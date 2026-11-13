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
import initSqlJs from 'sql.js';

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
let sqlJsDbInstance: any = null;
let sqlJsInitPromise: Promise<any> | null = null;

export function isPostgres(): boolean {
  if (postgresAvailable) return true;
  const dbUrl = getDatabaseUrl();
  return Boolean(dbUrl || (process.env.SQL_HOST && process.env.SQL_DB_NAME));
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
    console.warn('⚠️ [VectOS]: DATABASE_URL is not set in environment variables. Falling back to in-memory sql.js engine.');
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

function sanitizeParams(params: any[]): any[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

let dbInitPromise: Promise<any> | null = null;

export function getDb(): Promise<any> {
  if (!dbInitPromise) {
    dbInitPromise = initializeDb().catch((err) => {
      dbInitPromise = null;
      console.error('Database connection initialization error:', err?.message || err);
      // Fallback to in-memory sql.js if postgres failed
      return initSqlJsDatabase();
    });
  }
  return dbInitPromise;
}

async function initializeDb(): Promise<any> {
  const dbUrl = getDatabaseUrl();
  const hasSql = Boolean(dbUrl || (process.env.SQL_HOST && process.env.SQL_DB_NAME));

  if (!hasSql) {
    console.log('ℹ️ [VectOS]: Running with in-memory sql.js SQLite database (no DATABASE_URL configured).');
    postgresAvailable = false;
    return initSqlJsDatabase();
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
    console.log('ℹ️ [VectOS]: Falling back to in-memory sql.js SQLite database.');
    return initSqlJsDatabase();
  }
}

async function initSqlJsDatabase(): Promise<any> {
  if (sqlJsDbInstance) return sqlJsDbInstance;
  if (!sqlJsInitPromise) {
    sqlJsInitPromise = (async () => {
      const SQL = await initSqlJs();
      sqlJsDbInstance = new SQL.Database();
      await initSqlJsSchema();
      console.log('✅ In-memory sql.js database initialized successfully.');
      return sqlJsDbInstance;
    })();
  }
  return sqlJsInitPromise;
}

async function initSqlJsSchema(): Promise<void> {
  if (!sqlJsDbInstance) return;

  const ddl = `
    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      owner_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      location TEXT DEFAULT 'Kigali, Rwanda',
      tin_number TEXT,
      receipt_footer_text TEXT DEFAULT 'Thank you for choosing us! Goods once sold in good condition are not returnable.',
      status TEXT DEFAULT 'active',
      business_type TEXT DEFAULT 'Hardware & Electronics',
      subscription_plan TEXT DEFAULT 'Standard Depot',
      billed_accounts INTEGER DEFAULT 1,
      billed_stocks INTEGER DEFAULT 1,
      monthly_fee REAL DEFAULT 20000.0,
      billing_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT,
      location TEXT,
      manager_name TEXT,
      phone TEXT,
      is_main INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
      stock_id INTEGER REFERENCES stocks(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      job_title TEXT DEFAULT 'Store Staff',
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      activation_status TEXT DEFAULT 'active',
      activation_note TEXT,
      can_create_orders INTEGER DEFAULT 1,
      can_process_payments INTEGER DEFAULT 0,
      can_release_stock INTEGER DEFAULT 0,
      can_manage_stock INTEGER DEFAULT 0,
      can_import_export_stock INTEGER DEFAULT 0,
      can_partner_borrow INTEGER DEFAULT 0,
      can_view_reports INTEGER DEFAULT 0,
      can_view_buying_prices INTEGER DEFAULT 0,
      can_give_discounts INTEGER DEFAULT 0,
      can_manage_users INTEGER DEFAULT 0,
      can_print_full_receipt INTEGER DEFAULT 1,
      can_print_delivery_note INTEGER DEFAULT 1,
      can_manage_customers INTEGER DEFAULT 1,
      can_manage_partners INTEGER DEFAULT 0,
      can_void_orders INTEGER DEFAULT 0,
      can_edit_company_settings INTEGER DEFAULT 0,
      can_view_audit_trail INTEGER DEFAULT 0,
      can_reset_passwords INTEGER DEFAULT 0,
      can_view_all_tenants INTEGER DEFAULT 0,
      can_manage_subscriptions INTEGER DEFAULT 0,
      force_password_change INTEGER DEFAULT 0,
      twofa_secret TEXT,
      twofa_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
      stock_id INTEGER DEFAULT 1 REFERENCES stocks(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      sku TEXT,
      barcode TEXT,
      category TEXT NOT NULL,
      unit TEXT DEFAULT 'pcs',
      buying_price REAL NOT NULL,
      selling_price REAL DEFAULT 0.0,
      quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 10,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      id_number TEXT,
      email TEXT,
      address TEXT,
      credit_balance REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS partner_shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      current_balance REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
      stock_id INTEGER DEFAULT 1 REFERENCES stocks(id) ON DELETE SET NULL,
      order_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      salesperson_id INTEGER NOT NULL REFERENCES users(id),
      total_amount REAL DEFAULT 0.0,
      paid_amount REAL DEFAULT 0.0,
      debt_amount REAL DEFAULT 0.0,
      payment_status TEXT DEFAULT 'pending',
      fulfillment_status TEXT DEFAULT 'pending_store',
      notes TEXT,
      client_ref TEXT,
      payment_approved_by INTEGER REFERENCES users(id),
      payment_approved_at DATETIME,
      stock_released_by INTEGER REFERENCES users(id),
      stock_released_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      buying_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      profit REAL NOT NULL,
      fulfillment_source TEXT DEFAULT 'Store',
      item_status TEXT DEFAULT 'pending_store',
      rejection_reason TEXT,
      partner_shop_id INTEGER REFERENCES partner_shops(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      reference_no TEXT,
      recorded_by INTEGER NOT NULL REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
      stock_id INTEGER DEFAULT 1 REFERENCES stocks(id) ON DELETE SET NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      reference TEXT,
      performed_by INTEGER NOT NULL REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      from_stock_id INTEGER NOT NULL REFERENCES stocks(id),
      to_stock_id INTEGER NOT NULL REFERENCES stocks(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      transferred_by INTEGER NOT NULL REFERENCES users(id),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS login_throttle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity TEXT UNIQUE NOT NULL,
      attempts INTEGER DEFAULT 0,
      locked_until DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS session (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire DATETIME NOT NULL
    );

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
  `;
  sqlJsDbInstance.run(ddl);

  // Seed default shop and warehouse
  const shopCountRes = sqlJsDbInstance.exec('SELECT COUNT(*) FROM shops');
  const shopCount = shopCountRes[0]?.values[0]?.[0] || 0;
  if (shopCount === 0) {
    sqlJsDbInstance.run(`
      INSERT INTO shops (id, name, code, owner_name, phone, email, location, status, subscription_plan)
      VALUES (1, 'VectOS Main Store', 'main', 'Administrator', '+250 788 000 000', 'rwemera30@gmail.com', 'Kigali, Rwanda', 'active', 'Standard Store')
    `);
    sqlJsDbInstance.run(`
      INSERT INTO stocks (id, shop_id, name, code, location, manager_name, is_main, status)
      VALUES (1, 1, 'Main Warehouse', 'WH-01', 'Kigali Central', 'Store Manager', 1, 'active')
    `);

    // Seed realistic Rwandan hardware catalog items so POS & inventory views have live demo data
    const initialProducts = [
      [1, 1, 'Ciment Twiga 32.5R (50kg)', 'CIM-325-TW', 'Twiga 32.5R', 'Construction / Cement', 'Sack (50kg)', 9200, 11500, 120, 15, 'Twiga 32.5R Portland Composite Cement'],
      [1, 1, 'Ciment Cimerwa 42.5N (50kg)', 'CIM-425-RW', 'Cimerwa 42.5N', 'Construction / Cement', 'Sack (50kg)', 10500, 13000, 85, 20, 'High strength Cimerwa structural cement'],
      [1, 1, 'Fer à Béton 12mm (Barre 12m)', 'IRN-12MM-12M', 'Iron Bar 12mm', 'Steel & Metals', 'Bar (12m)', 11800, 14200, 240, 30, 'High tensile deformed steel rebar for construction'],
      [1, 1, 'Fer à Béton 10mm (Barre 12m)', 'IRN-10MM-12M', 'Iron Bar 10mm', 'Steel & Metals', 'Bar (12m)', 8400, 10200, 310, 25, 'Standard 10mm construction steel rebar'],
      [1, 1, 'Tôles Bac 28G (Bleu nuit 3m)', 'TOL-28G-BLU', 'Roofing Sheet Blue', 'Roofing & Sheets', 'Sheet (3m)', 7500, 9500, 150, 15, 'Corrugated steel roofing sheet prepainted blue'],
      [1, 1, 'Tuyau PVC Pression 32mm PN10 (6m)', 'PVC-32MM-6M', 'PVC Pipe 32mm', 'Plumbing / Pipes', 'Pipe (6m)', 4200, 5600, 95, 10, 'Rigid PVC pressure pipe for water supply'],
      [1, 1, 'Peinture Vinyle Blanche Plascon (20L)', 'PNT-VIN-20L-WHT', 'Plascon White 20L', 'Paints & Finishes', 'Bucket (20L)', 32000, 39500, 35, 5, 'High opacity interior/exterior matte emulsion paint'],
      [1, 1, 'Brouette Construction Renforcée', 'EQP-BRT-HVY', 'Heavy Wheelbarrow', 'Tools & Equipment', 'Pcs', 28000, 35000, 18, 4, 'Heavy duty steel tray wheelbarrow with pneumatic tire'],
      [1, 1, 'Boîte Disjoncteur Schneider 4 Voies', 'ELE-DSJ-4V-SCH', 'Schneider Breaker 4W', 'Electrical & Lighting', 'Pcs', 14500, 18500, 42, 6, 'Surface mounted mini enclosure with DIN rail']
    ];

    for (const p of initialProducts) {
      sqlJsDbInstance.run(
        `INSERT INTO products (shop_id, stock_id, name, sku, barcode, category, unit, buying_price, selling_price, quantity, low_stock_threshold, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p
      );
    }

    // Seed default customer
    sqlJsDbInstance.run(`
      INSERT INTO customers (id, shop_id, name, phone, email, address, credit_balance)
      VALUES (1, 1, 'Kigali Prime Contractors Ltd', '+250 788 123 456', 'procurement@kigaliprime.rw', 'Kacyiru, Kigali', 0)
    `);
  }

  try {
    sqlJsDbInstance.run('UPDATE products SET selling_price = buying_price WHERE buying_price IS NOT NULL AND buying_price > 0');
  } catch {}

  await ensureAdminAccounts();
}

export function saveDb(dbToSave?: any) {
  // Pure Postgres / in-memory SQLite: auto-committed
}

const pgTxStorage = new AsyncLocalStorage<pg.PoolClient>();

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (isPostgres()) {
    if (pgTxStorage.getStore()) {
      throw new Error('Nested transactions are not supported');
    }
    const pool = getPgPool();
    if (!pool) {
      throw new Error('Database connection not available.');
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

  // sql.js SQLite transaction
  if (!sqlJsDbInstance) await getDb();
  if (!sqlJsDbInstance) {
    throw new Error('sql.js database instance is not initialized.');
  }
  sqlJsDbInstance.run('BEGIN TRANSACTION');
  try {
    const result = await fn();
    sqlJsDbInstance.run('COMMIT');
    return result;
  } catch (e) {
    try { sqlJsDbInstance.run('ROLLBACK'); } catch {}
    throw e;
  }
}

export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (isPostgres()) {
    const txClient = pgTxStorage.getStore();
    if (txClient) {
      const pgSql = formatPgSql(sql);
      const res = await txClient.query(pgSql, params);
      return res.rows as T[];
    }
    const pool = getPgPool();
    if (!pool) {
      throw new Error('Database connection not available.');
    }
    const pgSql = formatPgSql(sql);
    const res = await pool.query(pgSql, params);
    return res.rows as T[];
  }

  // sql.js SQLite fallback
  if (!sqlJsDbInstance) await getDb();
  if (!sqlJsDbInstance) {
    throw new Error('sql.js database instance is not initialized.');
  }

  // Emulate information_schema.columns in SQLite via PRAGMA table_info
  if (sql.includes('information_schema.columns')) {
    const tableMatch = /table_name\s*=\s*'([^']+)'/i.exec(sql);
    const tableName = tableMatch ? tableMatch[1] : '';
    const colMatch = /column_name\s*=\s*'([^']+)'/i.exec(sql);
    const targetCol = colMatch ? colMatch[1].toLowerCase() : null;
    if (tableName) {
      try {
        const pragmaStmt = sqlJsDbInstance.prepare(`PRAGMA table_info(${tableName})`);
        const cols: any[] = [];
        while (pragmaStmt.step()) {
          const row = pragmaStmt.getAsObject();
          cols.push({ column_name: String(row.name).toLowerCase() });
        }
        pragmaStmt.free();
        if (targetCol) {
          return cols.filter((c) => c.column_name === targetCol) as T[];
        }
        return cols as T[];
      } catch {
        return [];
      }
    }
    return [];
  }

  const cleanParams = sanitizeParams(params);
  const stmt = sqlJsDbInstance.prepare(sql);
  try {
    stmt.bind(cleanParams);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const results = await queryAll<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

export async function execute(sql: string, params: any[] = []): Promise<{ lastInsertId: number; changes: number }> {
  if (isPostgres()) {
    const target = pgTxStorage.getStore() || null;
    const pool = getPgPool();
    if (!pool && !target) {
      throw new Error('Database connection not available.');
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

  // sql.js SQLite execution
  if (!sqlJsDbInstance) await getDb();
  if (!sqlJsDbInstance) {
    throw new Error('sql.js database instance is not initialized.');
  }

  const cleanParams = sanitizeParams(params);
  sqlJsDbInstance.run(sql, cleanParams);
  let lastInsertId = 0;
  let changes = 0;
  try {
    const idRes = sqlJsDbInstance.exec('SELECT last_insert_rowid() as id');
    if (idRes[0]?.values[0]?.[0] !== undefined) {
      lastInsertId = Number(idRes[0].values[0][0]);
    }
    const chRes = sqlJsDbInstance.exec('SELECT changes() as changes');
    if (chRes[0]?.values[0]?.[0] !== undefined) {
      changes = Number(chRes[0].values[0][0]);
    }
  } catch {}
  return { lastInsertId, changes };
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
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price NUMERIC(15,2) DEFAULT 0.0;`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_approved_by INTEGER;`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_approved_at TIMESTAMP WITH TIME ZONE;`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_released_by INTEGER;`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_released_at TIMESTAMP WITH TIME ZONE;`,
    `ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shop_sku ON products(shop_id, sku) WHERE sku IS NOT NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shop_client_ref ON orders(shop_id, client_ref) WHERE client_ref IS NOT NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shop_phone ON customers(shop_id, phone);`
  ];

  for (const m of migrations) {
    try {
      await pool.query(m);
    } catch {
      // safe to ignore if column/index already present or table not owned
    }
  }

  try {
    await pool.query('UPDATE products SET selling_price = buying_price WHERE buying_price IS NOT NULL AND buying_price > 0;');
  } catch {}

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
  // Handled via initPostgresSchemaIfNeeded and ensureAdminAccounts
}

export async function ensureAdminAccounts(dbToUse?: any): Promise<void> {
  const adminPass = await bcrypt.hash('password123', 10);
  const primaryEmail = 'rwemera30@gmail.com';
  const aliasAdminEmail = 'admin@vectos.co.rw';
  const salesEmail = 'sales@quincaille.rw';

  try {
    // Check available columns in users table so we only query columns that exist
    let cols = new Set<string>();
    try {
      const colRows = await queryAll<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
      );
      if (colRows && colRows.length > 0) {
        cols = new Set(colRows.map(r => r.column_name.toLowerCase()));
      }
    } catch {
      // Fallback if information_schema query unavailable
    }

    const permKeys = [
      'can_create_orders', 'can_process_payments', 'can_release_stock', 'can_manage_stock',
      'can_import_export_stock', 'can_partner_borrow', 'can_view_reports', 'can_view_buying_prices',
      'can_give_discounts', 'can_manage_users', 'can_print_full_receipt', 'can_print_delivery_note',
      'can_manage_customers', 'can_manage_partners', 'can_void_orders', 'can_edit_company_settings',
      'can_view_audit_trail', 'can_reset_passwords', 'can_view_all_tenants', 'can_manage_subscriptions'
    ];

    const activePerms = permKeys.filter(k => cols.size === 0 || cols.has(k));

    // 1. Ensure rwemera30@gmail.com (Platform Superadmin)
    const existingPrimary = await queryOne('SELECT id, password FROM users WHERE LOWER(TRIM(email)) = ?', [primaryEmail]);
    if (existingPrimary) {
      const passToUse = existingPrimary.password ? existingPrimary.password : adminPass;
      const setClauses = [
        'password = ?',
        'is_active = 1',
        "activation_status = 'active'",
        "role = 'superadmin'",
        "name = 'Rwemera Platform Administrator'"
      ];
      const params: any[] = [passToUse];
      for (const p of activePerms) {
        setClauses.push(`${p} = 1`);
      }
      params.push(existingPrimary.id);
      await execute(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`, params);
    } else {
      const insertCols = ['name', 'email', 'password', 'role', 'job_title', 'phone', 'is_active', 'activation_status'];
      const insertVals = ['Rwemera Platform Administrator', primaryEmail, adminPass, 'superadmin', 'Platform Administrator', '+250 788 000 000', 1, 'active'];
      for (const p of activePerms) {
        insertCols.push(p);
        insertVals.push(1);
      }
      const placeholders = insertCols.map(() => '?').join(', ');
      await execute(`INSERT INTO users (${insertCols.join(', ')}) VALUES (${placeholders})`, insertVals);
    }

    // 2. Ensure admin@vectos.co.rw
    const existingAlias = await queryOne('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', [aliasAdminEmail]);
    if (existingAlias) {
      await execute(`UPDATE users SET password = ?, is_active = 1, activation_status = 'active', role = 'superadmin' WHERE id = ?`, [adminPass, existingAlias.id]);
    } else {
      const insertCols = ['name', 'email', 'password', 'role', 'job_title', 'phone', 'is_active', 'activation_status'];
      const insertVals = ['VectOS Administrator', aliasAdminEmail, adminPass, 'superadmin', 'Platform Administrator', '+250 788 000 000', 1, 'active'];
      for (const p of activePerms) {
        insertCols.push(p);
        insertVals.push(1);
      }
      const placeholders = insertCols.map(() => '?').join(', ');
      await execute(`INSERT INTO users (${insertCols.join(', ')}) VALUES (${placeholders})`, insertVals);
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
