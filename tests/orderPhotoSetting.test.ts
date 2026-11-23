import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { dbReady } from '../server';
import { createTestShop, login } from './helpers';
import { execute } from '../server/database/db';

let shopId = 0;
let otherShopId = 0;
let productId = 0;
let managerAgent: ReturnType<typeof request.agent>;
let sellerAgent: ReturnType<typeof request.agent>;

let chainShopId = 0;
let chainProductId = 0;
let chainManagerAgent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  await dbReady;

  const std = await createTestShop('PhotoOptStd');
  shopId = std.shopId;
  const mgr = await login(std.managerEmail, std.managerPassword);
  managerAgent = mgr.agent as any;

  const other = await createTestShop('OtherPhotoTenant');
  otherShopId = other.shopId;

  const prodRes = await managerAgent.post('/api/products').send({
    name: 'Iron Rod 10mm',
    sku: `ROD-${Date.now()}`,
    category: 'Steel',
    unit: 'pcs',
    buying_price: 5000,
    selling_price: 7000,
    quantity: 50,
  });
  expect(prodRes.status).toBe(200);
  productId = prodRes.body.product.id;

  // Seller without can_edit_company_settings
  const sellerEmail = `seller-photo-${Date.now()}@test.rw`;
  const sPass = 'SellerPass2025!';
  const uRes = await managerAgent.post('/api/users').send({
    name: 'Standard Seller',
    email: sellerEmail,
    password: sPass,
    role: 'salesperson',
    permissions: { can_create_orders: true, can_edit_company_settings: false },
  });
  expect(uRes.status).toBe(200);
  const sSess = await login(sellerEmail, sPass);
  sellerAgent = sSess.agent as any;

  // Strict-chain shop to verify toggle also works for strict_chain mode
  const chain = await createTestShop('PhotoChainCo');
  chainShopId = chain.shopId;
  await execute(
    `UPDATE shops SET workflow_mode = 'strict_chain', pricing_mode = 'stock_only' WHERE id = ?`,
    [chainShopId]
  );
  const cMgr = await login(chain.managerEmail, chain.managerPassword);
  chainManagerAgent = cMgr.agent as any;
  const cpRes = await chainManagerAgent.post('/api/products').send({
    name: 'Pipe 2-inch',
    sku: `PIPE-${Date.now()}`,
    category: 'Plumbing',
    unit: 'pcs',
    buying_price: 3000,
    selling_price: 4500,
    quantity: 20,
  });
  expect(cpRes.status).toBe(200);
  chainProductId = cpRes.body.product.id;
});

describe('Shop-Wide Order Photo Attachment & Manager Mandatory Toggle', () => {
  it('exposes general R2 status to standard shops without exposing /api/chain routes', async () => {
    const r2Res = await managerAgent.get('/api/storage/r2-status');
    expect(r2Res.status).toBe(200);
    expect(typeof r2Res.body.configured).toBe('boolean');

    const chainRes = await managerAgent.get('/api/chain/r2-status');
    expect(chainRes.status).toBe(403);
  });

  it('defaults require_order_photo to optional (0) and allows orders with or without a valid photo key', async () => {
    const meRes = await managerAgent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(Number(meRes.body.shop.require_order_photo || 0)).toBe(0);

    // Order without photo succeeds
    const noPhotoOrder = await sellerAgent.post('/api/orders').send({
      items: [{ product_id: productId, quantity: 1 }],
      payment_method: 'cash',
      paid_amount: 0,
    });
    expect(noPhotoOrder.status).toBe(200);
    expect(noPhotoOrder.body.order.handwritten_photo_key).toBeNull();

    // Order with valid tenant-scoped photo key succeeds and persists key
    const validKey = `shops/${shopId}/orders/slip-${Date.now()}.webp`;
    const withPhotoOrder = await sellerAgent.post('/api/orders').send({
      items: [{ product_id: productId, quantity: 1 }],
      payment_method: 'cash',
      paid_amount: 0,
      handwritten_photo_key: validKey,
    });
    expect(withPhotoOrder.status).toBe(200);
    expect(withPhotoOrder.body.order.handwritten_photo_key).toBe(validKey);
  });

  it('rejects cross-tenant photo keys on order creation', async () => {
    const foreignKey = `shops/${otherShopId}/orders/stolen-slip.webp`;
    const res = await sellerAgent.post('/api/orders').send({
      items: [{ product_id: productId, quantity: 1 }],
      payment_method: 'cash',
      paid_amount: 0,
      handwritten_photo_key: foreignKey,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid order photo key');
  });

  it('blocks non-permitted staff from modifying store settings and lets manager enforce mandatory order photo', async () => {
    const forbiddenRes = await sellerAgent.put(`/api/shops/${shopId}`).send({
      require_order_photo: 1,
    });
    expect(forbiddenRes.status).toBe(403);

    const meBefore = await managerAgent.get('/api/auth/me');
    const shop = meBefore.body.shop;

    const enableRes = await managerAgent.put(`/api/shops/${shopId}`).send({
      name: shop.name,
      owner_name: shop.owner_name,
      phone: shop.phone,
      email: shop.email,
      location: shop.location,
      require_order_photo: 1,
    });
    expect(enableRes.status).toBe(200);
    expect(Number(enableRes.body.shop.require_order_photo)).toBe(1);

    // Seller submitting without photo is now rejected
    const blockedRes = await sellerAgent.post('/api/orders').send({
      items: [{ product_id: productId, quantity: 1 }],
      payment_method: 'cash',
      paid_amount: 0,
    });
    expect(blockedRes.status).toBe(400);
    expect(blockedRes.body.error).toContain('Order photo is required');

    // Seller submitting with valid tenant-scoped photo succeeds
    const validKey = `shops/${shopId}/orders/mandatory-${Date.now()}.webp`;
    const okRes = await sellerAgent.post('/api/orders').send({
      items: [{ product_id: productId, quantity: 1 }],
      payment_method: 'cash',
      paid_amount: 0,
      handwritten_photo_key: validKey,
    });
    expect(okRes.status).toBe(200);
    expect(okRes.body.order.handwritten_photo_key).toBe(validKey);

    // Turning mandatory back OFF restores optional behavior
    const disableRes = await managerAgent.put(`/api/shops/${shopId}`).send({
      require_order_photo: 0,
    });
    expect(disableRes.status).toBe(200);
    expect(Number(disableRes.body.shop.require_order_photo)).toBe(0);

    const optionalAgainRes = await sellerAgent.post('/api/orders').send({
      items: [{ product_id: productId, quantity: 1 }],
      payment_method: 'cash',
      paid_amount: 0,
    });
    expect(optionalAgainRes.status).toBe(200);
  });

  it('enforces require_order_photo on strict_chain shops as well when enabled by manager', async () => {
    const enableChainRes = await chainManagerAgent.put(`/api/shops/${chainShopId}`).send({
      require_order_photo: true,
    });
    expect(enableChainRes.status).toBe(200);
    expect(Number(enableChainRes.body.shop.require_order_photo)).toBe(1);

    const missingPhoto = await chainManagerAgent.post('/api/chain/orders').send({
      items: [{ product_id: chainProductId, quantity: 1 }],
    });
    expect(missingPhoto.status).toBe(400);
    expect(missingPhoto.body.error).toContain('Order photo is required');

    const withPhoto = await chainManagerAgent.post('/api/chain/orders').send({
      items: [{ product_id: chainProductId, quantity: 1 }],
      handwritten_photo_key: `shops/${chainShopId}/orders/chain-${Date.now()}.webp`,
    });
    expect(withPhoto.status).toBe(200);
  });

  it('defaults can_upload_photos appropriately and enforces manager control on uploads & attachments', async () => {
    // Salesperson created above defaulted to can_upload_photos = 1
    const spMe = await sellerAgent.get('/api/auth/me');
    expect(Number(spMe.body.user.can_upload_photos)).toBe(1);

    // Create a storekeeper (no order creation / no payment taking) without specifying can_upload_photos -> defaults to 0
    const skEmail = `sk-nophoto-${Date.now()}@test.rw`;
    const pass = 'StaffPass2025!';
    const skRes = await managerAgent.post('/api/users').send({
      name: 'Quiet Storekeeper',
      email: skEmail,
      password: pass,
      role: 'storekeeper',
      permissions: { can_release_stock: true, can_create_orders: false, can_process_payments: false },
    });
    expect(skRes.status).toBe(200);
    const skSess = await login(skEmail, pass);
    const skMe = await skSess.agent.get('/api/auth/me');
    expect(Number(skMe.body.user.can_upload_photos)).toBe(0);

    // Create a cashier -> defaults to can_upload_photos = 1
    const cashEmail = `cashier-proof-${Date.now()}@test.rw`;
    const cashRes = await managerAgent.post('/api/users').send({
      name: 'Proof Cashier',
      email: cashEmail,
      password: pass,
      role: 'accountant',
      permissions: { can_process_payments: true, can_create_orders: false },
    });
    expect(cashRes.status).toBe(200);
    const cashierId = cashRes.body.user.id;
    const cashSess = await login(cashEmail, pass);
    const cashAgent = cashSess.agent as any;
    const cashMe = await cashAgent.get('/api/auth/me');
    expect(Number(cashMe.body.user.can_upload_photos)).toBe(1);

    // Manager revokes can_upload_photos from cashier
    const revokeRes = await managerAgent.put(`/api/users/${cashierId}`).send({
      can_upload_photos: false,
    });
    expect(revokeRes.status).toBe(200);

    // Cashier is now blocked from requesting upload URLs or attaching payment proof photos (403)
    const uploadBlocked = await cashAgent.post('/api/orders/upload-photo-url').send({
      contentType: 'image/webp',
      purpose: 'payment',
    });
    expect(uploadBlocked.status).toBe(403);

    // Create an unpaid order via seller so cashier can record payment without photo (still works!)
    const unpaidOrderRes = await sellerAgent.post('/api/orders').send({
      customer_name: 'Proof Test Client',
      items: [{ product_id: productId, quantity: 2 }],
      payment_method: 'cash',
      paid_amount: 0,
    });
    expect(unpaidOrderRes.status).toBe(200);
    const unpaidOrderId = unpaidOrderRes.body.order.id;

    // Cashier blocked if trying to attach a proof key while revoked
    const proofKey = `shops/${shopId}/payments/momo-${Date.now()}.webp`;
    const blockedPayProof = await cashAgent.post(`/api/orders/${unpaidOrderId}/payments`).send({
      amount: 3000,
      payment_method: 'momo',
      reference_no: 'TXN-BLOCKED',
      proof_photo_key: proofKey,
    });
    expect(blockedPayProof.status).toBe(403);

    // Cashier recording payment WITHOUT photo still works seamlessly
    const plainPay = await cashAgent.post(`/api/orders/${unpaidOrderId}/payments`).send({
      amount: 3000,
      payment_method: 'momo',
      reference_no: 'TXN-NO-PHOTO',
    });
    expect(plainPay.status).toBe(200);

    // Manager grants can_upload_photos back to cashier -> attaching proof photo now works immediately
    const grantRes = await managerAgent.put(`/api/users/${cashierId}`).send({
      can_upload_photos: true,
    });
    expect(grantRes.status).toBe(200);

    const allowedPayProof = await cashAgent.post(`/api/orders/${unpaidOrderId}/payments`).send({
      amount: 4000,
      payment_method: 'momo',
      reference_no: 'TXN-WITH-PROOF',
      proof_photo_key: proofKey,
    });
    expect(allowedPayProof.status).toBe(200);

    // Order detail returns the stored proof_photo_key on the payment row
    const detailRes = await cashAgent.get(`/api/orders/${unpaidOrderId}`);
    expect(detailRes.status).toBe(200);
    const proofPayment = (detailRes.body.payments || []).find((p: any) => p.reference_no === 'TXN-WITH-PROOF');
    expect(proofPayment).toBeTruthy();
    expect(proofPayment.proof_photo_key).toBe(proofKey);

    // Cross-tenant payment proof key rejected (400)
    const foreignProofKey = `shops/${otherShopId}/payments/stolen.webp`;
    const crossKeyPay = await cashAgent.post(`/api/orders/${unpaidOrderId}/payments`).send({
      amount: 1000,
      payment_method: 'cash',
      proof_photo_key: foreignProofKey,
    });
    expect(crossKeyPay.status).toBe(400);

    // POS checkout order with optional payment_proof_photo_key saves it onto initial payment row
    const checkoutProofKey = `shops/${shopId}/payments/pos-${Date.now()}.webp`;
    const posOrderWithProof = await managerAgent.post('/api/orders').send({
      customer_name: 'Proof Test Client',
      items: [{ product_id: productId, quantity: 1 }],
      payment_method: 'momo',
      paid_amount: 7000,
      payment_reference: 'MOMO-POS-1',
      payment_proof_photo_key: checkoutProofKey,
    });
    expect(posOrderWithProof.status).toBe(200);
    const posDetail = await managerAgent.get(`/api/orders/${posOrderWithProof.body.order.id}`);
    expect(posDetail.status).toBe(200);
    expect(posDetail.body.payments[0].proof_photo_key).toBe(checkoutProofKey);

    // Bulk debt settlement accepts optional proof_photo_key and stores it cleanly
    const custRes = await managerAgent.get('/api/customers?q=Proof+Test+Client');
    const customerId = custRes.body.customers[0].id;
    const bulkProofKey = `shops/${shopId}/payments/bulk-${Date.now()}.webp`;
    const settleRes = await cashAgent.post(`/api/customers/${customerId}/settle-debt`).send({
      amount: 2000,
      payment_method: 'bank_transfer',
      reference_no: 'BK-992',
      proof_photo_key: bulkProofKey,
    });
    expect(settleRes.status).toBe(200);

    const stmtRes = await cashAgent.get(`/api/customers/${customerId}/statement?period=all`);
    expect(stmtRes.status).toBe(200);
    const ledgerEntry = (stmtRes.body.creditLedger || []).find((l: any) => l.reference_no === 'BK-992');
    expect(ledgerEntry).toBeTruthy();
    expect(ledgerEntry.proof_photo_key).toBe(bulkProofKey);

    // Tenant isolation on GET /api/payments/:id/photo-url
    const otherSess = await createTestShop('UnauthorizedProofTenant');
    const otherLogin = await login(otherSess.managerEmail, otherSess.managerPassword);
    const foreignPhotoReq = await otherLogin.agent.get(`/api/payments/${proofPayment.id}/photo-url`);
    expect(foreignPhotoReq.status).toBe(404);
  });
});
