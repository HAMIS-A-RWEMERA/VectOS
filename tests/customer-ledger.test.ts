import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { dbReady } from '../server';
import { createTestShop, login } from './helpers';

let managerAgent: ReturnType<typeof request.agent>;
let otherShopAgent: ReturnType<typeof request.agent>;
let salespersonAgent: ReturnType<typeof request.agent>;
let productId = 0;

beforeAll(async () => {
  await dbReady;

  const shopA = await createTestShop('LedgerShopA');
  const sessionA = await login(shopA.managerEmail, shopA.managerPassword);
  managerAgent = sessionA.agent as any;

  const shopB = await createTestShop('LedgerShopB');
  const sessionB = await login(shopB.managerEmail, shopB.managerPassword);
  otherShopAgent = sessionB.agent as any;

  // Create product in Shop A (10,000 RWF each, 500 stock)
  const prodRes = await managerAgent.post('/api/products').send({
    name: 'Ledger Steel Bar',
    sku: 'LSB-' + Date.now(),
    category: 'Steel & Metals',
    unit: 'pcs',
    buying_price: 8000,
    selling_price: 10000,
    quantity: 500,
    low_stock_threshold: 10,
  });
  expect(prodRes.status).toBe(200);
  productId = prodRes.body.product.id;

  // Create restricted salesperson without can_process_payments
  const spEmail = `ledger-sales-${Date.now()}@test.rw`;
  const spPassword = 'StaffPassword123!';
  const spCreate = await managerAgent.post('/api/users').send({
    name: 'Sales Only Staff',
    email: spEmail,
    password: spPassword,
    role: 'salesperson',
    permissions: {
      can_create_orders: true,
      can_process_payments: false,
      can_manage_customers: true,
      can_view_reports: false,
      can_view_buying_prices: false,
    },
  });
  expect(spCreate.status).toBe(200);
  const spSession = await login(spEmail, spPassword);
  salespersonAgent = spSession.agent as any;
});

describe('Customer Statements, Bulk Debt Settlement, Store Credit & Top Buyers', () => {
  it('settles multiple unpaid receipts FIFO via bulk payment and leaves exact remaining debt balance', async () => {
    // 1. Create customer
    const custRes = await managerAgent.post('/api/customers').send({
      name: 'Kigali Repeat Contractor',
      phone: '0788100200',
      address: 'Gasabo, Kigali',
    });
    expect(custRes.status).toBe(200);
    const customerId = custRes.body.customer.id;

    // 2. Create 3 orders totaling 200,000 debt (60k + 80k + 60k)
    const o1 = await managerAgent.post('/api/orders').send({
      customer_id: customerId,
      items: [{ product_id: productId, quantity: 6, selling_price: 10000 }],
      payment_method: 'debt_credit',
      paid_amount: 0,
    });
    const o2 = await managerAgent.post('/api/orders').send({
      customer_id: customerId,
      items: [{ product_id: productId, quantity: 8, selling_price: 10000 }],
      payment_method: 'debt_credit',
      paid_amount: 0,
    });
    const o3 = await managerAgent.post('/api/orders').send({
      customer_id: customerId,
      items: [{ product_id: productId, quantity: 6, selling_price: 10000 }],
      payment_method: 'debt_credit',
      paid_amount: 0,
    });

    expect(o1.status).toBe(200);
    expect(o2.status).toBe(200);
    expect(o3.status).toBe(200);

    // 3. Bulk settle 170,000 RWF -> should fully clear o1 (60k), o2 (80k), and pay 30k on o3 leaving 30k debt
    const settleRes = await managerAgent.post(`/api/customers/${customerId}/settle-debt`).send({
      amount: 170000,
      payment_method: 'momo',
      reference_no: 'MOMO-170K',
      notes: 'Weekly partial settlement',
    });

    expect(settleRes.status).toBe(200);
    expect(settleRes.body.success).toBe(true);
    expect(settleRes.body.appliedToDebt).toBe(170000);
    expect(settleRes.body.remainingDebt).toBe(30000);
    expect(Number(settleRes.body.customer.credit_balance)).toBe(30000);
    expect(settleRes.body.settledOrders).toHaveLength(3);
    expect(settleRes.body.settledOrders[0].new_payment_status).toBe('paid');
    expect(settleRes.body.settledOrders[1].new_payment_status).toBe('paid');
    expect(settleRes.body.settledOrders[2].new_payment_status).toBe('partial');
    expect(settleRes.body.settledOrders[2].remaining_debt).toBe(30000);

    // 4. Verify statement includes orders, itemized lines (without buying price), payments, and bulk ledger
    const stmtRes = await managerAgent.get(`/api/customers/${customerId}/statement?period=week`);
    expect(stmtRes.status).toBe(200);
    expect(stmtRes.body.summary.ordersCount).toBe(3);
    expect(stmtRes.body.summary.totalOrdered).toBe(200000);
    expect(stmtRes.body.summary.currentDebtBalance).toBe(30000);
    expect(stmtRes.body.orders[0].statement_items.length).toBeGreaterThan(0);
    expect(stmtRes.body.orders[0].statement_items[0].buying_price).toBeUndefined();
    expect(stmtRes.body.payments.length).toBe(3);
    expect(stmtRes.body.creditLedger.some((l: any) => l.entry_type === 'bulk_payment')).toBe(true);
  });

  it('tracks money owed to client (store_credit) and deducts it from their next POS order', async () => {
    // 1. Create customer
    const custRes = await managerAgent.post('/api/customers').send({
      name: 'Advance Deposit Client',
      phone: '0788300400',
    });
    expect(custRes.status).toBe(200);
    const customerId = custRes.body.customer.id;

    // 2. Record 50,000 store credit owed to client
    const addCreditRes = await managerAgent.post(`/api/customers/${customerId}/store-credit`).send({
      action: 'add',
      amount: 50000,
      payment_method: 'cash',
      notes: 'Advance deposit for next order',
    });
    expect(addCreditRes.status).toBe(200);
    expect(Number(addCreditRes.body.customer.store_credit)).toBe(50000);

    // 3. Place new 120,000 POS order applying store credit -> customer pays only missing 70,000
    const orderRes = await managerAgent.post('/api/orders').send({
      customer_id: customerId,
      items: [{ product_id: productId, quantity: 12, selling_price: 10000 }],
      payment_method: 'cash',
      paid_amount: 70000,
      use_store_credit: true,
    });

    expect(orderRes.status).toBe(200);
    expect(orderRes.body.store_credit_applied).toBe(50000);
    expect(orderRes.body.order.total_amount).toBe(120000);
    expect(orderRes.body.order.paid_amount).toBe(120000);
    expect(orderRes.body.order.debt_amount).toBe(0);
    expect(orderRes.body.order.payment_status).toBe('paid');

    // 4. Verify store_credit dropped to 0 and statement shows credit_used
    const stmtRes = await managerAgent.get(`/api/customers/${customerId}/statement?period=today`);
    expect(stmtRes.status).toBe(200);
    expect(stmtRes.body.summary.currentStoreCredit).toBe(0);
    expect(stmtRes.body.summary.creditAddedInPeriod).toBe(50000);
    expect(stmtRes.body.summary.creditUsedInPeriod).toBe(50000);
  });

  it('ranks top revenue and most frequent buyers correctly', async () => {
    const cBig = await managerAgent.post('/api/customers').send({ name: 'Big Revenue Co', phone: '0788555111' });
    const cFreq = await managerAgent.post('/api/customers').send({ name: 'Frequent Buyer Co', phone: '0788555222' });

    // Big Revenue Co: 1 huge order (300,000)
    await managerAgent.post('/api/orders').send({
      customer_id: cBig.body.customer.id,
      items: [{ product_id: productId, quantity: 30, selling_price: 10000 }],
      payment_method: 'cash',
      paid_amount: 300000,
    });

    // Frequent Buyer Co: 4 small orders (40,000 total)
    for (let i = 0; i < 4; i++) {
      await managerAgent.post('/api/orders').send({
        customer_id: cFreq.body.customer.id,
        items: [{ product_id: productId, quantity: 1, selling_price: 10000 }],
        payment_method: 'cash',
        paid_amount: 10000,
      });
    }

    const topSpentRes = await managerAgent.get('/api/customers?sort=top_spent');
    expect(topSpentRes.status).toBe(200);
    expect(topSpentRes.body.customers[0].name).toBe('Big Revenue Co');

    const mostFreqRes = await managerAgent.get('/api/customers?sort=most_orders');
    expect(mostFreqRes.status).toBe(200);
    expect(mostFreqRes.body.customers[0].name).toBe('Frequent Buyer Co');
    expect(Number(mostFreqRes.body.customers[0].order_count)).toBe(4);
  });

  it('enforces can_process_payments and multi-tenant shop_id isolation on customer ledger actions', async () => {
    const custRes = await managerAgent.post('/api/customers').send({
      name: 'Protected Ledger Client',
      phone: '0788777888',
    });
    const customerId = custRes.body.customer.id;

    // Restricted salesperson without can_process_payments cannot settle bulk debt or adjust store credit
    const spBulk = await salespersonAgent.post(`/api/customers/${customerId}/settle-debt`).send({
      amount: 10000,
      payment_method: 'cash',
    });
    expect(spBulk.status).toBe(403);

    const spCredit = await salespersonAgent.post(`/api/customers/${customerId}/store-credit`).send({
      action: 'add',
      amount: 10000,
    });
    expect(spCredit.status).toBe(403);

    // Other tenant shop B cannot view or settle Shop A's customer
    const crossStmt = await otherShopAgent.get(`/api/customers/${customerId}/statement`);
    expect(crossStmt.status).toBe(404);

    const crossSettle = await otherShopAgent.post(`/api/customers/${customerId}/settle-debt`).send({
      amount: 10000,
      payment_method: 'cash',
    });
    expect(crossSettle.status).toBe(404);
  });

  it('excludes cancelled/voided paid orders from dashboard paymentBreakdown, reports, and customer statement totals while preserving them for red RWF 0 display', async () => {
    // Use an isolated shop so all KPIs start at 0
    const shopC = await createTestShop('VoidAuditShop');
    const { agent: shopCAgent } = await login(shopC.managerEmail, shopC.managerPassword);

    // 1. Add product with stock = 20, selling price = 10,000
    const pRes = await shopCAgent.post('/api/products').send({
      name: 'Void Test Cement',
      sku: 'VTC-' + Date.now(),
      category: 'Cement',
      unit: 'bags',
      buying_price: 8000,
      selling_price: 10000,
      quantity: 20,
      low_stock_threshold: 5,
    });
    expect(pRes.status).toBe(200);
    const pId = pRes.body.product.id;

    // 2. Create customer with 10,000 store credit
    const cRes = await shopCAgent.post('/api/customers').send({
      name: 'Cancelled Audit Client',
      phone: '0788999000',
    });
    expect(cRes.status).toBe(200);
    const cId = cRes.body.customer.id;

    await shopCAgent.post(`/api/customers/${cId}/store-credit`).send({
      action: 'add',
      amount: 10000,
      payment_method: 'cash',
      notes: 'Deposit before cancelled order',
    });

    // 3. Employee creates an order for 5 bags (50,000) marked PAID (10,000 store credit + 40,000 cash)
    const orderRes = await shopCAgent.post('/api/orders').send({
      customer_id: cId,
      items: [{ product_id: pId, quantity: 5, selling_price: 10000 }],
      payment_method: 'cash',
      paid_amount: 40000,
      use_store_credit: true,
    });
    expect(orderRes.status).toBe(200);
    const orderId = orderRes.body.order.id;
    expect(orderRes.body.order.payment_status).toBe('paid');

    // Confirm stock reduced to 15
    const midProd = await shopCAgent.get('/api/products');
    expect(midProd.body.products.find((p: any) => p.id === pId).quantity).toBe(15);

    // 4. Manager cancels/voids the order
    const voidRes = await shopCAgent.post(`/api/orders/${orderId}/void`).send({
      reason: 'Employee mistakenly marked order paid',
    });
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.order.fulfillment_status).toBe('cancelled');

    // Stock returned back to 20
    const afterProd = await shopCAgent.get('/api/products');
    expect(afterProd.body.products.find((p: any) => p.id === pId).quantity).toBe(20);

    // Cannot record any new payment against a cancelled order
    const payAttempt = await shopCAgent.post(`/api/orders/${orderId}/payments`).send({
      amount: 5000,
      payment_method: 'cash',
    });
    expect(payAttempt.status).toBe(400);

    // Dashboard stats & paymentBreakdown must all be 0
    const statsRes = await shopCAgent.get('/api/dashboard/stats');
    expect(statsRes.status).toBe(200);
    expect(Number(statsRes.body.todaySales)).toBe(0);
    expect(Number(statsRes.body.totalSales)).toBe(0);
    expect(Number(statsRes.body.totalPaid)).toBe(0);
    expect(statsRes.body.paymentBreakdown).toHaveLength(0);

    // Reports summary must exclude cancelled order
    const repRes = await shopCAgent.get('/api/reports/summary?period=today');
    expect(repRes.status).toBe(200);
    expect(Number(repRes.body.financialOverview.total_revenue)).toBe(0);
    expect(Number(repRes.body.financialOverview.total_paid)).toBe(0);
    expect(repRes.body.categorySales).toHaveLength(0);

    // Customer statement totals must all be 0, store_credit restored to 10,000,
    // AND cancelled order & payment are returned flagged as cancelled for red (Cancelled: RWF ...) display
    const stmtRes = await shopCAgent.get(`/api/customers/${cId}/statement?period=today`);
    expect(stmtRes.status).toBe(200);
    expect(stmtRes.body.summary.ordersCount).toBe(0);
    expect(stmtRes.body.summary.totalOrdered).toBe(0);
    expect(stmtRes.body.summary.totalPaidOnOrders).toBe(0);
    expect(stmtRes.body.summary.paymentsReceivedInPeriod).toBe(0);
    expect(stmtRes.body.summary.lifetimeOrders).toBe(0);
    expect(stmtRes.body.summary.lifetimeSpent).toBe(0);
    expect(stmtRes.body.summary.lifetimePaid).toBe(0);
    expect(stmtRes.body.summary.currentStoreCredit).toBe(10000);
    expect(stmtRes.body.orders.some((o: any) => o.id === orderId && o.fulfillment_status === 'cancelled')).toBe(true);
    expect(stmtRes.body.payments.some((p: any) => p.order_id === orderId && p.order_status === 'cancelled')).toBe(true);
  });
});

