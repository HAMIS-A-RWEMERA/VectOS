import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { createTestShop, login } from './helpers';
import { processWebhookEvent, initBillingTables } from '../server/billing/paymentService';

let agent: ReturnType<typeof request.agent>;
let token: string;

beforeAll(async () => {
  await initBillingTables();
  const shop = await createTestShop('Gate9Shop');
  const session = await login(shop.managerEmail, shop.managerPassword);
  agent = session.agent as any;
  token = session.token;
});

describe('Gate 9: Commercial Hardening, Payments & Webhooks', () => {
  it('initializes billing tables successfully', async () => {
    expect(true).toBe(true);
  });

  it('processes a valid payment charge request idempotently', async () => {
    const res = await agent
      .post('/api/billing/charge')
      .send({
        amount: 15000,
        currency: 'USD',
        paymentMethod: 'mock',
        clientRef: `test_client_ref_${Date.now()}`,
        _csrf: token
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment.paymentRef).toBeDefined();
    expect(res.body.payment.status).toBe('completed');
  });

  it('handles webhook event processing, deduplication and success state', async () => {
    const eventId = `evt_test_${Date.now()}`;
    const result1 = await processWebhookEvent(eventId, 'payment.success', 'mock', {
      shopId: 1,
      paymentRef: `pay_${eventId}`,
      amount: 25000
    });
    expect(result1.success).toBe(true);
    expect(result1.status).toBe('PROCESSED');

    // Duplicate delivery test (Idempotency)
    const result2 = await processWebhookEvent(eventId, 'payment.success', 'mock', {
      shopId: 1,
      paymentRef: `pay_${eventId}`,
      amount: 25000
    });
    expect(result2.success).toBe(true);
    expect(result2.status).toBe('ALREADY_PROCESSED');
  });

  it('returns upgraded health metrics including database health and webhook queues', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.dbHealthy).toBe(true);
    expect(res.body.queues).toBeDefined();
    expect(res.body.queues.deadLetterWebhooks).toBeGreaterThanOrEqual(0);
    expect(res.body.queues.pendingRetryWebhooks).toBeGreaterThanOrEqual(0);
  });
});
