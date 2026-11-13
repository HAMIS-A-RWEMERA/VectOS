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

  it('allows staff to edit an existing order and adjusts items and totals', async () => {
    // 1. Create order via API
    const createRes = await agent.post('/api/orders').send({
      customer_name: 'Original Customer',
      customer_phone: '0788123456',
      items: [{ product_id: productId, quantity: 2, selling_price: 10000 }],
      payment_method: 'cash',
      paid_amount: 20000,
      notes: 'Original note'
    });
    expect(createRes.status).toBe(200);
    expect(createRes.body.success).toBe(true);
    const orderId = createRes.body.order.id;

    // 2. Edit order: change customer, increase quantity to 4, update price, and change paid amount
    const editRes = await agent.put(`/api/orders/${orderId}`).send({
      customer_name: 'Revised Customer',
      customer_phone: '0788999888',
      paid_amount: 35000,
      notes: 'Customer changed quantity from 2 to 4 and paid 35,000 RWF',
      items: [{ product_id: productId, quantity: 4, selling_price: 10000 }]
    });
    expect(editRes.status).toBe(200);
    expect(editRes.body.success).toBe(true);
    expect(editRes.body.order).toBeTruthy();
    expect(editRes.body.order.total_amount).toBe(40000);
    expect(editRes.body.order.paid_amount).toBe(35000);
    expect(editRes.body.order.debt_amount).toBe(5000);
    expect(editRes.body.order.payment_status).toBe('partial');
    expect(editRes.body.order.customer_name).toBe('Revised Customer');
    expect(editRes.body.order.items).toHaveLength(1);
    expect(editRes.body.order.items[0].quantity).toBe(4);
  });

  it('allows selective stock release per checked item, returns unreleased stock, and updates the receipt', async () => {
    const secondProductId = await addProduct(agent as any, token, {
      name: 'Order Test Rebar',
      sku: 'OTR-' + Date.now(),
      buying_price: '10000',
      initial_quantity: '50'
    });

    const prod1Before = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [productId]);
    const prod2Before = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [secondProductId]);

    // Create 2-item order: 5 of product 1 (10,000 each) + 3 of product 2 (12,000 each) = 86,000 RWF
    const createRes = await agent.post('/api/orders').send({
      customer_name: 'Checklist Client',
      customer_phone: '0788776655',
      items: [
        { product_id: productId, quantity: 5, selling_price: 10000 },
        { product_id: secondProductId, quantity: 3, selling_price: 12000 }
      ],
      payment_method: 'cash',
      paid_amount: 86000
    });
    expect(createRes.status).toBe(200);
    const order = createRes.body.order;
    expect(order.items).toHaveLength(2);

    const item1 = order.items.find((it: any) => it.product_id === productId);
    expect(item1).toBeTruthy();

    // Storekeeper checks ONLY item 1 and releases 3 of 5 units (item 2 is unchecked)
    const releaseRes = await agent.post(`/api/orders/${order.id}/release-items`).send({
      released_items: [{ order_item_id: item1.id, product_id: productId, quantity_released: 3 }],
      update_receipt: true,
      fulfillment_status: 'approved'
    });

    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.success).toBe(true);
    const updated = releaseRes.body.order;
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].product_id).toBe(productId);
    expect(updated.items[0].quantity).toBe(3);
    expect(updated.total_amount).toBe(30000);
    expect(updated.paid_amount).toBe(30000);
    expect(updated.debt_amount).toBe(0);

    // Verify stock levels: 3 deducted from product 1 (2 returned), 0 deducted from product 2 (all 3 returned)
    const prod1After = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [productId]);
    const prod2After = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [secondProductId]);
    expect(Number(prod1After?.quantity)).toBe(Number(prod1Before?.quantity) - 3);
    expect(Number(prod2After?.quantity)).toBe(Number(prod2Before?.quantity));
  });
});
