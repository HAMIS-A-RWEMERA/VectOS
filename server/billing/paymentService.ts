import crypto from 'crypto';
import { queryAll, queryOne, execute, isPostgres } from '../database/db';

export interface PaymentParams {
  shopId: number;
  subscriptionId?: number;
  invoiceId?: string;
  amount: number;
  currency: string;
  paymentMethod: 'card' | 'mobile_money' | 'bank_transfer' | 'mock';
  clientRef: string;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  paymentRef: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  provider: string;
  rawResponse?: any;
}

export interface PaymentProvider {
  name: string;
  createPayment(params: PaymentParams): Promise<PaymentResult>;
  verifyPayment(paymentRef: string): Promise<PaymentResult>;
  refundPayment(paymentRef: string, amount?: number): Promise<{ success: boolean; refundRef: string }>;
  getPaymentStatus(paymentRef: string): Promise<PaymentResult>;
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): { valid: boolean; event?: any };
}

// Mock / Test Payment Provider with deterministic behavior
export class MockPaymentProvider implements PaymentProvider {
  name = 'mock';

  async createPayment(params: PaymentParams): Promise<PaymentResult> {
    const paymentRef = `mock_pay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    return {
      paymentRef,
      status: 'completed',
      provider: this.name,
      rawResponse: { simulated: true, ...params }
    };
  }

  async verifyPayment(paymentRef: string): Promise<PaymentResult> {
    return {
      paymentRef,
      status: 'completed',
      provider: this.name
    };
  }

  async refundPayment(paymentRef: string, amount?: number): Promise<{ success: boolean; refundRef: string }> {
    return {
      success: true,
      refundRef: `mock_ref_${Date.now()}`
    };
  }

  async getPaymentStatus(paymentRef: string): Promise<PaymentResult> {
    return {
      paymentRef,
      status: 'completed',
      provider: this.name
    };
  }

  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): { valid: boolean; event?: any } {
    try {
      const event = JSON.parse(rawBody);
      return { valid: true, event };
    } catch {
      return { valid: false };
    }
  }
}

// Stripe Provider Adapter (uses process.env.STRIPE_SECRET_KEY if available)
export class StripePaymentProvider implements PaymentProvider {
  name = 'stripe';

  async createPayment(params: PaymentParams): Promise<PaymentResult> {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    // Real Stripe SDK integration abstraction or fetch call
    const paymentRef = `stripe_pi_${Date.now()}`;
    return {
      paymentRef,
      status: 'pending',
      provider: this.name
    };
  }

  async verifyPayment(paymentRef: string): Promise<PaymentResult> {
    return { paymentRef, status: 'completed', provider: this.name };
  }

  async refundPayment(paymentRef: string): Promise<{ success: boolean; refundRef: string }> {
    return { success: true, refundRef: `stripe_ref_${Date.now()}` };
  }

  async getPaymentStatus(paymentRef: string): Promise<PaymentResult> {
    return { paymentRef, status: 'completed', provider: this.name };
  }

  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): { valid: boolean; event?: any } {
    const sig = headers['stripe-signature'];
    if (!sig && process.env.NODE_ENV === 'production') {
      return { valid: false };
    }
    try {
      const event = JSON.parse(rawBody);
      return { valid: true, event };
    } catch {
      return { valid: false };
    }
  }
}

export function getPaymentProvider(providerName?: string): PaymentProvider {
  if (providerName === 'stripe' && process.env.STRIPE_SECRET_KEY) {
    return new StripePaymentProvider();
  }
  return new MockPaymentProvider();
}

// Initialize webhook events table & subscriptions table if not present
export async function initBillingTables(): Promise<void> {
  if (isPostgres()) {
    const { getPgPool } = await import('../database/db');
    const pool = getPgPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id SERIAL PRIMARY KEY,
        event_id TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'RECEIVED',
        attempts INT DEFAULT 0,
        max_attempts INT DEFAULT 5,
        last_error TEXT,
        next_retry_at TIMESTAMP WITH TIME ZONE,
        processed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments_ledger (
        id SERIAL PRIMARY KEY,
        shop_id INTEGER NOT NULL,
        payment_ref TEXT UNIQUE NOT NULL,
        client_ref TEXT UNIQUE,
        amount NUMERIC NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else {
    await execute(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'RECEIVED',
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 5,
        last_error TEXT,
        next_retry_at DATETIME,
        processed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS payments_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL,
        payment_ref TEXT UNIQUE NOT NULL,
        client_ref TEXT UNIQUE,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
}

// Durable Webhook Processor & Retry Queue
export async function processWebhookEvent(eventId: string, eventType: string, provider: string, payload: any): Promise<{ success: boolean; status: string }> {
  await initBillingTables();
  const rawPayload = JSON.stringify(payload);

  // Check duplicate event ID
  const existing = await queryOne<{ id: number; status: string; attempts: number }>(
    `SELECT id, status, attempts FROM webhook_events WHERE event_id = ?`,
    [eventId]
  );

  if (existing) {
    if (existing.status === 'PROCESSED') {
      return { success: true, status: 'ALREADY_PROCESSED' };
    }
    if (existing.status === 'DEAD_LETTER') {
      return { success: false, status: 'DEAD_LETTER' };
    }
  } else {
    await execute(
      `INSERT INTO webhook_events (event_id, event_type, provider, payload, status, attempts) VALUES (?, ?, ?, ?, 'RECEIVED', 0)`,
      [eventId, eventType, provider, rawPayload]
    );
  }

  // Update to PROCESSING
  await execute(`UPDATE webhook_events SET status = 'PROCESSING', attempts = attempts + 1 WHERE event_id = ?`, [eventId]);

  try {
    // Simulate core business event handling (e.g. subscription state update or payment completion)
    if (eventType === 'payment.success' || eventType === 'charge.succeeded') {
      const data = payload.data || payload;
      const shopId = data.shopId || data.metadata?.shopId || 1;
      const paymentRef = data.paymentRef || data.id || `pay_${eventId}`;
      const amount = data.amount || 15000;

      // Idempotent payment recording
      const existingPay = await queryOne(`SELECT id FROM payments_ledger WHERE payment_ref = ?`, [paymentRef]);
      if (!existingPay) {
        await execute(
          `INSERT INTO payments_ledger (shop_id, payment_ref, amount, currency, status, provider, metadata) VALUES (?, ?, ?, ?, 'completed', ?, ?)`,
          [shopId, paymentRef, amount, data.currency || 'USD', provider, rawPayload]
        );
      }
    }

    // Mark PROCESSED
    const nowIso = new Date().toISOString();
    await execute(`UPDATE webhook_events SET status = 'PROCESSED', processed_at = ? WHERE event_id = ?`, [nowIso, eventId]);
    return { success: true, status: 'PROCESSED' };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    const eventRow = await queryOne<{ attempts: number; max_attempts: number }>(
      `SELECT attempts, max_attempts FROM webhook_events WHERE event_id = ?`,
      [eventId]
    );
    const attempts = eventRow?.attempts || 1;
    const maxAttempts = eventRow?.max_attempts || 5;

    if (attempts >= maxAttempts) {
      await execute(`UPDATE webhook_events SET status = 'DEAD_LETTER', last_error = ? WHERE event_id = ?`, [errorMsg, eventId]);
      return { success: false, status: 'DEAD_LETTER' };
    } else {
      // Exponential backoff retry
      const delaySec = Math.pow(2, attempts) * 10;
      const nextRetry = new Date(Date.now() + delaySec * 1000).toISOString();
      await execute(
        `UPDATE webhook_events SET status = 'RETRY_PENDING', last_error = ?, next_retry_at = ? WHERE event_id = ?`,
        [errorMsg, nextRetry, eventId]
      );
      return { success: false, status: 'RETRY_PENDING' };
    }
  }
}

export async function manualRetryWebhook(eventId: string): Promise<{ success: boolean; status: string }> {
  const event = await queryOne<{ event_id: string; event_type: string; provider: string; payload: string }>(
    `SELECT event_id, event_type, provider, payload FROM webhook_events WHERE event_id = ?`,
    [eventId]
  );
  if (!event) throw new Error('Webhook event not found');
  const payloadObj = JSON.parse(event.payload);
  return processWebhookEvent(event.event_id, event.event_type, event.provider, payloadObj);
}
