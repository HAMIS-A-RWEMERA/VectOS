import request from 'supertest';
import { app, dbReady } from '../server';
import { execute, queryOne } from '../server/database/db';

/** Every helper awaits full schema+seed completion before touching flows. */
async function waitForDb(): Promise<void> {
  await dbReady;
}

/** Fetch a valid CSRF token by visiting any page (cookie + injected meta). */
export async function getCsrf(agent: request.Agent): Promise<string> {
  await waitForDb();
  // Try /login first (works for anon); if already logged in, /login redirects, so try /dashboard
  let res = await agent.get('/login');
  let cookies: string[] = (res.headers['set-cookie'] as any) || [];
  for (const c of cookies) {
    const m = /vcsrf=([a-f0-9]{64})/.exec(c);
    if (m) return m[1];
  }
  let metaMatch = /name="csrf-token" content="([a-f0-9]{64})"/.exec(res.text || '');
  if (metaMatch) return metaMatch[1];
  // If /login redirected (already authenticated), try a protected page
  if (res.status === 302) {
    res = await agent.get('/dashboard');
    cookies = (res.headers['set-cookie'] as any) || [];
    for (const c of cookies) {
      const m = /vcsrf=([a-f0-9]{64})/.exec(c);
      if (m) return m[1];
    }
    metaMatch = /name="csrf-token" content="([a-f0-9]{64})"/.exec(res.text || '');
    if (metaMatch) return metaMatch[1];
  }
  return '';
}

export async function login(
  email: string,
  password: string
): Promise<{ agent: request.Agent; token: string; status: number }> {
  const agent = request.agent(app);
  const token = await getCsrf(agent);
  const res = await agent
    .post('/login')
    .type('form')
    .send({ email, password, _csrf: token });
  return { agent, token, status: res.status };
}

let shopCounter = 0;

export interface TestShop {
  shopId: number;
  managerEmail: string;
  managerPassword: string;
}

/** Registers a fresh shop + manager and activates both immediately. */
export async function createTestShop(baseName: string): Promise<TestShop> {
  await waitForDb();
  const suffix = Date.now() + '-' + (++shopCounter);
  const shopName = `${baseName} ${suffix}`;
  const managerEmail = `mgr-${baseName.toLowerCase().replace(/\s+/g, '')}-${suffix}@test.rw`;
  const password = 'password123';

  const anon = request.agent(app);
  const token = await getCsrf(anon);

  await anon.post('/register-shop').type('form').send({
    business_type: 'Hardware Store',
    shop_name: shopName,
    tin_number: String(100000000 + Math.floor(Math.random() * 899999999)),
    phone: '07' + String(80000000 + Math.floor(Math.random() * 9999999)).slice(0, 9),
    location: 'Kigali',
    owner_name: `Owner ${baseName}`,
    email: managerEmail,
    password,
    confirm_password: password,
    account_count: '3',
    stock_count: '1',
    _csrf: token
  });

  const shop = await queryOne<{ id: number }>('SELECT id FROM shops WHERE name = ?', [shopName]);
  if (!shop) throw new Error('Test shop registration failed');

  await execute("UPDATE shops SET status = 'active' WHERE id = ?", [shop.id]);
  await execute(
    "UPDATE users SET activation_status = 'active', is_active = 1 WHERE shop_id = ? AND role = 'manager'",
    [shop.id]
  );

  return { shopId: shop.id, managerEmail, managerPassword: password };
}

export async function addProduct(
  agent: request.Agent,
  csrfToken: string,
  fields: { name: string; sku?: string; buying_price?: string; initial_quantity?: string }
): Promise<number> {
  await agent.post('/products/add').type('form').send({
    name: fields.name,
    sku: fields.sku || '',
    category: 'Testing',
    unit: 'pcs',
    buying_price: fields.buying_price || '1000',
    initial_quantity: fields.initial_quantity || '50',
    low_stock_threshold: '5',
    description: '',
    _csrf: csrfToken
  });
  const row = await queryOne<{ id: number }>('SELECT id FROM products WHERE name = ? ORDER BY id DESC', [fields.name]);
  return row ? row.id : 0;
}
