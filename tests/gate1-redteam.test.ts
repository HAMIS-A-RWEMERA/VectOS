import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, dbReady } from '../server';
import { createTestShop, login } from './helpers';
import { execute, queryOne, queryAll } from '../server/database/db';
import { createBackup, restoreBackup } from '../server/database/backup';

describe('GATE 1: Comprehensive Red-Team & Adversarial Security Audit', () => {
  let shopA: { shopId: number; managerEmail: string; managerPassword: string };
  let shopB: { shopId: number; managerEmail: string; managerPassword: string };

  beforeAll(async () => {
    await dbReady;
    shopA = await createTestShop('TenantRedAlpha');
    shopB = await createTestShop('TenantRedBeta');
  });

  // ==========================================================================
  // 1. MULTI-TENANT ISOLATION RED-TEAM ATTACKS
  // ==========================================================================
  describe('Adversarial Multi-Tenant Isolation Attacks', () => {
    it('ATTACK: Tenant A user cannot read Tenant B products even with query injection', async () => {
      const { agent: agentA } = await login(shopA.managerEmail, shopA.managerPassword);

      // Create a secret product in Shop B
      const p2Result = await execute(
        `INSERT INTO products (shop_id, stock_id, name, sku, category, unit, buying_price, quantity, low_stock_threshold)
         VALUES (?, 1, 'Secret Tenant B Product 99', ?, 'Hardware', 'Pcs', 50000, 100, 5)`,
        [shopB.shopId, `SKU-TENANT-B-${Date.now()}`]
      );
      const secretProductId = p2Result.lastInsertId;

      // Tenant A requests product list with forged shop_id in query
      const res = await agentA.get(`/api/products?shop_id=${shopB.shopId}`);
      expect(res.status).toBe(200);
      const names = res.body.products.map((p: any) => p.name);
      expect(names).not.toContain('Secret Tenant B Product 99');

      // Tenant A attempts direct search for Tenant B product
      const resSearch = await agentA.get('/api/products?q=Secret+Tenant+B');
      expect(resSearch.status).toBe(200);
      expect(resSearch.body.products.length).toBe(0);
    });

    it('ATTACK: Tenant A user cannot read Tenant B order details (IDOR attack)', async () => {
      const { agent: agentA } = await login(shopA.managerEmail, shopA.managerPassword);

      // Create customer in Shop B
      const custB = await execute(
        `INSERT INTO customers (shop_id, name, phone, credit_balance) VALUES (?, 'Cust B', ?, 0)`,
        [shopB.shopId, `0788${Date.now().toString().slice(-6)}`]
      );

      // Create an order belonging to Shop B
      const orderBResult = await execute(
        `INSERT INTO orders (shop_id, customer_id, salesperson_id, order_number, total_amount, paid_amount, debt_amount, payment_status, fulfillment_status)
         VALUES (?, ?, 1, ?, 75000, 75000, 0, 'paid', 'pending_store')`,
        [shopB.shopId, custB.lastInsertId, `ORD-B-SECRET-${Date.now()}`]
      );
      const orderBId = orderBResult.lastInsertId;

      // Tenant A attempts to view Tenant B order
      const res = await agentA.get(`/api/orders/${orderBId}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found in this store/i);
    });

    it('ATTACK: Tenant A user cannot modify or delete Tenant B products', async () => {
      const { agent: agentA } = await login(shopA.managerEmail, shopA.managerPassword);

      // Create product in Shop B
      const pB = await execute(
        `INSERT INTO products (shop_id, stock_id, name, sku, category, unit, buying_price, quantity)
         VALUES (?, 1, 'Target B Product', ?, 'Hardware', 'Pcs', 10000, 50)`,
        [shopB.shopId, `SKU-TB-${Date.now()}`]
      );
      const pBId = pB.lastInsertId;

      // Attempt PUT
      const putRes = await agentA
        .put(`/api/products/${pBId}`)
        .send({ name: 'Hacked by Tenant A', buying_price: 1 });
      expect(putRes.status).toBe(404);

      // Attempt stock adjustment
      const adjRes = await agentA
        .post(`/api/products/${pBId}/adjust-stock`)
        .send({ adjustment_qty: -10, movement_type: 'Damage' });
      expect(adjRes.status).toBe(404);

      // Attempt DELETE
      const delRes = await agentA.delete(`/api/products/${pBId}`);
      expect(delRes.status).toBe(404);

      // Verify product remains intact in Shop B
      const check = await queryOne('SELECT * FROM products WHERE id = ?', [pBId]);
      expect(check.name).toBe('Target B Product');
      expect(check.quantity).toBe(50);
    });

    it('ATTACK: Tenant A cannot create an order consuming Tenant B product inventory', async () => {
      const { agent: agentA } = await login(shopA.managerEmail, shopA.managerPassword);

      // Product in Shop B with stock 10
      const pB = await execute(
        `INSERT INTO products (shop_id, stock_id, name, sku, category, unit, buying_price, quantity)
         VALUES (?, 1, 'Shop 2 Precious Metal', ?, 'Metals', 'Kg', 20000, 10)`,
        [shopB.shopId, `SKU-METAL-${Date.now()}`]
      );
      const pBId = pB.lastInsertId;

      // Tenant A attempts to order Shop B product
      const res = await agentA
        .post('/api/orders')
        .send({
          customer_name: 'Tenant A Cross Order Buyer',
          items: [{ product_id: pBId, quantity: 2, unit_price: 25000 }],
          payment_method: 'cash',
          paid_amount: 50000
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not found in this store|does not belong/i);

      // Verify Shop B stock was untouched
      const check = await queryOne('SELECT quantity FROM products WHERE id = ?', [pBId]);
      expect(check.quantity).toBe(10);
    });

    it('ATTACK: Tenant A cannot record payments or change fulfillment on Tenant B orders', async () => {
      const { agent: agentA } = await login(shopA.managerEmail, shopA.managerPassword);

      const custB = await execute(
        `INSERT INTO customers (shop_id, name, phone, credit_balance) VALUES (?, 'Cust B2', ?, 0)`,
        [shopB.shopId, `0788${Date.now().toString().slice(-6)}`]
      );

      const orderB = await execute(
        `INSERT INTO orders (shop_id, customer_id, salesperson_id, order_number, total_amount, paid_amount, debt_amount, payment_status, fulfillment_status)
         VALUES (?, ?, 1, ?, 100000, 0, 100000, 'debt', 'pending_store')`,
        [shopB.shopId, custB.lastInsertId, `ORD-B-PAY-${Date.now()}`]
      );
      const orderBId = orderB.lastInsertId;

      // Payment attempt
      const payRes = await agentA
        .post(`/api/orders/${orderBId}/payments`)
        .send({ amount: 50000, payment_method: 'cash' });
      expect(payRes.status).toBe(404);

      // Status change attempt
      const statusRes = await agentA
        .post(`/api/orders/${orderBId}/status`)
        .send({ fulfillment_status: 'completed' });
      expect(statusRes.status).toBe(404);
    });

    it('ATTACK: Tenant A cannot view or manipulate Tenant B customers, reports, or warehouses', async () => {
      const { agent: agentA } = await login(shopA.managerEmail, shopA.managerPassword);

      // Customer in Shop B
      const custB = await execute(
        `INSERT INTO customers (shop_id, name, phone, credit_balance)
         VALUES (?, 'Secret VIP Customer Shop B', ?, 500000)`,
        [shopB.shopId, `0788${Date.now().toString().slice(-6)}`]
      );
      const custBId = custB.lastInsertId;

      // Customer list
      const custListRes = await agentA.get('/api/customers?q=VIP');
      expect(custListRes.status).toBe(200);
      const bCustFound = custListRes.body.customers.some((c: any) => c.name === 'Secret VIP Customer Shop B');
      expect(bCustFound).toBe(false);

      // Update customer attempt
      const custUpdateRes = await agentA
        .put(`/api/customers/${custBId}`)
        .send({ name: 'Hijacked Customer' });
      expect(custUpdateRes.status).toBe(404);

      // Warehouse cross-tenant transfer attempt
      const whB = await execute(
        `INSERT INTO stocks (shop_id, name, code, is_main, status)
         VALUES (?, 'Shop B Depot', ?, 1, 'active')`,
        [shopB.shopId, `WH-SB-${Date.now().toString().slice(-4)}`]
      );
      const whBId = whB.lastInsertId;

      const p1 = await queryOne('SELECT id FROM products WHERE shop_id = ? LIMIT 1', [shopA.shopId]);
      const transferRes = await agentA
        .post('/api/stocks/transfer')
        .send({
          from_stock_id: 1,
          to_stock_id: whBId,
          product_id: p1 ? p1.id : 1,
          quantity: 1
        });
      expect(transferRes.status).toBe(404);
      expect(transferRes.body.error).toMatch(/does not belong to this store/i);
    });
  });

  // ==========================================================================
  // 2. BACKEND RBAC & PRIVILEGE ESCALATION ATTACKS
  // ==========================================================================
  describe('Adversarial RBAC & Privilege Escalation Attacks', () => {
    it('ATTACK: Cashier/Salesperson cannot create products or adjust stock', async () => {
      // Create a restricted salesperson user in Shop A
      const cashierEmail = `cashier-${Date.now()}@test.rw`;
      const password = 'password123';
      await execute(
        `INSERT INTO users (shop_id, stock_id, name, email, password, role, is_active, activation_status, can_create_orders, can_manage_stock, can_manage_users)
         VALUES (?, 1, 'Restricted Cashier', ?, ?, 'salesperson', 1, 'active', 1, 0, 0)`,
        [shopA.shopId, cashierEmail, await (await import('bcryptjs')).default.hash(password, 10)]
      );

      const { agent: sessionCashier } = await login(cashierEmail, password);

      // Attempt to create product
      const createProdRes = await sessionCashier
        .post('/api/products')
        .send({ name: 'Unauthorized Tool', buying_price: 5000, quantity: 10 });
      expect(createProdRes.status).toBe(403);
      expect(createProdRes.body.error).toMatch(/permission/i);

      // Attempt to adjust stock
      const p1 = await queryOne('SELECT id FROM products WHERE shop_id = ? LIMIT 1', [shopA.shopId]);
      if (p1) {
        const adjRes = await sessionCashier
          .post(`/api/products/${p1.id}/adjust-stock`)
          .send({ adjustment_qty: 10 });
        expect(adjRes.status).toBe(403);
      }

      // Attempt to access user management
      const usersRes = await sessionCashier.get('/api/users');
      expect(usersRes.status).toBe(403);
    });

    it('ATTACK: Store Manager cannot elevate an account to SuperAdmin role', async () => {
      const { agent: sessionManager } = await login(shopA.managerEmail, shopA.managerPassword);

      // Attempt to create superadmin user
      const createRes = await sessionManager
        .post('/api/users')
        .send({
          name: 'Fake SuperAdmin',
          email: `fake.superadmin-${Date.now()}@test.rw`,
          password: 'Password123!',
          role: 'superadmin'
        });
      expect(createRes.status).toBe(403);
      expect(createRes.body.error).toMatch(/privilege escalation/i);

      // Attempt to update existing user to superadmin
      const userRes = await execute(
        `INSERT INTO users (shop_id, stock_id, name, email, password, role, is_active)
         VALUES (?, 1, 'Target Staff', ?, 'pass', 'salesperson', 1)`,
        [shopA.shopId, `target.staff-${Date.now()}@test.rw`]
      );
      const targetId = userRes.lastInsertId;

      const updateRes = await sessionManager
        .put(`/api/users/${targetId}`)
        .send({ role: 'superadmin' });
      expect(updateRes.status).toBe(403);
      expect(updateRes.body.error).toMatch(/privilege escalation/i);

      // Verify role did not change
      const check = await queryOne('SELECT role FROM users WHERE id = ?', [targetId]);
      expect(check.role).toBe('salesperson');
    });

    it('ATTACK: Cascading suspension locks out staff when manager is deactivated', async () => {
      const shopGamma = await createTestShop('TenantGamma');

      // Create staff in Shop Gamma
      const staffEmail = `staff-gamma-${Date.now()}@test.rw`;
      const password = 'password123';
      await execute(
        `INSERT INTO users (shop_id, stock_id, name, email, password, role, is_active, activation_status, can_create_orders)
         VALUES (?, 1, 'Staff Gamma', ?, ?, 'salesperson', 1, 'active', 1)`,
        [shopGamma.shopId, staffEmail, await (await import('bcryptjs')).default.hash(password, 10)]
      );

      // Deactivate the shop manager
      await execute(
        "UPDATE users SET is_active = 0 WHERE shop_id = ? AND role = 'manager'",
        [shopGamma.shopId]
      );

      const { agent: staffSession } = await login(staffEmail, password);

      // Staff attempts to access API
      const res = await staffSession.get('/api/dashboard/stats');
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/temporarily blocked|locked/i);
    });
  });

  // ==========================================================================
  // 3. INVENTORY INTEGRITY & RACE CONDITION ATTACKS
  // ==========================================================================
  describe('Adversarial Inventory Integrity & Race Condition Attacks', () => {
    it('ATTACK: Concurrent orders competing for limited stock never create negative inventory', async () => {
      // Create product with exactly 5 units in stock
      const prodRes = await execute(
        `INSERT INTO products (shop_id, stock_id, name, sku, category, unit, buying_price, quantity, low_stock_threshold)
         VALUES (?, 1, 'High-Demand Drill RedTeam', ?, 'Tools', 'Pcs', 40000, 5, 2)`,
        [shopA.shopId, `SKU-RACE-${Date.now()}`]
      );
      const prodId = prodRes.lastInsertId;

      // Create 5 separate authenticated client agents
      const sessions = await Promise.all(
        Array.from({ length: 5 }).map(() => login(shopA.managerEmail, shopA.managerPassword))
      );

      // Launch 5 concurrent requests each trying to purchase 2 units (Total requested: 10 units > 5 units available)
      const orderPromises = sessions.map(({ agent }, idx) =>
        agent.post('/api/orders').send({
          customer_name: `Concurrent Race Buyer ${idx}`,
          items: [{ product_id: prodId, quantity: 2, unit_price: 45000 }],
          payment_method: 'cash',
          paid_amount: 90000
        })
      );

      const results = await Promise.all(orderPromises);
      const successful = results.filter(r => r.status === 200);
      const rejected = results.filter(r => r.status === 400);

      // Exactly 2 orders of 2 units should succeed (4 units total), 3 orders must fail
      expect(successful.length).toBe(2);
      expect(rejected.length).toBe(3);

      // Check remaining stock is strictly 1 (5 - 4 = 1) and never negative
      const product = await queryOne('SELECT quantity FROM products WHERE id = ?', [prodId]);
      expect(product.quantity).toBe(1);
    });

    it('ATTACK: Multi-item order failure rolls back stock deductions completely (ACID)', async () => {
      const { agent: session } = await login(shopA.managerEmail, shopA.managerPassword);

      // Product 1 has plenty of stock
      const p1 = await execute(
        `INSERT INTO products (shop_id, stock_id, name, sku, category, unit, buying_price, quantity)
         VALUES (?, 1, 'In-Stock Item Red', ?, 'Hardware', 'Pcs', 1000, 50)`,
        [shopA.shopId, `SKU-ROLL-1-${Date.now()}`]
      );
      // Product 2 has insufficient stock (only 1 unit)
      const p2 = await execute(
        `INSERT INTO products (shop_id, stock_id, name, sku, category, unit, buying_price, quantity)
         VALUES (?, 1, 'Low-Stock Item Red', ?, 'Hardware', 'Pcs', 1000, 1)`,
        [shopA.shopId, `SKU-ROLL-2-${Date.now()}`]
      );

      // Attempt order requesting 10 units of p1 and 5 units of p2
      const res = await session.post('/api/orders').send({
        customer_name: 'Rollback Tester',
        items: [
          { product_id: p1.lastInsertId, quantity: 10, unit_price: 1500 },
          { product_id: p2.lastInsertId, quantity: 5, unit_price: 1500 }
        ],
        payment_method: 'cash'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/insufficient stock/i);

      // Verify p1 stock was NOT decremented because the transaction rolled back
      const p1Check = await queryOne('SELECT quantity FROM products WHERE id = ?', [p1.lastInsertId]);
      const p2Check = await queryOne('SELECT quantity FROM products WHERE id = ?', [p2.lastInsertId]);
      expect(p1Check.quantity).toBe(50);
      expect(p2Check.quantity).toBe(1);
    });
  });

  // ==========================================================================
  // 4. BACKUP & RESTORE INTEGRITY ATTACKS
  // ==========================================================================
  describe('Adversarial Backup & Restore Integrity Attacks', () => {
    it('ATTACK: Tampered backup payload checksum mismatch is detected and rejected', async () => {
      const manifest = await createBackup(shopA.shopId);

      // Tamper with data payload
      manifest.data.shops = [{ id: shopA.shopId, name: 'Tampered Hacker Store' }];

      await expect(restoreBackup(manifest)).rejects.toThrow(/checksum mismatch/i);
    });

    it('ATTACK: Cross-tenant backup restore attempt is blocked by API layer', async () => {
      const { agent: agentA } = await login(shopA.managerEmail, shopA.managerPassword);

      // Create a valid backup for Shop B
      const manifestB = await createBackup(shopB.shopId);

      // Tenant A attempts to restore Shop B's backup into Shop A or overwrite Shop B
      const res = await agentA
        .post('/api/backup/restore')
        .send(manifestB);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/cross-tenant restore forbidden/i);
    });
  });
});
