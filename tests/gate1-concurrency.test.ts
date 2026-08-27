import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { createTestShop, login } from './helpers';
import { queryOne } from '../server/database/db';

describe('Gate 1: Inventory Integrity & Concurrency Safety', () => {
  let shop: { shopId: number; managerEmail: string; managerPassword: string };
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    shop = await createTestShop('AtomicStockShop');
    const session = await login(shop.managerEmail, shop.managerPassword);
    agent = session.agent;
  });

  it('atomically decrements stock and prevents selling more than available quantity', async () => {
    // 1. Create a limited stock product (5 units only)
    const createRes = await agent.post('/api/products').send({
      name: 'Limited Generator',
      sku: `GEN-${Date.now()}`,
      category: 'Machinery',
      buying_price: 200000,
      quantity: 5
    });
    expect(createRes.status).toBe(200);
    const prodId = createRes.body.product.id;

    // 2. Order 3 units -> Should succeed, leaving 2 in stock
    const order1 = await agent.post('/api/orders').send({
      customer_name: 'Buyer One',
      items: [{ product_id: prodId, quantity: 3, selling_price: 250000 }],
      paid_amount: 750000
    });
    expect(order1.status).toBe(200);

    const prodCheck1 = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [prodId]);
    expect(prodCheck1?.quantity).toBe(2);

    // 3. Attempt to order 3 units when only 2 remain -> Must FAIL atomically
    const order2 = await agent.post('/api/orders').send({
      customer_name: 'Buyer Two',
      items: [{ product_id: prodId, quantity: 3, selling_price: 250000 }],
      paid_amount: 750000
    });
    expect(order2.status).toBe(400);
    expect(order2.body.error).toMatch(/Insufficient stock/i);

    // 4. Verify quantity is still intact at 2 (no partial deduction / corruption)
    const prodCheck2 = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [prodId]);
    expect(prodCheck2?.quantity).toBe(2);

    // 5. Order exact remaining 2 units -> Should succeed, leaving 0 in stock
    const order3 = await agent.post('/api/orders').send({
      customer_name: 'Buyer Three',
      items: [{ product_id: prodId, quantity: 2, selling_price: 250000 }],
      paid_amount: 500000
    });
    expect(order3.status).toBe(200);

    const prodCheck3 = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [prodId]);
    expect(prodCheck3?.quantity).toBe(0);
  });

  it('prevents manual stock adjustment into negative quantity', async () => {
    const createRes = await agent.post('/api/products').send({
      name: 'Small Paint Can',
      sku: `PNT-${Date.now()}`,
      category: 'Paint',
      buying_price: 5000,
      quantity: 4
    });
    expect(createRes.status).toBe(200);
    const prodId = createRes.body.product.id;

    // Try to adjust by -10 when stock is 4
    const adjRes = await agent.post(`/api/products/${prodId}/adjust-stock`).send({
      adjustment_qty: -10,
      movement_type: 'Correction'
    });
    expect(adjRes.status).toBe(400);
    expect(adjRes.body.error).toMatch(/Insufficient stock/i);

    const prodCheck = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [prodId]);
    expect(prodCheck?.quantity).toBe(4);
  });
});
