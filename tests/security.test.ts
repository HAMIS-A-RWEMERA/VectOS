import request from 'supertest';
import { describe, test, expect } from 'vitest';
import { app } from '../server';
import { getCsrf, login, createTestShop } from './helpers';
import { queryOne } from '../server/database/db';

describe('Security — CSRF, auth, tenant isolation, roles', () => {
  test('POST without CSRF token is rejected (403)', async () => {
    const agent = request.agent(app);
    // Login first to get session, but do NOT send _csrf
    const { agent: authAgent } = await login('manager@quincaille.rw', 'password123');
    // Try to create product without CSRF
    const res = await authAgent.post('/products/add').type('form').send({
      name: 'CSRF Test Product',
      sku: 'CSRF-001',
      category: 'Testing',
      buying_price: '1000',
      initial_quantity: '10',
    });
    expect(res.status).toBe(403);
    expect(res.text).toMatch(/Security Check Failed|session token/i);
  });

  test('POST with valid CSRF succeeds', async () => {
    const { agent, token } = await login('manager@quincaille.rw', 'password123');
    const res = await agent.post('/products/add').type('form').send({
      name: 'CSRF Valid Product ' + Date.now(),
      sku: 'CSRF-OK-' + Date.now(),
      category: 'Testing',
      buying_price: '1000',
      initial_quantity: '10',
      _csrf: token,
    });
    expect([302, 200]).toContain(res.status);
  });

  test('unauthenticated access redirects to login', async () => {
    const anon = request.agent(app);
    const res = await anon.get('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  test('salesperson cannot access admin shops', async () => {
    // Use salesperson from seed
    const { agent } = await login('sales@quincaille.rw', 'password123');
    const res = await agent.get('/admin/shops');
    expect(res.status).toBe(403);
  });

  test('cross-tenant isolation — shop A cannot see shop B orders', async () => {
    const shopA = await createTestShop('SecA');
    const shopB = await createTestShop('SecB');

    // Login as shop A manager and create product via helper (which handles CSRF)
    const { agent: agentA, token: tokenA } = await login(shopA.managerEmail, shopA.managerPassword);
    const skuA = 'SEC-A-' + shopA.shopId + '-' + Date.now();
    // Use direct execute for product creation to avoid CSRF flakiness in test
    // Create product directly via shopping as shop A
    const addResA = await agentA.post('/products/add').type('form').send({
      name: 'SecA Product ' + shopA.shopId,
      sku: skuA,
      category: 'Testing',
      buying_price: '5000',
      initial_quantity: '20',
      _csrf: tokenA,
    });
    // Should redirect on success (302)
    expect(addResA.status).toBe(302);
    const prodA = await queryOne<{ id: number }>('SELECT id FROM products WHERE sku = ?', [skuA]);
    expect(prodA).toBeTruthy();

    // Now login as shop B and try to access shop A's product via adjust-stock
    const { agent: agentB, token: tokenB } = await login(shopB.managerEmail, shopB.managerPassword);
    const res = await agentB.post('/products/adjust-stock').type('form').send({
      product_id: String(prodA!.id),
      adjustment_qty: '5',
      _csrf: tokenB,
    });
    // Should redirect without changing stock (product not found for shop B)
    expect([302, 200]).toContain(res.status);
    // Verify shop A's product quantity unchanged
    const prodAfter = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [prodA!.id]);
    expect(prodAfter?.quantity).toBe(20);
  });

  test('superadmin without shop context defaults safely', async () => {
    const { agent } = await login('admin@vectos.co.rw', 'password123');
    const res = await agent.get('/admin/shops');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/SuperAdmin|All Rwanda Depots/i);
  });

  test('error page does not leak SQL for 500', async () => {
    const anon = request.agent(app);
    // Request a non-existent order with invalid ID to trigger error handling
    const { agent } = await login('manager@quincaille.rw', 'password123');
    const csrf = await getCsrf(agent);
    // Try to create product with malformed data that would cause DB error if not validated
    // Use a very long name to test input handling
    const longName = 'A'.repeat(5000);
    const res = await agent.post('/products/add').type('form').send({
      name: longName,
      category: 'Testing',
      buying_price: '1000',
      initial_quantity: '10',
      _csrf: csrf,
    });
    // Should be handled without leaking SQL in response (either 400 validation or 500 generic)
    if (res.status === 500) {
      expect(res.text).not.toMatch(/SELECT|INSERT|SQLITE|syntax error/i);
    }
  });
});
