import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { createTestShop, login } from './helpers';
import { queryOne } from '../server/database/db';

describe('Gate 1: Multi-Tenant Isolation & RBAC Security', () => {
  let shopA: { shopId: number; managerEmail: string; managerPassword: string };
  let shopB: { shopId: number; managerEmail: string; managerPassword: string };

  beforeAll(async () => {
    shopA = await createTestShop('TenantAlpha');
    shopB = await createTestShop('TenantBeta');
  });

  it('rejects unauthenticated API calls with 401 JSON error', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/log in|authentication/i);
  });

  it('allows authenticated shop manager to access their isolated dashboard metrics', async () => {
    const { agent } = await login(shopA.managerEmail, shopA.managerPassword);
    const res = await agent.get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('todaySales');
    expect(res.body).toHaveProperty('inventoryValue');
  });

  it('strictly isolates products between Shop A and Shop B', async () => {
    const { agent: agentA } = await login(shopA.managerEmail, shopA.managerPassword);
    const skuA = `SKU-A-${Date.now()}`;

    // Shop A creates a product
    const createResA = await agentA.post('/api/products').send({
      name: 'Alpha Exclusive Tool',
      sku: skuA,
      category: 'Tools',
      buying_price: 15000,
      quantity: 50
    });
    expect(createResA.status).toBe(200);
    const prodA = createResA.body.product;
    expect(prodA).toBeTruthy();

    // Shop B lists products — should NOT include Shop A's product
    const { agent: agentB } = await login(shopB.managerEmail, shopB.managerPassword);
    const listResB = await agentB.get('/api/products');
    expect(listResB.status).toBe(200);
    const foundInB = listResB.body.products.some((p: any) => p.sku === skuA);
    expect(foundInB).toBe(false);

    // Shop B tries to adjust Shop A's product — should be rejected with 404 (Not in this store)
    const adjustResB = await agentB.post(`/api/products/${prodA.id}/adjust-stock`).send({
      adjustment_qty: -5,
      movement_type: 'Damage'
    });
    expect(adjustResB.status).toBe(404);

    // Verify quantity in Shop A remains untouched at 50
    const checkA = await agentA.get('/api/products');
    const itemA = checkA.body.products.find((p: any) => p.sku === skuA);
    expect(itemA.quantity).toBe(50);
  });

  it('blocks privilege escalation: Store manager cannot create SuperAdmin account', async () => {
    const { agent } = await login(shopA.managerEmail, shopA.managerPassword);
    const rogueRes = await agent.post('/api/users').send({
      name: 'Rogue Admin',
      email: `rogue-${Date.now()}@test.rw`,
      password: 'password123',
      role: 'superadmin'
    });
    expect(rogueRes.status).toBe(403);
    expect(rogueRes.body.error).toMatch(/Privilege escalation blocked/i);
  });

  it('blocks privilege escalation: Store manager cannot promote user to SuperAdmin', async () => {
    const { agent } = await login(shopA.managerEmail, shopA.managerPassword);
    // Create regular salesperson
    const staffRes = await agent.post('/api/users').send({
      name: 'Staff Worker',
      email: `staff-${Date.now()}@test.rw`,
      password: 'password123',
      role: 'salesperson'
    });
    expect(staffRes.status).toBe(200);
    const staffId = staffRes.body.user.id;

    // Attempt to promote to superadmin
    const promoteRes = await agent.put(`/api/users/${staffId}`).send({
      role: 'superadmin'
    });
    expect(promoteRes.status).toBe(403);
  });
});
