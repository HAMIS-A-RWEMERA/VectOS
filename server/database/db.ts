import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local first, then .env for local and script tasks
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

import bcrypt from 'bcryptjs';
import pg from 'pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { AsyncLocalStorage } from 'node:async_hooks';

// Support serverless connection pooling over WebSockets in Node.js / Vercel runtime
neonConfig.webSocketConstructor = ws;

const { Pool } = pg;

// Postgres returns NUMERIC/BIGINT as strings by default, which breaks
// arithmetic in dashboards/reports (string concatenation). Parse them as numbers.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => parseFloat(val));
pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => parseInt(val, 10));

let pgPoolInstance: any = null;
let postgresAvailable = false;
let postgresSchemaInitialized = false;

export function isPostgres(): boolean {
  return true; // Pure Postgres engine
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    ''
  ).trim();
}

export function getPgPool(): pg.Pool {
  if (pgPoolInstance) {
    return pgPoolInstance;
  }

  const connectionString = getDatabaseUrl();

  if (connectionString) {
    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

    if (connectionString.includes('neon.tech') || connectionString.includes('-pooler')) {
      pgPoolInstance = new NeonPool({
        connectionString,
        max: 10,
        connectionTimeoutMillis: 15000,
      });
    } else {
      pgPoolInstance = new Pool({
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    }
  } else if (process.env.SQL_HOST && process.env.SQL_DB_NAME) {
    const user = process.env.SQL_USER || process.env.SQL_ADMIN_USER || 'postgres';
    const password = process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || '';
    const host = process.env.SQL_HOST;
    const port = parseInt(process.env.SQL_PORT || '5432', 10);
    const database = process.env.SQL_DB_NAME;

    pgPoolInstance = new Pool({
      host,
      port,
      user,
      password,
      database,
      ssl: false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });
  } else {
    // If no database URL is provided yet, create a dummy pool that surfaces a clear error
    console.warn('⚠️ [VectOS]: DATABASE_URL is not set in environment variables.');
  }

  if (pgPoolInstance) {
    pgPoolInstance.on('error', (err: any) => {
      console.error('Unexpected error on idle PostgreSQL client:', err);
    });
  }

  return pgPoolInstance;
}

export function formatPgSql(sql: string): string {
  let index = 1;
  // Replace SQLite ? parameters with Postgres $1, $2, $3...
  return sql.replace(/\?/g, () => `$${index++}`);
}

let dbInitPromise: Promise<any> | null = null;

export function getDb(): Promise<any> {
  if (!dbInitPromise) {
    dbInitPromise = initializeDb().catch((err) => {
      dbInitPromise = null;
      console.error('Database connection initialization error:', err?.message || err);
    });
  }
  return dbInitPromise;
}

async function initializeDb(): Promise<any> {
  const dbUrl = getDatabaseUrl();
  const hasSql = Boolean(dbUrl || (process.env.SQL_HOST && process.env.SQL_DB_NAME));

  if (!hasSql) {
    console.warn('⚠️ [VectOS]: Running without DATABASE_URL. In Vercel Project Settings, add DATABASE_URL from your Neon console.');
    postgresAvailable = false;
    return null;
  }

  try {
    const pool = getPgPool();
    if (!pool) {
      throw new Error('PostgreSQL pool could not be created from DATABASE_URL.');
    }
    await pool.query('SELECT 1');
    postgresAvailable = true;
    console.log('✅ PostgreSQL connection verified successfully — persistent database active.');
    await initPostgresSchemaIfNeeded();
    return pool;
  } catch (err: any) {
    const sanitizedMsg = err?.message || String(err);
    console.error(`PostgreSQL connection notice: ${sanitizedMsg}`);
    postgresAvailable = false;
    pgPoolInstance = null;
    return null;
  }
}

export function saveDb(dbToSave?: any) {
  // Pure Postgres: transactions are auto-committed or managed via withTransaction
}

const pgTxStorage = new AsyncLocalStorage<pg.PoolClient>();

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (pgTxStorage.getStore()) {
    throw new Error('Nested transactions are not supported');
  }
  const pool = getPgPool();
  if (!pool) {
    throw new Error('Database connection not available. Please verify DATABASE_URL is set in environment variables.');
  }
  const client = await pool.connect();
  return pgTxStorage.run(client, async () => {
    try {
      await client.query('BEGIN');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally {
      client.release();
    }
  });
}

export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const txClient = pgTxStorage.getStore();
  if (txClient) {
    const pgSql = formatPgSql(sql);
    const res = await txClient.query(pgSql, params);
    return res.rows as T[];
  }
  const pool = getPgPool();
  if (!pool) {
    throw new Error('Database connection not available. Please verify DATABASE_URL is set in environment variables.');
  }
  const pgSql = formatPgSql(sql);
  const res = await pool.query(pgSql, params);
  return res.rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const results = await queryAll<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

export async function execute(sql: string, params: any[] = []): Promise<{ lastInsertId: number; changes: number }> {
  const target = pgTxStorage.getStore() || null;
  const pool = getPgPool();
  if (!pool && !target) {
    throw new Error('Database connection not available. Please verify DATABASE_URL is set in environment variables.');
  }
  const doQuery = async (pgSql: string) => {
    if (target) return target.query(pgSql, params);
    return pool.query(pgSql, params);
  };

  let pgSql = formatPgSql(sql);
  const isInsert = /^\s*INSERT\s+INTO/i.test(sql);
  const hasReturning = /RETURNING/i.test(sql);
  if (isInsert && !hasReturning) {
    pgSql += ' RETURNING id';
  }
  try {
    const res = await doQuery(pgSql);
    let lastInsertId = 0;
    if (res.rows && res.rows.length > 0 && res.rows[0].id !== undefined) {
      lastInsertId = Number(res.rows[0].id);
    }
    return { lastInsertId, changes: res.rowCount || 0 };
  } catch (err: any) {
    if (isInsert && !hasReturning && err.message?.includes('column "id" does not exist')) {
      const fallbackSql = formatPgSql(sql);
      const res = await doQuery(fallbackSql);
      return { lastInsertId: 0, changes: res.rowCount || 0 };
    }
    throw err;
  }
}

export async function initPostgresSchemaIfNeeded(): Promise<void> {
  if (postgresSchemaInitialized) return;
  const pool = getPgPool();
  if (!pool) return;

  try {
    const checkTable = await pool.query(`SELECT to_regclass('public.users') as exists;`);
    if (!checkTable.rows[0] || !checkTable.rows[0].exists) {
      console.log('Applying PostgreSQL database schema...');
      const candidatePaths = [
        path.join(process.cwd(), 'database-schema.sql'),
        path.join(__dirname, 'database-schema.sql'),
        path.join(__dirname, '..', 'database-schema.sql'),
        path.join(__dirname, '..', '..', 'database-schema.sql')
      ];
      const schemaSqlPath = candidatePaths.find(p => fs.existsSync(p));
      if (schemaSqlPath) {
        const sqlContent = fs.readFileSync(schemaSqlPath, 'utf-8');
        await pool.query(sqlContent);
        console.log('✅ PostgreSQL database schema applied successfully from', schemaSqlPath);
      }
    }
  } catch (err: any) {
    console.warn('Notice on PostgreSQL initial table check:', err?.message || err);
  }

  // Safe migrations to ensure auxiliary tables and columns exist
  const migrations = [
    `CREATE TABLE IF NOT EXISTS stock_transfers (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      from_stock_id INTEGER NOT NULL REFERENCES stocks(id),
      to_stock_id INTEGER NOT NULL REFERENCES stocks(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      transferred_by INTEGER NOT NULL REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS login_throttle (
      id SERIAL PRIMARY KEY,
      identity TEXT UNIQUE NOT NULL,
      attempts INTEGER DEFAULT 0,
      locked_until TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );`,
    `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_audit_trail INTEGER DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS can_reset_passwords INTEGER DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_all_tenants INTEGER DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_subscriptions INTEGER DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change INTEGER DEFAULT 0;`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_approved_by INTEGER;`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_approved_at TIMESTAMP WITH TIME ZONE;`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_released_by INTEGER;`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_released_at TIMESTAMP WITH TIME ZONE;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shop_sku ON products(shop_id, sku) WHERE sku IS NOT NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shop_client_ref ON orders(shop_id, client_ref) WHERE client_ref IS NOT NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shop_phone ON customers(shop_id, phone);`
  ];

  for (const m of migrations) {
    try {
      await pool.query(m);
    } catch {
      // safe to ignore if column/index already present
    }
  }

  // Seed Default Active Shop if none exists in Postgres
  try {
    const shopCheck = await pool.query('SELECT COUNT(*) as count FROM shops');
    if (parseInt(shopCheck.rows[0]?.count || '0', 10) === 0) {
      console.log('Seeding initial default store and warehouse in Neon Postgres...');
      await pool.query(`
        INSERT INTO shops (id, name, code, owner_name, phone, email, location, status, subscription_plan)
        VALUES (1, 'VectOS Main Store', 'main', 'Administrator', '+250 788 000 000', 'rwemera30@gmail.com', 'Kigali, Rwanda', 'active', 'Standard Store')
        ON CONFLICT DO NOTHING;
      `);
      try {
        await pool.query(`SELECT setval('shops_id_seq', (SELECT COALESCE(MAX(id), 1) FROM shops));`);
      } catch {}
    }

    const stockCheck = await pool.query('SELECT COUNT(*) as count FROM stocks');
    if (parseInt(stockCheck.rows[0]?.count || '0', 10) === 0) {
      await pool.query(`
        INSERT INTO stocks (id, shop_id, name, code, location, manager_name, is_main, status)
        VALUES (1, 1, 'Main Warehouse', 'WH-01', 'Kigali Central', 'Store Manager', 1, 'active')
        ON CONFLICT DO NOTHING;
      `);
      try {
        await pool.query(`SELECT setval('stocks_id_seq', (SELECT COALESCE(MAX(id), 1) FROM stocks));`);
      } catch {}
    }
  } catch (seedErr) {
    console.warn('Notice on Postgres initial seeding:', seedErr);
  }

  postgresSchemaInitialized = true;
  await ensureAdminAccounts();
}

export async function migrateUsersTableIfNeeded(db?: any): Promise<void> {
  // No-op for Postgres (schema handled via initPostgresSchemaIfNeeded)
}

export async function ensureAdminAccounts(dbToUse?: any): Promise<void> {
  const adminPass = await bcrypt.hash('password123', 10);
  const primaryEmail = 'rwemera30@gmail.com';
  const aliasAdminEmail = 'admin@vectos.co.rw';
  const salesEmail = 'sales@quincaille.rw';

  try {
    // 1. Ensure rwemera30@gmail.com (Platform Superadmin)
    const existingPrimary = await queryOne('SELECT id, password FROM users WHERE LOWER(TRIM(email)) = ?', [primaryEmail]);
    if (existingPrimary) {
      // Preserve existing user-chosen password if present, otherwise set to adminPass
      const passToUse = existingPrimary.password ? existingPrimary.password : adminPass;
      await execute(`
        UPDATE users SET password = ?, is_active = 1, activation_status = 'active', role = 'superadmin', name = 'Rwemera Platform Administrator',
            can_create_orders = 1, can_process_payments = 1, can_release_stock = 1, can_manage_stock = 1,
            can_import_export_stock = 1, can_partner_borrow = 1, can_view_reports = 1, can_view_buying_prices = 1,
            can_give_discounts = 1, can_manage_users = 1, can_print_full_receipt = 1, can_print_delivery_note = 1,
            can_manage_customers = 1, can_manage_partners = 1, can_void_orders = 1, can_edit_company_settings = 1,
            can_view_audit_trail = 1, can_reset_passwords = 1, can_view_all_tenants = 1, can_manage_subscriptions = 1
        WHERE id = ?`, [passToUse, existingPrimary.id]);
    } else {
      await execute(`
        INSERT INTO users (name, email, password, role, job_title, phone, is_active, activation_status,
          can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow,
          can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note,
          can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions)
        VALUES (?, ?, ?, 'superadmin', 'Platform Administrator', '+250 788 000 000', 1, 'active', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)`,
        ['Rwemera Platform Administrator', primaryEmail, adminPass]);
    }

    // 2. Ensure admin@vectos.co.rw
    const existingAlias = await queryOne('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', [aliasAdminEmail]);
    if (existingAlias) {
      await execute(`UPDATE users SET password = ?, is_active = 1, activation_status = 'active', role = 'superadmin' WHERE id = ?`, [adminPass, existingAlias.id]);
    } else {
      await execute(`
        INSERT INTO users (name, email, password, role, job_title, phone, is_active, activation_status,
          can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow,
          can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note,
          can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions)
        VALUES (?, ?, ?, 'superadmin', 'Platform Administrator', '+250 788 000 000', 1, 'active', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)`,
        ['VectOS Administrator', aliasAdminEmail, adminPass]);
    }

    // 3. Ensure sales@quincaille.rw
    const existingSales = await queryOne('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', [salesEmail]);
    if (existingSales) {
      await execute(`UPDATE users SET password = ?, is_active = 1, activation_status = 'active' WHERE id = ?`, [adminPass, existingSales.id]);
    } else {
      await execute(`
        INSERT INTO users (shop_id, stock_id, name, email, password, role, job_title, phone, is_active, activation_status, can_create_orders, can_print_full_receipt)
        VALUES (1, 1, 'Sales Agent', ?, ?, 'salesperson', 'Sales Staff', '+250 788 111 222', 1, 'active', 1, 1)`,
        [salesEmail, adminPass]);
    }
  } catch (err) {
    console.error('Error in ensureAdminAccounts (PG):', err);
  }
}
