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

  const connectionString = (
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
  const dbUrl = (
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    ''
  ).trim();

  // Strict P0-1 Requirement: In production, PostgreSQL DATABASE_URL is mandatory
  if (isProd) {
    if (!dbUrl) {
      const errMsg = 'FATAL [VectOS]: NODE_ENV=production requires a valid PostgreSQL DATABASE_URL. Ephemeral in-memory database fallback is strictly prohibited in production.';
      console.error(errMsg);
      throw new Error('Production configuration error: DATABASE_URL is missing. Production mode requires a persistent PostgreSQL database.');
    }

    try {
      const pool = getPgPool();
      await pool.query('SELECT 1');
      postgresAvailable = true;
      console.log('✅ PostgreSQL production connection verified successfully.');
      await initPostgresSchemaIfNeeded();
      return null;
    } catch (err: any) {
      const sanitizedMsg = err?.message || String(err);
      console.error(`FATAL [VectOS]: Production PostgreSQL connection failed (${sanitizedMsg}). Refusing to fall back to in-memory storage.`);
      throw new Error(`Production database connection failed: ${sanitizedMsg}`);
    }
  }

  if (isPostgres()) {
    // In Postgres mode, ensure tables exist
    await initPostgresSchemaIfNeeded();
    return null;
  }

  // Development/Test mode: If DATABASE_URL is set, test connectivity
  if (!postgresAvailable && dbUrl) {
    try {
      const pool = getPgPool();
      await pool.query('SELECT 1');
      postgresAvailable = true;
      console.log('PostgreSQL connection successful — using remote database.');
      await initPostgresSchemaIfNeeded();
      return null;
    } catch (err) {
      const msg = (err as Error).message || String(err);
      console.warn('PostgreSQL unreachable in development (' + msg + '), falling back to local SQLite.');
      postgresAvailable = false;
      pgPoolInstance = null;
      // Fall through to local SQLite below in development
    }
  }

  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs();

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
      console.warn("Warning: Database file was corrupted or malformed. Re-creating a fresh database instance...", err);
      try {
        fs.unlinkSync(DB_FILE);
      } catch (e) {
        // ignore deletion error
      }
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  try {
    await initSchemaAndSeed(dbInstance);
  } catch (schemaErr) {
    console.warn("Warning: Error initializing schema on existing DB. Re-creating fresh database...", schemaErr);
    dbInstance = new SQL.Database();
    await initSchemaAndSeed(dbInstance);
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
  try {
    const pool = getPgPool();
    const checkTable = await pool.query(`
      SELECT to_regclass('public.users') as exists;
    `);

    if (!checkTable.rows[0] || !checkTable.rows[0].exists) {
      console.log('Initializing Supabase PostgreSQL schema...');
      const schemaSqlPath = path.join(process.cwd(), 'supabase-schema.sql');
      if (fs.existsSync(schemaSqlPath)) {
        const sqlContent = fs.readFileSync(schemaSqlPath, 'utf-8');
        try {
          await pool.query(sqlContent);
        } catch (e: any) {
          // Handle concurrent CREATE EXTENSION race (IF NOT EXISTS is not fully concurrent-safe)
          if (String(e.message).includes('pg_extension_name_index') || String(e.message).includes('already exists')) {
            console.log('Extension already exists (concurrent init), continuing schema init');
          } else {
            throw e;
          }
        }
        console.log('Supabase PostgreSQL schema and seed data loaded successfully!');
      }
    }
    // Ensure stock_transfers exists on existing DBs (added after initial schema)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id SERIAL PRIMARY KEY,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        from_stock_id INTEGER NOT NULL REFERENCES stocks(id),
        to_stock_id INTEGER NOT NULL REFERENCES stocks(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        transferred_by INTEGER NOT NULL REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_throttle (
        id SERIAL PRIMARY KEY,
        identity TEXT UNIQUE NOT NULL,
        attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shop_sku ON products(shop_id, sku) WHERE sku IS NOT NULL;`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shop_client_ref ON orders(shop_id, client_ref) WHERE client_ref IS NOT NULL;`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shop_phone ON customers(shop_id, phone);`);
    postgresSchemaInitialized = true;
  } catch (err) {
    console.error('Error auto-initializing PostgreSQL schema:', err);
  }
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
  // PostgreSQL path uses queryOne/execute, not sql.js db.exec
  if (isPostgres()) {
    try {
      const adminPass = await bcrypt.hash('password123', 10);
      const existing = await queryOne('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', ['admin@vectos.co.rw']);
      if (existing) {
        await execute(`
          UPDATE users SET password = ?, is_active = 1, activation_status = 'active', role = 'superadmin', name = 'VectOS Super Admin',
              can_create_orders = 1, can_process_payments = 1, can_release_stock = 1, can_manage_stock = 1,
              can_import_export_stock = 1, can_partner_borrow = 1, can_view_reports = 1, can_view_buying_prices = 1,
              can_give_discounts = 1, can_manage_users = 1, can_print_full_receipt = 1, can_print_delivery_note = 1,
              can_manage_customers = 1, can_manage_partners = 1, can_void_orders = 1, can_edit_company_settings = 1
          WHERE LOWER(TRIM(email)) = ?`, [adminPass, 'admin@vectos.co.rw']);
      } else {
        const old = await queryOne('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', ['admin@quincaille.rw']);
        if (old) {
          await execute(`
            UPDATE users SET email = 'admin@vectos.co.rw', password = ?, is_active = 1, activation_status = 'active', role = 'superadmin', name = 'VectOS Super Admin',
                can_create_orders = 1, can_process_payments = 1, can_release_stock = 1, can_manage_stock = 1,
                can_import_export_stock = 1, can_partner_borrow = 1, can_view_reports = 1, can_view_buying_prices = 1,
                can_give_discounts = 1, can_manage_users = 1, can_print_full_receipt = 1, can_print_delivery_note = 1,
                can_manage_customers = 1, can_manage_partners = 1, can_void_orders = 1, can_edit_company_settings = 1
            WHERE LOWER(TRIM(email)) = ?`, [adminPass, 'admin@quincaille.rw']);
        } else {
          await execute(`
            INSERT INTO users (name, email, password, role, job_title, phone, is_active, activation_status,
              can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow,
              can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings)
            VALUES (?, ?, ?, 'superadmin', 'Platform Owner & Administrator', '+250 788 000 999', 1, 'active', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)`,
            ['VectOS Super Admin', 'admin@vectos.co.rw', adminPass]);
        }
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
    const adminPass = await bcrypt.hash('password123', 10);
    
    // Check if admin@vectos.co.rw exists
    const res = db.exec("SELECT id, email, password, is_active, role FROM users WHERE LOWER(TRIM(email)) = 'admin@vectos.co.rw'");
    if (res.length > 0 && res[0].values.length > 0) {
      // User exists, make sure they are active, role is superadmin, password is set, and have all admin permissions
      db.run(`
        UPDATE users 
        SET password = ?, is_active = 1, activation_status = 'active', role = 'superadmin', name = 'VectOS Super Admin',
            can_create_orders = 1, can_process_payments = 1, can_release_stock = 1, can_manage_stock = 1,
            can_import_export_stock = 1, can_partner_borrow = 1, can_view_reports = 1, can_view_buying_prices = 1,
            can_give_discounts = 1, can_manage_users = 1, can_print_full_receipt = 1, can_print_delivery_note = 1,
            can_manage_customers = 1, can_manage_partners = 1, can_void_orders = 1, can_edit_company_settings = 1
        WHERE LOWER(TRIM(email)) = 'admin@vectos.co.rw'
      `, [adminPass]);
    } else {
      // Also check if admin@quincaille.rw exists and migrate or insert
      const resOld = db.exec("SELECT id FROM users WHERE LOWER(TRIM(email)) = 'admin@quincaille.rw'");
      if (resOld.length > 0 && resOld[0].values.length > 0) {
        db.run(`
          UPDATE users 
          SET email = 'admin@vectos.co.rw', password = ?, is_active = 1, activation_status = 'active', role = 'superadmin', name = 'VectOS Super Admin',
              can_create_orders = 1, can_process_payments = 1, can_release_stock = 1, can_manage_stock = 1,
              can_import_export_stock = 1, can_partner_borrow = 1, can_view_reports = 1, can_view_buying_prices = 1,
              can_give_discounts = 1, can_manage_users = 1, can_print_full_receipt = 1, can_print_delivery_note = 1,
              can_manage_customers = 1, can_manage_partners = 1, can_void_orders = 1, can_edit_company_settings = 1
          WHERE LOWER(TRIM(email)) = 'admin@quincaille.rw'
        `, [adminPass]);
      } else {
        // Insert admin@vectos.co.rw — a PLATFORM superadmin belongs to no shop
        // (shop_id stays NULL). Hardcoding shop_id = 1 here caused a FOREIGN
        // KEY failure on freshly-initialized databases where shop 1 did not
        // exist yet, aborting the entire seed process.
        db.run(`
          INSERT INTO users (name, email, password, role, job_title, phone, is_active, activation_status,
            can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow,
            can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings)
          VALUES (?, ?, ?, 'superadmin', 'Platform Owner & Administrator', '+250 788 000 999', 1, 'active', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
        `, [
          'VectOS Super Admin',
          'admin@vectos.co.rw',
          adminPass
        ]);
      }
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
    "ALTER TABLE customers ADD COLUMN id_number TEXT;",
    "ALTER TABLE customers ADD COLUMN shop_id INTEGER DEFAULT 1;",
    "ALTER TABLE products ADD COLUMN shop_id INTEGER DEFAULT 1;",
    "ALTER TABLE products ADD COLUMN stock_id INTEGER DEFAULT 1;",
    "ALTER TABLE partner_shops ADD COLUMN shop_id INTEGER DEFAULT 1;",
    "ALTER TABLE orders ADD COLUMN shop_id INTEGER DEFAULT 1;",
    "ALTER TABLE orders ADD COLUMN stock_id INTEGER DEFAULT 1;",
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
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shop_phone ON customers(shop_id, phone);`
  ];

  for (const q of migrationQueries) {
    try {
      db.run(q);
    } catch (e) {
      // Column already exists, safe to ignore
    }
  }

  // --- SEEDING INITIAL DATA ---

  // 0. Seed Default Active Shop & Secondary Shop
  const shopCheck = db.exec("SELECT COUNT(*) FROM shops");
  if (shopCheck.length === 0 || Number(shopCheck[0].values[0][0]) === 0) {
    db.run(`
      INSERT INTO shops (id, name, code, owner_name, phone, email, location, tin_number, status, subscription_plan)
      VALUES (1, 'Quincaille Kigali Central Depot', 'central', 'Jean-Luc Hakizimana', '+250 788 100 001', 'manager@quincaille.rw', 'Gikondo Industrial Zone, Kigali', '100234567', 'active', 'Enterprise Multi-Store');
    `);

    db.run(`
      INSERT INTO shops (id, name, code, owner_name, phone, email, location, tin_number, status, subscription_plan)
      VALUES (2, 'Kwizera & Sons Hardware Ltd', 'kwizera', 'Kwizera Eric', '+250 788 555 123', 'kwizera@hardware.rw', 'Nyabugogo Hardware Center, Kigali', '109876543', 'active', 'Standard Depot (RWF 45,000/mo)');
    `);
  }

  // 1. Seed SuperAdmin and Shop Users
  const userCheck = db.exec("SELECT COUNT(*) FROM users");
  if (userCheck.length === 0 || Number(userCheck[0].values[0][0]) === 0) {
    const defaultPassword = await bcrypt.hash('password123', 10);
    
    // SuperAdmin Platform Owner (Has access across all hardware shops & approval rights)
    db.run(`
      INSERT INTO users (name, email, password, role, job_title, phone, is_active, 
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow, 
        can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings) 
      VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
    `, [
      'Platform Super Admin',
      'admin@vectos.co.rw',
      defaultPassword,
      'superadmin',
      'Platform Owner & Administrator',
      '+250 788 000 999'
    ]);

    // Shop 1 Manager (Full store control)
    db.run(`
      INSERT INTO users (shop_id, name, email, password, role, job_title, phone, is_active, 
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow, 
        can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings) 
      VALUES (1, ?, ?, ?, 'manager', 'Store Owner / Manager', ?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
    `, [
      'Jean-Luc Hakizimana',
      'manager@quincaille.rw',
      defaultPassword,
      '+250 788 100 001'
    ]);

    // Shop 1 Staff 1: Salesperson + Cashier combo (illustrates flexible checkboxes!)
    db.run(`
      INSERT INTO users (shop_id, name, email, password, role, job_title, phone, is_active, 
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow, 
        can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings) 
      VALUES (1, ?, ?, ?, 'salesperson', 'Sales & Counter Cashier', ?, 1, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0)
    `, [
      'Marie-Claire Umutoni',
      'sales@quincaille.rw',
      defaultPassword,
      '+250 788 100 002'
    ]);

    // Shop 1 Staff 2: Accountant (Finance, payments, reports, partner reconciliation)
    db.run(`
      INSERT INTO users (shop_id, name, email, password, role, job_title, phone, is_active, 
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow, 
        can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings) 
      VALUES (1, ?, ?, ?, 'accountant', 'Finance & Head Cashier', ?, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0)
    `, [
      'Patrick Nshimiyimana',
      'accountant@quincaille.rw',
      defaultPassword,
      '+250 788 100 003'
    ]);

    // Shop 1 Staff 3: Storekeeper (Warehouse, dispatch, stock entry, quantities-only receipts)
    db.run(`
      INSERT INTO users (shop_id, name, email, password, role, job_title, phone, is_active, 
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow, 
        can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings) 
      VALUES (1, ?, ?, ?, 'storekeeper', 'Warehouse Storekeeper', ?, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0)
    `, [
      'Emmanuel Bizimana',
      'storekeeper@quincaille.rw',
      defaultPassword,
      '+250 788 100 004'
    ]);
  }

  // 1.1 Seed default stock warehouses (after shops so FK succeeds)
  try {
    const stockCount = db.exec("SELECT COUNT(*) FROM stocks");
    if (stockCount.length === 0 || Number(stockCount[0].values[0][0]) === 0) {
      db.run(`
        INSERT INTO stocks (id, shop_id, name, code, location, manager_name, is_main, status)
        VALUES (1, 1, 'Main Gikondo Central Warehouse', 'WH-GIK-01', 'Gikondo Industrial Zone', 'Jean-Luc Hakizimana', 1, 'active');
      `);
      db.run(`
        INSERT INTO stocks (id, shop_id, name, code, location, manager_name, is_main, status)
        VALUES (2, 1, 'Gisozi Hardware Depot (Branch 2)', 'WH-GSZ-02', 'Gisozi Hardware Market', 'Emmanuel Bizimana', 0, 'active');
      `);
      db.run(`
        INSERT INTO stocks (id, shop_id, name, code, location, manager_name, is_main, status)
        VALUES (3, 2, 'Nyabugogo Central Depot', 'WH-NYA-01', 'Nyabugogo Hardware Center', 'Kwizera Eric', 1, 'active');
      `);
    }
  } catch (e) {
    // ignore
  }

  // 1.2 Ensure VectOS SuperAdmin exists (after demo users so count guard doesn't skip them)
  await ensureAdminAccounts(db);

  // 2. Seed Products (Construction materials with fixed buying price)
  const productCheck = db.exec("SELECT COUNT(*) FROM products");
  if (productCheck.length > 0 && Number(productCheck[0].values[0][0]) === 0) {
    const sampleProducts = [
      ['CIMERWA Cement 32.5R (50kg)', 'CEM-325R', 'Cement', 'Bag', 10500, 250, 50, 'High quality Rwandan hydraulic cement for masonry'],
      ['CIMERWA Cement 42.5N Premium (50kg)', 'CEM-425N', 'Cement', 'Bag', 12200, 180, 40, 'High strength cement for structural slabs'],
      ['Deformed Iron Bars 12mm x 12m', 'IB-12MM', 'Steel & Rebar', 'Bar', 11000, 320, 50, 'Fe500 grade steel reinforcement bar'],
      ['Deformed Iron Bars 16mm x 12m', 'IB-16MM', 'Steel & Rebar', 'Bar', 18500, 150, 30, 'Heavy duty steel reinforcement bar'],
      ['Roofing Sheets Gauge 28 Blue (3m)', 'RS-G28-BL', 'Roofing', 'Sheet', 14500, 120, 25, 'Pre-painted corrugated galvanised iron sheet'],
      ['Roofing Sheets Gauge 30 Maroon (3m)', 'RS-G30-MR', 'Roofing', 'Sheet', 11800, 80, 20, 'Versatile color-coated corrugated sheet'],
      ['PVC Pressure Pipe 110mm PN10 (6m)', 'PVC-110MM', 'Plumbing', 'Pipe', 16000, 60, 15, 'High density underground drainage pipe'],
      ['Amandla Weather Guard Paint White (20L)', 'PNT-WG-20L', 'Paint', 'Bucket', 48000, 25, 8, 'Exterior washable weatherguard acrylic paint'],
      ['Roofing Nails Rubber Washer (1kg)', 'NL-RF-1KG', 'Hardware & Fasteners', 'Kg', 2200, 150, 30, 'Galvanised umbrella head roofing nails'],
      ['Lake Sand Washing Clean (10 Tonne Truck)', 'SND-LAKE-10T', 'Aggregates', 'Truck', 140000, 12, 3, 'Washed plaster sand from Lake Kivu'],
      ['Gravel Aggregates 14/20mm (10 Tonne Truck)', 'GRV-20MM-10T', 'Aggregates', 'Truck', 165000, 8, 2, 'Machine crushed hard blue stone aggregates'],
      ['Binding Wire 1.6mm Annealed (25kg Roll)', 'BW-16MM-25KG', 'Hardware & Fasteners', 'Roll', 32000, 20, 5, 'Soft annealed iron wire for rebar tying']
    ];

    for (const prod of sampleProducts) {
      db.run(
        "INSERT INTO products (name, sku, category, unit, buying_price, quantity, low_stock_threshold, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        prod
      );
    }
  }

  // 3. Seed Customers
  const custCheck = db.exec("SELECT COUNT(*) FROM customers");
  if (custCheck.length > 0 && Number(custCheck[0].values[0][0]) === 0) {
    const sampleCustomers = [
      ['Kigali Heights Construction Ltd', '+250 788 333 111', 'contracts@kigaliheights.rw', 'Kacyiru, Kigali', 150000.0],
      ['Inyange Commercial Contractors', '+250 788 444 222', 'inyangebuilder@gmail.com', 'Gikondo Industrial Zone', 0.0],
      ['Eric Mugisha (Individual Builder)', '+250 789 555 333', 'eric.mugisha@gmail.com', 'Nyamirambo, Kigali', 45000.0],
      ['Vision City Villa Developers', '+250 788 666 444', 'procurement@visioncity.rw', 'Gacuriro, Kigali', 0.0]
    ];

    for (const c of sampleCustomers) {
      db.run(
        "INSERT INTO customers (name, phone, email, address, credit_balance) VALUES (?, ?, ?, ?, ?)",
        c
      );
    }
  }

  // 4. Seed Partner Shops
  const partnerCheck = db.exec("SELECT COUNT(*) FROM partner_shops");
  if (partnerCheck.length > 0 && Number(partnerCheck[0].values[0][0]) === 0) {
    const samplePartners = [
      ['Bimaco Hardware Nyabugogo', 'Alain Bimenyimana', '+250 788 777 888', 'Nyabugogo Bus Park Area', 0.0],
      ['Rwanda Building Supplies Gisozi', 'Chantal Uwase', '+250 788 999 000', 'Gisozi Hardware Market', 120000.0],
      ['Muhima Construction Depot', 'Damascene Ndayisaba', '+250 788 222 333', 'Muhima Main Road', 0.0]
    ];

    for (const p of samplePartners) {
      db.run(
        "INSERT INTO partner_shops (name, contact_person, phone, address, current_balance) VALUES (?, ?, ?, ?, ?)",
        p
      );
    }
  }

  // 5. Seed Initial Sample Orders & Order Items
  const orderCheck = db.exec("SELECT COUNT(*) FROM orders");
  if (orderCheck.length > 0 && Number(orderCheck[0].values[0][0]) === 0) {
    // Order 1: Completed Cash Sale
    db.run(`
      INSERT INTO orders (order_number, customer_id, salesperson_id, total_amount, paid_amount, debt_amount, payment_status, fulfillment_status, notes)
      VALUES ('ORD-2026-001', 1, 2, 250000, 250000, 0, 'paid', 'completed', 'Urgent slab pour for Kigali Heights');
    `);
    db.run(`
      INSERT INTO order_items (order_id, product_id, quantity, buying_price, selling_price, subtotal, profit, fulfillment_source, item_status)
      VALUES (1, 1, 20, 10500, 12500, 250000, 40000, 'Store', 'approved');
    `);
    db.run(`
      INSERT INTO payments (order_id, amount, payment_method, reference_no, recorded_by)
      VALUES (1, 250000, 'momo', 'MM-20260804-0982', 3);
    `);
    db.run(`
      INSERT INTO inventory_movements (product_id, quantity, movement_type, reference, performed_by)
      VALUES (1, -20, 'Sale', 'ORD-2026-001', 4);
    `);

    // Order 2: Pending Storekeeper Review
    db.run(`
      INSERT INTO orders (order_number, customer_id, salesperson_id, total_amount, paid_amount, debt_amount, payment_status, fulfillment_status, notes)
      VALUES ('ORD-2026-002', 2, 2, 380000, 200000, 180000, 'partial', 'pending_store', 'Partial payment received; waiting store dispatch');
    `);
    db.run(`
      INSERT INTO order_items (order_id, product_id, quantity, buying_price, selling_price, subtotal, profit, fulfillment_source, item_status)
      VALUES (2, 3, 20, 11000, 13000, 260000, 40000, 'Store', 'pending_store');
    `);
    db.run(`
      INSERT INTO order_items (order_id, product_id, quantity, buying_price, selling_price, subtotal, profit, fulfillment_source, item_status)
      VALUES (2, 5, 8, 14500, 15000, 120000, 4000, 'Store', 'pending_store');
    `);
    db.run(`
      INSERT INTO payments (order_id, amount, payment_method, reference_no, recorded_by)
      VALUES (2, 200000, 'bank_transfer', 'BK-88492019', 3);
    `);
  }
}
