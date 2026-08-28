import { Router, Request, Response } from 'express';
import { getPaymentProvider, processWebhookEvent, manualRetryWebhook, initBillingTables } from '../billing/paymentService';
import { requireAuth, requireSuperAdmin } from '../auth';
import { queryAll, queryOne, execute } from '../database/db';

const router = Router();

// Initialize billing tables on load and ensure completion
let billingTablesInitialized = false;
async function ensureBillingTables() {
  if (!billingTablesInitialized) {
    await initBillingTables();
    billingTablesInitialized = true;
  }
}

// Create payment intent
router.post('/billing/charge', requireAuth, async (req: Request, res: Response) => {
  const { amount, currency, paymentMethod, clientRef, subscriptionId } = req.body;
  const shopId = req.session?.user?.shop_id || 1;

  if (!amount || !clientRef) {
    return res.status(400).json({ error: 'amount and clientRef are required' });
  }

  try {
    await ensureBillingTables();
    const provider = getPaymentProvider();
    const result = await provider.createPayment({
      shopId,
      amount: Number(amount),
      currency: currency || 'USD',
      paymentMethod: paymentMethod || 'mock',
      clientRef,
      subscriptionId: subscriptionId ? Number(subscriptionId) : undefined
    });

    // Record in ledger
    const existing = await queryOne('SELECT id FROM payments_ledger WHERE payment_ref = ?', [result.paymentRef]);
    if (!existing) {
      await execute(
        `INSERT INTO payments_ledger (shop_id, payment_ref, client_ref, amount, currency, status, provider, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [shopId, result.paymentRef, clientRef, Number(amount), currency || 'USD', result.status, result.provider, JSON.stringify(result.rawResponse || {})]
      );
    }

    res.json({ success: true, payment: result });
  } catch (err: any) {
    console.error('Charge error:', err);
    res.status(500).json({ error: 'Failed to process payment charge: ' + err.message });
  }
});

// Webhook receiver endpoint with signature verification & durable queue
router.post('/webhooks/:provider', async (req: Request, res: Response) => {
  const providerName = req.params.provider;
  const rawBody = JSON.stringify(req.body || {});
  const headers = req.headers as Record<string, string | undefined>;

  try {
    await ensureBillingTables();
    const provider = getPaymentProvider(providerName);
    const verification = provider.verifyWebhook(headers, rawBody);

    if (!verification.valid && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = verification.event || req.body;
    const eventId = event.id || event.eventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const eventType = event.type || event.eventType || 'payment.success';

    // Process via durable webhook service
    const result = await processWebhookEvent(eventId, eventType, providerName, event);

    res.json({ received: true, ...result });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook handler error: ' + err.message });
  }
});

// Admin endpoint to view webhook events & DLQ
router.get('/admin/webhooks', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureBillingTables();
    const events = await queryAll('SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 50');
    const dlqCount = await queryOne('SELECT COUNT(*) as count FROM webhook_events WHERE status = ?', ['DEAD_LETTER']);
    const pendingCount = await queryOne('SELECT COUNT(*) as count FROM webhook_events WHERE status = ?', ['RETRY_PENDING']);

    res.json({
      events,
      stats: {
        deadLetter: dlqCount?.count || 0,
        pendingRetry: pendingCount?.count || 0
      }
    });
  } catch (err: any) {
    console.error('Get webhooks error:', err);
    res.status(500).json({ error: 'Failed to fetch webhook events' });
  }
});

// Admin endpoint to manually retry a webhook event
router.post('/admin/webhooks/:eventId/retry', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const eventId = req.params.eventId;
  try {
    await ensureBillingTables();
    const result = await manualRetryWebhook(eventId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Manual retry error:', err);
    res.status(400).json({ error: 'Retry failed: ' + err.message });
  }
});

export default router;
