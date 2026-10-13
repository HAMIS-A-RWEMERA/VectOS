import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { getCsrf, login, createTestShop, addProduct } from './helpers';
import { queryOne } from '../server/database/db';

describe('Store manager workflow check', () => {
  it('stock adjust + customer register + multi-item order all succeed', async () => {
    const { managerEmail, managerPassword } = await createTestShop('Kigali Depot');
    const { agent, token } = await login(managerEmail, managerPassword);

    // Add 2 test products
    const p1 = await addProduct(agent, token, { name: 'Cement 32.5R', buying_price: '10000', initial_quantity: '50' });
    const p2 = await addProduct(agent, token, { name: 'Iron Bars 12mm', buying_price: '11000', initial_quantity: '40' });

    // 1. Products page renders management controls
    const prodPage = await agent.get('/products');
    expect(prodPage.status).toBe(200);

    // 2. Stock adjustment POST
    const adj = await agent.post('/products/adjust-stock').type('form').send({
      product_id: String(p1),
      adjustment_type: 'restock',
      quantity: '10',
      notes: 'diag test',
      _csrf: token
    });

    // 3. Customer registration POST
    const cust = await agent.post('/customers/add').type('form').send({
      name: 'Diag Client',
      phone: '078' + String(Math.floor(Math.random() * 9000000) + 1000000),
      email: '',
      address: '',
      notes: '',
      _csrf: token
    });
    const custRow = await queryOne("SELECT id FROM customers WHERE name = 'Diag Client'");
    expect(custRow).toBeTruthy();

    // 4. Order with TWO catalog items at once
    const ref = 'diag-two-items-' + Date.now();
    const ord = await agent.post('/orders/create').type('form').send({
      customer_mode: 'new',
      new_customer_name: 'Multi Item Client',
      new_customer_phone: '0781112233',
      items: JSON.stringify([
        { product_id: p1, quantity: 2, selling_price: 12000 },
        { product_id: p2, quantity: 1, selling_price: 13000 }
      ]),
      client_ref: ref,
      _csrf: token
    });
    const saved = await queryOne<{ id: number }>('SELECT id FROM orders WHERE client_ref = ?', [ref]);
    expect(saved).toBeTruthy();

    // Hard assertions
    expect(adj.status).toBe(302);
    expect(cust.status).toBe(302);
    expect(ord.status).toBe(302);
    expect(saved).toBeTruthy();
  });

  it('manager can register new staff accounts', async () => {
    const { managerEmail, managerPassword } = await createTestShop('Staff Test Depot');
    const { agent, token } = await login(managerEmail, managerPassword);
    const email = `newstaff-${Date.now()}@testcompany.rw`;
    const res = await agent.post('/users/add').type('form').send({
      name: 'New Staff Member',
      email,
      password: 'password123',
      confirm_password: 'password123',
      role: 'salesperson',
      job_title: 'Counter Sales',
      phone: '078' + String(Math.floor(Math.random() * 9000000) + 1000000),
      can_create_orders: '1',
      _csrf: token
    });
    expect(res.status).toBe(302);
    const row = await queryOne<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]);
    expect(row).toBeTruthy();
  });
});
