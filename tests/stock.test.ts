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
});
