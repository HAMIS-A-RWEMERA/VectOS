import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { queryAll, queryOne, execute, withTransaction, isPostgres, isProduction } from '../database/db';
import { createBackup, restoreBackup, BackupManifest } from '../database/backup';
import { 
  requireAuth, 
  requireSuperAdmin, 
  requireManager, 
  requirePermission 
} from '../auth';
import { throttleCheck, throttleFail, throttleClear } from '../security';

const router = Router();

// ============================================================================
// TENANT RESOLUTION & ISOLATION HELPERS
// ============================================================================

/**
 * Returns the authenticated store shop_id.
 * Strict multi-tenant rule:
 * - SuperAdmin can view any shop (defaults to explicit query/body param, user.shop_id, or 1 for global depot).
 * - Tenant users MUST have user.shop_id. If missing, returns null (never silently falls back to 1).
 */
export function getTenantShopId(req: Request): number | null {
  const user = req.session?.user;
  if (!user) return null;

  if (user.role === 'superadmin') {
    const explicit = Number(req.query.shop_id || req.body?.shop_id);
    if (!isNaN(explicit) && explicit > 0) return explicit;
    return user.shop_id || 1;
  }

  return user.shop_id ? Number(user.shop_id) : null;
}

/**
 * Middleware enforcing valid tenant association on all store-scoped API endpoints.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  const shopId = getTenantShopId(req);
  if (!shopId) {
    return res.status(403).json({ 
      error: 'Tenant Store Association Required: Your session is not linked to an active store depot.' 
    });
  }
  res.locals.shopId = shopId;
  next();
}

/**
 * Helper to log audit events into the tenant's immutable audit log.
 */
async function logApiAudit(req: Request, action: string, details: string, explicitShopId?: number) {
  try {
    const shopId = explicitShopId || getTenantShopId(req) || 1;
    const userId = req.session?.user?.id || null;
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    await execute(
      'INSERT INTO audit_logs (shop_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
      [shopId, userId, action, details, ip]
    );
  } catch (err) {
    console.error('API Audit log error:', err);
  }
}

// ============================================================================
// 1. AUTHENTICATION & SESSION MANAGEMENT
// ============================================================================

// Get Current User / Session State
router.get('/auth/me', async (req: Request, res: Response) => {
  if (!req.session?.user) {
    return res.json({ user: null, shop: null, availableShops: [], isSuperAdmin: false, dbPersistent: isPostgres() });
  }

  const user = req.session.user;
  let shop = null;
  const shopId = user.shop_id || (user.role === 'superadmin' ? 1 : null);

  if (shopId) {
    shop = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
  }

  // SuperAdmin gets list of all registered store tenants
  let availableShops: any[] = [];
  if (user.role === 'superadmin') {
    availableShops = await queryAll('SELECT id, name, code, location, status, subscription_plan FROM shops ORDER BY name ASC');
  }

  res.json({
    user,
    shop,
    availableShops,
    isSuperAdmin: user.role === 'superadmin',
    dbPersistent: isPostgres()
  });
});

// Login with Rate Limiting & Throttling
router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();

  // Brute-force rate limiting check
  const throttle = await throttleCheck(cleanEmail);
  if (!throttle.ok) {
    return res.status(429).json({ 
      error: `Too many failed sign-in attempts. This account is temporarily locked. Try again in about ${throttle.retryAfterMin} minute(s).` 
    });
  }

  try {
    if (cleanEmail === 'admin@vectos.co.rw' || cleanEmail === 'admin@quincaille.rw') {
      const { ensureAdminAccounts } = await import('../database/db');
      await ensureAdminAccounts();
    }

    const user = await queryOne(
      `SELECT u.*, s.name as shop_name, s.status as shop_status 
       FROM users u 
       LEFT JOIN shops s ON u.shop_id = s.id 
       WHERE LOWER(TRIM(u.email)) = ?`,
      [cleanEmail]
    );

    if (!user) {
      await throttleFail(cleanEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      await throttleFail(cleanEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Reset throttle on valid authentication
    await throttleClear(cleanEmail);

    if (user.is_active === 0 || user.activation_status === 'suspended') {
      return res.status(403).json({ error: 'Account is deactivated or suspended. Please contact your store manager or administrator.' });
    }

    if (user.role !== 'superadmin' && user.shop_status === 'suspended') {
      return res.status(403).json({ error: 'Store subscription is currently suspended. Please contact VectOS Platform Administration.' });
    }

    // Populate session
    req.session.user = {
      id: user.id,
      shop_id: user.shop_id,
      stock_id: user.stock_id,
      name: user.name,
      email: user.email,
      role: user.role,
      job_title: user.job_title,
      phone: user.phone,
      twofa_enabled: Boolean(user.twofa_enabled),
      can_create_orders: Boolean(user.can_create_orders),
      can_process_payments: Boolean(user.can_process_payments),
      can_release_stock: Boolean(user.can_release_stock),
      can_manage_stock: Boolean(user.can_manage_stock),
      can_import_export_stock: Boolean(user.can_import_export_stock),
      can_partner_borrow: Boolean(user.can_partner_borrow),
      can_view_reports: Boolean(user.can_view_reports),
      can_view_buying_prices: Boolean(user.can_view_buying_prices),
      can_give_discounts: Boolean(user.can_give_discounts),
      can_manage_users: Boolean(user.can_manage_users),
      can_print_full_receipt: Boolean(user.can_print_full_receipt),
      can_print_delivery_note: Boolean(user.can_print_delivery_note),
      can_manage_customers: Boolean(user.can_manage_customers),
      can_manage_partners: Boolean(user.can_manage_partners),
      can_void_orders: Boolean(user.can_void_orders),
      can_edit_company_settings: Boolean(user.can_edit_company_settings)
    };

    let shop = null;
    if (user.shop_id) {
      shop = await queryOne('SELECT * FROM shops WHERE id = ?', [user.shop_id]);
    } else if (user.role === 'superadmin') {
      shop = await queryOne('SELECT * FROM shops WHERE id = 1');
    }

    await logApiAudit(req, 'USER_LOGIN', `User ${user.name} (${user.email}) logged in.`, user.shop_id || 1);

    res.json({
      success: true,
      user: req.session.user,
      shop
    });
  } catch (err: any) {
    console.error('Login API error:', err);
    res.status(500).json({ error: 'Internal login processing error' });
  }
});

// Quick Demo Role Switcher (STRICTLY DISABLED IN PRODUCTION)
router.post('/auth/demo-switch', async (req: Request, res: Response) => {
  if (isProduction()) {
    return res.status(403).json({ error: 'Demo role switcher is strictly prohibited in production mode.' });
  }

  const { role, email } = req.body;

  let targetEmail = email;
  if (!targetEmail) {
    switch (role) {
      case 'superadmin':
        targetEmail = 'admin@vectos.co.rw';
        break;
      case 'manager':
        targetEmail = 'manager@quincaille.rw';
        break;
      case 'salesperson':
      case 'cashier':
        targetEmail = 'sales@quincaille.rw';
        break;
      case 'accountant':
        targetEmail = 'accountant@quincaille.rw';
        break;
      case 'storekeeper':
        targetEmail = 'storekeeper@quincaille.rw';
        break;
      default:
        targetEmail = 'manager@quincaille.rw';
    }
  }

  const user = await queryOne(
    `SELECT u.*, s.name as shop_name, s.status as shop_status 
     FROM users u 
     LEFT JOIN shops s ON u.shop_id = s.id 
     WHERE LOWER(TRIM(u.email)) = ?`,
    [targetEmail.toLowerCase()]
  );

  if (!user) {
    return res.status(404).json({ error: `User with email ${targetEmail} not found.` });
  }

  req.session.user = {
    id: user.id,
    shop_id: user.shop_id,
    stock_id: user.stock_id,
    name: user.name,
    email: user.email,
    role: user.role,
    job_title: user.job_title,
    phone: user.phone,
    twofa_enabled: Boolean(user.twofa_enabled),
    can_create_orders: Boolean(user.can_create_orders),
    can_process_payments: Boolean(user.can_process_payments),
    can_release_stock: Boolean(user.can_release_stock),
    can_manage_stock: Boolean(user.can_manage_stock),
    can_import_export_stock: Boolean(user.can_import_export_stock),
    can_partner_borrow: Boolean(user.can_partner_borrow),
    can_view_reports: Boolean(user.can_view_reports),
    can_view_buying_prices: Boolean(user.can_view_buying_prices),
    can_give_discounts: Boolean(user.can_give_discounts),
    can_manage_users: Boolean(user.can_manage_users),
    can_print_full_receipt: Boolean(user.can_print_full_receipt),
    can_print_delivery_note: Boolean(user.can_print_delivery_note),
    can_manage_customers: Boolean(user.can_manage_customers),
    can_manage_partners: Boolean(user.can_manage_partners),
    can_void_orders: Boolean(user.can_void_orders),
    can_edit_company_settings: Boolean(user.can_edit_company_settings)
  };

  let shop = null;
  if (user.shop_id) {
    shop = await queryOne('SELECT * FROM shops WHERE id = ?', [user.shop_id]);
  } else if (user.role === 'superadmin') {
    shop = await queryOne('SELECT * FROM shops WHERE id = 1');
  }

  res.json({
    success: true,
    user: req.session.user,
    shop
  });
});

// Logout
router.post('/auth/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Switch active shop (Superadmin only)
router.post('/shops/switch', requireAuth, async (req: Request, res: Response) => {
  const { shop_id } = req.body;
  const user = req.session.user;

  if (user.role !== 'superadmin' && user.shop_id !== Number(shop_id)) {
    return res.status(403).json({ error: 'Permission denied: Only SuperAdmin can switch store tenant views.' });
  }

  const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [Number(shop_id)]);
  if (!shop) {
    return res.status(404).json({ error: 'Shop tenant not found' });
  }

  req.session.user.shop_id = shop.id;
  res.json({ success: true, shop });
});

// ============================================================================
// 2. DASHBOARD STATS & RECENT ACTIVITY (ISOLATED PER TENANT)
// ============================================================================

router.get('/dashboard/stats', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;

  try {
    const isPg = isPostgres();
    const todaySql = isPg
      ? `SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count 
         FROM orders WHERE shop_id = ? AND created_at >= CURRENT_DATE AND fulfillment_status != 'cancelled'`
      : `SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count 
         FROM orders WHERE shop_id = ? AND date(created_at) = date('now') AND fulfillment_status != 'cancelled'`;

    const allOrders = await queryAll(
      `SELECT * FROM orders WHERE shop_id = ? ORDER BY created_at DESC LIMIT 10`,
      [shopId]
    );

    const totalSalesRow = await queryOne(
      `SELECT COALESCE(SUM(total_amount), 0) as total_sales, COALESCE(SUM(paid_amount), 0) as total_paid, COALESCE(SUM(debt_amount), 0) as total_debt 
       FROM orders WHERE shop_id = ? AND fulfillment_status != 'cancelled'`,
      [shopId]
    );

    const todaySalesRow = await queryOne(todaySql, [shopId]);

    const lowStockProducts = await queryAll(
      `SELECT * FROM products WHERE shop_id = ? AND quantity <= low_stock_threshold ORDER BY quantity ASC LIMIT 8`,
      [shopId]
    );

    const totalProductsRow = await queryOne(
      `SELECT COUNT(*) as count, COALESCE(SUM(quantity * buying_price), 0) as total_inventory_value FROM products WHERE shop_id = ?`,
      [shopId]
    );

    const totalCustomersRow = await queryOne(
      `SELECT COUNT(*) as count, COALESCE(SUM(credit_balance), 0) as total_receivables FROM customers WHERE shop_id = ?`,
      [shopId]
    );

    const stockLocations = await queryAll(
      `SELECT * FROM stocks WHERE shop_id = ? ORDER BY is_main DESC, name ASC`,
      [shopId]
    );

    const paymentBreakdown = await queryAll(
      `SELECT payment_method, COALESCE(SUM(amount), 0) as total_amount, COUNT(*) as count 
       FROM payments WHERE shop_id = ? GROUP BY payment_method`,
      [shopId]
    );

    const recentTrendSql = isPg
      ? `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as orders_count 
         FROM orders WHERE shop_id = ? AND fulfillment_status != 'cancelled' 
         GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD') 
         ORDER BY date DESC LIMIT 7`
      : `SELECT strftime('%Y-%m-%d', created_at) as date, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as orders_count 
         FROM orders WHERE shop_id = ? AND fulfillment_status != 'cancelled' 
         GROUP BY strftime('%Y-%m-%d', created_at) 
         ORDER BY date DESC LIMIT 7`;

    const recentDaysTrend = await queryAll(recentTrendSql, [shopId]);

    res.json({
      todaySales: Number(todaySalesRow?.today_sales || 0),
      todayOrderCount: Number(todaySalesRow?.today_count || 0),
      totalSales: Number(totalSalesRow?.total_sales || 0),
      totalPaid: Number(totalSalesRow?.total_paid || 0),
      totalDebt: Number(totalSalesRow?.total_debt || 0),
      productCount: Number(totalProductsRow?.count || 0),
      inventoryValue: Number(totalProductsRow?.total_inventory_value || 0),
      customerCount: Number(totalCustomersRow?.count || 0),
      totalReceivables: Number(totalCustomersRow?.total_receivables || 0),
      lowStockCount: lowStockProducts.length,
      lowStockProducts,
      recentOrders: allOrders,
      stockLocations,
      paymentBreakdown,
      recentDaysTrend: recentDaysTrend.reverse()
    });
  } catch (err: any) {
    console.error('Dashboard stats API error:', err);
    res.status(500).json({ error: 'Failed to load dashboard metrics' });
  }
});

// ============================================================================
// 3. PRODUCTS & CATALOG (INVENTORY MANAGEMENT)
// ============================================================================

// List products
router.get('/products', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const search = (req.query.q as string || '').trim().toLowerCase();
  const category = (req.query.category as string || '').trim();

  try {
    let sql = `SELECT * FROM products WHERE shop_id = ?`;
    const params: any[] = [shopId];

    if (search) {
      sql += ` AND (LOWER(name) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(barcode) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (category && category !== 'all') {
      sql += ` AND category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY name ASC`;
    const products = await queryAll(sql, params);

    const categories = await queryAll(
      `SELECT DISTINCT category FROM products WHERE shop_id = ? AND category IS NOT NULL AND category != '' ORDER BY category ASC`,
      [shopId]
    );

    res.json({
      products,
      categories: categories.map(c => c.category)
    });
  } catch (err: any) {
    console.error('Products API error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Create Product (Requires can_manage_stock)
router.post('/products', requireAuth, requireTenant, requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const {
    name,
    sku,
    barcode,
    category,
    unit,
    buying_price,
    quantity,
    low_stock_threshold,
    description,
    stock_id
  } = req.body;

  if (!name || Number(buying_price) < 0) {
    return res.status(400).json({ error: 'Product name and valid buying price are required' });
  }

  try {
    let finalStockId = stock_id ? Number(stock_id) : 1;
    // Verify warehouse belongs to this store
    const stockExists = await queryOne('SELECT id FROM stocks WHERE id = ? AND shop_id = ?', [finalStockId, shopId]);
    if (!stockExists) {
      const mainStock = await queryOne('SELECT id FROM stocks WHERE shop_id = ? AND is_main = 1 LIMIT 1', [shopId]);
      finalStockId = mainStock?.id || 1;
    }

    const finalSku = sku || `SKU-${Date.now().toString().slice(-6)}`;
    const finalThreshold = low_stock_threshold !== undefined ? Math.max(0, Number(low_stock_threshold)) : 10;
    const finalQty = quantity !== undefined ? Math.max(0, Number(quantity)) : 0;

    const result = await execute(
      `INSERT INTO products (shop_id, stock_id, name, sku, barcode, category, unit, buying_price, quantity, low_stock_threshold, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        finalStockId,
        name.trim(),
        finalSku.trim(),
        barcode ? barcode.trim() : null,
        category ? category.trim() : 'Hardware',
        unit ? unit.trim() : 'Pcs',
        Number(buying_price),
        finalQty,
        finalThreshold,
        description ? description.trim() : null
      ]
    );

    await logApiAudit(req, 'PRODUCT_CREATED', `Created product ${name} (SKU: ${finalSku}) with ${finalQty} initial units`);

    const created = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [result.lastInsertId, shopId]);
    res.json({ success: true, product: created });
  } catch (err: any) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product. Ensure SKU is unique within this store.' });
  }
});

// Update Product
router.put('/products/:id', requireAuth, requireTenant, requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const productId = Number(req.params.id);
  const {
    name,
    sku,
    barcode,
    category,
    unit,
    buying_price,
    quantity,
    low_stock_threshold,
    description
  } = req.body;

  try {
    const existing = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found in this store' });
    }

    await execute(
      `UPDATE products 
       SET name = ?, sku = ?, barcode = ?, category = ?, unit = ?, buying_price = ?, quantity = ?, low_stock_threshold = ?, description = ?
       WHERE id = ? AND shop_id = ?`,
      [
        name || existing.name,
        sku || existing.sku,
        barcode !== undefined ? barcode : existing.barcode,
        category || existing.category,
        unit || existing.unit,
        buying_price !== undefined ? Number(buying_price) : existing.buying_price,
        quantity !== undefined ? Math.max(0, Number(quantity)) : existing.quantity,
        low_stock_threshold !== undefined ? Math.max(0, Number(low_stock_threshold)) : existing.low_stock_threshold,
        description !== undefined ? description : existing.description,
        productId,
        shopId
      ]
    );

    await logApiAudit(req, 'PRODUCT_UPDATED', `Updated product #${productId} (${name || existing.name})`);
    const updated = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    res.json({ success: true, product: updated });
  } catch (err: any) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete Product
router.delete('/products/:id', requireAuth, requireTenant, requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const productId = Number(req.params.id);

  try {
    const existing = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found in this store' });
    }

    await execute('DELETE FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    await logApiAudit(req, 'PRODUCT_DELETED', `Deleted product #${productId} (${existing.name})`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to delete product. It may be referenced in existing orders.' });
  }
});

// Adjust Product Stock (Atomic & Transactional)
router.post('/products/:id/adjust-stock', requireAuth, requireTenant, requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const productId = Number(req.params.id);
  const { adjustment_qty, movement_type, reference, notes } = req.body;

  const adj = Number(adjustment_qty);
  if (isNaN(adj) || adj === 0) {
    return res.status(400).json({ error: 'Valid non-zero adjustment quantity is required' });
  }

  try {
    const product = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found in this store' });
    }

    await withTransaction(async () => {
      if (adj < 0) {
        // Atomic deduction with stock check condition
        const deductionRes = await execute(
          'UPDATE products SET quantity = quantity - ? WHERE id = ? AND shop_id = ? AND quantity >= ?',
          [Math.abs(adj), productId, shopId, Math.abs(adj)]
        );
        if (deductionRes.changes === 0) {
          throw new Error(`Insufficient stock for reduction. Product only has ${product.quantity} units in stock.`);
        }
      } else {
        await execute(
          'UPDATE products SET quantity = quantity + ? WHERE id = ? AND shop_id = ?',
          [adj, productId, shopId]
        );
      }

      await execute(
        `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          product.stock_id || 1,
          productId,
          adj,
          movement_type || (adj > 0 ? 'Stock Received' : 'Damage/Correction'),
          reference || notes || 'Manual Stock Adjustment',
          req.session?.user?.id || 1
        ]
      );
    });

    await logApiAudit(req, 'STOCK_ADJUSTMENT', `Adjusted product #${productId} quantity by ${adj > 0 ? '+' : ''}${adj}`);

    const updated = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    res.json({ success: true, product: updated });
  } catch (err: any) {
    console.error('Adjust stock error:', err);
    res.status(400).json({ error: err.message || 'Failed to adjust stock' });
  }
});

// ============================================================================
// 4. STOCKS / WAREHOUSES & TRANSFERS (MULTI-LOCATION)
// ============================================================================

router.get('/stocks', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  try {
    const stocks = await queryAll(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM products p WHERE p.stock_id = s.id AND p.shop_id = s.shop_id) as product_count,
        (SELECT COALESCE(SUM(quantity), 0) FROM products p WHERE p.stock_id = s.id AND p.shop_id = s.shop_id) as total_units
       FROM stocks s 
       WHERE s.shop_id = ? ORDER BY s.is_main DESC, s.name ASC`,
      [shopId]
    );

    const transfers = await queryAll(
      `SELECT t.*, p.name as product_name, p.sku as product_sku, 
              s1.name as from_stock_name, s2.name as to_stock_name, u.name as transferred_by_name
       FROM stock_transfers t
       JOIN products p ON t.product_id = p.id
       JOIN stocks s1 ON t.from_stock_id = s1.id
       JOIN stocks s2 ON t.to_stock_id = s2.id
       LEFT JOIN users u ON t.transferred_by = u.id
       WHERE t.shop_id = ?
       ORDER BY t.created_at DESC LIMIT 20`,
      [shopId]
    );

    res.json({ stocks, transfers });
  } catch (err: any) {
    console.error('Stocks API error:', err);
    res.status(500).json({ error: 'Failed to fetch warehouse stocks' });
  }
});

// Create Warehouse / Stock Location (Requires Store Manager)
router.post('/stocks', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const { name, code, location, manager_name, phone, is_main } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Stock location name is required' });
  }

  try {
    const result = await execute(
      `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        shopId,
        name.trim(),
        code ? code.trim() : `WH-${Date.now().toString().slice(-4)}`,
        location ? location.trim() : 'Kigali',
        manager_name ? manager_name.trim() : null,
        phone ? phone.trim() : null,
        is_main ? 1 : 0
      ]
    );

    await logApiAudit(req, 'STOCK_LOCATION_CREATED', `Created warehouse/stock location ${name}`);
    const created = await queryOne('SELECT * FROM stocks WHERE id = ? AND shop_id = ?', [result.lastInsertId, shopId]);
    res.json({ success: true, stock: created });
  } catch (err: any) {
    console.error('Create stock error:', err);
    res.status(500).json({ error: 'Failed to create stock location' });
  }
});

// Stock Transfer Between Warehouses (Atomic & Verified)
router.post('/stocks/transfer', requireAuth, requireTenant, requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const { from_stock_id, to_stock_id, product_id, quantity, notes } = req.body;

  const qty = Number(quantity);
  if (!from_stock_id || !to_stock_id || !product_id || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Invalid transfer parameters. Quantity must be greater than 0.' });
  }

  if (Number(from_stock_id) === Number(to_stock_id)) {
    return res.status(400).json({ error: 'Source and destination warehouses cannot be the same.' });
  }

  try {
    // Verify source and destination warehouses belong to this store
    const fromStock = await queryOne('SELECT id, name FROM stocks WHERE id = ? AND shop_id = ?', [from_stock_id, shopId]);
    const toStock = await queryOne('SELECT id, name FROM stocks WHERE id = ? AND shop_id = ?', [to_stock_id, shopId]);
    if (!fromStock || !toStock) {
      return res.status(404).json({ error: 'Source or destination warehouse does not belong to this store.' });
    }

    const product = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [product_id, shopId]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found in this store.' });
    }

    await withTransaction(async () => {
      // Record transfer entry
      await execute(
        `INSERT INTO stock_transfers (shop_id, from_stock_id, to_stock_id, product_id, quantity, transferred_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [shopId, from_stock_id, to_stock_id, product_id, qty, req.session?.user?.id || 1, notes || null]
      );

      // Record inventory movements
      await execute(
        `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, ?, 'Transfer Out', ?, ?)`,
        [shopId, from_stock_id, product_id, -qty, `Transfer to WH #${to_stock_id} (${toStock.name})`, req.session?.user?.id || 1]
      );

      await execute(
        `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, ?, 'Transfer In', ?, ?)`,
        [shopId, to_stock_id, product_id, qty, `Transfer from WH #${from_stock_id} (${fromStock.name})`, req.session?.user?.id || 1]
      );
    });

    await logApiAudit(req, 'STOCK_TRANSFER', `Transferred ${qty} of ${product.name} from WH #${from_stock_id} to WH #${to_stock_id}`);

    res.json({ success: true, message: `Successfully transferred ${qty} units.` });
  } catch (err: any) {
    console.error('Stock transfer error:', err);
    res.status(500).json({ error: err.message || 'Failed to process warehouse stock transfer' });
  }
});

// ============================================================================
// 5. ORDERS & POS CHECKOUT (CONCURRENCY-SAFE ATOMIC INVENTORY)
// ============================================================================

router.get('/orders', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const status = (req.query.status as string || '').trim();

  try {
    let sql = `
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, u.name as salesperson_name,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON o.salesperson_id = u.id
      WHERE o.shop_id = ?
    `;
    const params: any[] = [shopId];

    if (status && status !== 'all') {
      sql += ` AND (o.payment_status = ? OR o.fulfillment_status = ?)`;
      params.push(status, status);
    }

    sql += ` ORDER BY o.created_at DESC LIMIT 50`;
    const orders = await queryAll(sql, params);

    res.json({ orders });
  } catch (err: any) {
    console.error('Orders API error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get Single Order with Items & Payments
router.get('/orders/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);

  try {
    const order = await queryOne(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
              u.name as salesperson_name, s.name as shop_name, s.tin_number, s.receipt_footer_text, s.phone as shop_phone
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN users u ON o.salesperson_id = u.id
       LEFT JOIN shops s ON o.shop_id = s.id
       WHERE o.id = ? AND o.shop_id = ?`,
      [orderId, shopId]
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found in this store' });
    }

    const items = await queryAll(
      `SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit as product_unit
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    const payments = await queryAll(
      `SELECT p.*, u.name as recorded_by_name
       FROM payments p
       LEFT JOIN users u ON p.recorded_by = u.id
       WHERE p.order_id = ? AND p.shop_id = ?
       ORDER BY p.created_at ASC`,
      [orderId, shopId]
    );

    res.json({ order, items, payments });
  } catch (err: any) {
    console.error('Get order detail error:', err);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Create Order (POS Checkout with ATOMIC stock decrements)
router.post('/orders', requireAuth, requireTenant, requirePermission('can_create_orders'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const {
    customer_id,
    customer_name,
    customer_phone,
    items,
    payment_method,
    paid_amount,
    notes,
    payment_reference
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one product item is required to place an order.' });
  }

  try {
    const result = await withTransaction(async () => {
      // 1. Resolve or create customer if new
      let finalCustomerId: number | null = customer_id ? Number(customer_id) : null;

      if (finalCustomerId) {
        const custCheck = await queryOne('SELECT id FROM customers WHERE id = ? AND shop_id = ?', [finalCustomerId, shopId]);
        if (!custCheck) {
          throw new Error('Specified customer does not belong to this store.');
        }
      } else if (customer_name) {
        const existing = await queryOne('SELECT id FROM customers WHERE shop_id = ? AND phone = ?', [shopId, customer_phone || '']);
        if (existing) {
          finalCustomerId = existing.id;
        } else {
          const newCust = await execute(
            `INSERT INTO customers (shop_id, name, phone, credit_balance) VALUES (?, ?, ?, 0.0)`,
            [shopId, customer_name.trim(), customer_phone ? customer_phone.trim() : '']
          );
          finalCustomerId = newCust.lastInsertId;
        }
      }

      // 2. Validate all products and calculate totals
      let totalAmount = 0;
      const parsedItems: any[] = [];

      for (const item of items) {
        const prod = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [item.product_id, shopId]);
        if (!prod) {
          throw new Error(`Product #${item.product_id} not found in this store.`);
        }

        const qty = Number(item.quantity);
        if (isNaN(qty) || qty <= 0) {
          throw new Error(`Invalid quantity for product ${prod.name}`);
        }

        const sellingPrice = item.selling_price !== undefined ? Number(item.selling_price) : prod.buying_price * 1.15;
        const subtotal = sellingPrice * qty;
        const profit = (sellingPrice - prod.buying_price) * qty;

        totalAmount += subtotal;

        parsedItems.push({
          product: prod,
          product_id: prod.id,
          quantity: qty,
          buying_price: prod.buying_price,
          selling_price: sellingPrice,
          subtotal,
          profit,
          fulfillment_source: item.fulfillment_source || 'Store'
        });
      }

      const paid = paid_amount !== undefined ? Math.min(totalAmount, Math.max(0, Number(paid_amount))) : totalAmount;
      const debt = Math.max(0, totalAmount - paid);
      const paymentStatus = debt === 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
      const fulfillmentStatus = 'pending_store';
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

      // 3. Insert Order Record
      const orderRes = await execute(
        `INSERT INTO orders (shop_id, stock_id, order_number, customer_id, salesperson_id, total_amount, paid_amount, debt_amount, payment_status, fulfillment_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          1,
          orderNumber,
          finalCustomerId,
          req.session?.user?.id || 1,
          totalAmount,
          paid,
          debt,
          paymentStatus,
          fulfillmentStatus,
          notes || null
        ]
      );

      const orderId = orderRes.lastInsertId;

      // 4. ATOMIC Stock Decrement & Order Item Insertion
      for (const pi of parsedItems) {
        await execute(
          `INSERT INTO order_items (order_id, product_id, quantity, buying_price, selling_price, subtotal, profit, fulfillment_source, item_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_store')`,
          [orderId, pi.product_id, pi.quantity, pi.buying_price, pi.selling_price, pi.subtotal, pi.profit, pi.fulfillment_source]
        );

        // Strict Atomic Stock Check & Decrement
        const stockDeduction = await execute(
          `UPDATE products SET quantity = quantity - ? WHERE id = ? AND shop_id = ? AND quantity >= ?`,
          [pi.quantity, pi.product_id, shopId, pi.quantity]
        );

        if (stockDeduction.changes === 0) {
          throw new Error(
            `Insufficient stock for "${pi.product.name}". Requested ${pi.quantity} units, but insufficient available inventory.`
          );
        }

        // Record inventory movement
        await execute(
          `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
           VALUES (?, 1, ?, ?, 'Sale', ?, ?)`,
          [shopId, pi.product_id, -pi.quantity, `Sale for Order ${orderNumber}`, req.session?.user?.id || 1]
        );
      }

      // 5. Insert Payment Record
      if (paid > 0) {
        await execute(
          `INSERT INTO payments (shop_id, order_id, amount, payment_method, reference_no, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            shopId,
            orderId,
            paid,
            payment_method || 'cash',
            payment_reference || null,
            req.session?.user?.id || 1
          ]
        );
      }

      // 6. Update Customer Credit Balance if debt remains
      if (debt > 0 && finalCustomerId) {
        await execute(
          `UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ? AND shop_id = ?`,
          [debt, finalCustomerId, shopId]
        );
      }

      return { orderId, orderNumber, totalAmount, paid, debt };
    });

    await logApiAudit(req, 'ORDER_CREATED', `Placed Order ${result.orderNumber} for RWF ${result.totalAmount.toLocaleString()}`);

    const createdOrder = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [result.orderId, shopId]);
    res.json({ success: true, order: createdOrder });
  } catch (err: any) {
    console.error('Order creation error:', err);
    res.status(400).json({ error: err.message || 'Failed to place order' });
  }
});

// Record Payment on Existing Order
router.post('/orders/:id/payments', requireAuth, requireTenant, requirePermission('can_process_payments'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const { amount, payment_method, reference_no } = req.body;

  const payAmt = Number(amount);
  if (isNaN(payAmt) || payAmt <= 0) {
    return res.status(400).json({ error: 'Valid payment amount greater than 0 is required' });
  }

  try {
    const order = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found in this store' });
    }

    await withTransaction(async () => {
      await execute(
        `INSERT INTO payments (shop_id, order_id, amount, payment_method, reference_no, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          orderId,
          payAmt,
          payment_method || 'cash',
          reference_no || null,
          req.session?.user?.id || 1
        ]
      );

      const newPaid = Number(order.paid_amount) + payAmt;
      const newDebt = Math.max(0, Number(order.total_amount) - newPaid);
      const newPaymentStatus = newDebt === 0 ? 'paid' : 'partial';

      await execute(
        `UPDATE orders SET paid_amount = ?, debt_amount = ?, payment_status = ? WHERE id = ? AND shop_id = ?`,
        [newPaid, newDebt, newPaymentStatus, orderId, shopId]
      );

      if (order.customer_id) {
        await execute(
          `UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ? AND shop_id = ?`,
          [payAmt, order.customer_id, shopId]
        );
      }
    });

    await logApiAudit(req, 'PAYMENT_RECORDED', `Recorded payment of RWF ${payAmt.toLocaleString()} for Order #${orderId}`);

    const updatedOrder = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    res.json({ success: true, order: updatedOrder });
  } catch (err: any) {
    console.error('Record payment error:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Update Fulfillment Status (Dispatch / Release / Reject)
router.post('/orders/:id/status', requireAuth, requireTenant, requirePermission('can_release_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const { fulfillment_status, reason } = req.body;

  try {
    const order = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found in this store' });
    }

    await execute(
      `UPDATE orders SET fulfillment_status = ? WHERE id = ? AND shop_id = ?`,
      [fulfillment_status, orderId, shopId]
    );

    let itemStatus = 'pending_store';
    if (fulfillment_status === 'approved' || fulfillment_status === 'dispatched' || fulfillment_status === 'completed') {
      itemStatus = 'approved';
    }
    if (fulfillment_status === 'rejected') itemStatus = 'rejected';

    await execute(
      `UPDATE order_items SET item_status = ?, rejection_reason = ? WHERE order_id = ?`,
      [itemStatus, reason || null, orderId]
    );

    await logApiAudit(req, 'ORDER_STATUS_CHANGED', `Changed Order #${orderId} fulfillment status to ${fulfillment_status}`);

    const updated = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// ============================================================================
// 6. CUSTOMERS & CREDIT LEDGER (RECEIVABLES TRACKING)
// ============================================================================

router.get('/customers', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const search = (req.query.q as string || '').trim().toLowerCase();

  try {
    let sql = `
      SELECT c.*, 
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.shop_id = c.shop_id) as order_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE o.customer_id = c.id AND o.shop_id = c.shop_id) as total_spent
      FROM customers c
      WHERE c.shop_id = ?
    `;
    const params: any[] = [shopId];

    if (search) {
      sql += ` AND (LOWER(c.name) LIKE ? OR LOWER(c.phone) LIKE ? OR LOWER(c.email) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY c.credit_balance DESC, c.name ASC`;
    const customers = await queryAll(sql, params);

    res.json({ customers });
  } catch (err: any) {
    console.error('Customers API error:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Create Customer
router.post('/customers', requireAuth, requireTenant, requirePermission('can_manage_customers'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const { name, phone, email, address, id_number } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Customer name is required' });
  }

  try {
    const result = await execute(
      `INSERT INTO customers (shop_id, name, phone, email, address, id_number, credit_balance)
       VALUES (?, ?, ?, ?, ?, ?, 0.0)`,
      [
        shopId,
        name.trim(),
        phone ? phone.trim() : '',
        email ? email.trim() : null,
        address ? address.trim() : null,
        id_number ? id_number.trim() : null
      ]
    );

    await logApiAudit(req, 'CUSTOMER_CREATED', `Added customer ${name}`);
    const created = await queryOne('SELECT * FROM customers WHERE id = ? AND shop_id = ?', [result.lastInsertId, shopId]);
    res.json({ success: true, customer: created });
  } catch (err: any) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update Customer
router.put('/customers/:id', requireAuth, requireTenant, requirePermission('can_manage_customers'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const customerId = Number(req.params.id);
  const { name, phone, email, address, id_number } = req.body;

  try {
    const existing = await queryOne('SELECT * FROM customers WHERE id = ? AND shop_id = ?', [customerId, shopId]);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found in this store' });
    }

    await execute(
      `UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, id_number = ? WHERE id = ? AND shop_id = ?`,
      [
        name || existing.name,
        phone !== undefined ? phone : existing.phone,
        email !== undefined ? email : existing.email,
        address !== undefined ? address : existing.address,
        id_number !== undefined ? id_number : existing.id_number,
        customerId,
        shopId
      ]
    );

    const updated = await queryOne('SELECT * FROM customers WHERE id = ? AND shop_id = ?', [customerId, shopId]);
    res.json({ success: true, customer: updated });
  } catch (err: any) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// ============================================================================
// 7. PARTNERS & PEER STORE BORROWING
// ============================================================================

router.get('/partners', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  try {
    const partners = await queryAll(
      `SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC`,
      [shopId]
    );
    res.json({ partners });
  } catch (err: any) {
    console.error('Partners API error:', err);
    res.status(500).json({ error: 'Failed to fetch partner hardware stores' });
  }
});

router.post('/partners', requireAuth, requireTenant, requirePermission('can_manage_partners'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const { name, contact_person, phone, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Partner shop name is required' });
  }

  try {
    const result = await execute(
      `INSERT INTO partner_shops (shop_id, name, contact_person, phone, address, current_balance)
       VALUES (?, ?, ?, ?, ?, 0.0)`,
      [
        shopId,
        name.trim(),
        contact_person ? contact_person.trim() : null,
        phone ? phone.trim() : null,
        address ? address.trim() : null
      ]
    );

    await logApiAudit(req, 'PARTNER_CREATED', `Added partner store ${name}`);
    const created = await queryOne('SELECT * FROM partner_shops WHERE id = ? AND shop_id = ?', [result.lastInsertId, shopId]);
    res.json({ success: true, partner: created });
  } catch (err: any) {
    console.error('Create partner error:', err);
    res.status(500).json({ error: 'Failed to create partner hardware store' });
  }
});

// ============================================================================
// 8. USERS & ACCESS CONTROL (RBAC & PRIVILEGE ENFORCEMENT)
// ============================================================================

router.get('/users', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const isSuper = req.session?.user?.role === 'superadmin';

  try {
    const sql = isSuper
      ? `SELECT u.id, u.shop_id, u.stock_id, u.name, u.email, u.role, u.job_title, u.phone, u.is_active, u.activation_status, s.name as shop_name 
         FROM users u LEFT JOIN shops s ON u.shop_id = s.id ORDER BY u.role DESC, u.name ASC`
      : `SELECT id, shop_id, stock_id, name, email, role, job_title, phone, is_active, activation_status,
                can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
                can_partner_borrow, can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users,
                can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings
         FROM users WHERE shop_id = ? ORDER BY role DESC, name ASC`;
    const params = isSuper ? [] : [shopId];

    const users = await queryAll(sql, params);
    res.json({ users });
  } catch (err: any) {
    console.error('Users API error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create Staff User (Store Manager can only create staff within their store)
router.post('/users', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const currentUser = req.session.user;
  const { name, email, password, role, job_title, phone, permissions } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and initial password are required' });
  }

  // Privilege escalation check: Non-superadmin cannot create superadmin accounts
  const assignedRole = (role || 'salesperson').toLowerCase();
  if (assignedRole === 'superadmin' && currentUser.role !== 'superadmin') {
    return res.status(403).json({ error: 'Privilege escalation blocked: Only SuperAdmin can create superadmin accounts.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const p = permissions || {};

    const result = await execute(
      `INSERT INTO users (
        shop_id, stock_id, name, email, password, role, job_title, phone, is_active, activation_status,
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
        can_partner_borrow, can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users,
        can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        name.trim(),
        email.trim().toLowerCase(),
        hashedPassword,
        assignedRole,
        job_title || 'Store Staff',
        phone || null,
        p.can_create_orders !== undefined ? (p.can_create_orders ? 1 : 0) : 1,
        p.can_process_payments ? 1 : 0,
        p.can_release_stock ? 1 : 0,
        p.can_manage_stock ? 1 : 0,
        p.can_import_export_stock ? 1 : 0,
        p.can_partner_borrow ? 1 : 0,
        p.can_view_reports ? 1 : 0,
        p.can_view_buying_prices ? 1 : 0,
        p.can_give_discounts ? 1 : 0,
        p.can_manage_users ? 1 : 0,
        p.can_print_full_receipt !== undefined ? (p.can_print_full_receipt ? 1 : 0) : 1,
        p.can_print_delivery_note !== undefined ? (p.can_print_delivery_note ? 1 : 0) : 1,
        p.can_manage_customers !== undefined ? (p.can_manage_customers ? 1 : 0) : 1,
        p.can_manage_partners ? 1 : 0,
        p.can_void_orders ? 1 : 0,
        p.can_edit_company_settings ? 1 : 0
      ]
    );

    await logApiAudit(req, 'USER_CREATED', `Created staff user ${name} (${email}) with role ${assignedRole}`);
    const created = await queryOne('SELECT id, name, email, role, job_title FROM users WHERE id = ? AND shop_id = ?', [result.lastInsertId, shopId]);
    res.json({ success: true, user: created });
  } catch (err: any) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user. Ensure email is unique.' });
  }
});

// Update User (Edit Roles / Permissions / Status)
router.put('/users/:id', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const targetUserId = Number(req.params.id);
  const currentUser = req.session.user;
  const { name, phone, role, job_title, is_active, permissions, password } = req.body;

  try {
    const existing = await queryOne('SELECT * FROM users WHERE id = ? AND shop_id = ?', [targetUserId, shopId]);
    if (!existing && currentUser.role !== 'superadmin') {
      return res.status(404).json({ error: 'User account not found in this store' });
    }

    // Privilege escalation check
    if (role === 'superadmin' && currentUser.role !== 'superadmin') {
      return res.status(403).json({ error: 'Privilege escalation blocked: Only SuperAdmin can assign superadmin role.' });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (role && (currentUser.role === 'superadmin' || role !== 'superadmin')) { 
      updates.push('role = ?'); params.push(role); 
    }
    if (job_title !== undefined) { updates.push('job_title = ?'); params.push(job_title); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (password && password.trim().length >= 6) {
      const hash = await bcrypt.hash(password.trim(), 10);
      updates.push('password = ?');
      params.push(hash);
    }

    if (permissions) {
      const permKeys = [
        'can_create_orders', 'can_process_payments', 'can_release_stock', 'can_manage_stock',
        'can_import_export_stock', 'can_partner_borrow', 'can_view_reports', 'can_view_buying_prices',
        'can_give_discounts', 'can_manage_users', 'can_print_full_receipt', 'can_print_delivery_note',
        'can_manage_customers', 'can_manage_partners', 'can_void_orders', 'can_edit_company_settings'
      ];
      for (const pk of permKeys) {
        if (permissions[pk] !== undefined) {
          updates.push(`${pk} = ?`);
          params.push(permissions[pk] ? 1 : 0);
        }
      }
    }

    if (updates.length > 0) {
      let sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      params.push(targetUserId);
      if (currentUser.role !== 'superadmin') {
        sql += ' AND shop_id = ?';
        params.push(shopId);
      }
      await execute(sql, params);
    }

    await logApiAudit(req, 'USER_UPDATED', `Updated staff user #${targetUserId}`);
    const updated = await queryOne('SELECT id, name, email, role, job_title, is_active FROM users WHERE id = ?', [targetUserId]);
    res.json({ success: true, user: updated });
  } catch (err: any) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// ============================================================================
// 9. SHOPS & SUPERADMIN PLATFORM PORTAL
// ============================================================================

// List stores
router.get('/shops', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user;

  try {
    if (user.role === 'superadmin') {
      const shops = await queryAll(`
        SELECT s.*, 
          (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id) as user_count,
          (SELECT COUNT(*) FROM stocks st WHERE st.shop_id = s.id) as stock_count,
          (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) as product_count,
          (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE o.shop_id = s.id) as total_revenue
        FROM shops s ORDER BY s.id ASC
      `);
      return res.json({ shops });
    }

    // Non-superadmin managers only see their own store
    if (user.shop_id) {
      const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [user.shop_id]);
      return res.json({ shops: shop ? [shop] : [] });
    }

    return res.status(403).json({ error: 'SuperAdmin access required' });
  } catch (err: any) {
    console.error('Shops API error:', err);
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});

// Register New Store Tenant (SuperAdmin Only)
router.post('/shops', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const { name, code, owner_name, phone, email, location, tin_number, subscription_plan } = req.body;

  if (!name || !owner_name || !email) {
    return res.status(400).json({ error: 'Store name, owner name, and email are required' });
  }

  try {
    const finalCode = code || name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);

    const result = await execute(
      `INSERT INTO shops (name, code, owner_name, phone, email, location, tin_number, status, subscription_plan)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        name.trim(),
        finalCode,
        owner_name.trim(),
        phone ? phone.trim() : '+250 788 000 000',
        email.trim().toLowerCase(),
        location ? location.trim() : 'Kigali, Rwanda',
        tin_number ? tin_number.trim() : null,
        subscription_plan || 'Standard Depot (RWF 45,000/mo)'
      ]
    );

    const shopId = result.lastInsertId;

    // Create default Main Warehouse for this shop
    await execute(
      `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'active')`,
      [
        shopId,
        `${name} Main Depot`,
        `WH-${finalCode.toUpperCase()}-01`,
        location || 'Kigali',
        owner_name,
        phone
      ]
    );

    await logApiAudit(req, 'SHOP_REGISTERED', `Created new store tenant ${name} (#${shopId})`, shopId);
    const created = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    res.json({ success: true, shop: created });
  } catch (err: any) {
    console.error('Create shop error:', err);
    res.status(500).json({ error: 'Failed to register shop. Ensure store code and email are unique.' });
  }
});

// Update Shop Settings (SuperAdmin or Store Manager for their own store)
router.put('/shops/:id', requireAuth, requireManager, async (req: Request, res: Response) => {
  const shopId = Number(req.params.id);
  const user = req.session.user;

  if (user.role !== 'superadmin' && user.shop_id !== shopId) {
    return res.status(403).json({ error: 'Permission denied: Cannot edit settings for another store.' });
  }

  const { name, owner_name, phone, email, location, tin_number, receipt_footer_text, status, subscription_plan } = req.body;

  try {
    const existing = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!existing) {
      return res.status(404).json({ error: 'Shop tenant not found' });
    }

    // Only SuperAdmin can change subscription status or plan
    const newStatus = user.role === 'superadmin' && status ? status : existing.status;
    const newPlan = user.role === 'superadmin' && subscription_plan ? subscription_plan : existing.subscription_plan;

    await execute(
      `UPDATE shops 
       SET name = ?, owner_name = ?, phone = ?, email = ?, location = ?, tin_number = ?, receipt_footer_text = ?, status = ?, subscription_plan = ?
       WHERE id = ?`,
      [
        name || existing.name,
        owner_name || existing.owner_name,
        phone || existing.phone,
        email || existing.email,
        location || existing.location,
        tin_number !== undefined ? tin_number : existing.tin_number,
        receipt_footer_text !== undefined ? receipt_footer_text : existing.receipt_footer_text,
        newStatus,
        newPlan,
        shopId
      ]
    );

    await logApiAudit(req, 'SHOP_SETTINGS_UPDATED', `Updated store settings for #${shopId}`, shopId);
    const updated = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    res.json({ success: true, shop: updated });
  } catch (err: any) {
    console.error('Update shop error:', err);
    res.status(500).json({ error: 'Failed to update store settings' });
  }
});

// ============================================================================
// 10. REPORTS & AUDIT TRAIL (STRICTLY SCOPED PER TENANT)
// ============================================================================

router.get('/reports/summary', requireAuth, requireTenant, requirePermission('can_view_reports'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;

  try {
    const categorySales = await queryAll(
      `SELECT p.category, COALESCE(SUM(oi.subtotal), 0) as revenue, COALESCE(SUM(oi.profit), 0) as profit, SUM(oi.quantity) as units_sold
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled'
       GROUP BY p.category ORDER BY revenue DESC`,
      [shopId]
    );

    const topSellingProducts = await queryAll(
      `SELECT p.name, p.sku, p.category, SUM(oi.quantity) as total_units_sold, SUM(oi.subtotal) as total_revenue, SUM(oi.profit) as total_profit
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled'
       GROUP BY p.id, p.name, p.sku, p.category ORDER BY total_revenue DESC LIMIT 10`,
      [shopId]
    );

    const salespersonPerformance = await queryAll(
      `SELECT u.name, u.email, COUNT(o.id) as total_orders, COALESCE(SUM(o.total_amount), 0) as total_sales
       FROM orders o
       JOIN users u ON o.salesperson_id = u.id
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled'
       GROUP BY u.id, u.name, u.email ORDER BY total_sales DESC`,
      [shopId]
    );

    const auditLogs = await queryAll(
      `SELECT a.*, u.name as user_name, u.role as user_role
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.shop_id = ? ORDER BY a.created_at DESC LIMIT 30`,
      [shopId]
    );

    res.json({
      categorySales,
      topSellingProducts,
      salespersonPerformance,
      auditLogs
    });
  } catch (err: any) {
    console.error('Reports API error:', err);
    res.status(500).json({ error: 'Failed to generate store reports' });
  }
});

// ============================================================================
// 11. CRYPTOGRAPHIC BACKUP & RESTORE (TENANT ISOLATED)
// ============================================================================

router.get('/backup/export', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const user = req.session!.user!;

  try {
    const targetShopId = user.role === 'superadmin' ? (shopId || null) : shopId;
    const backup = await createBackup(targetShopId);

    await logApiAudit(req, 'BACKUP_EXPORTED', `Generated signed backup snapshot for shop #${targetShopId || 'ALL'}`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="vectos-backup-shop-${targetShopId || 'full'}-${Date.now()}.json"`);
    res.json(backup);
  } catch (err: any) {
    console.error('Backup export error:', err);
    res.status(500).json({ error: 'Failed to generate store backup: ' + err.message });
  }
});

router.post('/backup/restore', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const user = req.session!.user!;
  const manifest = req.body as BackupManifest;

  if (!manifest || !manifest.metadata || !manifest.data) {
    return res.status(400).json({ error: 'Invalid backup structure. Missing metadata or data payload.' });
  }

  // Cross-tenant guard: Non-superadmins cannot restore data targeting a different shop
  if (user.role !== 'superadmin' && manifest.metadata.shop_id !== shopId) {
    return res.status(403).json({ error: 'Cross-tenant restore forbidden. Manifest belongs to a different store.' });
  }

  try {
    const result = await restoreBackup(manifest);
    await logApiAudit(req, 'BACKUP_RESTORED', `Restored data snapshot for shop #${shopId}`);
    res.json({ success: true, stats: result.stats });
  } catch (err: any) {
    console.error('Backup restore error:', err);
    res.status(400).json({ error: 'Restoration failed: ' + err.message });
  }
});

export default router;
