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
});
