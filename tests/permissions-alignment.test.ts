import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { dbReady } from '../server';
import { createTestShop, login } from './helpers';
import { queryOne } from '../server/database/db';

let managerAgent: ReturnType<typeof request.agent>;
let productId = 0;
let salespersonId = 0;
let salespersonEmail = '';
let accountantEmail = '';
let storekeeperEmail = '';
const staffPassword = 'StaffPassword123!';

beforeAll(async () => {
  await dbReady;
  const shop = await createTestShop('PermAlign');

  const mgrSession = await login(shop.managerEmail, shop.managerPassword);
  managerAgent = mgrSession.agent as any;

  // Create a product with distinct buying_price (5000) and selling_price (8000)
  const prodRes = await managerAgent.post('/api/products').send({
    name: 'Permission Test Pipe',
    sku: 'PTP-' + Date.now(),
    category: 'Plumbing',
    unit: 'pcs',
    buying_price: 5000,
    selling_price: 8000,
    quantity: 50,
    low_stock_threshold: 5
  });
  expect(prodRes.status).toBe(200);
  productId = prodRes.body.product.id;

  const ts = Date.now();

  salespersonEmail = `sales-${ts}@test.rw`;
  const spCreate = await managerAgent.post('/api/users').send({
    name: 'Salesperson One',
    email: salespersonEmail,
    password: staffPassword,
    role: 'salesperson',
    permissions: {
      can_create_orders: true,
      can_process_payments: false,
      can_release_stock: false,
      can_manage_stock: false,
      can_import_export_stock: false,
      can_partner_borrow: false,
      can_view_reports: false,
      can_view_buying_prices: false,
      can_give_discounts: false,
      can_manage_users: false,
      can_print_full_receipt: false,
      can_print_delivery_note: true,
      can_manage_customers: true,
      can_manage_partners: false,
      can_void_orders: false
    }
  });
  expect(spCreate.status).toBe(200);
  salespersonId = spCreate.body.user.id;

  accountantEmail = `acct-${ts}@test.rw`;
  const acctCreate = await managerAgent.post('/api/users').send({
    name: 'Accountant One',
    email: accountantEmail,
    password: staffPassword,
    role: 'accountant',
    permissions: {
      can_create_orders: false,
      can_process_payments: true,
      can_release_stock: false,
      can_manage_stock: false,
      can_import_export_stock: false,
      can_partner_borrow: false,
      can_view_reports: true,
      can_view_buying_prices: true,
      can_give_discounts: false,
      can_manage_users: false,
      can_print_full_receipt: true,
      can_print_delivery_note: true,
      can_manage_customers: true,
      can_manage_partners: false,
      can_void_orders: true
    }
  });
  expect(acctCreate.status).toBe(200);

  storekeeperEmail = `store-${ts}@test.rw`;
  const storeCreate = await managerAgent.post('/api/users').send({
    name: 'Storekeeper One',
    email: storekeeperEmail,
    password: staffPassword,
    role: 'storekeeper',
    permissions: {
      can_create_orders: false,
      can_process_payments: false,
      can_release_stock: true,
      can_manage_stock: true,
      can_import_export_stock: false,
      can_partner_borrow: false,
      can_view_reports: false,
      can_view_buying_prices: false,
      can_give_discounts: false,
      can_manage_users: false,
      can_print_full_receipt: false,
      can_print_delivery_note: true,
      can_manage_customers: false,
      can_manage_partners: false,
      can_void_orders: false
    }
  });
  expect(storeCreate.status).toBe(200);
});

describe('Backend & UI Permission Alignment + Multi-Staff & Solo Workflows', () => {
  it('masks buying prices and profits for staff without can_view_buying_prices', async () => {
    const spSession = await login(salespersonEmail, staffPassword);
    const prodRes = await (spSession.agent as any).get('/api/products');
    expect(prodRes.status).toBe(200);
    const found = prodRes.body.products.find((p: any) => p.id === productId);
    expect(found).toBeTruthy();
    expect(found.selling_price).toBe(8000);
    expect(found.buying_price).toBeNull();

    const statsRes = await (spSession.agent as any).get('/api/dashboard/stats');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.inventoryValue).toBe(0);
  });

  it('enforces multi-staff separation: salesperson -> cashier/accountant -> storekeeper -> void', async () => {
    const spSession = await login(salespersonEmail, staffPassword);
    const spAgent = spSession.agent as any;

    const acctSession = await login(accountantEmail, staffPassword);
    const acctAgent = acctSession.agent as any;

    const storeSession = await login(storekeeperEmail, staffPassword);
    const storeAgent = storeSession.agent as any;

    // 1. Salesperson cannot discount below catalog price (8000) without can_give_discounts
    const discountAttempt = await spAgent.post('/api/orders').send({
      customer_name: 'Discount Test',
      items: [{ product_id: productId, quantity: 2, selling_price: 6000 }],
      payment_method: 'cash',
      paid_amount: 12000
    });
    expect(discountAttempt.status).toBe(403);

    // 2. Salesperson creates order at catalog price (even if spoofing paid_amount: 16000, server forces paid_amount = 0)
    const createRes = await spAgent.post('/api/orders').send({
      customer_name: 'MultiStaff Client',
      customer_phone: '0788000111',
      items: [{ product_id: productId, quantity: 2, selling_price: 8000 }],
      payment_method: 'cash',
      paid_amount: 16000
    });
    expect(createRes.status).toBe(200);
    const order = createRes.body.order;
    expect(order.total_amount).toBe(16000);
    expect(order.paid_amount).toBe(0);
    expect(order.debt_amount).toBe(16000);
    expect(order.payment_status).toBe('pending');
    expect(order.fulfillment_status).toBe('pending_store');
    expect(order.items[0].buying_price).toBeNull();
    expect(order.items[0].profit).toBeNull();

    // Salesperson cannot confirm payment or release stock or void order
    const spPayAttempt = await spAgent.post(`/api/orders/${order.id}/payments`).send({ amount: 16000, payment_method: 'cash' });
    expect(spPayAttempt.status).toBe(403);

    const spReleaseAttempt = await spAgent.post(`/api/orders/${order.id}/release-items`).send({
      released_items: [{ order_item_id: order.items[0].id, product_id: productId, quantity_released: 2 }]
    });
    expect(spReleaseAttempt.status).toBe(403);

    const spVoidAttempt = await spAgent.post(`/api/orders/${order.id}/void`).send({ reason: 'test' });
    expect(spVoidAttempt.status).toBe(403);

    // 3. Accountant confirms payment (200), but cannot release stock (403)
    const acctReleaseAttempt = await acctAgent.post(`/api/orders/${order.id}/release-items`).send({
      released_items: [{ order_item_id: order.items[0].id, product_id: productId, quantity_released: 2 }]
    });
    expect(acctReleaseAttempt.status).toBe(403);

    const payRes = await acctAgent.post(`/api/orders/${order.id}/payments`).send({
      amount: 16000,
      payment_method: 'momo',
      reference_no: 'MOMO-123'
    });
    expect(payRes.status).toBe(200);

    const detailAfterPay = await acctAgent.get(`/api/orders/${order.id}`);
    expect(detailAfterPay.status).toBe(200);
    expect(detailAfterPay.body.order.payment_status).toBe('paid');
    expect(detailAfterPay.body.order.paid_amount).toBe(16000);
    expect(detailAfterPay.body.order.debt_amount).toBe(0);
    // Accountant has can_view_buying_prices=1 so cost & profit are visible
    expect(detailAfterPay.body.items[0].buying_price).toBe(5000);
    expect(detailAfterPay.body.items[0].profit).toBe(6000);

    // 4. Storekeeper cannot record payments (403), but can release stock (200)
    const storePayAttempt = await storeAgent.post(`/api/orders/${order.id}/payments`).send({ amount: 5000, payment_method: 'cash' });
    expect(storePayAttempt.status).toBe(403);

    const releaseRes = await storeAgent.post(`/api/orders/${order.id}/release-items`).send({
      released_items: [{ order_item_id: order.items[0].id, product_id: productId, quantity_released: 2 }],
      update_receipt: true,
      fulfillment_status: 'approved'
    });
    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.order.fulfillment_status).toBe('approved');
    expect(releaseRes.body.order.stock_released_by_name).toBe('Storekeeper One');

    // 5. Accountant voids the order -> stock is restored and order becomes cancelled
    const prodBeforeVoid = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [productId]);
    const voidRes = await acctAgent.post(`/api/orders/${order.id}/void`).send({ reason: 'Customer cancelled pickup' });
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.order.fulfillment_status).toBe('cancelled');

    const prodAfterVoid = await queryOne<{ quantity: number }>('SELECT quantity FROM products WHERE id = ?', [productId]);
    expect(Number(prodAfterVoid?.quantity)).toBe(Number(prodBeforeVoid?.quantity) + 2);
  });

  it('syncs live DB permission changes immediately without requiring re-login', async () => {
    const spSession = await login(salespersonEmail, staffPassword);
    const spAgent = spSession.agent as any;

    // Grant can_give_discounts via manager PUT /api/users/:id while salesperson session is active
    const updateRes = await managerAgent.put(`/api/users/${salespersonId}`).send({
      permissions: {
        can_create_orders: true,
        can_give_discounts: true
      }
    });
    expect(updateRes.status).toBe(200);

    const meRes = await spAgent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(Number(meRes.body.user.can_give_discounts)).toBe(1);

    // Immediately allowed to create discounted order without logging out
    const discountedRes = await spAgent.post('/api/orders').send({
      customer_name: 'Live Sync Discount Client',
      items: [{ product_id: productId, quantity: 1, selling_price: 7000 }],
      payment_method: 'cash',
      paid_amount: 0
    });
    expect(discountedRes.status).toBe(200);
    expect(discountedRes.body.order.total_amount).toBe(7000);
  });

  it('supports solo operator single-step checkout with immediate stock release', async () => {
    const soloRes = await managerAgent.post('/api/orders').send({
      customer_name: 'Solo Walk-in Client',
      items: [{ product_id: productId, quantity: 1, selling_price: 8000 }],
      payment_method: 'cash',
      paid_amount: 8000,
      release_immediately: true
    });
    expect(soloRes.status).toBe(200);
    expect(soloRes.body.order.payment_status).toBe('paid');
    expect(soloRes.body.order.fulfillment_status).toBe('approved');
    expect(soloRes.body.order.stock_released_by).toBeTruthy();
  });

  it('creates a blank custom staff account with zero permissions and enforces pause/reactivate access', async () => {
    const ts = Date.now();
    const blankEmail = `blank-${ts}@test.rw`;
    const allFalsePermissions = {
      can_create_orders: false,
      can_process_payments: false,
      can_release_stock: false,
      can_manage_stock: false,
      can_import_export_stock: false,
      can_partner_borrow: false,
      can_view_reports: false,
      can_view_buying_prices: false,
      can_give_discounts: false,
      can_manage_users: false,
      can_print_full_receipt: false,
      can_print_delivery_note: false,
      can_manage_customers: false,
      can_manage_partners: false,
      can_void_orders: false,
      can_edit_company_settings: false,
      can_view_audit_trail: false,
      can_reset_passwords: false
    };

    const createBlank = await managerAgent.post('/api/users').send({
      name: 'Blank Custom Staff',
      email: blankEmail,
      password: staffPassword,
      role: 'employee',
      job_title: 'Custom Staff',
      permissions: allFalsePermissions,
      ...allFalsePermissions
    });
    expect(createBlank.status).toBe(200);
    const blankId = createBlank.body.user.id;

    // Verify none of the defaulted permissions stayed 1
    const blankSession = await login(blankEmail, staffPassword);
    const blankAgent = blankSession.agent as any;
    const meRes = await blankAgent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(Number(meRes.body.user.can_create_orders)).toBe(0);
    expect(Number(meRes.body.user.can_print_full_receipt)).toBe(0);
    expect(Number(meRes.body.user.can_print_delivery_note)).toBe(0);
    expect(Number(meRes.body.user.can_manage_customers)).toBe(0);

    // Denied from creating orders or managing customers
    const orderAttempt = await blankAgent.post('/api/orders').send({
      customer_name: 'No Perm Test',
      items: [{ product_id: productId, quantity: 1, selling_price: 8000 }],
      payment_method: 'cash',
      paid_amount: 0
    });
    expect(orderAttempt.status).toBe(403);

    const custAttempt = await blankAgent.post('/api/customers').send({ name: 'Should Fail' });
    expect(custAttempt.status).toBe(403);

    // Log in while active first
    const spSession = await login(salespersonEmail, staffPassword);
    const spAgent = spSession.agent as any;

    // Pause access (is_active: 0) on salesperson while preserving permissions
    const pauseRes = await managerAgent.put(`/api/users/${salespersonId}`).send({ is_active: 0 });
    expect(pauseRes.status).toBe(200);

    const pausedStatsAttempt = await spAgent.get('/api/dashboard/stats');
    expect(pausedStatsAttempt.status).toBe(403);

    // Reactivate access (is_active: 1) -> restores saved duties immediately
    const activateRes = await managerAgent.put(`/api/users/${salespersonId}`).send({ is_active: 1 });
    expect(activateRes.status).toBe(200);

    const restoredStatsAttempt = await spAgent.get('/api/dashboard/stats');
    expect(restoredStatsAttempt.status).toBe(200);
  });
});

