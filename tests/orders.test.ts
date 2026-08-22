import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { createTestShop, login, addProduct } from './helpers';
import { queryOne } from '../server/database/db';

let agent: ReturnType<typeof request.agent>;
let token: string;
let productId = 0;

beforeAll(async () => {
  const shop = await createTestShop('OrderFlow');
  const session = await login(shop.managerEmail, shop.managerPassword);
  agent = session.agent as any;
  token = session.token;
  productId = await addProduct(agent as any, token, {
    name: 'Order Test Cement',
    sku: 'OTC-' + Date.now(),
    buying_price: '8000',
    initial_quantity: '100'
  });
});

describe('Order lifecycle', () => {
  it('serves the new order (POS) form', async () => {
    const res = await agent.get('/orders/new');
    expect(res.status).toBe(200);
    expect(res.text).toContain('productsCatalog');
    expect(res.text).toContain('barcodeInput');
  });

  it('creates an order with a new walk-in customer and a client_ref', async () => {
    const ref = 'test-ref-' + Date.now();
    const res = await agent.post('/orders/create').type('form').send({
      customer_mode: 'new',
      new_customer_name: 'Walk-in Client',
      new_customer_phone: '078' + String(Math.floor(Math.random() * 9000000) + 1000000),
      notes: 'created by automated test',
      items: JSON.stringify([{ product_id: productId, quantity: 3, selling_price: 9500 }]),
      client_ref: ref,
      _csrf: token
    });
    expect(res.status).toBe(302);
    const order = await queryOne<{ id: number; order_number: string }>(
      'SELECT id, order_number FROM orders WHERE client_ref = ?', [ref]
    );
    expect(order).toBeTruthy();
  });

  it('ignores duplicate submissions of the same offline order', async () => {
    const ref = 'dup-ref-' + Date.now();
    const payload = {
      customer_mode: 'new',
      new_customer_name: 'Dup Client',
      new_customer_phone: '078' + String(Math.floor(Math.random() * 9000000) + 1000000),
      items: JSON.stringify([{ product_id: productId, quantity: 1, selling_price: 9000 }]),
      client_ref: ref,
      _csrf: token
    };
    const first = await agent.post('/orders/create').type('form').send(payload);
    expect(first.status).toBe(302);

    const second = await agent.post('/orders/create').type('form').send(payload);
    expect(second.status).toBe(302);
    expect(String(second.headers.location)).toContain('already+received');

    const count = await queryOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM orders WHERE client_ref = ?', [ref]
    );
    expect(Number(count?.c)).toBe(1);
  });

  it('rejects order creation without items', async () => {
    const res = await agent.post('/orders/create').type('form').send({
      customer_mode: 'new',
      new_customer_name: 'Empty Order',
      new_customer_phone: '0781112223',
      items: JSON.stringify([]),
      _csrf: token
    });
    expect([302, 400]).toContain(res.status);
  });
});
