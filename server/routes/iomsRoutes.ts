import { Router, Request, Response } from 'express';
import path from 'path';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { queryAll, queryOne, execute } from '../database/db';
import { 
  requireAuth, 
  requireSuperAdmin, 
  requireManager, 
  requirePermission,
  requireSalesperson, 
  requireAccountant, 
  requireStorekeeper 
} from '../auth';
import { uploadSpreadsheet } from '../upload';

const router = Router();

// PWA Icon Handlers
router.get(['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.sendFile(path.join(process.cwd(), 'public', 'icon.svg'));
});

// Helper to log audit events
async function logAudit(userId: number | undefined, action: string, details: string, req: Request, shopId?: number | null) {
  try {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const sId = shopId !== undefined ? shopId : (req.session?.user?.shop_id || 1);
    await execute(
      'INSERT INTO audit_logs (shop_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
      [sId, userId || null, action, details, ip]
    );
  } catch (err) {
    console.error('Audit logging error:', err);
  }
}

// Helper to get active shopId for queries
function getActiveShopId(req: Request): number {
  if (req.session?.user?.role === 'superadmin' && req.session.user.shop_id) {
    return req.session.user.shop_id;
  }
  return req.session?.user?.shop_id || 1;
}

// -------------------------------------------------------------
// AUTHENTICATION & SHOP REGISTRATION ROUTES
// -------------------------------------------------------------

// Login Page
router.get('/login', async (req: Request, res: Response) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
  res.render('login', { error: null, shops });
});

// Process Login
router.post('/login', async (req: Request, res: Response) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  try {
    // If admin is logging in, ensure account is active and present
    if (email === 'admin@vectos.co.rw' || email === 'admin@quincaille.rw') {
      const { ensureAdminAccounts } = await import('../database/db');
      await ensureAdminAccounts();
    }

    const user = await queryOne(`
      SELECT u.*, s.name as shop_name, s.status as shop_status 
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      WHERE LOWER(TRIM(u.email)) = ?
    `, [email]);

    if (!user) {
      const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
      return res.render('login', { error: 'Account not found. Please verify the email address.', shops });
    }

    if (Number(user.is_active) !== 1 || (user.activation_status && user.activation_status !== 'active')) {
      const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
      return res.render('login', { error: 'Your user account is inactive or pending approval. Please contact your manager or platform administrator.', shops });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
      return res.render('login', { error: 'Invalid password. Please check your credentials.', shops });
    }

    if (user.role !== 'superadmin' && user.shop_status === 'pending') {
      const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
      return res.render('login', { 
        error: 'Your Hardware Store registration is pending approval by the Platform Super Administrator. Access will be unlocked upon payment confirmation.', 
        shops 
      });
    }

    if (user.role !== 'superadmin' && user.shop_status === 'suspended') {
      const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
      return res.render('login', { 
        error: 'Your Hardware Store subscription is currently suspended. Please contact the platform admin for renewal.', 
        shops 
      });
    }

    req.session.user = {
      id: user.id,
      shop_id: user.shop_id,
      shop_name: user.shop_name || 'Central Platform',
      shop_status: user.shop_status || 'active',
      name: user.name,
      email: user.email,
      role: user.role,
      job_title: user.job_title || user.role,
      phone: user.phone,
      can_create_orders: user.can_create_orders,
      can_process_payments: user.can_process_payments,
      can_release_stock: user.can_release_stock,
      can_manage_stock: user.can_manage_stock,
      can_import_export_stock: user.can_import_export_stock,
      can_partner_borrow: user.can_partner_borrow,
      can_view_buying_prices: user.can_view_buying_prices,
      can_give_discounts: user.can_give_discounts,
      can_view_reports: user.can_view_reports,
      can_manage_users: user.can_manage_users,
      can_print_full_receipt: user.can_print_full_receipt,
      can_print_delivery_note: user.can_print_delivery_note,
      can_manage_customers: user.can_manage_customers,
      can_manage_partners: user.can_manage_partners,
      can_void_orders: user.can_void_orders,
      can_edit_company_settings: user.can_edit_company_settings
    };

    await logAudit(user.id, 'USER_LOGIN', `Logged in successfully as ${user.role.toUpperCase()} (${user.job_title || user.role})`, req, user.shop_id);
    
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      if (user.role === 'superadmin') {
        res.redirect('/admin/shops');
      } else {
        res.redirect('/dashboard');
      }
    });
  } catch (err: any) {
    const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
    res.render('login', { error: 'Authentication error: ' + err.message, shops });
  }
});

// Forgot Password — recovery instructions page
router.get('/forgot-password', (req: Request, res: Response) => {
  res.render('forgot_password', { error: null });
});

// Self-Service Shop Registration Form
router.get('/register-shop', (req: Request, res: Response) => {
  res.render('register_shop', { error: null, success: null });
});

// Process Self-Service Shop Registration on VectOS
router.post('/register-shop', async (req: Request, res: Response) => {
  const { 
    shop_name, 
    owner_name, 
    phone, 
    email, 
    location, 
    tin_number, 
    business_type,
    account_count,
    stock_count,
    password, 
    confirm_password 
  } = req.body;

  try {
    if (password !== confirm_password) {
      return res.render('register_shop', { error: 'Passwords do not match.', success: null });
    }

    if (!shop_name || !owner_name || !phone || !email || !password) {
      return res.render('register_shop', { error: 'Please fill in all required registration fields.', success: null });
    }

    // Check email uniqueness
    const existingUser = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.render('register_shop', { error: 'An account with this email address already exists. Please login.', success: null });
    }

    const accountsNum = Math.max(1, parseInt(account_count) || 1);
    const stocksNum = Math.max(1, parseInt(stock_count) || 1);
    const monthlyFee = 15000 + (accountsNum * 5000) + (stocksNum * 5000);
    const planName = `VectOS Custom Plan (RWF ${monthlyFee.toLocaleString()}/mo: ${accountsNum} users, ${stocksNum} stocks)`;

    // Create unique code
    const baseCode = shop_name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
    const code = `${baseCode}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create Shop record with 'pending' status
    const shopRes = await execute(
      `INSERT INTO shops (
        name, code, owner_name, phone, email, location, tin_number, status, 
        business_type, subscription_plan, billed_accounts, billed_stocks, monthly_fee, billing_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      [
        shop_name.trim(),
        code,
        owner_name.trim(),
        phone.trim(),
        email.trim(),
        location || 'Kigali, Rwanda',
        tin_number ? tin_number.trim() : null,
        business_type || 'Hardware & Construction',
        planName,
        accountsNum,
        stocksNum,
        monthlyFee,
        `Initial registration: Base RWF 15,000 + ${accountsNum} account(s) + ${stocksNum} stock(s).`
      ]
    );

    const newShopId = shopRes.lastInsertId;

    // Create primary stock warehouse for this new company
    const stockRes = await execute(
      `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'active')`,
      [
        newShopId,
        `Main ${shop_name.trim()} Central Warehouse`,
        `WH-${code.slice(0, 6).toUpperCase()}-01`,
        location || 'Kigali, Rwanda',
        owner_name.trim(),
        phone.trim()
      ]
    );
    const primaryStockId = stockRes.lastInsertId;

    // If additional stocks were requested during registration, create placeholder secondary depots
    if (stocksNum > 1) {
      for (let i = 2; i <= stocksNum; i++) {
        await execute(
          `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
           VALUES (?, ?, ?, ?, ?, ?, 0, 'active')`,
          [
            newShopId,
            `${shop_name.trim()} Branch Depot #${i}`,
            `WH-${code.slice(0, 6).toUpperCase()}-0${i}`,
            `Branch ${i} Location, Rwanda`,
            owner_name.trim(),
            phone.trim()
          ]
        );
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Owner / Manager user for this shop
    await execute(
      `INSERT INTO users (
        shop_id, stock_id, name, email, password, role, job_title, phone, is_active, activation_status,
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
        can_partner_borrow, can_view_buying_prices, can_give_discounts, can_view_reports, can_manage_users,
        can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners,
        can_void_orders, can_edit_company_settings
      ) VALUES (?, ?, ?, ?, ?, 'manager', 'Store Owner / Manager', ?, 1, 'pending_approval', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)`,
      [newShopId, primaryStockId, owner_name.trim(), email.trim(), hashedPassword, phone.trim()]
    );

    await logAudit(undefined, 'SHOP_REGISTER', `New store registered on VectOS: "${shop_name}" (${business_type}) by ${owner_name}. Plan: RWF ${monthlyFee}/mo (Pending VectOS SuperAdmin Activation)`, req, newShopId);

    res.render('register_shop', { 
      error: null, 
      success: `Congratulations! "${shop_name}" has been registered on VectOS with ${accountsNum} staff account(s) and ${stocksNum} warehouse location(s). The VectOS team will contact you to arrange your preferred payment plan, and your access will be unlocked upon review.` 
    });
  } catch (err: any) {
    res.render('register_shop', { error: 'Registration error: ' + err.message, success: null });
  }
});

// Logout
router.get('/logout', async (req: Request, res: Response) => {
  if (req.session.user) {
    await logAudit(req.session.user.id, 'USER_LOGOUT', 'User logged out', req);
  }
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// -------------------------------------------------------------
// SUPER ADMIN MODULE (Platform Owner: Manage & Approve All Quincaillerie Shops)
// -------------------------------------------------------------

router.get('/admin/shops', requireSuperAdmin, async (req: Request, res: Response) => {
  const user = req.session.user!;

  try {
    const shops = await queryAll(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM users WHERE shop_id = s.id) as user_count,
        (SELECT COUNT(*) FROM users WHERE shop_id = s.id AND activation_status = 'pending_approval') as pending_user_count,
        (SELECT COUNT(*) FROM stocks WHERE shop_id = s.id) as stock_count,
        (SELECT COUNT(*) FROM products WHERE shop_id = s.id) as product_count,
        (SELECT COUNT(*) FROM orders WHERE shop_id = s.id) as order_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE shop_id = s.id) as total_sales
      FROM shops s
      ORDER BY s.id DESC
    `);

    // Fetch all users and stocks across all shops for SuperAdmin inspection and instant activation
    const allUsers = await queryAll(`
      SELECT u.*, s.name as shop_name, st.name as stock_name
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      LEFT JOIN stocks st ON u.stock_id = st.id
      ORDER BY u.activation_status = 'pending_approval' DESC, u.shop_id ASC, u.role = 'manager' DESC
    `);

    const allStocks = await queryAll(`
      SELECT st.*, s.name as shop_name,
        (SELECT COUNT(*) FROM products WHERE stock_id = st.id) as product_count,
        (SELECT COALESCE(SUM(quantity), 0) FROM products WHERE stock_id = st.id) as total_units
      FROM stocks st
      LEFT JOIN shops s ON st.shop_id = s.id
      ORDER BY st.shop_id ASC, st.is_main DESC
    `);

    const stats = {
      totalShops: shops.length,
      activeShops: shops.filter(s => s.status === 'active').length,
      pendingShops: shops.filter(s => s.status === 'pending').length,
      suspendedShops: shops.filter(s => s.status === 'suspended').length,
      platformSales: shops.reduce((acc, s) => acc + (s.total_sales || 0), 0),
      totalMonthlyMRR: shops.filter(s => s.status === 'active').reduce((acc, s) => acc + (s.monthly_fee || 20000), 0),
      totalPendingStaff: allUsers.filter(u => u.activation_status === 'pending_approval').length
    };

    res.render('admin/shops', { user, shops, allUsers, allStocks, stats, message: req.query.msg || null });
  } catch (err: any) {
    res.status(500).render('error', { title: 'SuperAdmin Error', message: err.message, path: req.path });
  }
});

// SuperAdmin: Approve / Activate Shop
router.post('/admin/shops/approve/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const shopId = parseInt(req.params.id, 10);
  try {
    const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).send('Shop not found');

    await execute("UPDATE shops SET status = 'active' WHERE id = ?", [shopId]);
    // Also activate the manager user
    await execute("UPDATE users SET is_active = 1, activation_status = 'active' WHERE shop_id = ? AND role = 'manager'", [shopId]);

    await logAudit(req.session.user!.id, 'SUPERADMIN_APPROVE_SHOP', `SuperAdmin approved and activated company: "${shop.name}" (#${shopId})`, req, shopId);

    res.redirect('/admin/shops?msg=Company+and+Manager+approved+and+activated+successfully');
  } catch (err: any) {
    res.status(500).render('error', { title: 'Approval Error', message: err.message, path: req.path });
  }
});

// SuperAdmin: Suspend / Toggle Shop Status (with Cascade Suspension to all shop users)
router.post('/admin/shops/toggle-status/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const shopId = parseInt(req.params.id, 10);
  const { new_status } = req.body;
  try {
    const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).send('Shop not found');

    await execute('UPDATE shops SET status = ? WHERE id = ?', [new_status, shopId]);

    if (new_status === 'suspended') {
      // Cascade: deactivate all users associated with this shop
      await execute('UPDATE users SET is_active = 0 WHERE shop_id = ?', [shopId]);
    } else if (new_status === 'active') {
      // Reactivate manager
      await execute("UPDATE users SET is_active = 1 WHERE shop_id = ? AND role = 'manager'", [shopId]);
    }

    await logAudit(req.session.user!.id, 'SUPERADMIN_STATUS_CHANGE', `SuperAdmin set company "${shop.name}" status to ${new_status.toUpperCase()} (Cascade applied to all staff accounts)`, req, shopId);

    res.redirect('/admin/shops?msg=Company+status+and+staff+access+updated+successfully');
  } catch (err: any) {
    res.status(500).render('error', { title: 'Status Error', message: err.message, path: req.path });
  }
});

// SuperAdmin: Update Pricing & Billing Details for a Shop
router.post('/admin/shops/update-billing/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const shopId = parseInt(req.params.id, 10);
  const { billed_accounts, billed_stocks, monthly_fee, billing_notes, subscription_plan } = req.body;

  try {
    const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).send('Shop not found');

    const accounts = Math.max(1, parseInt(billed_accounts) || 1);
    const stocks = Math.max(1, parseInt(billed_stocks) || 1);
    const fee = parseFloat(monthly_fee) || (15000 + accounts * 5000 + stocks * 5000);

    await execute(
      `UPDATE shops SET 
        billed_accounts = ?, billed_stocks = ?, monthly_fee = ?, billing_notes = ?, subscription_plan = ?
       WHERE id = ?`,
      [accounts, stocks, fee, billing_notes || null, subscription_plan || `VectOS Plan (RWF ${fee.toLocaleString()}/mo)`, shopId]
    );

    await logAudit(req.session.user!.id, 'SUPERADMIN_UPDATE_BILLING', `Updated billing structure for ${shop.name}: RWF ${fee}/mo (${accounts} accounts, ${stocks} stocks)`, req, shopId);

    res.redirect('/admin/shops?msg=Billing+and+pricing+structure+updated');
  } catch (err: any) {
    res.status(500).render('error', { title: 'Billing Update Error', message: err.message, path: req.path });
  }
});

// SuperAdmin: Reset a user's password (generates one-time temp password)
router.post('/admin/users/reset-password/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.id, 10);
  try {
    const targetUser = await queryOne('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!targetUser) return res.status(404).send('User not found');

    const provided = (req.body.new_password || '').trim();
    let tempPassword: string;
    if (provided.length >= 6) {
      tempPassword = provided;
    } else {
      // Auto-generate a readable temporary password
      const words = ['Kigali', 'Nyanza', 'Muhazi', 'Kivu', 'Gorilla', 'Akagera', 'Inyange', 'Umuganda'];
      tempPassword = words[Math.floor(Math.random() * words.length)] + '-' + Math.floor(1000 + Math.random() * 9000) + '!';
    }

    const hashed = await bcrypt.hash(tempPassword, 10);
    await execute(
      "UPDATE users SET password = ?, is_active = 1, activation_status = 'active' WHERE id = ?",
      [hashed, targetId]
    );

    await logAudit(req.session.user!.id, 'SUPERADMIN_PASSWORD_RESET', `SuperAdmin reset password for ${targetUser.name} (${targetUser.email})`, req, targetUser.shop_id);

    res.redirect('/admin/shops?msg=' + encodeURIComponent(`Password reset for ${targetUser.name}. Temporary password: ${tempPassword} — share it securely; they must change it in Settings.`));
  } catch (err: any) {
    res.status(500).render('error', { title: 'Password Reset Error', message: err.message, path: req.path });
  }
});

// SuperAdmin: Activate / Deactivate Individual Staff Account
router.post('/admin/users/toggle-activation/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id, 10);
  const { new_status, activation_note } = req.body;

  try {
    const targetUser = await queryOne('SELECT u.*, s.name as shop_name FROM users u LEFT JOIN shops s ON u.shop_id = s.id WHERE u.id = ?', [userId]);
    if (!targetUser) return res.status(404).send('User not found');

    const isActive = new_status === 'active' ? 1 : 0;
    await execute(
      'UPDATE users SET is_active = ?, activation_status = ?, activation_note = ? WHERE id = ?',
      [isActive, new_status, activation_note || null, userId]
    );

    // If this is a manager and was deactivated, cascade deactivate all employees in that shop
    if (targetUser.role === 'manager' && new_status !== 'active') {
      await execute('UPDATE users SET is_active = 0 WHERE shop_id = ?', [targetUser.shop_id]);
      await logAudit(req.session.user!.id, 'CASCADE_MANAGER_DEACTIVATION', `Manager ${targetUser.name} deactivated; cascaded suspension to all staff in "${targetUser.shop_name}"`, req, targetUser.shop_id);
    }

    // If this is a manager being reactivated, restore access for their previously-approved staff
    if (targetUser.role === 'manager' && new_status === 'active') {
      await execute(
        "UPDATE users SET is_active = 1 WHERE shop_id = ? AND id <> ? AND activation_status = 'active'",
        [targetUser.shop_id, userId]
      );
      await logAudit(req.session.user!.id, 'CASCADE_MANAGER_REACTIVATION', `Manager ${targetUser.name} reactivated; restored access for approved staff in "${targetUser.shop_name}"`, req, targetUser.shop_id);
    }

    await logAudit(req.session.user!.id, 'SUPERADMIN_USER_ACTIVATION', `SuperAdmin set user ${targetUser.name} (${targetUser.email}) activation to ${new_status.toUpperCase()}`, req, targetUser.shop_id);

    res.redirect('/admin/shops?msg=User+activation+status+updated+successfully');
  } catch (err: any) {
    res.status(500).render('error', { title: 'User Activation Error', message: err.message, path: req.path });
  }
});

// SuperAdmin: Switch active shop context
router.get('/admin/switch-shop/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const shopId = parseInt(req.params.id, 10);
  try {
    const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (shop && req.session.user) {
      req.session.user.shop_id = shop.id;
      req.session.user.shop_name = shop.name;
    }
    res.redirect('/dashboard');
  } catch (err: any) {
    res.redirect('/admin/shops');
  }
});

// SuperAdmin: Exit assistance mode and return to global platform overview
router.get('/admin/exit-assist', requireSuperAdmin, async (req: Request, res: Response) => {
  if (req.session.user) {
    req.session.user.shop_id = 0 as any;
    req.session.user.shop_name = 'Central Platform (SuperAdmin)';
  }
  res.redirect('/admin/shops');
});

// -------------------------------------------------------------
// DASHBOARD ROUTE (Multi-Tenant Role-Tailored Analytics)
// -------------------------------------------------------------

router.get('/dashboard', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  
  try {
    // Current shop details
    const shopInfo = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);

    // Shared KPIs scoped to shop
    const todaySales = await queryOne(`
      SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count 
      FROM orders 
      WHERE shop_id = ? AND DATE(created_at) = DATE('now')
    `, [shopId]).catch(() => null) || { total: 0, count: 0 };

    // Total Profit (Sum of profit across completed order items)
    const todayProfitRes = await queryOne(`
      SELECT COALESCE(SUM(oi.profit), 0) as total_profit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.shop_id = ? AND DATE(o.created_at) = DATE('now') AND oi.item_status IN ('approved', 'partner_fulfilled')
    `, [shopId]);
    const todayProfit = todayProfitRes ? todayProfitRes.total_profit : 0;

    // Inventory Value
    const invValRes = await queryOne(`
      SELECT COALESCE(SUM(buying_price * quantity), 0) as total_value, COUNT(*) as total_items,
             SUM(CASE WHEN quantity <= low_stock_threshold THEN 1 ELSE 0 END) as low_stock_count
      FROM products
      WHERE shop_id = ?
    `, [shopId]);

    // Pending Counts
    const pendingStoreCountRes = await queryOne(`
      SELECT COUNT(*) as cnt FROM orders WHERE shop_id = ? AND fulfillment_status = 'pending_store'
    `, [shopId]);
    const pendingStoreCount = pendingStoreCountRes ? pendingStoreCountRes.cnt : 0;

    const pendingAccountantCountRes = await queryOne(`
      SELECT COUNT(*) as cnt FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.shop_id = ? AND oi.item_status = 'rejected'
    `, [shopId]);
    const pendingAccountantCount = pendingAccountantCountRes ? pendingAccountantCountRes.cnt : 0;

    // Debt totals
    const customerDebtRes = await queryOne(`SELECT COALESCE(SUM(credit_balance), 0) as total_debt FROM customers WHERE shop_id = ?`, [shopId]);
    const partnerBalanceRes = await queryOne(`SELECT COALESCE(SUM(current_balance), 0) as total_partner FROM partner_shops WHERE shop_id = ?`, [shopId]);

    // Recent Activity Orders
    const recentOrders = await queryAll(`
      SELECT o.*, c.name as customer_name, u.name as salesperson_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.salesperson_id = u.id
      WHERE o.shop_id = ?
      ORDER BY o.id DESC LIMIT 6
    `, [shopId]);

    // Low Stock Items
    const lowStockProducts = await queryAll(`
      SELECT * FROM products WHERE shop_id = ? AND quantity <= low_stock_threshold ORDER BY quantity ASC LIMIT 5
    `, [shopId]);

    res.render('dashboard', {
      user,
      shopInfo,
      kpis: {
        todaySalesTotal: todaySales.total || 0,
        todaySalesCount: todaySales.count || 0,
        todayProfit: todayProfit || 0,
        inventoryValue: invValRes ? invValRes.total_value : 0,
        totalProductLines: invValRes ? invValRes.total_items : 0,
        lowStockCount: invValRes ? invValRes.low_stock_count : 0,
        pendingStoreCount,
        pendingAccountantCount,
        totalCustomerDebt: customerDebtRes ? customerDebtRes.total_debt : 0,
        totalPartnerBalance: partnerBalanceRes ? partnerBalanceRes.total_partner : 0
      },
      recentOrders,
      lowStockProducts
    });
  } catch (err: any) {
    console.error('Dashboard Error:', err);
    res.status(500).render('error', { title: 'Dashboard Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// PRODUCTS MODULE (Inventory & Bulk Excel/CSV Import)
// -------------------------------------------------------------

router.get('/products', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const search = req.query.search ? String(req.query.search).trim() : '';
  const category = req.query.category ? String(req.query.category) : '';
  const msg = req.query.msg ? String(req.query.msg) : null;

  try {
    let sql = 'SELECT * FROM products WHERE shop_id = ?';
    const params: any[] = [shopId];

    if (search) {
      sql += ' AND (name LIKE ? OR sku LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += ' ORDER BY name ASC';

    const products = await queryAll(sql, params);
    const categoriesRes = await queryAll('SELECT DISTINCT category FROM products WHERE shop_id = ? ORDER BY category ASC', [shopId]);
    const categories = categoriesRes.map(c => c.category);

    res.render('products', {
      user,
      products,
      categories,
      search,
      selectedCategory: category,
      msg
    });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Products Error', message: err.message, path: req.path });
  }
});

// Download Sample Spreadsheet Template
router.get('/products/sample-template', requireAuth, (req: Request, res: Response) => {
  const sampleData = [
    {
      'Product Name': 'CIMERWA Cement 32.5R (50kg)',
      'SKU / Code': 'CEM-325R',
      'Category': 'Cement',
      'Unit': 'Bag',
      'Buying Price': 10500,
      'Initial Quantity': 250,
      'Low Stock Alert': 50,
      'Description': 'Standard construction cement'
    },
    {
      'Product Name': 'Deformed Iron Bars 12mm x 12m',
      'SKU / Code': 'IB-12MM',
      'Category': 'Steel & Rebar',
      'Unit': 'Bar',
      'Buying Price': 11000,
      'Initial Quantity': 300,
      'Low Stock Alert': 40,
      'Description': 'Fe500 grade rebar'
    },
    {
      'Product Name': 'Roofing Sheets Gauge 28 Blue (3m)',
      'SKU / Code': 'RS-G28-BL',
      'Category': 'Roofing',
      'Unit': 'Sheet',
      'Buying Price': 14500,
      'Initial Quantity': 100,
      'Low Stock Alert': 20,
      'Description': 'Color-coated corrugated iron sheets'
    },
    {
      'Product Name': 'PVC Pressure Pipe 110mm PN10 (6m)',
      'SKU / Code': 'PVC-110MM',
      'Category': 'Plumbing',
      'Unit': 'Pipe',
      'Buying Price': 16000,
      'Initial Quantity': 45,
      'Low Stock Alert': 10,
      'Description': 'Heavy duty drainage pipe'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="Quincaille_Stock_Import_Template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Bulk Excel/CSV Product Import
router.post('/products/import-excel', requirePermission('can_manage_stock'), uploadSpreadsheet.single('file'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);

  if (!req.file || !req.file.buffer) {
    return res.status(400).render('error', {
      title: 'Import Error',
      message: 'Please select a valid .xlsx, .xls, or .csv file to import.',
      path: req.path
    });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).render('error', {
        title: 'Empty File',
        message: 'The uploaded spreadsheet contains no data rows.',
        path: req.path
      });
    }

    let insertedCount = 0;
    let updatedCount = 0;

    for (const row of rawRows) {
      // Find keys flexibly
      const name = (row['Product Name'] || row['product_name'] || row['Name'] || row['name'] || row['Item'] || row['item'] || '').toString().trim();
      if (!name) continue;

      const sku = (row['SKU / Code'] || row['SKU'] || row['sku'] || row['Code'] || row['code'] || '').toString().trim() || null;
      const category = (row['Category'] || row['category'] || 'General Hardware').toString().trim();
      const unit = (row['Unit'] || row['unit'] || 'pcs').toString().trim();
      const buyingPrice = parseFloat(row['Buying Price'] || row['buying_price'] || row['Cost'] || row['Price'] || 0) || 0;
      const quantity = parseInt(row['Initial Quantity'] || row['Quantity'] || row['quantity'] || row['Stock'] || row['qty'] || 0, 10) || 0;
      const lowStock = parseInt(row['Low Stock Alert'] || row['low_stock_threshold'] || row['Min Stock'] || 10, 10) || 10;
      const description = (row['Description'] || row['description'] || '').toString().trim() || null;

      // Check if product already exists by name or SKU in this shop
      let existing = null;
      if (sku) {
        existing = await queryOne('SELECT * FROM products WHERE shop_id = ? AND sku = ?', [shopId, sku]);
      }
      if (!existing) {
        existing = await queryOne('SELECT * FROM products WHERE shop_id = ? AND LOWER(name) = LOWER(?)', [shopId, name]);
      }

      if (existing) {
        // Update existing product
        const newQty = existing.quantity + quantity;
        await execute(
          `UPDATE products SET buying_price = ?, quantity = ?, low_stock_threshold = ?, description = COALESCE(?, description), updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [buyingPrice > 0 ? buyingPrice : existing.buying_price, newQty, lowStock, description, existing.id]
        );

        if (quantity > 0) {
          await execute(
            `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
             VALUES (?, ?, ?, 'Stock Received', 'Excel Bulk Import', ?)`,
            [shopId, existing.id, quantity, user.id]
          );
        }
        updatedCount++;
      } else {
        // Insert new product
        const resProd = await execute(
          `INSERT INTO products (shop_id, name, sku, category, unit, buying_price, quantity, low_stock_threshold, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [shopId, name, sku, category, unit, buyingPrice, Math.max(0, quantity), lowStock, description]
        );

        if (quantity > 0) {
          await execute(
            `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
             VALUES (?, ?, ?, 'Stock Received', 'Excel Bulk Import Initial', ?)`,
            [shopId, resProd.lastInsertId, quantity, user.id]
          );
        }
        insertedCount++;
      }
    }

    await logAudit(user.id, 'BULK_IMPORT', `Imported spreadsheet with ${insertedCount} new products added and ${updatedCount} existing products updated.`, req, shopId);

    res.redirect(`/products?msg=Bulk+import+successful!+Added+${insertedCount}+new+products,+updated+${updatedCount}+products.`);
  } catch (err: any) {
    console.error('Excel Import Error:', err);
    res.status(500).render('error', { title: 'Bulk Import Failed', message: err.message, path: req.path });
  }
});

// Fast Batch Product Quick Entry
router.post('/products/batch-add', requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { batch_items } = req.body;

  try {
    let items: any[] = [];
    if (typeof batch_items === 'string') {
      items = JSON.parse(batch_items);
    } else if (Array.isArray(batch_items)) {
      items = batch_items;
    }

    let addedCount = 0;
    for (const item of items) {
      const name = String(item.name || '').trim();
      if (!name) continue;

      const buyingPrice = parseFloat(item.buying_price) || 0;
      const quantity = parseInt(item.quantity, 10) || 0;
      const category = item.category || 'General';
      const unit = item.unit || 'pcs';
      const sku = item.sku || null;

      const resProd = await execute(
        `INSERT INTO products (shop_id, name, sku, category, unit, buying_price, quantity, low_stock_threshold, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, 10, ?)`,
        [shopId, name, sku, category, unit, buyingPrice, Math.max(0, quantity), item.description || null]
      );

      if (quantity > 0) {
        await execute(
          `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
           VALUES (?, ?, ?, 'Stock Received', 'Batch Quick Entry', ?)`,
          [shopId, resProd.lastInsertId, quantity, user.id]
        );
      }
      addedCount++;
    }

    await logAudit(user.id, 'BATCH_ADD', `Added ${addedCount} products via batch quick entry.`, req, shopId);
    res.redirect(`/products?msg=${addedCount}+products+added+successfully`);
  } catch (err: any) {
    res.status(500).render('error', { title: 'Batch Add Error', message: err.message, path: req.path });
  }
});

// Single Product Add
router.post('/products/add', requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { name, sku, category, unit, buying_price, initial_quantity, low_stock_threshold, description } = req.body;

  try {
    const buyPrice = parseFloat(buying_price);
    const initQty = parseInt(initial_quantity, 10) || 0;
    const threshold = parseInt(low_stock_threshold, 10) || 10;

    const resProd = await execute(
      `INSERT INTO products (shop_id, name, sku, category, unit, buying_price, quantity, low_stock_threshold, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [shopId, name, sku || null, category, unit || 'pcs', buyPrice, initQty, threshold, description || null]
    );

    if (initQty > 0) {
      await execute(
        `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, 'Stock Received', 'Initial Inventory Setup', ?)`,
        [shopId, resProd.lastInsertId, initQty, user.id]
      );
    }

    await logAudit(user.id, 'PRODUCT_ADD', `Added new product: ${name} (${category}, Buy Price: ${buyPrice})`, req, shopId);
    res.redirect('/products?msg=Product+added+successfully');
  } catch (err: any) {
    res.status(500).render('error', { title: 'Product Creation Error', message: err.message, path: req.path });
  }
});

// Stock Adjustment
router.post('/products/adjust-stock', requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { product_id, adjustment_qty, movement_type, reference } = req.body;

  try {
    const prodId = parseInt(product_id, 10);
    const adjQty = parseInt(adjustment_qty, 10);

    if (isNaN(prodId) || isNaN(adjQty) || adjQty === 0) {
      return res.redirect('/products');
    }

    const product = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [prodId, shopId]);
    if (!product) return res.redirect('/products');

    const newQty = product.quantity + adjQty;
    if (newQty < 0) {
      return res.status(400).render('error', {
        title: 'Stock Adjustment Error',
        message: `Cannot reduce quantity below 0. Current stock: ${product.quantity}`,
        path: req.path
      });
    }

    await execute('UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newQty, prodId]);

    await execute(
      `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [shopId, prodId, adjQty, movement_type || 'Adjustment', reference || 'Manual Stock Update', user.id]
    );

    await logAudit(user.id, 'STOCK_UPDATE', `Updated stock for ${product.name}: ${adjQty > 0 ? '+' : ''}${adjQty} (New Qty: ${newQty})`, req, shopId);
    res.redirect('/products?msg=Stock+updated+successfully');
  } catch (err: any) {
    res.status(500).render('error', { title: 'Stock Update Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// CUSTOMERS MODULE
// -------------------------------------------------------------

router.get('/customers', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  
  try {
    const customers = await queryAll(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND shop_id = ?) as total_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE customer_id = c.id AND shop_id = ?) as total_spent
      FROM customers c
      WHERE c.shop_id = ?
      ORDER BY c.name ASC
    `, [shopId, shopId, shopId]);

    res.render('customers', { user, customers });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Customers Error', message: err.message, path: req.path });
  }
});

router.post('/customers/add', requirePermission('can_manage_customers'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { name, phone, id_number, email, address } = req.body;

  try {
    const existing = await queryOne('SELECT * FROM customers WHERE shop_id = ? AND phone = ?', [shopId, phone]);
    if (existing) {
      return res.status(400).render('error', {
        title: 'Duplicate Customer',
        message: `A customer with phone number ${phone} already exists (${existing.name}).`,
        path: req.path
      });
    }

    await execute(
      'INSERT INTO customers (shop_id, name, phone, id_number, email, address, credit_balance) VALUES (?, ?, ?, ?, ?, ?, 0.0)',
      [shopId, name, phone, id_number || null, email || null, address || null]
    );

    await logAudit(user.id, 'CUSTOMER_ADD', `Registered new customer: ${name} (${phone})`, req, shopId);
    res.redirect('/customers');
  } catch (err: any) {
    res.status(500).render('error', { title: 'Customer Registration Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// ORDERS MODULE (Creation, Ad-Hoc Items & Partner Sourcing)
// -------------------------------------------------------------

// Orders List View
router.get('/orders', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const filterStatus = req.query.status ? String(req.query.status) : '';

  try {
    let sql = `
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.id_number as customer_id_number, u.name as salesperson_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.salesperson_id = u.id
      WHERE o.shop_id = ?
    `;
    const params: any[] = [shopId];

    if (filterStatus) {
      sql += ' AND (o.fulfillment_status = ? OR o.payment_status = ?)';
      params.push(filterStatus, filterStatus);
    }

    sql += ' ORDER BY o.id DESC';

    const orders = await queryAll(sql, params);
    res.render('orders', { user, orders, filterStatus });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Orders List Error', message: err.message, path: req.path });
  }
});

// Order Creation Form (Salesperson with Ad-Hoc & Partner Sourcing)
router.get('/orders/new', requirePermission('can_create_orders'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);

  try {
    const customers = await queryAll('SELECT * FROM customers WHERE shop_id = ? ORDER BY name ASC', [shopId]);
    const products = await queryAll('SELECT * FROM products WHERE shop_id = ? ORDER BY name ASC', [shopId]);
    const partners = await queryAll('SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC', [shopId]);

    res.render('order_new', { user, customers, products, partners });
  } catch (err: any) {
    res.status(500).render('error', { title: 'New Order Form Error', message: err.message, path: req.path });
  }
});

// Process Order Creation (Supports Existing Products, Ad-Hoc Items & Partner Sourcing)
router.post('/orders/create', requirePermission('can_create_orders'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { 
    customer_mode, 
    customer_id, 
    new_customer_name, 
    new_customer_phone, 
    new_customer_id_number, 
    items, 
    notes 
  } = req.body;

  try {
    let custId = parseInt(customer_id, 10);

    // Auto-register customer at checkout if needed
    if (customer_mode === 'new' || (!customer_id && new_customer_name && new_customer_phone)) {
      const trimmedName = String(new_customer_name || '').trim();
      const trimmedPhone = String(new_customer_phone || '').trim();
      const trimmedIdNo = String(new_customer_id_number || '').trim();

      if (!trimmedName || !trimmedPhone) {
        return res.status(400).render('error', {
          title: 'Customer Details Missing',
          message: 'To automatically register a new customer, please enter both Full Name and Phone Number.',
          path: req.path
        });
      }

      let existingCust = await queryOne('SELECT * FROM customers WHERE shop_id = ? AND phone = ?', [shopId, trimmedPhone]);
      if (!existingCust && trimmedIdNo) {
        existingCust = await queryOne('SELECT * FROM customers WHERE shop_id = ? AND id_number = ?', [shopId, trimmedIdNo]);
      }

      if (existingCust) {
        custId = existingCust.id;
        if (trimmedIdNo && !existingCust.id_number) {
          await execute('UPDATE customers SET id_number = ? WHERE id = ?', [trimmedIdNo, custId]);
        }
      } else {
        const resCust = await execute(
          'INSERT INTO customers (shop_id, name, phone, id_number, credit_balance) VALUES (?, ?, ?, ?, 0.0)',
          [shopId, trimmedName, trimmedPhone, trimmedIdNo || null]
        );
        custId = resCust.lastInsertId;
        await logAudit(user.id, 'CUSTOMER_AUTO_REGISTER', `Auto-registered customer ${trimmedName} (${trimmedPhone}) during order placement`, req, shopId);
      }
    }

    if (isNaN(custId)) {
      return res.status(400).render('error', {
        title: 'Invalid Client Selection',
        message: 'Please select an existing customer or enter details for a new customer to proceed.',
        path: req.path
      });
    }

    let parsedItems: any[] = [];
    if (typeof items === 'string') {
      parsedItems = JSON.parse(items);
    } else if (Array.isArray(items)) {
      parsedItems = items;
    }

    if (!parsedItems || parsedItems.length === 0) {
      return res.status(400).render('error', { title: 'Empty Order', message: 'Order must contain at least one line item.', path: req.path });
    }

    // Process line items (handling existing products and on-the-fly ad-hoc / partner sourced items)
    let grandTotal = 0;
    const validatedLines: Array<{
      product_id: number;
      quantity: number;
      buying_price: number;
      selling_price: number;
      subtotal: number;
      profit: number;
      fulfillment_source: string;
      item_status: string;
      partner_shop_id?: number | null;
    }> = [];

    for (const item of parsedItems) {
      const qty = parseInt(String(item.quantity), 10);
      const selPrice = parseFloat(String(item.selling_price));
      if (qty <= 0 || isNaN(selPrice) || selPrice < 0) continue;

      let prodId = parseInt(String(item.product_id), 10);
      let buyPrice = parseFloat(String(item.buying_price)) || 0;
      let fulfillSource = 'Store';
      let itemStatus = 'pending_store';
      let partnerShopId = item.partner_shop_id ? parseInt(String(item.partner_shop_id), 10) : null;

      // Handle on-the-fly ad-hoc item creation
      if (item.is_adhoc || !prodId || isNaN(prodId)) {
        const adhocName = String(item.product_name || item.name || 'Ad-Hoc Material').trim();
        const adhocCat = String(item.category || 'Special Order').trim();
        const adhocUnit = String(item.unit || 'pcs').trim();
        const adhocBuyPrice = parseFloat(String(item.buying_price)) || (selPrice * 0.85);

        // Check if item was already created
        let existingProd = await queryOne('SELECT * FROM products WHERE shop_id = ? AND LOWER(name) = LOWER(?)', [shopId, adhocName]);
        if (!existingProd) {
          const newProdRes = await execute(
            `INSERT INTO products (shop_id, name, category, unit, buying_price, quantity, low_stock_threshold, description)
             VALUES (?, ?, ?, ?, ?, 0, 5, ?)`,
            [shopId, adhocName, adhocCat, adhocUnit, adhocBuyPrice, 'Auto-created during order entry']
          );
          prodId = newProdRes.lastInsertId;
        } else {
          prodId = existingProd.id;
        }
        buyPrice = adhocBuyPrice;

        if (item.source_type === 'partner' && partnerShopId) {
          const partner = await queryOne('SELECT * FROM partner_shops WHERE id = ?', [partnerShopId]);
          fulfillSource = partner ? partner.name : 'Partner Shop';
          itemStatus = 'partner_fulfilled';

          // Increase partner debt balance
          const partnerCost = buyPrice * qty;
          await execute('UPDATE partner_shops SET current_balance = current_balance + ? WHERE id = ?', [partnerCost, partnerShopId]);
        }
      } else {
        const prod = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [prodId, shopId]);
        if (!prod) continue;
        buyPrice = prod.buying_price;
      }

      const subtotal = selPrice * qty;
      const profit = (selPrice - buyPrice) * qty;
      grandTotal += subtotal;

      validatedLines.push({
        product_id: prodId,
        quantity: qty,
        buying_price: buyPrice,
        selling_price: selPrice,
        subtotal,
        profit,
        fulfillment_source: fulfillSource,
        item_status: itemStatus,
        partner_shop_id: partnerShopId
      });
    }

    if (validatedLines.length === 0) {
      return res.status(400).render('error', { title: 'Order Validation Error', message: 'No valid items found in order.', path: req.path });
    }

    // Generate Order Number
    const countRes = await queryOne('SELECT COUNT(*) as cnt FROM orders WHERE shop_id = ?', [shopId]);
    const orderNum = `ORD-${new Date().getFullYear()}-${String((countRes ? countRes.cnt : 0) + 1).padStart(4, '0')}`;

    // Determine initial order fulfillment status
    const allPartner = validatedLines.every(l => l.item_status === 'partner_fulfilled');
    const initFulfillStatus = allPartner ? 'completed' : 'pending_store';

    // Insert Order Header
    const orderRes = await execute(
      `INSERT INTO orders (shop_id, order_number, customer_id, salesperson_id, total_amount, paid_amount, debt_amount, payment_status, fulfillment_status, notes)
       VALUES (?, ?, ?, ?, ?, 0.0, ?, 'pending', ?, ?)`,
      [shopId, orderNum, custId, user.id, grandTotal, grandTotal, initFulfillStatus, notes || null]
    );

    const orderId = orderRes.lastInsertId;

    // Insert Order Items
    for (const line of validatedLines) {
      await execute(
        `INSERT INTO order_items (order_id, product_id, quantity, buying_price, selling_price, subtotal, profit, fulfillment_source, item_status, partner_shop_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, line.product_id, line.quantity, line.buying_price, line.selling_price, line.subtotal, line.profit, line.fulfillment_source, line.item_status, line.partner_shop_id || null]
      );
    }

    // Update customer credit debt balance
    if (grandTotal > 0) {
      await execute(
        'UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?',
        [grandTotal, custId]
      );
    }

    await logAudit(user.id, 'ORDER_CREATE', `Created order ${orderNum} (Total: RWF ${grandTotal}, Lines: ${validatedLines.length})`, req, shopId);
    res.redirect(`/orders/${orderId}`);
  } catch (err: any) {
    console.error('Order creation error:', err);
    res.status(500).render('error', { title: 'Order Creation Error', message: err.message, path: req.path });
  }
});

// Single Order Detail View
router.get('/orders/:id', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const orderId = parseInt(req.params.id, 10);

  try {
    const order = await queryOne(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email, c.address as customer_address, c.id_number as customer_id_number,
             u.name as salesperson_name, u.role as salesperson_role
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.salesperson_id = u.id
      WHERE o.id = ? AND o.shop_id = ?
    `, [orderId, shopId]);

    if (!order) {
      return res.status(404).render('error', { title: 'Order Not Found', message: 'Requested order does not exist in your store.', path: req.path });
    }

    const items = await queryAll(`
      SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit as product_unit, ps.name as partner_shop_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN partner_shops ps ON oi.partner_shop_id = ps.id
      WHERE oi.order_id = ?
    `, [orderId]);

    const payments = await queryAll(`
      SELECT pay.*, u.name as recorded_by_name, u.role as recorded_by_role
      FROM payments pay
      JOIN users u ON pay.recorded_by = u.id
      WHERE pay.order_id = ?
      ORDER BY pay.created_at ASC
    `, [orderId]);

    const partners = await queryAll('SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC', [shopId]);
    const shopInfo = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);

    res.render('order_detail', { user, order, items, payments, partners, shopInfo });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Order View Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// PRINTABLE SLIP 1: OFFICIAL FINANCIAL RECEIPT (Prices & Amounts)
// -------------------------------------------------------------

router.get('/orders/:id/receipt', requirePermission('can_print_full_receipt'), async (req: Request, res: Response) => {
  const orderId = parseInt(req.params.id, 10);
  const shopId = getActiveShopId(req);

  try {
    const order = await queryOne(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address, c.id_number as customer_id_number,
             u.name as salesperson_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.salesperson_id = u.id
      WHERE o.id = ? AND o.shop_id = ?
    `, [orderId, shopId]);

    if (!order) {
      return res.status(404).render('error', { title: 'Receipt Not Found', message: 'Requested order ID does not exist.', path: req.path });
    }

    const items = await queryAll(`
      SELECT oi.*, p.name as product_name, p.unit as product_unit
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [orderId]);

    const shopInfo = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    const payments = await queryAll('SELECT * FROM payments WHERE order_id = ?', [orderId]);

    res.render('order_receipt', { order, items, shopInfo, payments });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Receipt Generation Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// PRINTABLE SLIP 2: STOCK DELIVERY NOTE / BON DE LIVRAISON (Quantities Only - NO Prices / RRA Audit Safe)
// -------------------------------------------------------------

router.get('/orders/:id/delivery-note', requirePermission('can_print_delivery_note'), async (req: Request, res: Response) => {
  const orderId = parseInt(req.params.id, 10);
  const shopId = getActiveShopId(req);

  try {
    const order = await queryOne(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address, c.id_number as customer_id_number,
             u.name as salesperson_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.salesperson_id = u.id
      WHERE o.id = ? AND o.shop_id = ?
    `, [orderId, shopId]);

    if (!order) {
      return res.status(404).render('error', { title: 'Delivery Note Not Found', message: 'Requested order does not exist.', path: req.path });
    }

    const items = await queryAll(`
      SELECT oi.id, oi.quantity, oi.fulfillment_source, oi.item_status, p.name as product_name, p.sku as product_sku, p.unit as product_unit
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ? AND oi.item_status != 'unavailable'
    `, [orderId]);

    const shopInfo = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);

    res.render('delivery_note', { order, items, shopInfo });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Delivery Slip Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// STOREKEEPER MODULE (Item Review: Approve / Reject)
// -------------------------------------------------------------

router.get('/storekeeper', requirePermission('can_release_stock'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);

  try {
    const pendingItems = await queryAll(`
      SELECT oi.*, o.order_number, o.created_at as order_date, c.name as customer_name, p.name as product_name, p.quantity as current_stock, p.unit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.shop_id = ? AND oi.item_status = 'pending_store'
      ORDER BY oi.id ASC
    `, [shopId]);

    const recentlyReviewed = await queryAll(`
      SELECT oi.*, o.order_number, p.name as product_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.shop_id = ? AND oi.item_status IN ('approved', 'rejected')
      ORDER BY oi.id DESC LIMIT 10
    `, [shopId]);

    res.render('storekeeper', { user, pendingItems, recentlyReviewed });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Storekeeper Module Error', message: err.message, path: req.path });
  }
});

// Storekeeper Review Action
router.post('/storekeeper/item-review', requirePermission('can_release_stock'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { item_id, action, rejection_reason } = req.body;

  try {
    const itemId = parseInt(item_id, 10);
    const item = await queryOne(`
      SELECT oi.*, p.name as product_name, p.quantity as current_stock, o.order_number, o.shop_id
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.id = ? AND o.shop_id = ?
    `, [itemId, shopId]);

    if (!item) return res.status(404).send('Order item not found.');
    if (item.item_status !== 'pending_store') return res.status(400).send('Item has already been reviewed.');

    if (action === 'approve') {
      if (item.current_stock < item.quantity) {
        return res.status(400).render('error', {
          title: 'Insufficient Inventory',
          message: `Cannot approve item "${item.product_name}". Requested: ${item.quantity}, Available Stock: ${item.current_stock}. Please reject to route to Accountant for Partner Shop sourcing.`,
          path: req.path
        });
      }

      await execute("UPDATE order_items SET item_status = 'approved', fulfillment_source = 'Store' WHERE id = ?", [itemId]);

      const newStock = item.current_stock - item.quantity;
      await execute('UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, item.product_id]);

      await execute(
        `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, 'Sale', ?, ?)`,
        [shopId, item.product_id, -item.quantity, item.order_number, user.id]
      );

      await logAudit(user.id, 'STORE_APPROVE_ITEM', `Approved item ${item.product_name} (${item.quantity} qty) for ${item.order_number}`, req, shopId);
    } else if (action === 'reject') {
      await execute(
        "UPDATE order_items SET item_status = 'rejected', rejection_reason = ? WHERE id = ?",
        [rejection_reason || 'Out of stock in warehouse', itemId]
      );

      await logAudit(user.id, 'STORE_REJECT_ITEM', `Rejected item ${item.product_name} for ${item.order_number}. Reason: ${rejection_reason}`, req, shopId);
    }

    await checkAndUpdateOrderCompletion(item.order_id);
    res.redirect('/storekeeper');
  } catch (err: any) {
    res.status(500).render('error', { title: 'Storekeeper Review Error', message: err.message, path: req.path });
  }
});

async function checkAndUpdateOrderCompletion(orderId: number) {
  const pendingItems = await queryAll("SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ? AND item_status = 'pending_store'", [orderId]);
  const rejectedItems = await queryAll("SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ? AND item_status = 'rejected'", [orderId]);

  const pCnt = pendingItems[0] ? pendingItems[0].cnt : 0;
  const rCnt = rejectedItems[0] ? rejectedItems[0].cnt : 0;

  if (pCnt === 0 && rCnt === 0) {
    await execute("UPDATE orders SET fulfillment_status = 'completed' WHERE id = ?", [orderId]);
  } else if (rCnt > 0) {
    await execute("UPDATE orders SET fulfillment_status = 'resolving_rejected' WHERE id = ?", [orderId]);
  } else {
    await execute("UPDATE orders SET fulfillment_status = 'pending_store' WHERE id = ?", [orderId]);
  }
}

// -------------------------------------------------------------
// ACCOUNTANT MODULE (Resolve Rejected Items via Partner Shop)
// -------------------------------------------------------------

router.get('/accountant/rejected-items', requirePermission('can_partner_borrow'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);

  try {
    const rejectedItems = await queryAll(`
      SELECT oi.*, o.order_number, o.created_at as order_date, c.name as customer_name, p.name as product_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.shop_id = ? AND oi.item_status = 'rejected'
      ORDER BY oi.id ASC
    `, [shopId]);

    const partners = await queryAll('SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC', [shopId]);

    res.render('accountant_rejected', { user, rejectedItems, partners });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Accountant Resolution Error', message: err.message, path: req.path });
  }
});

router.post('/accountant/resolve-item', requirePermission('can_partner_borrow'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { item_id, resolution, partner_shop_id, partner_cost } = req.body;

  try {
    const itemId = parseInt(item_id, 10);
    const item = await queryOne(`
      SELECT oi.*, o.id as order_id, o.order_number, p.name as product_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE oi.id = ? AND o.shop_id = ?
    `, [itemId, shopId]);

    if (!item) return res.status(404).send('Item not found.');

    if (resolution === 'partner_shop') {
      const partnerId = parseInt(partner_shop_id, 10);
      const partner = await queryOne('SELECT * FROM partner_shops WHERE id = ? AND shop_id = ?', [partnerId, shopId]);
      if (!partner) return res.status(400).send('Invalid partner shop selected.');

      const cost = parseFloat(partner_cost) || (item.buying_price * item.quantity);

      await execute(`
        UPDATE order_items 
        SET item_status = 'partner_fulfilled', 
            fulfillment_source = ?, 
            partner_shop_id = ?
        WHERE id = ?
      `, [partner.name, partner.id, itemId]);

      await execute('UPDATE partner_shops SET current_balance = current_balance + ? WHERE id = ?', [cost, partner.id]);

      await logAudit(user.id, 'ACCOUNTANT_PARTNER_FULFILL', `Procured item ${item.product_name} for ${item.order_number} from partner shop: ${partner.name} (Cost: RWF ${cost})`, req, shopId);
    } else if (resolution === 'unavailable') {
      await execute(`
        UPDATE order_items 
        SET item_status = 'unavailable', 
            fulfillment_source = 'Unavailable', 
            selling_price = 0.0, 
            subtotal = 0.0, 
            profit = 0.0 
        WHERE id = ?
      `, [itemId]);

      const orderItems = await queryAll('SELECT SUM(subtotal) as new_total FROM order_items WHERE order_id = ?', [item.order_id]);
      const newTotal = orderItems[0] ? orderItems[0].new_total : 0;

      const order = await queryOne('SELECT * FROM orders WHERE id = ?', [item.order_id]);
      if (order) {
        const newDebt = Math.max(0, newTotal - order.paid_amount);
        let payStatus = order.payment_status;
        if (order.paid_amount >= newTotal) payStatus = 'paid';

        await execute(
          'UPDATE orders SET total_amount = ?, debt_amount = ?, payment_status = ? WHERE id = ?',
          [newTotal, newDebt, payStatus, item.order_id]
        );
      }

      await logAudit(user.id, 'ACCOUNTANT_MARK_UNAVAILABLE', `Marked item ${item.product_name} as Unavailable for ${item.order_number}`, req, shopId);
    }

    await checkAndUpdateOrderCompletion(item.order_id);
    res.redirect('/accountant/rejected-items');
  } catch (err: any) {
    res.status(500).render('error', { title: 'Resolution Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// PAYMENTS MODULE
// -------------------------------------------------------------

router.get('/payments', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);

  try {
    const payments = await queryAll(`
      SELECT pay.*, o.order_number, o.total_amount, o.paid_amount, o.debt_amount, c.name as customer_name, u.name as recorded_by_name, u.role as recorded_by_role
      FROM payments pay
      JOIN orders o ON pay.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON pay.recorded_by = u.id
      WHERE pay.shop_id = ?
      ORDER BY pay.id DESC
    `, [shopId]);

    const debtOrders = await queryAll(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.shop_id = ? AND o.debt_amount > 0
      ORDER BY o.id DESC
    `, [shopId]);

    res.render('payments', { user, payments, debtOrders });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Payments Module Error', message: err.message, path: req.path });
  }
});

router.post('/payments/record', requirePermission('can_process_payments'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { order_id, payment_amount, payment_method, reference_no } = req.body;

  try {
    const orderId = parseInt(order_id, 10);
    const amount = parseFloat(payment_amount);

    if (isNaN(orderId) || isNaN(amount) || amount <= 0) {
      return res.status(400).send('Invalid payment details.');
    }

    const order = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) return res.status(404).send('Order not found.');

    const newPaid = order.paid_amount + amount;
    const newDebt = Math.max(0, order.total_amount - newPaid);
    let newStatus = 'partial';
    if (newPaid >= order.total_amount) {
      newStatus = 'paid';
    }

    await execute(
      `INSERT INTO payments (shop_id, order_id, amount, payment_method, reference_no, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [shopId, orderId, amount, payment_method, reference_no || `PAY-${Date.now()}`, user.id]
    );

    await execute(
      'UPDATE orders SET paid_amount = ?, debt_amount = ?, payment_status = ? WHERE id = ?',
      [newPaid, newDebt, newStatus, orderId]
    );

    if (order.debt_amount > 0) {
      const debtReduction = Math.min(order.debt_amount, amount);
      await execute(
        'UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ?',
        [debtReduction, order.customer_id]
      );
    }

    await logAudit(user.id, 'PAYMENT_RECORDED', `Recorded payment of RWF ${amount} for order ${order.order_number} (${payment_method.toUpperCase()})`, req, shopId);
    res.redirect('/payments');
  } catch (err: any) {
    res.status(500).render('error', { title: 'Payment Recording Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// PARTNER SHOPS MODULE
// -------------------------------------------------------------

router.get('/partners', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);

  try {
    const partners = await queryAll('SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC', [shopId]);
    res.render('partners', { user, partners });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Partners Module Error', message: err.message, path: req.path });
  }
});

router.post('/partners/add', requirePermission('can_manage_partners'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { name, contact_person, phone, address } = req.body;

  try {
    await execute(
      'INSERT INTO partner_shops (shop_id, name, contact_person, phone, address, current_balance) VALUES (?, ?, ?, ?, ?, 0.0)',
      [shopId, name, contact_person, phone, address || null]
    );

    await logAudit(user.id, 'PARTNER_ADD', `Added partner shop: ${name} (${phone})`, req, shopId);
    res.redirect('/partners');
  } catch (err: any) {
    res.status(500).render('error', { title: 'Partner Registration Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// MULTI-STOCK / WAREHOUSE MANAGEMENT MODULE
// -------------------------------------------------------------

router.get('/stocks', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const msg = req.query.msg ? String(req.query.msg) : null;
  const error = req.query.error ? String(req.query.error) : null;

  try {
    const stocks = await queryAll(`
      SELECT st.*,
        (SELECT COUNT(*) FROM products WHERE stock_id = st.id) as product_count,
        (SELECT COALESCE(SUM(quantity), 0) FROM products WHERE stock_id = st.id) as total_units,
        (SELECT COALESCE(SUM(quantity * buying_price), 0) FROM products WHERE stock_id = st.id) as total_valuation,
        (SELECT COUNT(*) FROM users WHERE stock_id = st.id) as staff_count
      FROM stocks st
      WHERE st.shop_id = ?
      ORDER BY st.is_main DESC, st.name ASC
    `, [shopId]);

    const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    const products = await queryAll('SELECT id, name, sku, stock_id, quantity, buying_price FROM products WHERE shop_id = ? ORDER BY name ASC', [shopId]);

    // Stock transfers history
    const transfers = await queryAll(`
      SELECT t.*, p.name as product_name, p.sku as product_sku,
             fs.name as from_stock_name, ts.name as to_stock_name,
             u.name as transferred_by_name
      FROM stock_transfers t
      JOIN products p ON t.product_id = p.id
      JOIN stocks fs ON t.from_stock_id = fs.id
      JOIN stocks ts ON t.to_stock_id = ts.id
      LEFT JOIN users u ON t.transferred_by = u.id
      WHERE t.shop_id = ?
      ORDER BY t.id DESC LIMIT 50
    `, [shopId]);

    res.render('stocks', {
      user,
      shop,
      stocks,
      products,
      transfers,
      msg,
      error
    });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Stocks Module Error', message: err.message, path: req.path });
  }
});

// Add New Warehouse / Stock Depot
router.post('/stocks/add', requireManager, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { name, code, location, manager_name, phone } = req.body;

  try {
    if (!name || !name.trim()) {
      return res.redirect('/stocks?error=Warehouse+depot+name+is+required');
    }

    const finalCode = (code && code.trim()) ? code.trim().toUpperCase() : `WH-${Math.floor(1000 + Math.random() * 9000)}`;

    const stockRes = await execute(
      `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'active')`,
      [
        shopId,
        name.trim(),
        finalCode,
        location ? location.trim() : 'Kigali, Rwanda',
        manager_name ? manager_name.trim() : user.name,
        phone ? phone.trim() : user.phone
      ]
    );

    // Update shop billed stocks count
    await execute('UPDATE shops SET billed_stocks = (SELECT COUNT(*) FROM stocks WHERE shop_id = ?) WHERE id = ?', [shopId, shopId]);

    await logAudit(user.id, 'STOCK_WAREHOUSE_ADD', `Added new stock depot: "${name}" (${finalCode}) at ${location}`, req, shopId);
    res.redirect('/stocks?msg=New+warehouse+depot+registered+successfully');
  } catch (err: any) {
    res.redirect('/stocks?error=' + encodeURIComponent(err.message));
  }
});

// Transfer Inventory Between Stock Warehouses
router.post('/stocks/transfer', requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { product_id, from_stock_id, to_stock_id, quantity, notes } = req.body;

  try {
    const prodId = parseInt(product_id, 10);
    const fromId = parseInt(from_stock_id, 10);
    const toId = parseInt(to_stock_id, 10);
    const qty = parseInt(quantity, 10);

    if (isNaN(prodId) || isNaN(fromId) || isNaN(toId) || isNaN(qty) || qty <= 0) {
      return res.redirect('/stocks?error=Invalid+transfer+parameters');
    }

    if (fromId === toId) {
      return res.redirect('/stocks?error=Origin+and+destination+warehouses+must+be+different');
    }

    const sourceProduct = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [prodId, shopId]);
    if (!sourceProduct) {
      return res.redirect('/stocks?error=Selected+product+not+found');
    }

    if (sourceProduct.quantity < qty) {
      return res.redirect(`/stocks?error=Insufficient+stock+balance.+Available:+${sourceProduct.quantity}+units`);
    }

    // Deduct from origin product
    await execute('UPDATE products SET quantity = quantity - ? WHERE id = ?', [qty, prodId]);

    // Check if product exists in destination warehouse (matched by SKU & Shop)
    let destProduct = await queryOne('SELECT * FROM products WHERE shop_id = ? AND stock_id = ? AND sku = ?', [shopId, toId, sourceProduct.sku]);
    if (destProduct) {
      await execute('UPDATE products SET quantity = quantity + ? WHERE id = ?', [qty, destProduct.id]);
    } else {
      // Create destination product record in that warehouse
      await execute(
        `INSERT INTO products (
          shop_id, stock_id, name, sku, category, unit, buying_price, 
          min_selling_price, default_selling_price, max_selling_price, quantity, low_stock_threshold, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          toId,
          sourceProduct.name,
          sourceProduct.sku,
          sourceProduct.category,
          sourceProduct.unit,
          sourceProduct.buying_price,
          sourceProduct.min_selling_price,
          sourceProduct.default_selling_price,
          sourceProduct.max_selling_price,
          qty,
          sourceProduct.low_stock_threshold,
          sourceProduct.description
        ]
      );
    }

    // Record stock transfer log
    await execute(
      `INSERT INTO stock_transfers (shop_id, from_stock_id, to_stock_id, product_id, quantity, transferred_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [shopId, fromId, toId, prodId, qty, user.id, notes ? notes.trim() : null]
    );

    const fromStock = await queryOne('SELECT name FROM stocks WHERE id = ?', [fromId]);
    const toStock = await queryOne('SELECT name FROM stocks WHERE id = ?', [toId]);

    await logAudit(
      user.id, 
      'STOCK_TRANSFER', 
      `Transferred ${qty} units of "${sourceProduct.name}" from [${fromStock?.name}] to [${toStock?.name}]`, 
      req, 
      shopId
    );

    res.redirect(`/stocks?msg=Successfully+transferred+${qty}+units+of+${encodeURIComponent(sourceProduct.name)}`);
  } catch (err: any) {
    res.redirect('/stocks?error=' + encodeURIComponent(err.message));
  }
});

// -------------------------------------------------------------
// REPORTS MODULE (Multi-Stock & Consolidated Total Business)
// -------------------------------------------------------------

router.get('/reports', requirePermission('can_view_reports'), async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const selectedStockId = req.query.stock_id ? String(req.query.stock_id) : 'all';

  try {
    // 0. Fetch all stock locations for this company
    const stocks = await queryAll('SELECT * FROM stocks WHERE shop_id = ? ORDER BY is_main DESC, name ASC', [shopId]);

    // 1. Stock Breakdown Comparison Table (for all warehouses)
    const stockBreakdown = await queryAll(`
      SELECT st.*,
             (SELECT COUNT(*) FROM products WHERE stock_id = st.id) as product_lines,
             (SELECT COALESCE(SUM(quantity), 0) FROM products WHERE stock_id = st.id) as total_units,
             (SELECT COALESCE(SUM(quantity * buying_price), 0) FROM products WHERE stock_id = st.id) as valuation,
             (SELECT COALESCE(SUM(oi.subtotal), 0) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.shop_id = st.shop_id AND o.stock_id = st.id AND oi.item_status IN ('approved', 'partner_fulfilled')) as sales_revenue,
             (SELECT COALESCE(SUM(oi.profit), 0) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.shop_id = st.shop_id AND o.stock_id = st.id AND oi.item_status IN ('approved', 'partner_fulfilled')) as sales_profit
      FROM stocks st
      WHERE st.shop_id = ?
      ORDER BY st.is_main DESC, st.name ASC
    `, [shopId]);

    // 2. Sales & Profit Summary by Salesperson (filtered or combined)
    let spQuery = `
      SELECT u.name as salesperson, COUNT(DISTINCT o.id) as orders_count, 
             COALESCE(SUM(oi.subtotal), 0) as total_sales,
             COALESCE(SUM(oi.profit), 0) as total_profit
      FROM users u
      LEFT JOIN orders o ON o.salesperson_id = u.id AND o.shop_id = ?
    `;
    const spParams: any[] = [shopId];

    if (selectedStockId !== 'all') {
      spQuery += ' AND o.stock_id = ?';
      spParams.push(parseInt(selectedStockId, 10));
    }

    spQuery += `
      LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.item_status IN ('approved', 'partner_fulfilled')
      WHERE u.shop_id = ?
      GROUP BY u.id
    `;
    spParams.push(shopId);

    const salespersonProfit = await queryAll(spQuery, spParams);

    // 3. Product Profitability & Performance
    let prodQuery = `
      SELECT p.name, p.category, p.buying_price,
             COALESCE(SUM(oi.quantity), 0) as total_units_sold,
             COALESCE(SUM(oi.subtotal), 0) as total_revenue,
             COALESCE(SUM(oi.profit), 0) as total_profit
      FROM products p
    `;
    const prodParams: any[] = [];

    if (selectedStockId !== 'all') {
      prodQuery += `
        LEFT JOIN order_items oi ON oi.product_id = p.id AND oi.item_status IN ('approved', 'partner_fulfilled')
        LEFT JOIN orders o ON oi.order_id = o.id AND o.stock_id = ?
        WHERE p.shop_id = ? AND (p.stock_id = ? OR p.stock_id IS NULL)
      `;
      prodParams.push(parseInt(selectedStockId, 10), shopId, parseInt(selectedStockId, 10));
    } else {
      prodQuery += `
        LEFT JOIN order_items oi ON oi.product_id = p.id AND oi.item_status IN ('approved', 'partner_fulfilled')
        WHERE p.shop_id = ?
      `;
      prodParams.push(shopId);
    }

    prodQuery += `
      GROUP BY p.name, p.category
      ORDER BY total_profit DESC
    `;

    const productPerformance = await queryAll(prodQuery, prodParams);

    // 4. Customer Debt Breakdown
    const customerDebts = await queryAll(`
      SELECT name, phone, credit_balance FROM customers WHERE shop_id = ? AND credit_balance > 0 ORDER BY credit_balance DESC
    `, [shopId]);

    // 5. Partner Shop Balances
    const partnerBalances = await queryAll(`
      SELECT name, contact_person, phone, current_balance FROM partner_shops WHERE shop_id = ? AND current_balance > 0 ORDER BY current_balance DESC
    `, [shopId]);

    // Totals calculation
    const totalBusinessRevenue = productPerformance.reduce((acc, p) => acc + (p.total_revenue || 0), 0);
    const totalBusinessProfit = productPerformance.reduce((acc, p) => acc + (p.total_profit || 0), 0);
    const totalInventoryValuation = stockBreakdown.reduce((acc, s) => acc + (s.valuation || 0), 0);

    const activeStockName = selectedStockId === 'all' 
      ? 'All Warehouses (Consolidated Total Business)' 
      : (stocks.find(s => String(s.id) === selectedStockId)?.name || 'Selected Warehouse');

    res.render('reports', {
      user,
      stocks,
      selectedStockId,
      activeStockName,
      stockBreakdown,
      salespersonProfit,
      productPerformance,
      customerDebts,
      partnerBalances,
      totals: {
        revenue: totalBusinessRevenue,
        profit: totalBusinessProfit,
        valuation: totalInventoryValuation
      }
    });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Reports Module Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// USER MANAGEMENT & DYNAMIC PERMISSION CHECKLISTS MATRIX
// -------------------------------------------------------------

router.get('/users', requireManager, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);

  try {
    let sql = 'SELECT * FROM users';
    const params: any[] = [];

    if (user.role !== 'superadmin') {
      sql += ' WHERE shop_id = ?';
      params.push(shopId);
    }
    sql += " ORDER BY role = 'manager' DESC, name ASC";

    const users = await queryAll(sql, params);
    res.render('users', { user, users, msg: req.query.msg || null });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Users Module Error', message: err.message, path: req.path });
  }
});

// Manager: Add New Employee with Custom Permission Checklist
router.post('/users/add', requireManager, async (req: Request, res: Response) => {
  const currentUser = req.session.user!;
  const shopId = getActiveShopId(req);
  const { 
    name, 
    email, 
    password, 
    job_title, 
    phone,
    can_create_orders,
    can_process_payments,
    can_release_stock,
    can_manage_stock,
    can_import_export_stock,
    can_partner_borrow,
    can_view_buying_prices,
    can_give_discounts,
    can_view_reports,
    can_manage_users,
    can_print_full_receipt,
    can_print_delivery_note,
    can_manage_customers,
    can_manage_partners,
    can_void_orders,
    can_edit_company_settings
  } = req.body;

  try {
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).render('error', {
        title: 'User Creation Error',
        message: `An account with email ${email} is already in use.`,
        path: req.path
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    await execute(
      `INSERT INTO users (
        shop_id, name, email, password, role, job_title, phone, is_active, activation_status,
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
        can_partner_borrow, can_view_buying_prices, can_give_discounts, can_view_reports, can_manage_users,
        can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners,
        can_void_orders, can_edit_company_settings
      ) VALUES (?, ?, ?, ?, 'employee', ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        name.trim(),
        email.trim(),
        hashed,
        job_title || 'Operations Staff',
        phone || null,
        can_create_orders ? 1 : 0,
        can_process_payments ? 1 : 0,
        can_release_stock ? 1 : 0,
        can_manage_stock ? 1 : 0,
        can_import_export_stock ? 1 : 0,
        can_partner_borrow ? 1 : 0,
        can_view_buying_prices ? 1 : 0,
        can_give_discounts ? 1 : 0,
        can_view_reports ? 1 : 0,
        can_manage_users ? 1 : 0,
        can_print_full_receipt ? 1 : 0,
        can_print_delivery_note ? 1 : 0,
        can_manage_customers ? 1 : 0,
        can_manage_partners ? 1 : 0,
        can_void_orders ? 1 : 0,
        can_edit_company_settings ? 1 : 0
      ]
    );

    await logAudit(currentUser.id, 'USER_CREATE', `Created employee account "${name}" (pending SuperAdmin activation)`, req, shopId);
    res.redirect('/users?msg=Employee+account+created+and+activated+successfully');
  } catch (err: any) {
    res.status(500).render('error', { title: 'User Creation Error', message: err.message, path: req.path });
  }
});

// Manager: Edit Employee Info & Modify Permission Checkboxes on the Fly
router.post('/users/edit/:id', requireManager, async (req: Request, res: Response) => {
  const currentUser = req.session.user!;
  const shopId = getActiveShopId(req);
  const targetId = parseInt(req.params.id, 10);
  const { 
    name, 
    email, 
    password, 
    job_title, 
    phone, 
    is_active,
    can_create_orders,
    can_process_payments,
    can_release_stock,
    can_manage_stock,
    can_import_export_stock,
    can_partner_borrow,
    can_view_buying_prices,
    can_give_discounts,
    can_view_reports,
    can_manage_users,
    can_print_full_receipt,
    can_print_delivery_note,
    can_manage_customers,
    can_manage_partners,
    can_void_orders,
    can_edit_company_settings
  } = req.body;

  try {
    const target = await queryOne('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!target) return res.status(404).send('User not found.');

    // Security check: non-superadmin cannot edit users from other shops
    if (currentUser.role !== 'superadmin' && target.shop_id !== shopId) {
      return res.status(403).send('Forbidden');
    }

    let passwordClause = '';
    const params: any[] = [
      name.trim(),
      email.trim(),
      job_title || target.job_title,
      phone || null,
      is_active ? 1 : 0,
      can_create_orders ? 1 : 0,
      can_process_payments ? 1 : 0,
      can_release_stock ? 1 : 0,
      can_manage_stock ? 1 : 0,
      can_import_export_stock ? 1 : 0,
      can_partner_borrow ? 1 : 0,
      can_view_buying_prices ? 1 : 0,
      can_give_discounts ? 1 : 0,
      can_view_reports ? 1 : 0,
      can_manage_users ? 1 : 0,
      can_print_full_receipt ? 1 : 0,
      can_print_delivery_note ? 1 : 0,
      can_manage_customers ? 1 : 0,
      can_manage_partners ? 1 : 0,
      can_void_orders ? 1 : 0,
      can_edit_company_settings ? 1 : 0
    ];

    if (password && password.trim().length > 0) {
      const hashed = await bcrypt.hash(password.trim(), 10);
      passwordClause = ', password = ?';
      params.push(hashed);
    }

    params.push(targetId);

    await execute(
      `UPDATE users SET 
        name = ?, email = ?, job_title = ?, phone = ?, is_active = ?,
        can_create_orders = ?, can_process_payments = ?, can_release_stock = ?, can_manage_stock = ?, can_import_export_stock = ?,
        can_partner_borrow = ?, can_view_buying_prices = ?, can_give_discounts = ?, can_view_reports = ?, can_manage_users = ?,
        can_print_full_receipt = ?, can_print_delivery_note = ?, can_manage_customers = ?, can_manage_partners = ?,
        can_void_orders = ?, can_edit_company_settings = ?
        ${passwordClause}
       WHERE id = ?`,
      params
    );

    await logAudit(currentUser.id, 'USER_EDIT_PERMISSIONS', `Updated permissions & profile for employee ${name} (#${targetId})`, req, shopId);
    res.redirect('/users?msg=User+profile+and+permissions+updated+successfully');
  } catch (err: any) {
    res.status(500).render('error', { title: 'User Update Error', message: err.message, path: req.path });
  }
});

// Manager: Quick Toggle Active Status
router.post('/users/delete/:id', requireManager, async (req: Request, res: Response) => {
  const currentUserId = req.session.user!.id;
  const targetId = parseInt(req.params.id, 10);

  if (isNaN(targetId)) return res.status(400).send('Invalid user ID.');

  if (targetId === currentUserId) {
    return res.status(400).render('error', {
      title: 'Action Prohibited',
      message: 'You cannot remove or deactivate your own active session account.',
      path: req.path
    });
  }

  try {
    const targetUser = await queryOne('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!targetUser) return res.status(404).send('User not found.');

    try {
      await execute('DELETE FROM users WHERE id = ?', [targetId]);
      await logAudit(currentUserId, 'USER_DELETE', `Permanently deleted user account ${targetUser.name}`, req);
    } catch (err) {
      await execute('UPDATE users SET is_active = 0 WHERE id = ?', [targetId]);
      await logAudit(currentUserId, 'USER_DEACTIVATE', `Deactivated user account ${targetUser.name}`, req);
    }

    res.redirect('/users?msg=User+status+updated');
  } catch (err: any) {
    res.status(500).render('error', { title: 'User Removal Error', message: err.message, path: req.path });
  }
});

// -------------------------------------------------------------
// COMPANY SETTINGS & MANAGER PROFILE
// -------------------------------------------------------------

router.get('/settings', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);

  try {
    const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    res.render('settings', { 
      user, 
      shop, 
      msg: req.query.msg || null, 
      error: req.query.error || null 
    });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Settings Error', message: err.message, path: req.path });
  }
});

// Update Company Header / Details (TIN, Phone, Address, Name)
router.post('/settings/company', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);
  const { name, phone, email, location, tin_number, receipt_footer_text } = req.body;

  // Authorization check: manager, superadmin, or permission flag
  if (user.role !== 'manager' && user.role !== 'superadmin' && !user.can_edit_company_settings) {
    return res.status(403).render('error', { title: 'Access Denied', message: 'You do not have permission to modify company branding/settings.', path: req.path });
  }

  try {
    await execute(
      `UPDATE shops SET 
        name = ?, phone = ?, email = ?, location = ?, tin_number = ?, receipt_footer_text = ?
       WHERE id = ?`,
      [
        name.trim(),
        phone ? phone.trim() : null,
        email ? email.trim() : null,
        location ? location.trim() : null,
        tin_number ? tin_number.trim() : null,
        receipt_footer_text ? receipt_footer_text.trim() : null,
        shopId
      ]
    );

    // Update session store name if applicable
    if (req.session.user) {
      req.session.user.shop_name = name.trim();
    }

    await logAudit(user.id, 'COMPANY_SETTINGS_UPDATE', `Updated company profile details for "${name}" (TIN: ${tin_number})`, req, shopId);
    res.redirect('/settings?msg=Company+details+updated+successfully');
  } catch (err: any) {
    res.redirect('/settings?error=' + encodeURIComponent(err.message));
  }
});

// Update User Password / Personal Profile
router.post('/settings/password', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const { current_password, new_password, confirm_password, phone, name } = req.body;

  try {
    const dbUser = await queryOne('SELECT * FROM users WHERE id = ?', [user.id]);
    if (!dbUser) return res.status(404).send('User record not found.');

    if (new_password) {
      if (new_password !== confirm_password) {
        return res.redirect('/settings?error=New+passwords+do+not+match');
      }

      const match = await bcrypt.compare(current_password, dbUser.password);
      if (!match) {
        return res.redirect('/settings?error=Current+password+is+incorrect');
      }

      const hashed = await bcrypt.hash(new_password, 10);
      await execute('UPDATE users SET password = ?, name = ?, phone = ? WHERE id = ?', [hashed, name ? name.trim() : dbUser.name, phone ? phone.trim() : dbUser.phone, user.id]);
    } else {
      await execute('UPDATE users SET name = ?, phone = ? WHERE id = ?', [name ? name.trim() : dbUser.name, phone ? phone.trim() : dbUser.phone, user.id]);
    }

    if (name && req.session.user) req.session.user.name = name.trim();
    if (phone && req.session.user) req.session.user.phone = phone.trim();

    await logAudit(user.id, 'PASSWORD_PROFILE_UPDATE', `Updated credentials/profile details for ${user.email}`, req, user.shop_id);
    res.redirect('/settings?msg=Profile+updated+successfully');
  } catch (err: any) {
    res.redirect('/settings?error=' + encodeURIComponent(err.message));
  }
});

// -------------------------------------------------------------
// AUDIT LOGS MODULE
// -------------------------------------------------------------

router.get('/audit-logs', requireManager, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const shopId = getActiveShopId(req);

  try {
    let sql = `
      SELECT a.*, u.name as user_name, u.role as user_role, s.name as shop_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN shops s ON a.shop_id = s.id
    `;
    const params: any[] = [];

    if (user.role !== 'superadmin') {
      sql += ' WHERE a.shop_id = ?';
      params.push(shopId);
    }

    sql += ' ORDER BY a.id DESC LIMIT 100';

    const logs = await queryAll(sql, params);
    res.render('audit_logs', { user, logs });
  } catch (err: any) {
    res.status(500).render('error', { title: 'Audit Logs Error', message: err.message, path: req.path });
  }
});

export default router;
