import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { dbReady } from '../server';
import { createTestShop, login } from './helpers';
import { execute, queryOne } from '../server/database/db';

let standardShopAgent: ReturnType<typeof request.agent>;
let chainManagerAgent: ReturnType<typeof request.agent>;
let chainShopId = 0;
let mainStockId = 0;
let warehouseStockId = 0;
let shopProductId = 0;
let watchedWarehouseProductId = 0;

let sellerEmail = '';
let sup1Email = '';
let sup1Id = 0;
let sup2Email = '';
let sup2Id = 0;
let warehouseEmail = '';
const staffPass = 'ChainPass2025!';

beforeAll(async () => {
  await dbReady;

  // 1. Standard shop (must be blocked from strict-chain endpoints)
  const stdShop = await createTestShop('StandardRef');
  const stdSess = await login(stdShop.managerEmail, stdShop.managerPassword);
  standardShopAgent = stdSess.agent as any;

  // 2. Isolated Strict-Chain + Stock-Only shop
  const chainShop = await createTestShop('StrictChainCo');
  chainShopId = chainShop.shopId;

  await execute(
    `UPDATE shops SET workflow_mode = 'strict_chain', pricing_mode = 'stock_only' WHERE id = ?`,
    [chainShopId]
  );

  const mgrSess = await login(chainShop.managerEmail, chainShop.managerPassword);
  chainManagerAgent = mgrSess.agent as any;

  // Create Main Shop (is_main = 1) and Warehouse (is_main = 0)
  const mainRes = await execute(
    `INSERT INTO stocks (shop_id, name, code, location, is_main, status) VALUES (?, 'Main Shop', 'SHP-01', 'Front Store', 1, 'active')`,
    [chainShopId]
  );
  mainStockId = mainRes.lastInsertId;

  const whRes = await execute(
    `INSERT INTO stocks (shop_id, name, code, location, is_main, status) VALUES (?, 'Central Warehouse', 'WH-02', 'Back Depot', 0, 'active')`,
    [chainShopId]
  );
  warehouseStockId = whRes.lastInsertId;

  // Create 1 Main Shop product and 1 Watched Warehouse product
  const pShopRes = await chainManagerAgent.post('/api/products').send({
    name: 'Cement Bags 50kg',
    sku: 'CEM-SHP-' + Date.now(),
    category: 'Cement',
    unit: 'bag',
    buying_price: 9000,
    selling_price: 11000,
    quantity: 40,
    stock_id: mainStockId,
    is_watched: false,
  });
  expect(pShopRes.status).toBe(200);
  shopProductId = pShopRes.body.product.id;

  const pWhRes = await chainManagerAgent.post('/api/products').send({
    name: 'Special Copper Cable 10mm',
    sku: 'COP-WH-' + Date.now(),
    category: 'Electrical',
    unit: 'roll',
    buying_price: 45000,
    selling_price: 60000,
    quantity: 25,
    stock_id: warehouseStockId,
    is_watched: true,
  });
  expect(pWhRes.status).toBe(200);
  watchedWarehouseProductId = pWhRes.body.product.id;

  const ts = Date.now();
  sellerEmail = `seller-${ts}@chain.rw`;
  sup1Email = `sup1-${ts}@chain.rw`;
  sup2Email = `sup2-${ts}@chain.rw`;
  warehouseEmail = `wh-${ts}@chain.rw`;

  // Create Seller, Supervisor 1, Supervisor 2, Warehouse Officer
  const sCreate = await chainManagerAgent.post('/api/users').send({
    name: 'Jean Seller',
    email: sellerEmail,
    password: staffPass,
    role: 'salesperson',
    stock_id: mainStockId,
    permissions: { can_create_orders: true, can_verify_orders: false, can_release_stock: false },
  });
  expect(sCreate.status).toBe(200);

  const v1Create = await chainManagerAgent.post('/api/users').send({
    name: 'Alice Supervisor 1',
    email: sup1Email,
    password: staffPass,
    role: 'employee',
    job_title: 'Supervisor',
    permissions: { can_create_orders: false, can_verify_orders: true, can_resolve_flagged_orders: false },
  });
  expect(v1Create.status).toBe(200);
  sup1Id = v1Create.body.user.id;

  const v2Create = await chainManagerAgent.post('/api/users').send({
    name: 'Bob Supervisor 2',
    email: sup2Email,
    password: staffPass,
    role: 'employee',
    job_title: 'Supervisor',
    permissions: { can_create_orders: false, can_verify_orders: true, can_resolve_flagged_orders: false },
  });
  expect(v2Create.status).toBe(200);
  sup2Id = v2Create.body.user.id;

  const wCreate = await chainManagerAgent.post('/api/users').send({
    name: 'Eric Warehouse',
    email: warehouseEmail,
    password: staffPass,
    role: 'storekeeper',
    stock_id: warehouseStockId,
    permissions: { can_release_stock: true, can_create_orders: false, can_verify_orders: false },
  });
  expect(wCreate.status).toBe(200);
});

describe('Phase 1 Strict Verification Chain, Isolation, Stock-Only & Watched Product Audit', () => {
  it('blocks standard shops from accessing strict-chain endpoints', async () => {
    const res = await standardShopAgent.get('/api/chain/orders');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Strict Verification Chain');
  });

  it('rejects cross-tenant or invalid handwritten photo keys', async () => {
    const sellerSess = await login(sellerEmail, staffPass);
    const badPhoto = await (sellerSess.agent as any).post('/api/chain/orders').send({
      customer_name: 'Client X',
      handwritten_photo_key: 'shops/999999/orders/hack.webp',
      items: [{ product_id: shopProductId, quantity: 2 }],
    });
    expect(badPhoto.status).toBe(400);
  });

  it('executes full multi-location chain, same-supervisor lock, warehouse flag, delegation & watched-product audit', async () => {
    const sellerAgent = (await login(sellerEmail, staffPass)).agent as any;
    const sup1Agent = (await login(sup1Email, staffPass)).agent as any;
    const sup2Agent = (await login(sup2Email, staffPass)).agent as any;
    const whAgent = (await login(warehouseEmail, staffPass)).agent as any;

    const validPhotoKey = `shops/${chainShopId}/orders/slip-001.webp`;

    // 1. Seller creates mixed order (3 Cement from Main Shop + 2 Special Copper Cable from Warehouse)
    const createRes = await sellerAgent.post('/api/chain/orders').send({
      customer_name: 'Kigali Construction Ltd',
      handwritten_photo_key: validPhotoKey,
      notes: 'Deliver both locations',
      items: [
        { product_id: shopProductId, quantity: 3 },
        { product_id: watchedWarehouseProductId, quantity: 2 },
      ],
    });
    expect(createRes.status).toBe(200);
    const orderId = createRes.body.order.id;
    expect(createRes.body.order.chain_status).toBe('pending_supervisor_1');
    expect(Number(createRes.body.order.total_amount)).toBe(0); // Stock-only mode hides prices

    // Verify physical stock is NOT deducted yet, while reserved availability reflects pending order
    const availRes = await sellerAgent.get('/api/chain/products-availability');
    expect(availRes.status).toBe(200);
    expect(availRes.body.pricing_mode).toBe('stock_only');
    const shopProdAvail = availRes.body.products.find((p: any) => p.id === shopProductId);
    expect(shopProdAvail.quantity).toBe(40);
    expect(shopProdAvail.reserved_quantity).toBe(3);
    expect(shopProdAvail.available_quantity).toBe(37);
    expect(shopProdAvail.buying_price).toBeNull();
    expect(shopProdAvail.selling_price).toBe(0);

    // 2. Supervisor 1 returns order to Seller for quantity edit -> Seller edits & resubmits
    const retRes = await sup1Agent.post(`/api/chain/orders/${orderId}/verify-1`).send({
      decision: 'return',
      reason: 'Handwritten slip says 4 Cement bags, not 3',
    });
    expect(retRes.status).toBe(200);
    expect(retRes.body.chain_status).toBe('returned_to_seller');

    const editRes = await sellerAgent.put(`/api/chain/orders/${orderId}/seller-edit`).send({
      notes: 'Corrected Cement to 4 bags',
      items: [
        { product_id: shopProductId, quantity: 4 },
        { product_id: watchedWarehouseProductId, quantity: 2 },
      ],
    });
    expect(editRes.status).toBe(200);
    expect(editRes.body.chain_status).toBe('pending_supervisor_1');

    // 3. Supervisor 1 authorizes Verification #1 -> locks Step 2 to Supervisor 1
    const approve1 = await sup1Agent.post(`/api/chain/orders/${orderId}/verify-1`).send({
      decision: 'approve',
    });
    expect(approve1.status).toBe(200);
    expect(approve1.body.chain_status).toBe('in_release');
    expect(approve1.body.first_verified_by).toBe(sup1Id);

    // Seller can no longer edit once authorized
    const blockedEdit = await sellerAgent.put(`/api/chain/orders/${orderId}/seller-edit`).send({
      items: [{ product_id: shopProductId, quantity: 1 }],
    });
    expect(blockedEdit.status).toBe(403);

    // 4. Warehouse queue shows ONLY warehouse items for this order
    const whQueueRes = await whAgent.get('/api/chain/orders?queue=warehouse_release');
    expect(whQueueRes.status).toBe(200);
    const whOrder = whQueueRes.body.orders.find((o: any) => o.id === orderId);
    expect(whOrder).toBeTruthy();
    expect(whOrder.items.length).toBe(1);
    expect(whOrder.items[0].product_id).toBe(watchedWarehouseProductId);
    expect(whOrder.items[0].leg_type).toBe('warehouse');

    // 5. Seller releases Main Shop leg; Supervisor 2 is BLOCKED from Verification #2; Supervisor 1 succeeds
    const relShop = await sellerAgent.post(`/api/chain/orders/${orderId}/release-leg`).send({ leg: 'shop' });
    expect(relShop.status).toBe(200);

    const wrongSup2 = await sup2Agent.post(`/api/chain/orders/${orderId}/verify-2`).send({ leg: 'shop' });
    expect(wrongSup2.status).toBe(400);
    expect(wrongSup2.body.error).toContain('Same-Supervisor Rule');

    const okSup1 = await sup1Agent.post(`/api/chain/orders/${orderId}/verify-2`).send({ leg: 'shop' });
    expect(okSup1.status).toBe(200);
    expect(okSup1.body.completed).toBe(false); // Warehouse leg still remaining!

    // Stock still untouched until ALL legs are confirmed!
    const midShopProd = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [shopProductId]);
    expect(Number(midShopProd?.quantity)).toBe(40);

    // 6. Warehouse spots discrepancy and FLAGS order for Manager (frozen)
    const flagRes = await whAgent.post(`/api/chain/orders/${orderId}/flag`).send({
      reason: 'Handwritten slip shows 1 roll of copper cable, not 2',
    });
    expect(flagRes.status).toBe(200);
    expect(flagRes.body.chain_status).toBe('flagged_for_manager');

    // Supervisor 2 without delegation CANNOT resolve flagged order
    const blockedResolve = await sup2Agent.post(`/api/chain/orders/${orderId}/manager-resolve`).send({
      action: 'approve_as_is',
    });
    expect(blockedResolve.status).toBe(403);

    // 7. Manager delegates flag resolution to Supervisor 2 (leave coverage) -> Supervisor 2 edits & completes!
    const delegateRes = await chainManagerAgent.put(`/api/users/${sup2Id}`).send({
      permissions: { can_verify_orders: true, can_resolve_flagged_orders: true },
    });
    expect(delegateRes.status).toBe(200);

    const resolveRes = await sup2Agent.post(`/api/chain/orders/${orderId}/manager-resolve`).send({
      action: 'edit_and_release',
      resolution_note: 'Verified against handwritten slip: corrected copper cable to 1 roll during manager leave',
      items: [
        { product_id: shopProductId, quantity: 4 },
        { product_id: watchedWarehouseProductId, quantity: 1 },
      ],
    });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.chain_status).toBe('completed');

    // 8. Both stocks are now deducted atomically!
    const finalShopProd = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [shopProductId]);
    const finalWhProd = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [watchedWarehouseProductId]);
    expect(Number(finalShopProd?.quantity)).toBe(36); // 40 - 4
    expect(Number(finalWhProd?.quantity)).toBe(24); // 25 - 1

    // 9. Manager Dashboard has an Unaudited Watch Alert for Special Copper Cable with full tracking details
    const alertsRes = await chainManagerAgent.get('/api/chain/watch-alerts?filter=unaudited');
    expect(alertsRes.status).toBe(200);
    expect(alertsRes.body.unauditedCount).toBe(1);
    const alert = alertsRes.body.alerts[0];
    expect(alert.product_name).toBe('Special Copper Cable 10mm');
    expect(alert.quantity_sold).toBe(1);
    expect(alert.stock_remaining_after).toBe(24);
    expect(alert.customer_name).toBe('Kigali Construction Ltd');
    expect(alert.seller_name).toBe('Jean Seller');
    expect(alert.first_verifier_name).toBe('Alice Supervisor 1');
    expect(alert.final_verifier_name).toBe('Bob Supervisor 2');
    expect(alert.stock_name).toBe('Central Warehouse');

    // 10. Manager marks the special alert as Audited
    const markRes = await chainManagerAgent.post(`/api/chain/watch-alerts/${alert.id}/audit`).send({
      audit_note: 'Checked against physical balance after returning to office',
    });
    expect(markRes.status).toBe(200);

    const afterAuditRes = await chainManagerAgent.get('/api/chain/watch-alerts?filter=unaudited');
    expect(afterAuditRes.status).toBe(200);
    expect(afterAuditRes.body.unauditedCount).toBe(0);
  });
});
