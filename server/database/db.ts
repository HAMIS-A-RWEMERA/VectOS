import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

const { Pool } = pg;

// Postgres returns NUMERIC/BIGINT as strings by default, which breaks
// arithmetic in dashboards/reports (string concatenation). Parse them as numbers.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => parseFloat(val));
pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => parseInt(val, 10));

// Resolve a writable location for the SQLite file. On serverless platforms
// (Netlify Lambda) process.cwd() is read-only, so fall back to /tmp.
function resolveDbFile(): string {
  const preferredDir = path.join(process.cwd(), 'database');
  try {
    fs.mkdirSync(preferredDir, { recursive: true });
    fs.accessSync(preferredDir, fs.constants.W_OK);
    return path.join(preferredDir, 'quincaille.db');
  } catch {
    return path.join(os.tmpdir(), 'quincaille.db');
  }
}

const DB_FILE = resolveDbFile();
let warnedReadOnly = false;

let dbInstance: SqlJsDatabase | null = null;
let pgPoolInstance: pg.Pool | null = null;
let postgresAvailable = false;

export function isPostgres(): boolean {
  return postgresAvailable && Boolean(
    (process.env.SQL_HOST && process.env.SQL_DB_NAME) ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL
  );
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getPgPool(): pg.Pool {
  if (pgPoolInstance) {
    return pgPoolInstance;
  }

  if (process.env.SQL_HOST && process.env.SQL_DB_NAME) {
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
    const connectionString = (
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL || 
      process.env.SUPABASE_DATABASE_URL || 
      process.env.SUPABASE_DB_URL || 
      ''
    ).trim();

    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

    pgPoolInstance = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  pgPoolInstance.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
  });

  return pgPoolInstance;
}

export function formatPgSql(sql: string): string {
  let index = 1;
  // Replace SQLite ? parameters with Postgres $1, $2, $3...
  return sql.replace(/\?/g, () => `$${index++}`);
}

let dbInitPromise: Promise<SqlJsDatabase | null> | null = null;

/**
 * Returns a shared, single-flight initialization promise. Concurrent callers
 * (e.g. an early HTTP request racing background startup) all await the SAME
 * schema+seed run instead of interleaving their own — interleaving caused
 * FOREIGN KEY failures and partially-seeded databases on slow machines/CI.
 */
export function getDb(): Promise<SqlJsDatabase | null> {
  if (!dbInitPromise) {
    dbInitPromise = initializeDb().catch((err) => {
      dbInitPromise = null; // permit a clean retry after a genuine failure
      throw err;
    });
  }
  return dbInitPromise;
}

async function initializeDb(): Promise<SqlJsDatabase | null> {
  const isProd = isProduction();
  const hasSql = Boolean(
    (process.env.SQL_HOST && process.env.SQL_DB_NAME) ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL
  );

  if (hasSql) {
    try {
      const pool = getPgPool();
      await pool.query('SELECT 1');
      postgresAvailable = true;
      console.log('✅ PostgreSQL connection verified successfully — persistent database active.');
      await initPostgresSchemaIfNeeded();
      return null;
    } catch (err: any) {
      const sanitizedMsg = err?.message || String(err);
      console.error(`PostgreSQL connection notice (${sanitizedMsg}).`);
      if (isProd && !process.env.VERCEL) {
        throw new Error(`Production database connection failed: ${sanitizedMsg}`);
      }
      postgresAvailable = false;
      pgPoolInstance = null;
    }
  } else if (isProd || process.env.VERCEL) {
    console.warn('⚠️ [VectOS]: Running without POSTGRES_URL / DATABASE_URL. For production & Vercel deployment, connect Vercel Postgres to ensure data persists permanently across serverless instances.');
  }

  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      const candidates = [
        path.join(process.cwd(), 'api', file),
        path.join(process.cwd(), 'public', file),
        path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
        path.join(__dirname, file),
        path.join(__dirname, '..', file),
        path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file)
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return p;
      }
      return file;
    }
  });

  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const filebuffer = fs.readFileSync(DB_FILE);
      if (filebuffer.length > 0) {
        dbInstance = new SQL.Database(filebuffer);
      } else {
        dbInstance = new SQL.Database();
      }
    } catch (err) {
      console.warn("Warning: Could not read existing database file, starting memory instance.", err);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  try {
    await initSchemaAndSeed(dbInstance);
  } catch (schemaErr) {
    console.warn("Warning: Schema check notice on SQLite instance:", schemaErr);
  }

  saveDb(dbInstance);

  return dbInstance;
}

export function saveDb(dbToSave?: SqlJsDatabase) {
  if (isPostgres()) return;
  const target = dbToSave || dbInstance;
  if (!target) return;
  try {
    const data = target.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    // Read-only filesystem (e.g. serverless without DATABASE_URL): warn once
    // instead of crashing every request. Data will not persist in this mode.
    if (!warnedReadOnly) {
      warnedReadOnly = true;
      console.warn(
        'Warning: Could not persist database file (' + DB_FILE + '). ' +
        'Set DATABASE_URL to a Supabase/PostgreSQL connection string for persistent storage.',
        err
      );
    }
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
    const pgSql = formatPgSql(sql);
    const res = await pool.query(pgSql, params);
    return res.rows as T[];
  }

  const db = await getDb();
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const results = await queryAll<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

export async function execute(sql: string, params: any[] = []): Promise<{ lastInsertId: number; changes: number }> {
  if (isPostgres()) {
    // Use transaction client if inside withTransaction
    const target = pgTxStorage.getStore() || null;
    const doQuery = async (pgSql: string) => {
      if (target) return target.query(pgSql, params);
      return getPgPool().query(pgSql, params);
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

  const db = await getDb();
  if (!db) return { lastInsertId: 0, changes: 0 };
  db.run(sql, params);
  const res = db.exec("SELECT last_insert_rowid() as id, changes() as count");
  let lastInsertId = 0;
  let changes = 0;
  if (res.length > 0 && res[0].values.length > 0) {
    lastInsertId = Number(res[0].values[0][0]);
    changes = Number(res[0].values[0][1]);
  }
  if (!sqlJsTxStorage.getStore()) saveDb(db);
  return { lastInsertId, changes };
}

let postgresSchemaInitialized = false;

// ---------------------------------------------------------------------------
// Transaction helper — atomic multi-statement writes for both engines.
// Usage: await withTransaction(async () => { await execute(...); ... });
// Postgres: BEGIN/COMMIT/ROLLBACK on a dedicated client so all queries
// inside the callback share the same transaction. SQLite: BEGIN IMMEDIATE
// on the single sql.js instance, saveDb only on COMMIT.
// ---------------------------------------------------------------------------
const pgTxStorage = new AsyncLocalStorage<pg.PoolClient>();
const sqlJsTxStorage = new AsyncLocalStorage<boolean>();

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (pgTxStorage.getStore() || sqlJsTxStorage.getStore()) {
    throw new Error('Nested transactions are not supported — use SAVEPOINT or refactor to single transaction');
  }
  if (isPostgres()) {
    const client = await getPgPool().connect();
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
  } else {
    const db = await getDb();
    if (!db) throw new Error('Database not available for transaction');
    return sqlJsTxStorage.run(true, async () => {
      try {
        db.run('BEGIN IMMEDIATE');
        const result = await fn();
        db.run('COMMIT');
        saveDb(db);
        return result;
      } catch (e) {
        try { db.run('ROLLBACK'); } catch {}
        throw e;
      }
    });
  }
}

export async function initPostgresSchemaIfNeeded(): Promise<void> {
  if (!isPostgres() || postgresSchemaInitialized) return;
  const pool = getPgPool();
  try {
    const checkTable = await pool.query(`SELECT to_regclass('public.users') as exists;`);
    if (!checkTable.rows[0] || !checkTable.rows[0].exists) {
      console.log('Initializing PostgreSQL schema...');
      const schemaSqlPath = path.join(process.cwd(), 'database-schema.sql');
      if (fs.existsSync(schemaSqlPath)) {
        const sqlContent = fs.readFileSync(schemaSqlPath, 'utf-8');
        await pool.query(sqlContent);
      }
    }
  } catch (err: any) {
    console.warn('Notice on PostgreSQL initial table check:', err?.message || err);
  }

  // Always ensure recent columns & auxiliary tables exist safely
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
  postgresSchemaInitialized = true;
}


export async function migrateUsersTableIfNeeded(db: SqlJsDatabase | null): Promise<void> {
  if (isPostgres() || !db) return;
  try {
    const tableDefRes = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
    if (tableDefRes.length > 0 && tableDefRes[0].values.length > 0) {
      const tableSql = String(tableDefRes[0].values[0][0]);
      // If table definition has a restrictive role check that blocks 'superadmin'
      if (
        tableSql.includes("CHECK(role IN") || 
        tableSql.includes("CHECK (role IN") || 
        (tableSql.includes("role IN") && !tableSql.includes("'superadmin'"))
      ) {
        console.log("Migrating users table schema to support 'superadmin' role...");
        db.run("PRAGMA foreign_keys = OFF;");
        db.run("ALTER TABLE users RENAME TO users_legacy_check;");
        db.run(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER,
            stock_id INTEGER,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'employee',
            job_title TEXT DEFAULT 'Operations Staff',
            phone TEXT,
            is_active INTEGER DEFAULT 1,
            activation_status TEXT DEFAULT 'active' CHECK(activation_status IN ('active', 'pending_approval', 'suspended')),
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
            FOREIGN KEY (stock_id) REFERENCES stocks(id)
          );
        `);
        const colsRes = db.exec("PRAGMA table_info(users_legacy_check)");
        if (colsRes.length > 0 && colsRes[0].values.length > 0) {
          const oldCols = colsRes[0].values.map((v: any[]) => String(v[1]));
          const allNewCols = [
            'id', 'shop_id', 'stock_id', 'name', 'email', 'password', 'role', 'job_title', 'phone', 
            'is_active', 'activation_status', 'activation_note', 'can_create_orders', 'can_process_payments', 
            'can_release_stock', 'can_manage_stock', 'can_import_export_stock', 'can_partner_borrow', 
            'can_view_reports', 'can_view_buying_prices', 'can_give_discounts', 'can_manage_users', 
            'can_print_full_receipt', 'can_print_delivery_note', 'can_manage_customers', 
            'can_manage_partners', 'can_void_orders', 'can_edit_company_settings', 'created_at'
          ];
          const commonCols = allNewCols.filter(c => oldCols.includes(c));
          const colsStr = commonCols.join(', ');
          db.run(`INSERT INTO users (${colsStr}) SELECT ${colsStr} FROM users_legacy_check;`);
        }
        db.run("DROP TABLE users_legacy_check;");
        db.run("PRAGMA foreign_keys = ON;");
      }
    }
  } catch (migErr) {
    console.error("Error migrating users table schema:", migErr);
  }
}

export async function ensureAdminAccounts(dbToUse?: SqlJsDatabase | null): Promise<void> {
  const adminPass = await bcrypt.hash('password123', 10);
  const primaryEmail = 'rwemera30@gmail.com';

  if (isPostgres()) {
    try {
      const existing = await queryOne('SELECT id FROM users WHERE LOWER(TRIM(email)) = ? OR LOWER(TRIM(email)) = ? OR LOWER(TRIM(email)) = ? OR LOWER(TRIM(email)) = ?', [primaryEmail, 'admin@vectos.rw', 'admin@vectos.co.rw', 'admin@quincaille.rw']);
      if (existing) {
        await execute(`
          UPDATE users SET email = ?, password = ?, is_active = 1, activation_status = 'active', role = 'superadmin', name = 'Rwemera Platform Administrator',
              can_create_orders = 1, can_process_payments = 1, can_release_stock = 1, can_manage_stock = 1,
              can_import_export_stock = 1, can_partner_borrow = 1, can_view_reports = 1, can_view_buying_prices = 1,
              can_give_discounts = 1, can_manage_users = 1, can_print_full_receipt = 1, can_print_delivery_note = 1,
              can_manage_customers = 1, can_manage_partners = 1, can_void_orders = 1, can_edit_company_settings = 1,
              can_view_audit_trail = 1, can_reset_passwords = 1, can_view_all_tenants = 1, can_manage_subscriptions = 1
          WHERE id = ?`, [primaryEmail, adminPass, existing.id]);
      } else {
        await execute(`
          INSERT INTO users (name, email, password, role, job_title, phone, is_active, activation_status,
            can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow,
            can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note,
            can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions)
          VALUES (?, ?, ?, 'superadmin', 'Platform Administrator', '+250 788 000 000', 1, 'active', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)`,
          ['Rwemera Platform Administrator', primaryEmail, adminPass]);
      }
    } catch (err) {
      console.error('Error in ensureAdminAccounts (PG):', err);
    }
    return;
  }

  const db = dbToUse || (await getDb());
  if (!db) return;
  try {
    await migrateUsersTableIfNeeded(db);

    const res = db.exec(`SELECT id FROM users WHERE LOWER(TRIM(email)) IN ('${primaryEmail}', 'admin@vectos.rw', 'admin@vectos.co.rw', 'admin@quincaille.rw')`);
    if (res.length > 0 && res[0].values.length > 0) {
      const existingId = res[0].values[0][0];
      db.run(`
        UPDATE users 
        SET email = ?, password = ?, is_active = 1, activation_status = 'active', role = 'superadmin', name = 'Rwemera Platform Administrator',
            can_create_orders = 1, can_process_payments = 1, can_release_stock = 1, can_manage_stock = 1,
            can_import_export_stock = 1, can_partner_borrow = 1, can_view_reports = 1, can_view_buying_prices = 1,
            can_give_discounts = 1, can_manage_users = 1, can_print_full_receipt = 1, can_print_delivery_note = 1,
            can_manage_customers = 1, can_manage_partners = 1, can_void_orders = 1, can_edit_company_settings = 1,
            can_view_audit_trail = 1, can_reset_passwords = 1, can_view_all_tenants = 1, can_manage_subscriptions = 1
        WHERE id = ?
      `, [primaryEmail, adminPass, existingId]);
    } else {
      db.run(`
        INSERT INTO users (name, email, password, role, job_title, phone, is_active, activation_status,
          can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow,
          can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note,
          can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions)
        VALUES (?, ?, ?, 'superadmin', 'Platform Administrator', '+250 788 000 000', 1, 'active', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
      `, [
        'Rwemera Platform Administrator',
        primaryEmail,
        adminPass
      ]);
    }

    saveDb(db);
  } catch (err) {
    console.error("Error in ensureAdminAccounts:", err);
  }
}

async function initSchemaAndSeed(db: SqlJsDatabase) {
  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON;");

  db.run(`
    -- 0. SHOPS / HARDWARE & TECH STORES (Multi-Tenancy)
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
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'suspended')),
      business_type TEXT DEFAULT 'Hardware & Construction',
      subscription_plan TEXT DEFAULT 'Starter Business (RWF 20,000/mo)',
      billed_accounts INTEGER DEFAULT 1,
      billed_stocks INTEGER DEFAULT 1,
      monthly_fee REAL DEFAULT 20000.0,
      billing_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 0.1 STOCKS / WAREHOUSES & BRANCH LOCATIONS
    CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      location TEXT,
      manager_name TEXT,
      phone TEXT,
      is_main INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'pending_approval', 'inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
    );

    -- 1. USERS (SuperAdmin, Managers, and Granular Permission Employees)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER,
      stock_id INTEGER,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      job_title TEXT DEFAULT 'Operations Staff',
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      activation_status TEXT DEFAULT 'active' CHECK(activation_status IN ('active', 'pending_approval', 'suspended')),
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
      twofa_secret TEXT,
      twofa_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_id) REFERENCES stocks(id)
    );

    -- 2. PRODUCTS (Construction, Hardware & Tech Materials)
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1,
      stock_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      sku TEXT,
      barcode TEXT,
      category TEXT NOT NULL,
      unit TEXT DEFAULT 'pcs',
      buying_price REAL NOT NULL CHECK(buying_price >= 0),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      low_stock_threshold INTEGER DEFAULT 10,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_id) REFERENCES stocks(id)
    );

    -- 3. CUSTOMERS (Construction Contractors & Individuals)
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      id_number TEXT,
      email TEXT,
      address TEXT,
      credit_balance REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
    );

    -- 4. PARTNER SHOPS (External Hardware Suppliers for Sourcing)
    CREATE TABLE IF NOT EXISTS partner_shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      current_balance REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
    );

    -- 5. ORDERS (Header records)
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1,
      stock_id INTEGER DEFAULT 1,
      order_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL,
      salesperson_id INTEGER NOT NULL,
      total_amount REAL DEFAULT 0.0,
      paid_amount REAL DEFAULT 0.0,
      debt_amount REAL DEFAULT 0.0,
      payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid', 'partial', 'debt')),
      fulfillment_status TEXT DEFAULT 'pending_store' CHECK(fulfillment_status IN ('pending_accountant', 'pending_store', 'resolving_rejected', 'completed', 'cancelled')),
      notes TEXT,
      client_ref TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_id) REFERENCES stocks(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (salesperson_id) REFERENCES users(id)
    );

    -- 6. ORDER ITEMS
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      buying_price REAL NOT NULL,
      selling_price REAL NOT NULL CHECK(selling_price >= 0),
      subtotal REAL NOT NULL,
      profit REAL NOT NULL,
      fulfillment_source TEXT DEFAULT 'Store',
      item_status TEXT DEFAULT 'pending_store' CHECK(item_status IN ('pending_store', 'approved', 'rejected', 'partner_fulfilled', 'unavailable')),
      rejection_reason TEXT,
      partner_shop_id INTEGER,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (partner_shop_id) REFERENCES partner_shops(id)
    );

    -- 7. PAYMENTS
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1,
      order_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'momo', 'bank_transfer', 'debt_credit')),
      reference_no TEXT,
      recorded_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (recorded_by) REFERENCES users(id)
    );

    -- 8. INVENTORY MOVEMENTS
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1,
      stock_id INTEGER DEFAULT 1,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('Stock Received', 'Sale', 'Adjustment', 'Damage', 'Return', 'Transfer In', 'Transfer Out')),
      reference TEXT,
      performed_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_id) REFERENCES stocks(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (performed_by) REFERENCES users(id)
    );

    -- 9. AUDIT LOGS
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER DEFAULT 1,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Safe schema migrations for existing columns
  const migrationQueries = [
    "ALTER TABLE shops ADD COLUMN business_type TEXT DEFAULT 'Hardware & Construction';",
    "ALTER TABLE shops ADD COLUMN receipt_footer_text TEXT DEFAULT 'Thank you for choosing us! Goods once sold in good condition are not returnable.';",
    "ALTER TABLE shops ADD COLUMN billed_accounts INTEGER DEFAULT 1;",
    "ALTER TABLE shops ADD COLUMN billed_stocks INTEGER DEFAULT 1;",
    "ALTER TABLE shops ADD COLUMN monthly_fee REAL DEFAULT 20000.0;",
    "ALTER TABLE shops ADD COLUMN billing_notes TEXT;",
    "ALTER TABLE users ADD COLUMN shop_id INTEGER;",
    "ALTER TABLE users ADD COLUMN stock_id INTEGER;",
    "ALTER TABLE users ADD COLUMN job_title TEXT DEFAULT 'Operations Staff';",
    "ALTER TABLE users ADD COLUMN activation_status TEXT DEFAULT 'active';",
    "ALTER TABLE users ADD COLUMN activation_note TEXT;",
    "ALTER TABLE users ADD COLUMN can_create_orders INTEGER DEFAULT 1;",
    "ALTER TABLE users ADD COLUMN can_process_payments INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_release_stock INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_manage_stock INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_import_export_stock INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_partner_borrow INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_view_reports INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_view_buying_prices INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_give_discounts INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_manage_users INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_print_full_receipt INTEGER DEFAULT 1;",
    "ALTER TABLE users ADD COLUMN can_print_delivery_note INTEGER DEFAULT 1;",
    "ALTER TABLE users ADD COLUMN can_manage_customers INTEGER DEFAULT 1;",
    "ALTER TABLE users ADD COLUMN can_manage_partners INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_void_orders INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_edit_company_settings INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_view_audit_trail INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_reset_passwords INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_view_all_tenants INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN can_manage_subscriptions INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN force_password_change INTEGER DEFAULT 0;",
    "ALTER TABLE customers ADD COLUMN id_number TEXT;",
    "ALTER TABLE customers ADD COLUMN shop_id INTEGER DEFAULT 1;",
    "ALTER TABLE products ADD COLUMN shop_id INTEGER DEFAULT 1;",
    "ALTER TABLE products ADD COLUMN stock_id INTEGER DEFAULT 1;",
    "ALTER TABLE partner_shops ADD COLUMN shop_id INTEGER DEFAULT 1;",
    "ALTER TABLE orders ADD COLUMN shop_id INTEGER DEFAULT 1;",
    "ALTER TABLE orders ADD COLUMN stock_id INTEGER DEFAULT 1;",
    "ALTER TABLE orders ADD COLUMN payment_approved_by INTEGER;",
    "ALTER TABLE orders ADD COLUMN payment_approved_at DATETIME;",
    "ALTER TABLE orders ADD COLUMN stock_released_by INTEGER;",
    "ALTER TABLE orders ADD COLUMN stock_released_at DATETIME;",
    "ALTER TABLE payments ADD COLUMN shop_id INTEGER DEFAULT 1;",
    "ALTER TABLE inventory_movements ADD COLUMN shop_id INTEGER DEFAULT 1;",
    "ALTER TABLE inventory_movements ADD COLUMN stock_id INTEGER DEFAULT 1;",
    "ALTER TABLE audit_logs ADD COLUMN shop_id INTEGER DEFAULT 1;",
    // Security & feature migrations
    "ALTER TABLE users ADD COLUMN twofa_secret TEXT;",
    "ALTER TABLE users ADD COLUMN twofa_enabled INTEGER DEFAULT 0;",
    "ALTER TABLE products ADD COLUMN barcode TEXT;",
    "ALTER TABLE orders ADD COLUMN client_ref TEXT;",
    `CREATE TABLE IF NOT EXISTS login_throttle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity TEXT UNIQUE NOT NULL,
      attempts INTEGER DEFAULT 0,
      locked_until DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS stock_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      from_stock_id INTEGER NOT NULL,
      to_stock_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      transferred_by INTEGER NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
      FOREIGN KEY (from_stock_id) REFERENCES stocks(id),
      FOREIGN KEY (to_stock_id) REFERENCES stocks(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (transferred_by) REFERENCES users(id)
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shop_sku ON products(shop_id, sku) WHERE sku IS NOT NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shop_client_ref ON orders(shop_id, client_ref) WHERE client_ref IS NOT NULL;`,
    `DROP INDEX IF EXISTS idx_customers_shop_phone;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shop_phone ON customers(shop_id, phone) WHERE phone IS NOT NULL AND phone != '';`
  ];

  for (const q of migrationQueries) {
    try {
      db.run(q);
    } catch (e) {
      // Column already exists, safe to ignore
    }
  }

  // --- SEEDING INITIAL DATA (Clean Slate) ---

  // 0. Seed Default Active Shop if none exists
  const shopCheck = db.exec("SELECT COUNT(*) FROM shops");
  if (shopCheck.length === 0 || Number(shopCheck[0].values[0][0]) === 0) {
    db.run(`
      INSERT INTO shops (id, name, code, owner_name, phone, email, location, status, subscription_plan)
      VALUES (1, 'VectOS Main Store', 'main', 'Administrator', '+250 788 000 000', 'rwemera30@gmail.com', 'Kigali, Rwanda', 'active', 'Standard Store');
    `);
  }

  // 0.1 Seed Default Stock Location if none exists
  try {
    const stockCount = db.exec("SELECT COUNT(*) FROM stocks");
    if (stockCount.length === 0 || Number(stockCount[0].values[0][0]) === 0) {
      db.run(`
        INSERT INTO stocks (id, shop_id, name, code, location, manager_name, is_main, status)
        VALUES (1, 1, 'Main Warehouse', 'WH-01', 'Kigali Central', 'Store Manager', 1, 'active');
      `);
    }
  } catch (e) {
    // ignore
  }

  // 1. Ensure Platform Administrator exists (No fake staff accounts)
  await ensureAdminAccounts(db);
}
