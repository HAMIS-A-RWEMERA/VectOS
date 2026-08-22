import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { getCsrf, login } from './helpers';
import { queryOne } from '../server/database/db';

// Reproduces the exact flows reported broken by the user, using the SEEDED
// demo manager (manager@quincaille.rw) against a freshly-seeded database.
describe('Demo manager regression check', () => {
  it('stock adjust + customer register + multi-item order all succeed', async () => {
    const { agent, token } = await login('manager@quincaille.rw', 'password123');

    // 1. Products page renders management controls
    const prodPage = await agent.get('/products');
    expect(prodPage.status).toBe(200);
    const hasAdjust = prodPage.text.includes('adjust-stock');
    console.log('products page mentions adjust-stock:', hasAdjust);

    // 2. Stock adjustment POST
    const adj = await agent.post('/products/adjust-stock').type('form').send({
      product_id: '1',
      adjustment_type: 'restock',
      quantity: '10',
      notes: 'diag test',
      _csrf: token
    });
    console.log('adjust-stock status:', adj.status);

    // 3. Customer registration POST
    const cust = await agent.post('/customers/add').type('form').send({
      name: 'Diag Client',
      phone: '078' + String(Math.floor(Math.random() * 9000000) + 1000000),
      email: '',
      address: '',
      notes: '',
      _csrf: token
    });
    console.log('customers/add status:', cust.status);
    const custRow = await queryOne("SELECT id FROM customers WHERE name = 'Diag Client'");
    console.log('customer row created:', Boolean(custRow));

    // 4. Order with TWO catalog items at once
    const ref = 'diag-two-items-' + Date.now();
    const ord = await agent.post('/orders/create').type('form').send({
      customer_mode: 'new',
      new_customer_name: 'Multi Item Client',
      new_customer_phone: '0781112233',
      items: JSON.stringify([
        { product_id: 1, quantity: 2, selling_price: 12000 },
        { product_id: 2, quantity: 1, selling_price: 9000 }
      ]),
      client_ref: ref,
      _csrf: token
    });
    console.log('two-item order status:', ord.status);
    const saved = await queryOne<{ id: number }>('SELECT id FROM orders WHERE client_ref = ?', [ref]);
    console.log('two-item order stored:', Boolean(saved));
    if (saved) {
      const cnt = await queryOne<{ c: number }>(
        'SELECT COUNT(*) AS c FROM order_items WHERE order_id = ?', [saved.id]
      );
      console.log('order_items rows:', Number(cnt?.c));
    }

    // Hard assertions
    expect(adj.status).toBe(302);
    expect(cust.status).toBe(302);
    expect(ord.status).toBe(302);
    expect(saved).toBeTruthy();
  });
});
