import { Router, Request, Response, NextFunction } from 'express';
import { queryAll, queryOne, execute, withTransaction } from '../database/db';
import { requireAuth, requirePermission, hasUserPermission } from '../auth';
import { getTenantShopId } from './apiRoutes';
import {
  isR2Configured,
  isValidTenantPhotoKey,
  createOrderPhotoUploadUrl,
  createOrderPhotoViewUrl,
} from '../r2';

const router = Router();

/**
 * Ensures the caller belongs to an active tenant whose workflow_mode === 'strict_chain'.
 * Completely isolates this enterprise verification pipeline from standard VectOS stores.
 */
async function requireStrictChainShop(req: Request, res: Response, next: NextFunction) {
  const shopId = getTenantShopId(req);
  if (!shopId) {
    return res.status(403).json({
      error: 'Tenant Store Association Required: Your session is not linked to an active store.',
    });
  }

  try {
    const shop = await queryOne<any>('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!shop) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }
    if (shop.workflow_mode !== 'strict_chain') {
      return res.status(403).json({
        error: 'Strict Verification Chain is not enabled for this store tenant.',
      });
    }
    res.locals.shopId = shopId;
    res.locals.shop = shop;
    next();
  } catch (err: any) {
    console.error('StrictChain middleware error:', err);
    return res.status(500).json({ error: 'Failed to verify store workflow configuration.' });
  }
}

async function logChainAudit(req: Request, action: string, details: string, shopId: number) {
  try {
    const userId = req.session?.user?.id || null;
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    await execute(
      'INSERT INTO audit_logs (shop_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
      [shopId, userId, action, details, ip]
    );
  } catch (err) {
    console.error('StrictChain audit log error:', err);
  }
}

/**
 * Calculates total reserved base units per product across uncompleted strict-chain orders.
 * Excludes completed, cancelled, and returned_to_seller drafts.
 */
async function getReservedBaseUnitsMap(shopId: number, excludeOrderId?: number): Promise<Map<number, number>> {
  const params: any[] = [shopId];
  let extraWhere = '';
  if (excludeOrderId) {
    extraWhere = ' AND o.id != ?';
    params.push(excludeOrderId);
  }

  const rows = await queryAll<{ product_id: number; reserved_units: number }>(
    `SELECT oi.product_id,
            COALESCE(SUM(oi.quantity * COALESCE(oi.pack_size, 1)), 0) as reserved_units
     FROM order_items oi
     INNER JOIN orders o ON oi.order_id = o.id
     WHERE o.shop_id = ?
       AND o.chain_status IN ('pending_supervisor_1', 'in_release', 'flagged_for_manager')
       ${extraWhere}
     GROUP BY oi.product_id`,
    params
  );

  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(Number(r.product_id), Number(r.reserved_units || 0));
  }
  return map;
}

/**
 * Finalizes an order atomically inside an open transaction once all legs are supervisor_confirmed:
 * 1. Marks order chain_status = 'completed', fulfillment_status = 'completed'
 * 2. Decrements products.quantity cleanly and inserts inventory_movements with true stock_id
 * 3. Creates Manager Audit Alert rows in product_watch_alerts for every watched product sold
 */
async function commitCompletedChainOrderTx(params: {
  shopId: number;
  orderId: number;
  orderNumber: string;
  customerName: string;
  sellerName: string;
  firstVerifierName: string;
  finalVerifierId: number;
  finalVerifierName: string;
}) {
  const {
    shopId,
    orderId,
    orderNumber,
    customerName,
    sellerName,
    firstVerifierName,
    finalVerifierId,
    finalVerifierName,
  } = params;

  const items = await queryAll<any>(
    `SELECT oi.*, p.name as product_name, p.unit as product_unit, p.is_watched, p.stock_id as prod_stock_id,
            st.name as source_stock_name
     FROM order_items oi
     INNER JOIN products p ON oi.product_id = p.id
     LEFT JOIN stocks st ON COALESCE(oi.source_stock_id, p.stock_id) = st.id
     WHERE oi.order_id = ?`,
    [orderId]
  );

  for (const item of items) {
    const baseUnits = Math.round(Number(item.quantity || 0)) * Math.max(1, Math.round(Number(item.pack_size || 1)));
    const targetStockId = Number(item.source_stock_id || item.prod_stock_id || 1);

    const stockUpdate = await execute(
      `UPDATE products
       SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND shop_id = ? AND quantity >= ?`,
      [baseUnits, item.product_id, shopId, baseUnits]
    );

    if (stockUpdate.changes === 0) {
      throw new Error(
        `Insufficient physical stock for "${item.product_name}". Cannot complete release without available stock.`
      );
    }

    await execute(
      `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
       VALUES (?, ?, ?, ?, 'Sale', ?, ?)`,
      [
        shopId,
        targetStockId,
        item.product_id,
        -baseUnits,
        `Verified Release ${item.quantity} ${item.sold_unit || item.product_unit || 'pcs'} (${orderNumber})`,
        finalVerifierId,
      ]
    );

    await execute(
      `UPDATE order_items SET item_status = 'approved' WHERE id = ?`,
      [item.id]
    );

    if (Number(item.is_watched) === 1) {
      const updatedProd = await queryOne<{ quantity: number }>(
        'SELECT quantity FROM products WHERE id = ? AND shop_id = ?',
        [item.product_id, shopId]
      );
      const remainingAfter = Number(updatedProd?.quantity ?? 0);

      await execute(
        `INSERT INTO product_watch_alerts (
           shop_id, order_id, order_number, product_id, product_name,
           stock_id, stock_name, quantity_sold, sold_unit, stock_remaining_after,
           customer_name, seller_name, first_verifier_name, final_verifier_name, is_audited
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          shopId,
          orderId,
          orderNumber,
          item.product_id,
          item.product_name,
          targetStockId,
          item.source_stock_name || (item.leg_type === 'warehouse' ? 'Warehouse' : 'Main Shop'),
          Number(item.quantity || 0),
          item.sold_unit || item.product_unit || 'pcs',
          remainingAfter,
          customerName,
          sellerName,
          firstVerifierName,
          finalVerifierName,
        ]
      );
    }
  }

  await execute(
    `UPDATE orders
     SET chain_status = 'completed',
         fulfillment_status = 'completed',
         stock_released_by = ?,
         stock_released_at = CURRENT_TIMESTAMP,
         final_verified_by = ?,
         final_verified_at = CURRENT_TIMESTAMP
     WHERE id = ? AND shop_id = ?`,
    [finalVerifierId, finalVerifierId, orderId, shopId]
  );
}

// ============================================================================
// 1. CLOUDFLARE R2 PRESIGNED UPLOAD / VIEW ROUTES
// ============================================================================

router.get('/r2-status', requireAuth, requireStrictChainShop, (req: Request, res: Response) => {
  res.json({ configured: isR2Configured() });
});

router.post('/upload-url', requireAuth, requireStrictChainShop, async (req: Request, res: Response) => {
  const user = req.session.user;
  if (
    !hasUserPermission(user, 'can_upload_photos') ||
    (!hasUserPermission(user, 'can_create_orders') && !hasUserPermission(user, 'can_resolve_flagged_orders'))
  ) {
    return res.status(403).json({
      error: 'Permission required to upload order photos. Ask your store manager to enable Upload Photos.',
    });
  }

  if (!isR2Configured()) {
    return res.status(503).json({
      error: 'Cloudflare R2 storage is not configured yet. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.',
      code: 'R2_NOT_CONFIGURED',
    });
  }

  try {
    const { contentType, orderHint } = req.body || {};
    const result = await createOrderPhotoUploadUrl({
      shopId: res.locals.shopId,
      contentType: String(contentType || 'image/webp'),
      orderHint: orderHint ? String(orderHint) : 'slip',
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('R2 Presigned PUT error:', err);
    res.status(400).json({ error: err.message || 'Failed to generate upload URL.' });
  }
});

router.get('/orders/:id/photo-url', requireAuth, requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);

  try {
    const order = await queryOne<any>(
      'SELECT id, handwritten_photo_key FROM orders WHERE id = ? AND shop_id = ?',
      [orderId, shopId]
    );
    if (!order) {
      return res.status(404).json({ error: 'Order not found in this store.' });
    }
    if (!order.handwritten_photo_key) {
      return res.status(404).json({ error: 'No handwritten order photo attached to this order.' });
    }
    if (!isR2Configured()) {
      return res.status(503).json({
        error: 'Cloudflare R2 storage is not configured on the server.',
        code: 'R2_NOT_CONFIGURED',
      });
    }

    const signed = await createOrderPhotoViewUrl({
      shopId,
      photoKey: order.handwritten_photo_key,
    });
    res.json({ success: true, photoKey: order.handwritten_photo_key, ...signed });
  } catch (err: any) {
    console.error('R2 Presigned GET error:', err);
    res.status(400).json({ error: err.message || 'Failed to sign photo URL.' });
  }
});

// ============================================================================
// 2. AVAILABILITY (PHYSICAL STOCK VS RESERVED STOCK IN PENDING VERIFICATION)
// ============================================================================

router.get('/products-availability', requireAuth, requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const shop = res.locals.shop;
  const isStockOnly = shop.pricing_mode === 'stock_only';

  try {
    const products = await queryAll<any>(
      `SELECT p.*, st.name as stock_name, st.is_main as stock_is_main
       FROM products p
       LEFT JOIN stocks st ON p.stock_id = st.id
       WHERE p.shop_id = ?
       ORDER BY p.name ASC`,
      [shopId]
    );
    const reservedMap = await getReservedBaseUnitsMap(shopId);

    const enriched = products.map((p) => {
      const physical = Number(p.quantity || 0);
      const reserved = reservedMap.get(Number(p.id)) || 0;
      const available = Math.max(0, physical - reserved);
      return {
        ...p,
        buying_price: isStockOnly ? null : p.buying_price,
        selling_price: isStockOnly ? 0 : p.selling_price,
        pack_buying_price: isStockOnly ? null : p.pack_buying_price,
        pack_selling_price: isStockOnly ? 0 : p.pack_selling_price,
        reserved_quantity: reserved,
        available_quantity: available,
        leg_type: Number(p.stock_is_main) === 1 ? 'shop' : 'warehouse',
      };
    });

    res.json({ products: enriched, pricing_mode: shop.pricing_mode });
  } catch (err: any) {
    console.error('StrictChain products availability error:', err);
    res.status(500).json({ error: 'Failed to load stock availability.' });
  }
});

// ============================================================================
// 3. CHAIN ORDERS QUEUE & DETAILS
// ============================================================================

router.get('/orders', requireAuth, requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const shop = res.locals.shop;
  const isStockOnly = shop.pricing_mode === 'stock_only';
  const queue = String(req.query.queue || 'all').trim();

  try {
    let whereExtra = '';
    const params: any[] = [shopId];

    if (queue === 'supervisor_1') {
      whereExtra = ` AND o.chain_status = 'pending_supervisor_1'`;
    } else if (queue === 'returned_to_seller') {
      whereExtra = ` AND o.chain_status = 'returned_to_seller'`;
    } else if (queue === 'in_release' || queue === 'shop_release' || queue === 'supervisor_2') {
      whereExtra = ` AND o.chain_status = 'in_release'`;
    } else if (queue === 'warehouse_release') {
      whereExtra = ` AND o.chain_status = 'in_release' AND EXISTS (SELECT 1 FROM order_items woi WHERE woi.order_id = o.id AND woi.leg_type = 'warehouse')`;
    } else if (queue === 'flagged') {
      whereExtra = ` AND o.chain_status = 'flagged_for_manager'`;
    } else if (queue === 'completed') {
      whereExtra = ` AND o.chain_status = 'completed'`;
    }

    const orders = await queryAll<any>(
      `SELECT o.*,
              c.name as customer_name, c.phone as customer_phone,
              u.name as salesperson_name,
              v1.name as first_verified_by_name,
              v2.name as final_verified_by_name,
              fl.name as flagged_by_name,
              rs.name as resolved_by_name
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN users u ON o.salesperson_id = u.id
       LEFT JOIN users v1 ON o.first_verified_by = v1.id
       LEFT JOIN users v2 ON o.final_verified_by = v2.id
       LEFT JOIN users fl ON o.flagged_by = fl.id
       LEFT JOIN users rs ON o.resolved_by = rs.id
       WHERE o.shop_id = ? ${whereExtra}
       ORDER BY o.id DESC`,
      params
    );

    const orderIds = orders.map((o) => o.id);
    const itemsByOrder = new Map<number, any[]>();
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(', ');
      const allItems = await queryAll<any>(
        `SELECT oi.*,
                p.name as product_name, p.sku as product_sku, p.unit as product_unit, p.is_watched,
                st.name as source_stock_name,
                lr.name as leg_released_by_name,
                lv.name as leg_verified_by_name
         FROM order_items oi
         INNER JOIN products p ON oi.product_id = p.id
         LEFT JOIN stocks st ON COALESCE(oi.source_stock_id, p.stock_id) = st.id
         LEFT JOIN users lr ON oi.leg_released_by = lr.id
         LEFT JOIN users lv ON oi.leg_verified_by = lv.id
         WHERE oi.order_id IN (${placeholders})
         ORDER BY oi.id ASC`,
        orderIds
      );

      for (const it of allItems) {
        if (queue === 'warehouse_release' && it.leg_type !== 'warehouse') {
          continue; // Warehouse workers only see warehouse-requested items
        }
        const cleaned = isStockOnly
          ? { ...it, buying_price: null, selling_price: 0, subtotal: 0, profit: null }
          : it;
        const arr = itemsByOrder.get(Number(it.order_id)) || [];
        arr.push(cleaned);
        itemsByOrder.set(Number(it.order_id), arr);
      }
    }

    const result = orders.map((o) => {
      const items = itemsByOrder.get(Number(o.id)) || [];
      return {
        ...o,
        total_amount: isStockOnly ? 0 : o.total_amount,
        paid_amount: isStockOnly ? 0 : o.paid_amount,
        debt_amount: isStockOnly ? 0 : o.debt_amount,
        items,
      };
    });

    res.json({ orders: result, pricing_mode: shop.pricing_mode });
  } catch (err: any) {
    console.error('StrictChain orders list error:', err);
    res.status(500).json({ error: 'Failed to load verification chain orders.' });
  }
});

// ============================================================================
// 4. SELLER CREATES ORDER -> PENDING SUPERVISOR VERIFICATION #1
// ============================================================================

router.post('/orders', requireAuth, requirePermission('can_create_orders'), requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const shop = res.locals.shop;
  const currentUserId = Number(req.session.user!.id);
  const isStockOnly = shop.pricing_mode === 'stock_only';

  const { customer_id, customer_name, customer_phone, handwritten_photo_key, notes, items } = req.body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one product item is required.' });
  }

  if (Number(shop.require_order_photo || 0) === 1 && !handwritten_photo_key) {
    return res.status(400).json({ error: 'Order photo is required by store settings before creating an order.' });
  }

  if (handwritten_photo_key && !isValidTenantPhotoKey(shopId, handwritten_photo_key)) {
    return res.status(400).json({ error: 'Invalid handwritten order photo key for this store.' });
  }

  try {
    const result = await withTransaction(async () => {
      // 1. Resolve or create customer safely (phone optional)
      let finalCustomerId: number | null = customer_id ? Number(customer_id) : null;
      if (finalCustomerId) {
        const custCheck = await queryOne('SELECT id FROM customers WHERE id = ? AND shop_id = ?', [finalCustomerId, shopId]);
        if (!custCheck) {
          throw new Error('Specified customer does not belong to this store.');
        }
      } else if (customer_name && String(customer_name).trim()) {
        const cleanName = String(customer_name).trim();
        const cleanPhone = customer_phone ? String(customer_phone).trim() : '';
        const existing = await queryOne(
          `SELECT id FROM customers WHERE shop_id = ? AND (LOWER(TRIM(name)) = LOWER(?) OR (? != '' AND phone = ?)) LIMIT 1`,
          [shopId, cleanName, cleanPhone, cleanPhone]
        );
        if (existing) {
          finalCustomerId = existing.id;
        } else {
          const safePhone = cleanPhone || `UNLISTED-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;
          const newCust = await execute(
            `INSERT INTO customers (shop_id, name, phone, credit_balance) VALUES (?, ?, ?, 0.0)`,
            [shopId, cleanName, safePhone]
          );
          finalCustomerId = newCust.lastInsertId;
        }
      } else {
        let walkIn = await queryOne(
          `SELECT id FROM customers WHERE shop_id = ? AND (name = 'Walk-in Client' OR name = 'Walk-in Customer') LIMIT 1`,
          [shopId]
        );
        if (!walkIn) {
          const newCust = await execute(
            `INSERT INTO customers (shop_id, name, phone, credit_balance) VALUES (?, 'Walk-in Client', 'WALK-IN', 0.0)`,
            [shopId]
          );
          finalCustomerId = newCust.lastInsertId;
        } else {
          finalCustomerId = walkIn.id;
        }
      }

      // 2. Validate products & unreserved availability (WITHOUT deducting stock yet!)
      const reservedMap = await getReservedBaseUnitsMap(shopId);
      const requestedMap = new Map<number, number>();
      const parsedItems: any[] = [];
      let totalAmount = 0;

      for (const item of items) {
        const prod = await queryOne<any>(
          `SELECT p.*, st.is_main as stock_is_main, st.name as stock_name
           FROM products p
           LEFT JOIN stocks st ON p.stock_id = st.id
           WHERE p.id = ? AND p.shop_id = ?`,
          [Number(item.product_id), shopId]
        );
        if (!prod) {
          throw new Error(`Product #${item.product_id} not found in this store.`);
        }

        const qty = Math.round(Number(item.quantity));
        if (isNaN(qty) || qty <= 0) {
          throw new Error(`Invalid quantity for product "${prod.name}".`);
        }

        const prodPackSize = Math.max(1, Math.round(Number(prod.units_per_pack || 1)));
        const isPack = item.sale_mode === 'pack' && prodPackSize > 1;
        const saleMode = isPack ? 'pack' : 'retail';
        const packSize = isPack ? prodPackSize : 1;
        const baseUnits = qty * packSize;

        const alreadyRequested = requestedMap.get(prod.id) || 0;
        const alreadyReserved = reservedMap.get(prod.id) || 0;
        const availableUnits = Number(prod.quantity || 0) - alreadyReserved - alreadyRequested;
        if (baseUnits > availableUnits) {
          throw new Error(
            `Insufficient unreserved stock for "${prod.name}". Physical: ${prod.quantity}, In Pending Orders: ${alreadyReserved}, Available: ${Math.max(0, availableUnits)}.`
          );
        }
        requestedMap.set(prod.id, alreadyRequested + baseUnits);

        const retailUnit = (prod.unit || '').trim() || 'pcs';
        const packUnit = (prod.pack_unit || '').trim() || 'Carton';
        const soldUnit = isPack ? packUnit : retailUnit;

        const unitSell = isStockOnly ? 0 : (isPack
          ? (Number(prod.pack_selling_price || 0) > 0 ? Number(prod.pack_selling_price) : Number(prod.selling_price || 0) * packSize)
          : Number(prod.selling_price || 0));
        const unitBuy = isStockOnly ? 0 : (isPack
          ? (Number(prod.pack_buying_price || 0) > 0 ? Number(prod.pack_buying_price) : Number(prod.buying_price || 0) * packSize)
          : Number(prod.buying_price || 0));

        const subtotal = Number((qty * unitSell).toFixed(2));
        const profit = Number((qty * (unitSell - unitBuy)).toFixed(2));
        totalAmount += subtotal;

        const sourceStockId = Number(prod.stock_id || 1);
        const legType = Number(prod.stock_is_main) === 1 ? 'shop' : 'warehouse';

        parsedItems.push({
          product_id: prod.id,
          source_stock_id: sourceStockId,
          leg_type: legType,
          quantity: qty,
          sale_mode: saleMode,
          sold_unit: soldUnit,
          pack_size: packSize,
          buying_price: unitBuy,
          selling_price: unitSell,
          subtotal,
          profit,
          fulfillment_source: legType === 'warehouse' ? 'Warehouse' : 'Store',
        });
      }

      const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;
      const orderRes = await execute(
        `INSERT INTO orders (
           shop_id, stock_id, order_number, customer_id, salesperson_id,
           total_amount, paid_amount, debt_amount, payment_status, fulfillment_status,
           notes, handwritten_photo_key, chain_status
         ) VALUES (?, 1, ?, ?, ?, ?, ?, 0, ?, 'pending_store', ?, ?, 'pending_supervisor_1')`,
        [
          shopId,
          orderNumber,
          finalCustomerId,
          currentUserId,
          isStockOnly ? 0 : totalAmount,
          isStockOnly ? 0 : totalAmount,
          isStockOnly ? 'paid' : 'pending',
          notes ? String(notes).trim() : null,
          handwritten_photo_key || null,
        ]
      );

      const orderId = orderRes.lastInsertId;

      for (const pi of parsedItems) {
        await execute(
          `INSERT INTO order_items (
             order_id, product_id, source_stock_id, quantity, sale_mode, sold_unit, pack_size,
             buying_price, selling_price, subtotal, profit, fulfillment_source, item_status,
             leg_type, leg_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_store', ?, 'pending')`,
          [
            orderId,
            pi.product_id,
            pi.source_stock_id,
            pi.quantity,
            pi.sale_mode,
            pi.sold_unit,
            pi.pack_size,
            pi.buying_price,
            pi.selling_price,
            pi.subtotal,
            pi.profit,
            pi.fulfillment_source,
            pi.leg_type,
          ]
        );
      }

      return { orderId, orderNumber, itemCount: parsedItems.length };
    });

    await logChainAudit(
      req,
      'CHAIN_ORDER_CREATED',
      `Seller submitted Order ${result.orderNumber} (${result.itemCount} items) for Supervisor #1 verification.`,
      shopId
    );

    const created = await queryOne('SELECT * FROM orders WHERE id = ?', [result.orderId]);
    res.json({ success: true, order: created });
  } catch (err: any) {
    console.error('StrictChain create order error:', err);
    res.status(400).json({ error: err.message || 'Failed to submit order.' });
  }
});

// ============================================================================
// 5. SUPERVISOR VERIFICATION #1 (AUTHORIZE OR RETURN TO SELLER)
// ============================================================================

router.post('/orders/:id/verify-1', requireAuth, requirePermission('can_verify_orders'), requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const currentUser = req.session.user!;
  const { decision, reason } = req.body || {};

  if (decision !== 'approve' && decision !== 'return') {
    return res.status(400).json({ error: 'Decision must be "approve" or "return".' });
  }

  try {
    const order = await queryOne<any>('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found in this store.' });
    }
    if (order.chain_status !== 'pending_supervisor_1') {
      return res.status(400).json({ error: `Order is currently in "${order.chain_status}", not pending Supervisor Verification #1.` });
    }

    if (decision === 'return') {
      const returnNote = String(reason || 'Order returned to seller for correction').trim();
      await execute(
        `UPDATE orders
         SET chain_status = 'returned_to_seller',
             resolution_note = ?
         WHERE id = ? AND shop_id = ?`,
        [returnNote, orderId, shopId]
      );
      await logChainAudit(req, 'CHAIN_RETURNED_TO_SELLER', `Supervisor ${currentUser.name} returned Order ${order.order_number} to Seller: ${returnNote}`, shopId);
      return res.json({ success: true, chain_status: 'returned_to_seller' });
    }

    await execute(
      `UPDATE orders
       SET chain_status = 'in_release',
           first_verified_by = ?,
           first_verified_at = CURRENT_TIMESTAMP
       WHERE id = ? AND shop_id = ?`,
      [currentUser.id, orderId, shopId]
    );

    await execute(
      `UPDATE order_items SET leg_status = 'pending' WHERE order_id = ?`,
      [orderId]
    );

    await logChainAudit(
      req,
      'CHAIN_SUPERVISOR_1_APPROVED',
      `Supervisor ${currentUser.name} authorized Order ${order.order_number} for physical release (locked to ${currentUser.name} for Step 2 verification).`,
      shopId
    );

    res.json({ success: true, chain_status: 'in_release', first_verified_by: currentUser.id });
  } catch (err: any) {
    console.error('StrictChain verify-1 error:', err);
    res.status(500).json({ error: 'Failed to process first supervisor verification.' });
  }
});

// ============================================================================
// 6. SELLER EDITS A RETURNED ORDER & RESUBMITS
// ============================================================================

router.put('/orders/:id/seller-edit', requireAuth, requirePermission('can_create_orders'), requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const shop = res.locals.shop;
  const isStockOnly = shop.pricing_mode === 'stock_only';
  const orderId = Number(req.params.id);
  const { items, notes, handwritten_photo_key } = req.body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required.' });
  }
  if (handwritten_photo_key && !isValidTenantPhotoKey(shopId, handwritten_photo_key)) {
    return res.status(400).json({ error: 'Invalid handwritten order photo key.' });
  }

  try {
    const existing = await queryOne<any>('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!existing) {
      return res.status(404).json({ error: 'Order not found in this store.' });
    }
    if (existing.chain_status !== 'returned_to_seller') {
      return res.status(403).json({
        error: 'Seller can only edit orders that were explicitly returned by a Supervisor during Verification #1.',
      });
    }

    await withTransaction(async () => {
      const reservedMap = await getReservedBaseUnitsMap(shopId, orderId);
      const requestedMap = new Map<number, number>();
      let totalAmount = 0;

      await execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);

      for (const item of items) {
        const prod = await queryOne<any>(
          `SELECT p.*, st.is_main as stock_is_main
           FROM products p LEFT JOIN stocks st ON p.stock_id = st.id
           WHERE p.id = ? AND p.shop_id = ?`,
          [Number(item.product_id), shopId]
        );
        if (!prod) throw new Error(`Product #${item.product_id} not found.`);

        const qty = Math.round(Number(item.quantity));
        if (isNaN(qty) || qty <= 0) throw new Error(`Invalid quantity for ${prod.name}`);

        const prodPackSize = Math.max(1, Math.round(Number(prod.units_per_pack || 1)));
        const isPack = item.sale_mode === 'pack' && prodPackSize > 1;
        const saleMode = isPack ? 'pack' : 'retail';
        const packSize = isPack ? prodPackSize : 1;
        const baseUnits = qty * packSize;

        const alreadyReq = requestedMap.get(prod.id) || 0;
        const reserved = reservedMap.get(prod.id) || 0;
        const available = Number(prod.quantity || 0) - reserved - alreadyReq;
        if (baseUnits > available) {
          throw new Error(`Insufficient unreserved stock for "${prod.name}".`);
        }
        requestedMap.set(prod.id, alreadyReq + baseUnits);

        const retailUnit = (prod.unit || '').trim() || 'pcs';
        const packUnit = (prod.pack_unit || '').trim() || 'Carton';
        const soldUnit = isPack ? packUnit : retailUnit;
        const unitSell = isStockOnly ? 0 : (isPack ? Number(prod.pack_selling_price || 0) || Number(prod.selling_price || 0) * packSize : Number(prod.selling_price || 0));
        const unitBuy = isStockOnly ? 0 : (isPack ? Number(prod.pack_buying_price || 0) || Number(prod.buying_price || 0) * packSize : Number(prod.buying_price || 0));
        const subtotal = Number((qty * unitSell).toFixed(2));
        const profit = Number((qty * (unitSell - unitBuy)).toFixed(2));
        totalAmount += subtotal;

        const sourceStockId = Number(prod.stock_id || 1);
        const legType = Number(prod.stock_is_main) === 1 ? 'shop' : 'warehouse';

        await execute(
          `INSERT INTO order_items (
             order_id, product_id, source_stock_id, quantity, sale_mode, sold_unit, pack_size,
             buying_price, selling_price, subtotal, profit, fulfillment_source, item_status, leg_type, leg_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_store', ?, 'pending')`,
          [orderId, prod.id, sourceStockId, qty, saleMode, soldUnit, packSize, unitBuy, unitSell, subtotal, profit, legType === 'warehouse' ? 'Warehouse' : 'Store', legType]
        );
      }

      await execute(
        `UPDATE orders
         SET chain_status = 'pending_supervisor_1',
             total_amount = ?,
             paid_amount = ?,
             notes = ?,
             handwritten_photo_key = COALESCE(?, handwritten_photo_key),
             resolution_note = NULL
         WHERE id = ? AND shop_id = ?`,
        [
          isStockOnly ? 0 : totalAmount,
          isStockOnly ? 0 : totalAmount,
          notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes,
          handwritten_photo_key || null,
          orderId,
          shopId,
        ]
      );
    });

    await logChainAudit(req, 'CHAIN_SELLER_RESUBMITTED', `Seller edited & resubmitted Order ${existing.order_number} for Supervisor #1 review.`, shopId);
    res.json({ success: true, chain_status: 'pending_supervisor_1' });
  } catch (err: any) {
    console.error('StrictChain seller edit error:', err);
    res.status(400).json({ error: err.message || 'Failed to update returned order.' });
  }
});

// ============================================================================
// 7. PHYSICAL RELEASE PER LEG (SELLER FOR SHOP ITEMS, WAREHOUSE FOR WAREHOUSE ITEMS)
// ============================================================================

router.post('/orders/:id/release-leg', requireAuth, requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const currentUser = req.session.user!;
  const leg = String(req.body?.leg || '').trim();

  if (leg !== 'shop' && leg !== 'warehouse') {
    return res.status(400).json({ error: 'Leg must be "shop" or "warehouse".' });
  }

  if (leg === 'shop' && !hasUserPermission(currentUser, 'can_create_orders') && !hasUserPermission(currentUser, 'can_release_stock')) {
    return res.status(403).json({ error: 'Permission required to mark Main Shop items as released.' });
  }
  if (leg === 'warehouse' && !hasUserPermission(currentUser, 'can_release_stock')) {
    return res.status(403).json({ error: 'Storekeeper / Warehouse permission required to release warehouse items.' });
  }

  try {
    const order = await queryOne<any>('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.chain_status !== 'in_release') {
      return res.status(400).json({ error: `Cannot release items while order status is "${order.chain_status}".` });
    }

    const nextLegStatus = leg === 'shop' ? 'seller_released' : 'warehouse_released';
    const upd = await execute(
      `UPDATE order_items
       SET leg_status = ?,
           leg_released_by = ?,
           leg_released_at = CURRENT_TIMESTAMP
       WHERE order_id = ? AND leg_type = ? AND leg_status = 'pending'`,
      [nextLegStatus, currentUser.id, orderId, leg]
    );

    if (upd.changes === 0) {
      return res.status(400).json({ error: `No pending ${leg} items found to release on this order.` });
    }

    await logChainAudit(
      req,
      leg === 'warehouse' ? 'CHAIN_WAREHOUSE_RELEASED' : 'CHAIN_SHOP_RELEASED',
      `${currentUser.name} marked ${leg} items as physically released for Order ${order.order_number}; awaiting Supervisor #2 confirmation.`,
      shopId
    );

    res.json({ success: true, leg, leg_status: nextLegStatus });
  } catch (err: any) {
    console.error('StrictChain release-leg error:', err);
    res.status(500).json({ error: 'Failed to record physical release.' });
  }
});

// ============================================================================
// 8. WAREHOUSE STAFF FLAG MISMATCH (FREEZES FOR MANAGER — CANNOT EDIT/RETURN)
// ============================================================================

router.post('/orders/:id/flag', requireAuth, requirePermission('can_release_stock'), requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const currentUser = req.session.user!;
  const reason = String(req.body?.reason || '').trim();

  if (!reason) {
    return res.status(400).json({ error: 'Please explain the discrepancy reason when flagging an order.' });
  }

  try {
    const order = await queryOne<any>('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.chain_status !== 'in_release') {
      return res.status(400).json({ error: `Only authorized orders in release stage can be flagged (current: "${order.chain_status}").` });
    }

    await execute(
      `UPDATE orders
       SET chain_status = 'flagged_for_manager',
           flagged_by = ?,
           flagged_at = CURRENT_TIMESTAMP,
           flag_reason = ?
       WHERE id = ? AND shop_id = ?`,
      [currentUser.id, reason, orderId, shopId]
    );

    await execute(
      `UPDATE order_items SET leg_status = 'flagged' WHERE order_id = ? AND leg_status != 'supervisor_confirmed'`,
      [orderId]
    );

    await logChainAudit(
      req,
      'CHAIN_WAREHOUSE_FLAGGED',
      `Warehouse staff ${currentUser.name} flagged Order ${order.order_number} for Manager resolution: ${reason}`,
      shopId
    );

    res.json({ success: true, chain_status: 'flagged_for_manager' });
  } catch (err: any) {
    console.error('StrictChain flag error:', err);
    res.status(500).json({ error: 'Failed to flag order for manager review.' });
  }
});

// ============================================================================
// 9. SUPERVISOR VERIFICATION #2 (ENFORCES SAME SUPERVISOR AS #1 + COMMITS STOCK)
// ============================================================================

router.post('/orders/:id/verify-2', requireAuth, requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const currentUser = req.session.user!;
  const leg = req.body?.leg ? String(req.body.leg).trim() : null; // 'shop' | 'warehouse' | null (all released legs)
  const overrideReason = req.body?.override_reason ? String(req.body.override_reason).trim() : '';

  const canVerify = hasUserPermission(currentUser, 'can_verify_orders');
  const canOverride = hasUserPermission(currentUser, 'can_resolve_flagged_orders');

  if (!canVerify && !canOverride) {
    return res.status(403).json({ error: 'Supervisor verification permission is required.' });
  }

  try {
    const txOutcome = await withTransaction(async () => {
      const order = await queryOne<any>(
        `SELECT o.*, c.name as customer_name, u.name as seller_name, v1.name as first_verifier_name
         FROM orders o
         LEFT JOIN customers c ON o.customer_id = c.id
         LEFT JOIN users u ON o.salesperson_id = u.id
         LEFT JOIN users v1 ON o.first_verified_by = v1.id
         WHERE o.id = ? AND o.shop_id = ?`,
        [orderId, shopId]
      );
      if (!order) throw new Error('Order not found in this store.');
      if (order.chain_status !== 'in_release') {
        throw new Error(`Order is currently "${order.chain_status}", not ready for Verification #2.`);
      }

      const isSameSupervisor = Number(order.first_verified_by) === Number(currentUser.id);
      if (!isSameSupervisor) {
        if (!canOverride) {
          throw new Error(
            `Same-Supervisor Rule: Only ${order.first_verified_by_name || order.first_verifier_name || 'the 1st authorizing supervisor'} can complete Verification #2 unless a Manager delegates override access.`
          );
        }
        if (!overrideReason) {
          throw new Error('Manager override requires an override_reason when confirming for another supervisor.');
        }
      }

      const targetLegFilter = leg === 'shop' || leg === 'warehouse' ? ` AND leg_type = ?` : '';
      const targetParams: any[] = [currentUser.id, orderId];
      if (leg === 'shop' || leg === 'warehouse') targetParams.push(leg);

      const confirmedUpd = await execute(
        `UPDATE order_items
         SET leg_status = 'supervisor_confirmed',
             leg_verified_by = ?,
             leg_verified_at = CURRENT_TIMESTAMP
         WHERE order_id = ? AND leg_status IN ('seller_released', 'warehouse_released')${targetLegFilter}`,
        targetParams
      );

      if (confirmedUpd.changes === 0) {
        throw new Error('No physically released items are waiting for Supervisor #2 confirmation.');
      }

      // Check if ALL items on the order are now supervisor_confirmed
      const remaining = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM order_items WHERE order_id = ? AND leg_status != 'supervisor_confirmed'`,
        [orderId]
      );

      const allConfirmed = Number(remaining?.count || 0) === 0;
      if (allConfirmed) {
        await commitCompletedChainOrderTx({
          shopId,
          orderId,
          orderNumber: order.order_number,
          customerName: order.customer_name || 'Walk-in Client',
          sellerName: order.seller_name || 'Seller',
          firstVerifierName: order.first_verifier_name || currentUser.name,
          finalVerifierId: Number(currentUser.id),
          finalVerifierName: currentUser.name,
        });
      }

      return {
        orderNumber: order.order_number,
        allConfirmed,
        overrideUsed: !isSameSupervisor,
      };
    });

    await logChainAudit(
      req,
      txOutcome.allConfirmed ? 'CHAIN_COMPLETED_AND_STOCK_DEDUCTED' : 'CHAIN_LEG_VERIFIED',
      `Verification #2 confirmed by ${currentUser.name} for Order ${txOutcome.orderNumber}${txOutcome.overrideUsed ? ` (Manager Override: ${overrideReason})` : ''}.${txOutcome.allConfirmed ? ' All legs verified — stock updated.' : ''}`,
      shopId
    );

    res.json({
      success: true,
      completed: txOutcome.allConfirmed,
      chain_status: txOutcome.allConfirmed ? 'completed' : 'in_release',
    });
  } catch (err: any) {
    console.error('StrictChain verify-2 error:', err);
    res.status(400).json({ error: err.message || 'Failed to complete Verification #2.' });
  }
});

// ============================================================================
// 10. MANAGER (OR DELEGATED STAFF) RESOLVES FLAGGED OR STUCK ORDERS
// ============================================================================

router.post('/orders/:id/manager-resolve', requireAuth, requirePermission('can_resolve_flagged_orders'), requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const shop = res.locals.shop;
  const isStockOnly = shop.pricing_mode === 'stock_only';
  const orderId = Number(req.params.id);
  const currentUser = req.session.user!;
  const { action, resolution_note, reassign_supervisor_id, items } = req.body || {};
  // action: 'edit_and_release' | 'approve_as_is' | 'reassign_supervisor' | 'cancel'

  if (!['edit_and_release', 'approve_as_is', 'reassign_supervisor', 'cancel'].includes(action)) {
    return res.status(400).json({ error: 'Invalid manager resolution action.' });
  }

  try {
    const outcome = await withTransaction(async () => {
      const order = await queryOne<any>(
        `SELECT o.*, c.name as customer_name, u.name as seller_name, v1.name as first_verifier_name
         FROM orders o
         LEFT JOIN customers c ON o.customer_id = c.id
         LEFT JOIN users u ON o.salesperson_id = u.id
         LEFT JOIN users v1 ON o.first_verified_by = v1.id
         WHERE o.id = ? AND o.shop_id = ?`,
        [orderId, shopId]
      );
      if (!order) throw new Error('Order not found.');
      if (order.chain_status === 'completed' || order.chain_status === 'cancelled') {
        throw new Error(`Order is already ${order.chain_status}.`);
      }

      if (action === 'cancel') {
        await execute(
          `UPDATE orders
           SET chain_status = 'cancelled',
               fulfillment_status = 'cancelled',
               resolved_by = ?,
               resolved_at = CURRENT_TIMESTAMP,
               resolution_note = ?
           WHERE id = ? AND shop_id = ?`,
          [currentUser.id, resolution_note || 'Cancelled by Manager', orderId, shopId]
        );
        await execute(`UPDATE order_items SET item_status = 'rejected' WHERE order_id = ?`, [orderId]);
        return { orderNumber: order.order_number, status: 'cancelled' };
      }

      if (action === 'reassign_supervisor') {
        const nextSupId = Number(reassign_supervisor_id);
        if (!nextSupId) throw new Error('Target supervisor ID is required to reassign.');
        const targetSup = await queryOne<any>(
          `SELECT id, name FROM users WHERE id = ? AND shop_id = ? AND is_active = 1`,
          [nextSupId, shopId]
        );
        if (!targetSup) throw new Error('Target supervisor not found or inactive in this store.');

        const nextChainStatus = order.chain_status === 'flagged_for_manager' ? 'in_release' : order.chain_status;
        await execute(
          `UPDATE orders
           SET first_verified_by = ?,
               chain_status = ?,
               resolved_by = ?,
               resolved_at = CURRENT_TIMESTAMP,
               resolution_note = ?
           WHERE id = ? AND shop_id = ?`,
          [nextSupId, nextChainStatus, currentUser.id, resolution_note || `Reassigned to ${targetSup.name}`, orderId, shopId]
        );
        await execute(
          `UPDATE order_items SET leg_status = 'pending' WHERE order_id = ? AND leg_status = 'flagged'`,
          [orderId]
        );
        return { orderNumber: order.order_number, status: nextChainStatus };
      }

      // Edit items if requested by Manager
      if (action === 'edit_and_release' && Array.isArray(items) && items.length > 0) {
        const reservedMap = await getReservedBaseUnitsMap(shopId, orderId);
        let totalAmount = 0;
        await execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);

        for (const item of items) {
          const prod = await queryOne<any>(
            `SELECT p.*, st.is_main as stock_is_main FROM products p LEFT JOIN stocks st ON p.stock_id = st.id WHERE p.id = ? AND p.shop_id = ?`,
            [Number(item.product_id), shopId]
          );
          if (!prod) throw new Error(`Product #${item.product_id} not found.`);
          const qty = Math.round(Number(item.quantity));
          if (isNaN(qty) || qty <= 0) throw new Error(`Invalid quantity for ${prod.name}`);

          const prodPackSize = Math.max(1, Math.round(Number(prod.units_per_pack || 1)));
          const isPack = item.sale_mode === 'pack' && prodPackSize > 1;
          const packSize = isPack ? prodPackSize : 1;
          const baseUnits = qty * packSize;
          const available = Number(prod.quantity || 0) - (reservedMap.get(prod.id) || 0);
          if (baseUnits > available) throw new Error(`Insufficient unreserved stock for "${prod.name}".`);

          const soldUnit = isPack ? (prod.pack_unit || 'Carton') : (prod.unit || 'pcs');
          const unitSell = isStockOnly ? 0 : (isPack ? Number(prod.pack_selling_price || 0) || Number(prod.selling_price || 0) * packSize : Number(prod.selling_price || 0));
          const unitBuy = isStockOnly ? 0 : (isPack ? Number(prod.pack_buying_price || 0) || Number(prod.buying_price || 0) * packSize : Number(prod.buying_price || 0));
          const subtotal = Number((qty * unitSell).toFixed(2));
          const profit = Number((qty * (unitSell - unitBuy)).toFixed(2));
          totalAmount += subtotal;
          const legType = Number(prod.stock_is_main) === 1 ? 'shop' : 'warehouse';

          await execute(
            `INSERT INTO order_items (
               order_id, product_id, source_stock_id, quantity, sale_mode, sold_unit, pack_size,
               buying_price, selling_price, subtotal, profit, fulfillment_source, item_status,
               leg_type, leg_status, leg_verified_by, leg_verified_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, 'supervisor_confirmed', ?, CURRENT_TIMESTAMP)`,
            [orderId, prod.id, Number(prod.stock_id || 1), qty, isPack ? 'pack' : 'retail', soldUnit, packSize, unitBuy, unitSell, subtotal, profit, legType === 'warehouse' ? 'Warehouse' : 'Store', legType, currentUser.id]
          );
        }

        await execute(
          `UPDATE orders SET total_amount = ?, paid_amount = ? WHERE id = ?`,
          [isStockOnly ? 0 : totalAmount, isStockOnly ? 0 : totalAmount, orderId]
        );
      } else {
        // approve_as_is
        await execute(
          `UPDATE order_items
           SET leg_status = 'supervisor_confirmed',
               leg_verified_by = ?,
               leg_verified_at = CURRENT_TIMESTAMP
           WHERE order_id = ?`,
          [currentUser.id, orderId]
        );
      }

      await execute(
        `UPDATE orders
         SET resolved_by = ?,
             resolved_at = CURRENT_TIMESTAMP,
             resolution_note = ?
         WHERE id = ? AND shop_id = ?`,
        [currentUser.id, resolution_note || 'Resolved and approved by Manager', orderId, shopId]
      );

      await commitCompletedChainOrderTx({
        shopId,
        orderId,
        orderNumber: order.order_number,
        customerName: order.customer_name || 'Walk-in Client',
        sellerName: order.seller_name || 'Seller',
        firstVerifierName: order.first_verifier_name || currentUser.name,
        finalVerifierId: Number(currentUser.id),
        finalVerifierName: currentUser.name,
      });

      return { orderNumber: order.order_number, status: 'completed' };
    });

    await logChainAudit(
      req,
      'CHAIN_MANAGER_RESOLVED',
      `Manager/Delegate ${currentUser.name} resolved Order ${outcome.orderNumber} (${action}): ${resolution_note || 'Approved'}`,
      shopId
    );

    res.json({ success: true, chain_status: outcome.status });
  } catch (err: any) {
    console.error('StrictChain manager-resolve error:', err);
    res.status(400).json({ error: err.message || 'Failed to resolve order.' });
  }
});

// ============================================================================
// 11. MANAGER SPECIAL PRODUCTS AUDIT DASHBOARD FEED
// ============================================================================

router.get('/watch-alerts', requireAuth, requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const currentUser = req.session.user!;
  const filter = String(req.query.filter || 'all'); // 'unaudited' | 'all'

  // Only Manager, SuperAdmin, Platform Ops, Report viewers, or Flag Resolvers see the audit feed
  if (
    !hasUserPermission(currentUser, 'can_view_reports') &&
    !hasUserPermission(currentUser, 'can_resolve_flagged_orders')
  ) {
    return res.status(403).json({ error: 'Manager or report audit permission is required.' });
  }

  try {
    const filterClause = filter === 'unaudited' ? ' AND a.is_audited = 0' : '';
    const alerts = await queryAll<any>(
      `SELECT a.*, au.name as audited_by_name, p.quantity as current_live_stock
       FROM product_watch_alerts a
       LEFT JOIN users au ON a.audited_by = au.id
       LEFT JOIN products p ON a.product_id = p.id
       WHERE a.shop_id = ?${filterClause}
       ORDER BY a.is_audited ASC, a.created_at DESC, a.id DESC
       LIMIT 200`,
      [shopId]
    );

    const unreadCountRow = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM product_watch_alerts WHERE shop_id = ? AND is_audited = 0`,
      [shopId]
    );

    res.json({
      alerts,
      unauditedCount: Number(unreadCountRow?.count || 0),
    });
  } catch (err: any) {
    console.error('StrictChain watch-alerts error:', err);
    res.status(500).json({ error: 'Failed to load special watched-product audit feed.' });
  }
});

router.post('/watch-alerts/:id/audit', requireAuth, requireStrictChainShop, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const alertId = Number(req.params.id);
  const currentUser = req.session.user!;
  const auditNote = req.body?.audit_note ? String(req.body.audit_note).trim() : null;

  if (
    !hasUserPermission(currentUser, 'can_view_reports') &&
    !hasUserPermission(currentUser, 'can_resolve_flagged_orders')
  ) {
    return res.status(403).json({ error: 'Manager or audit permission required.' });
  }

  try {
    const upd = await execute(
      `UPDATE product_watch_alerts
       SET is_audited = 1,
           audited_by = ?,
           audited_at = CURRENT_TIMESTAMP,
           audit_note = COALESCE(?, audit_note)
       WHERE id = ? AND shop_id = ?`,
      [currentUser.id, auditNote, alertId, shopId]
    );
    if (upd.changes === 0) {
      return res.status(404).json({ error: 'Audit alert not found in this store.' });
    }
    await logChainAudit(req, 'WATCH_ALERT_AUDITED', `Manager ${currentUser.name} marked Special Product Audit #${alertId} as checked.`, shopId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Watch alert mark audited error:', err);
    res.status(500).json({ error: 'Failed to mark alert as audited.' });
  }
});

export default router;
