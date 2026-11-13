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
});
