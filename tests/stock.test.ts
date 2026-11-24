import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { createTestShop, login } from './helpers';

let agent: ReturnType<typeof request.agent>;
let token: string;
const sku = 'STK-' + Date.now();
const productName = 'Stock Test Pipe ' + Date.now();

beforeAll(async () => {
  const shop = await createTestShop('StockFlow');
  const session = await login(shop.managerEmail, shop.managerPassword);
  agent = session.agent as any;
  token = session.token;
});

describe('Inventory (stock)', () => {
  it('adds a product with initial quantity', async () => {
    const res = await agent.post('/products/add').type('form').send({
      name: productName,
      sku,
      category: 'Plumbing',
      unit: 'pcs',
      buying_price: '12000',
      initial_quantity: '40',
      low_stock_threshold: '8',
      description: 'Automated test product',
      _csrf: token
    });
    expect(res.status).toBe(302);
  });

  it('lists the product in the catalog page', async () => {
    const res = await agent.get('/products');
    expect(res.status).toBe(200);
    expect(res.text).toContain(productName);
  });

  it('finds products via the htmx live-search fragment by SKU', async () => {
    const res = await agent.get(`/products/search?q=${encodeURIComponent(sku)}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(productName);
  });

  it('finds products by name fragment in live search', async () => {
    const res = await agent.get(`/products/search?q=${encodeURIComponent('Stock Test Pipe')}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(productName);
  });

  it('returns a friendly empty fragment for nonsense queries', async () => {
    const res = await agent.get('/products/search?q=zzz-does-not-exist-zzz');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No products found');
  });

  it('sorts products by quantity, best selling units, and date entered via GET /api/products', async () => {
    const apiShop = await createTestShop('SortApiFlow');
    const apiSession = await login(apiShop.managerEmail, apiShop.managerPassword);
    const apiAgent = apiSession.agent as any;

    const createItem = async (name: string, skuCode: string, qty: number, price = 2500) => {
      const res = await apiAgent.post('/api/products').send({
        name,
        sku: skuCode,
        category: 'Hardware',
        unit: 'pcs',
        buying_price: price,
        selling_price: price,
        quantity: qty,
        low_stock_threshold: 5
      });
      expect(res.status).toBe(200);
      return res.body.product;
    };

    const lowItem = await createItem('Zero Bolt', 'SRT-LOW', 0);
    const midItem = await createItem('Medium Cement', 'SRT-MID', 25);
    const highItem = await createItem('High Rebar', 'SRT-HIGH', 150);

    // Ensure distinct creation timestamps for deterministic date sorting
    const { execute } = await import('../server/database/db');
    await execute('UPDATE products SET created_at = ? WHERE id = ?', ['2026-01-01 08:00:00', lowItem.id]);
    await execute('UPDATE products SET created_at = ? WHERE id = ?', ['2026-02-01 08:00:00', midItem.id]);
    await execute('UPDATE products SET created_at = ? WHERE id = ?', ['2026-03-01 08:00:00', highItem.id]);

    // Create a customer & sell 12 units of Medium Cement so it becomes best-selling
    const custRes = await apiAgent.post('/api/customers').send({
      name: 'Sort Test Builder',
      phone: '0788123123'
    });
    expect(custRes.status).toBe(200);

    const orderRes = await apiAgent.post('/api/orders').send({
      customer_id: custRes.body.customer.id,
      items: [{ product_id: midItem.id, quantity: 12, selling_price: 2500 }],
      payment_method: 'cash',
      paid_amount: 30000,
      immediate_release: true
    });
    expect(orderRes.status).toBe(200);

    // 1. Quantity descending (High -> Low)
    const qtyDesc = await apiAgent.get('/api/products?sort=qty_desc');
    expect(qtyDesc.status).toBe(200);
    expect(qtyDesc.body.products.map((p: any) => p.sku)).toEqual(['SRT-HIGH', 'SRT-MID', 'SRT-LOW']);

    // 2. Quantity ascending (Zero / Low -> High)
    const qtyAsc = await apiAgent.get('/api/products?sort=qty_asc');
    expect(qtyAsc.status).toBe(200);
    expect(qtyAsc.body.products.map((p: any) => p.sku)).toEqual(['SRT-LOW', 'SRT-MID', 'SRT-HIGH']);

    // 3. Best selling descending (Medium Cement with 12 sold comes first)
    const soldDesc = await apiAgent.get('/api/products?sort=sold_desc');
    expect(soldDesc.status).toBe(200);
    expect(soldDesc.body.products[0].sku).toBe('SRT-MID');
    expect(soldDesc.body.products[0].total_units_sold).toBe(12);

    // 4. Date entered descending (Newest first) & ascending (Oldest first)
    const dateDesc = await apiAgent.get('/api/products?sort=date_desc');
    expect(dateDesc.status).toBe(200);
    expect(dateDesc.body.products.map((p: any) => p.sku)).toEqual(['SRT-HIGH', 'SRT-MID', 'SRT-LOW']);

    const dateAsc = await apiAgent.get('/api/products?sort=date_asc');
    expect(dateAsc.status).toBe(200);
    expect(dateAsc.body.products.map((p: any) => p.sku)).toEqual(['SRT-LOW', 'SRT-MID', 'SRT-HIGH']);
  });

  it('blocks tenant managers from wiping whole stock and lets SuperAdmin safely zero or delete tenant stock', async () => {
    const { queryOne } = await import('../server/database/db');

    // Create a fresh tenant A with 2 products (1 ordered, 1 un-ordered) and a bystander tenant B
    const tenantA = await createTestShop('WipeTargetCo');
    const tenantB = await createTestShop('BystanderCo');

    const shopARow = await queryOne<{ id: number; code: string }>('SELECT id, code FROM shops WHERE id = ?', [tenantA.shopId]);
    expect(shopARow).toBeTruthy();

    const sessA = await login(tenantA.managerEmail, tenantA.managerPassword);
    const agentA = sessA.agent as any;
    const sessB = await login(tenantB.managerEmail, tenantB.managerPassword);
    const agentB = sessB.agent as any;

    const pOrderedRes = await agentA.post('/api/products').send({
      name: 'Ordered Cement Bag',
      sku: `WPO-${Date.now()}`,
      category: 'Cement',
      unit: 'bags',
      buying_price: 9000,
      selling_price: 10500,
      quantity: 25,
    });
    expect(pOrderedRes.status).toBe(200);
    const orderedProdId = pOrderedRes.body.product.id;

    const pUnusedRes = await agentA.post('/api/products').send({
      name: 'Unused Steel Rod',
      sku: `WPU-${Date.now()}`,
      category: 'Steel',
      unit: 'pcs',
      buying_price: 5000,
      selling_price: 6000,
      quantity: 40,
    });
    expect(pUnusedRes.status).toBe(200);

    // Bystander shop B product (must remain untouched!)
    const pBystanderRes = await agentB.post('/api/products').send({
      name: 'Safe Bystander Paint',
      sku: `BYST-${Date.now()}`,
      category: 'Paints',
      unit: 'liters',
      buying_price: 4000,
      selling_price: 5000,
      quantity: 18,
    });
    expect(pBystanderRes.status).toBe(200);

    // Create an order on tenant A for Ordered Cement Bag so it has order_items + inventory_movements
    const custARes = await agentA.post('/api/customers').send({ name: 'Wipe Buyer', phone: '0788444555' });
    expect(custARes.status).toBe(200);
    const ordARes = await agentA.post('/api/orders').send({
      customer_id: custARes.body.customer.id,
      items: [{ product_id: orderedProdId, quantity: 3, selling_price: 10500 }],
      payment_method: 'cash',
      paid_amount: 31500,
      immediate_release: true,
    });
    expect(ordARes.status).toBe(200);

    // 1. Tenant Manager is strictly blocked (403) from stock-summary & wipe-stock even on their own store
    const mgrSummaryBlocked = await agentA.get(`/api/admin/shops/${tenantA.shopId}/stock-summary`);
    expect(mgrSummaryBlocked.status).toBe(403);

    const mgrWipeBlocked = await agentA.post(`/api/admin/shops/${tenantA.shopId}/wipe-stock`).send({
      mode: 'delete_products',
      confirm_code: shopARow!.code,
    });
    expect(mgrWipeBlocked.status).toBe(403);

    // 2. SuperAdmin logs in and inspects summary
    const superSess = await login('admin@vectos.co.rw', 'password123');
    const superAgent = superSess.agent as any;

    const sumRes = await superAgent.get(`/api/admin/shops/${tenantA.shopId}/stock-summary`);
    expect(sumRes.status).toBe(200);
    expect(sumRes.body.summary.productCount).toBe(2);
    expect(sumRes.body.summary.orderedProductCount).toBe(1);
    expect(sumRes.body.summary.deletableProductCount).toBe(1);
    expect(sumRes.body.summary.orderCount).toBe(1);

    // 3. Wrong confirm_code is rejected (400)
    const badConfirm = await superAgent.post(`/api/admin/shops/${tenantA.shopId}/wipe-stock`).send({
      mode: 'zero_quantities',
      confirm_code: 'WRONG-CODE',
    });
    expect(badConfirm.status).toBe(400);

    // 4. zero_quantities mode resets quantities to 0 while keeping both products
    const zeroRes = await superAgent.post(`/api/admin/shops/${tenantA.shopId}/wipe-stock`).send({
      mode: 'zero_quantities',
      confirm_code: shopARow!.code,
      reason: 'Owner physical recount',
    });
    expect(zeroRes.status).toBe(200);
    expect(zeroRes.body.zeroedProducts).toBe(2);

    const afterZeroA = await agentA.get('/api/products');
    expect(afterZeroA.body.products.length).toBe(2);
    expect(afterZeroA.body.products.every((p: any) => Number(p.quantity) === 0)).toBe(true);

    // 5. delete_products mode (default include_orders=false) deletes unused product cleanly & keeps ordered product at qty 0
    const safeDeleteRes = await superAgent.post(`/api/admin/shops/${tenantA.shopId}/wipe-stock`).send({
      mode: 'delete_products',
      include_orders: false,
      confirm_code: shopARow!.code,
    });
    expect(safeDeleteRes.status).toBe(200);
    expect(safeDeleteRes.body.deletedProducts).toBe(1);
    expect(safeDeleteRes.body.zeroedProducts).toBe(1);

    const afterSafeDelA = await agentA.get('/api/products');
    expect(afterSafeDelA.body.products.length).toBe(1);
    expect(afterSafeDelA.body.products[0].id).toBe(orderedProdId);

    // 6. delete_products with include_orders=true deletes 100% of products cleanly
    const fullWipeRes = await superAgent.post(`/api/admin/shops/${tenantA.shopId}/wipe-stock`).send({
      mode: 'delete_products',
      include_orders: true,
      confirm_code: shopARow!.code,
      reason: 'Fresh start requested by store owner',
    });
    expect(fullWipeRes.status).toBe(200);
    expect(fullWipeRes.body.deletedProducts).toBe(1);
    expect(fullWipeRes.body.deletedOrders).toBe(1);

    const afterFullDelA = await agentA.get('/api/products');
    expect(afterFullDelA.body.products.length).toBe(0);

    // 7. Bystander Tenant B's stock is 100% untouched
    const afterB = await agentB.get('/api/products');
    expect(afterB.body.products.length).toBe(1);
    expect(afterB.body.products[0].quantity).toBe(18);
  });

  it('serves tailored bulk Excel templates based on tenant pricing_mode and enforces 0 prices on stock_only bulk import', async () => {
    const XLSX = await import('xlsx');
    const { execute } = await import('../server/database/db');

    const parseBinary = (res: any, cb: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    };

    const stdShop = await createTestShop('StdTemplateCo');
    const stockOnlyShop = await createTestShop('StockOnlyTemplateCo');
    await execute("UPDATE shops SET pricing_mode = 'stock_only', workflow_mode = 'strict_chain' WHERE id = ?", [
      stockOnlyShop.shopId,
    ]);

    const stdSess = await login(stdShop.managerEmail, stdShop.managerPassword);
    const stockOnlySess = await login(stockOnlyShop.managerEmail, stockOnlyShop.managerPassword);
    const superSess = await login('admin@vectos.co.rw', 'password123');

    // 1. Standard tenant receives Excel template WITH Buying Price & Selling Price columns
    const stdRes = await (stdSess.agent as any)
      .get('/api/products/bulk-template')
      .buffer(true)
      .parse(parseBinary);
    expect(stdRes.status).toBe(200);
    expect(stdRes.headers['content-disposition']).toContain('Stock_With_Prices_Template.xlsx');
    const stdWb = XLSX.read(stdRes.body, { type: 'buffer' });
    expect(stdWb.SheetNames).toContain('Products');
    const stdRows = XLSX.utils.sheet_to_json<Record<string, any>>(stdWb.Sheets['Products']);
    expect(stdRows.length).toBeGreaterThan(0);
    expect(Object.keys(stdRows[0])).toContain('Buying Price (RWF)');
    expect(Object.keys(stdRows[0])).toContain('Selling Price (RWF)');

    // 2. Stock-Only tenant receives Excel template WITHOUT any price columns
    const soRes = await (stockOnlySess.agent as any)
      .get('/api/products/bulk-template')
      .buffer(true)
      .parse(parseBinary);
    expect(soRes.status).toBe(200);
    expect(soRes.headers['content-disposition']).toContain('Stock_Only_Template.xlsx');
    const soWb = XLSX.read(soRes.body, { type: 'buffer' });
    const soRows = XLSX.utils.sheet_to_json<Record<string, any>>(soWb.Sheets['Products']);
    expect(soRows.length).toBeGreaterThan(0);
    const soHeaders = Object.keys(soRows[0]);
    expect(soHeaders).toContain('Product Name');
    expect(soHeaders).toContain('Initial Quantity');
    expect(soHeaders.some((h) => /price/i.test(h))).toBe(false);

    // 3. SuperAdmin admin template endpoint also reflects target shop's pricing_mode
    const adminSoRes = await (superSess.agent as any)
      .get(`/api/admin/shops/${stockOnlyShop.shopId}/bulk-template`)
      .buffer(true)
      .parse(parseBinary);
    expect(adminSoRes.status).toBe(200);
    expect(adminSoRes.headers['content-disposition']).toContain('Stock_Only_Template.xlsx');

    // 4. Bulk-import on stock_only tenant strictly keeps all prices at 0
    const impRes = await (stockOnlySess.agent as any).post('/api/products/bulk-import').send({
      products: [
        {
          name: 'Strict Chain Rebar 10mm',
          sku: `SC-${Date.now()}`,
          category: 'Steel',
          unit: 'Bar',
          buying_price: 9999,
          selling_price: 12000,
          quantity: 60,
          low_stock_threshold: 10,
        },
      ],
    });
    expect(impRes.status).toBe(200);
    expect(impRes.body.insertedCount).toBe(1);

    const { queryOne } = await import('../server/database/db');
    const savedProd = await queryOne<any>(
      'SELECT buying_price, selling_price, quantity FROM products WHERE shop_id = ? AND name = ?',
      [stockOnlyShop.shopId, 'Strict Chain Rebar 10mm']
    );
    expect(savedProd).toBeTruthy();
    expect(Number(savedProd.quantity)).toBe(60);
    expect(Number(savedProd.buying_price)).toBe(0);
    expect(Number(savedProd.selling_price)).toBe(0);
  });

  it('allows SuperAdmin to completely delete a tenant shop, all warehouses, and all staff accounts while blocking managers and shop #1', async () => {
    const { execute, queryAll, queryOne } = await import('../server/database/db');

    const doomedTenant = await createTestShop('DoomedTenantCo');
    const bystanderTenant = await createTestShop('KeepMeTenantCo');

    const doomedShopRow = await queryOne<{ id: number; code: string }>(
      'SELECT id, code FROM shops WHERE id = ?',
      [doomedTenant.shopId]
    );
    expect(doomedShopRow).toBeTruthy();

    const doomedSess = await login(doomedTenant.managerEmail, doomedTenant.managerPassword);
    const doomedAgent = doomedSess.agent as any;

    // Add an extra warehouse + staff account + product + customer + order on the doomed tenant
    await execute(
      "INSERT INTO stocks (shop_id, name, location, is_main) VALUES (?, 'Annex Warehouse', 'Gisozi', 0)",
      [doomedTenant.shopId]
    );
    await execute(
      "INSERT INTO users (shop_id, name, email, password, role, is_active, activation_status) VALUES (?, 'Doomed Cashier', ?, 'hashed', 'cashier', 1, 'active')",
      [doomedTenant.shopId, `cashier-${Date.now()}@doomed.test`]
    );

    const pRes = await doomedAgent.post('/api/products').send({
      name: 'Doomed Galvanized Pipe',
      sku: `DM-${Date.now()}`,
      category: 'Plumbing',
      unit: 'pcs',
      buying_price: 5000,
      selling_price: 7000,
      quantity: 30,
    });
    expect(pRes.status).toBe(200);

    const cRes = await doomedAgent.post('/api/customers').send({
      name: 'Doomed Buyer',
      phone: '0788777666',
    });
    expect(cRes.status).toBe(200);

    const oRes = await doomedAgent.post('/api/orders').send({
      customer_id: cRes.body.customer.id,
      items: [{ product_id: pRes.body.product.id, quantity: 2, selling_price: 7000 }],
      payment_method: 'cash',
      paid_amount: 14000,
      immediate_release: true,
    });
    expect(oRes.status).toBe(200);

    // 1. Tenant Manager cannot delete their own shop (403)
    const mgrBlocked = await doomedAgent.post(`/api/admin/shops/${doomedTenant.shopId}/delete`).send({
      confirm_code: doomedShopRow!.code,
    });
    expect(mgrBlocked.status).toBe(403);

    // 2. SuperAdmin logs in and verifies safeguards
    const superSess = await login('admin@vectos.co.rw', 'password123');
    const superAgent = superSess.agent as any;

    // Primary platform store #1 cannot be deleted
    const primaryRow = await queryOne<{ code: string }>('SELECT code FROM shops WHERE id = 1');
    const protectPrimary = await superAgent.post('/api/admin/shops/1/delete').send({
      confirm_code: primaryRow?.code || 'MAIN',
    });
    expect(protectPrimary.status).toBe(400);

    // Wrong confirm code rejected
    const wrongCodeRes = await superAgent.post(`/api/admin/shops/${doomedTenant.shopId}/delete`).send({
      confirm_code: 'INVALID-CODE',
    });
    expect(wrongCodeRes.status).toBe(400);

    // Switch SuperAdmin context into doomed shop to verify session bounces back cleanly to #1 upon deletion
    const switchRes = await superAgent.post('/api/shops/switch').send({ shop_id: doomedTenant.shopId });
    expect(switchRes.status).toBe(200);

    // 3. Valid complete tenant deletion succeeds and cleans up every dependent table
    const delRes = await superAgent.post(`/api/admin/shops/${doomedTenant.shopId}/delete`).send({
      confirm_code: doomedShopRow!.code,
      reason: 'Tenant account permanently closed',
    });
    expect(delRes.status).toBe(200);
    expect(delRes.body.deletedShopId).toBe(doomedTenant.shopId);
    expect(delRes.body.deletedStocks).toBeGreaterThanOrEqual(2);
    expect(delRes.body.deletedUsers).toBeGreaterThanOrEqual(2);
    expect(delRes.body.deletedProducts).toBe(1);
    expect(delRes.body.deletedOrders).toBe(1);
    expect(delRes.body.switchedToShopId).toBe(1);

    // Verify all tenant records are gone
    expect(await queryOne('SELECT id FROM shops WHERE id = ?', [doomedTenant.shopId])).toBeNull();
    expect((await queryAll('SELECT id FROM stocks WHERE shop_id = ?', [doomedTenant.shopId])).length).toBe(0);
    expect((await queryAll('SELECT id FROM users WHERE shop_id = ?', [doomedTenant.shopId])).length).toBe(0);
    expect((await queryAll('SELECT id FROM products WHERE shop_id = ?', [doomedTenant.shopId])).length).toBe(0);
    expect((await queryAll('SELECT id FROM orders WHERE shop_id = ?', [doomedTenant.shopId])).length).toBe(0);
    expect((await queryAll('SELECT id FROM customers WHERE shop_id = ?', [doomedTenant.shopId])).length).toBe(0);

    // Verify SuperAdmin session bounced safely back to shop #1
    const meAfter = await superAgent.get('/api/auth/me');
    expect(meAfter.status).toBe(200);
    expect(Number(meAfter.body.user.shop_id)).toBe(1);

    // Verify bystander tenant remains 100% untouched
    const bystanderShop = await queryOne('SELECT id FROM shops WHERE id = ?', [bystanderTenant.shopId]);
    expect(bystanderShop).toBeTruthy();

    // 4. Regression: tenant deletion still succeeds cleanly even if optional payments_ledger table does not exist
    const missingLedgerTenant = await createTestShop('NoLedgerTenantCo');
    const missingShopRow = await queryOne<{ id: number; code: string }>('SELECT id, code FROM shops WHERE id = ?', [
      missingLedgerTenant.shopId,
    ]);
    await execute('DROP TABLE IF EXISTS payments_ledger');
    const delMissingRes = await superAgent.post(`/api/admin/shops/${missingLedgerTenant.shopId}/delete`).send({
      confirm_code: missingShopRow!.code,
    });
    expect(delMissingRes.status).toBe(200);
    expect(await queryOne('SELECT id FROM shops WHERE id = ?', [missingLedgerTenant.shopId])).toBeNull();
  });
});
