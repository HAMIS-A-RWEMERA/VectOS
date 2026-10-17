var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/database/db.ts
var db_exports = {};
__export(db_exports, {
  ensureAdminAccounts: () => ensureAdminAccounts,
  execute: () => execute,
  formatPgSql: () => formatPgSql,
  getDb: () => getDb,
  getPgPool: () => getPgPool,
  initPostgresSchemaIfNeeded: () => initPostgresSchemaIfNeeded,
  isPostgres: () => isPostgres,
  isProduction: () => isProduction,
  migrateUsersTableIfNeeded: () => migrateUsersTableIfNeeded,
  queryAll: () => queryAll,
  queryOne: () => queryOne,
  saveDb: () => saveDb,
  withTransaction: () => withTransaction
});
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import initSqlJs from "sql.js";
import bcrypt from "bcryptjs";
import pg from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { AsyncLocalStorage } from "node:async_hooks";
function resolveDbFile() {
  const preferredDir = path.join(process.cwd(), "database");
  try {
    fs.mkdirSync(preferredDir, { recursive: true });
    fs.accessSync(preferredDir, fs.constants.W_OK);
    return path.join(preferredDir, "quincaille.db");
  } catch {
    return path.join(os.tmpdir(), "quincaille.db");
  }
}
function isPostgres() {
  return postgresAvailable && Boolean(
    process.env.SQL_HOST && process.env.SQL_DB_NAME || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL
  );
}
function isProduction() {
  return process.env.NODE_ENV === "production";
}
function getPgPool() {
  if (pgPoolInstance) {
    return pgPoolInstance;
  }
  const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
  if (connectionString) {
    const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
    if (connectionString.includes("neon.tech") || connectionString.includes("-pooler")) {
      pgPoolInstance = new NeonPool({
        connectionString,
        max: 10,
        connectionTimeoutMillis: 15e3
      });
    } else {
      pgPoolInstance = new Pool({
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 3e4,
        connectionTimeoutMillis: 1e4
      });
    }
  } else if (process.env.SQL_HOST && process.env.SQL_DB_NAME) {
    const user = process.env.SQL_USER || process.env.SQL_ADMIN_USER || "postgres";
    const password = process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || "";
    const host = process.env.SQL_HOST;
    const port = parseInt(process.env.SQL_PORT || "5432", 10);
    const database = process.env.SQL_DB_NAME;
    pgPoolInstance = new Pool({
      host,
      port,
      user,
      password,
      database,
      ssl: false,
      max: 10,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 15e3
    });
  }
  if (pgPoolInstance) {
    pgPoolInstance.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL client:", err);
    });
  }
  return pgPoolInstance;
}
function formatPgSql(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}
function getDb() {
  if (!dbInitPromise) {
    dbInitPromise = initializeDb().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}
async function initializeDb() {
  const isProd2 = isProduction();
  const hasSql = Boolean(
    process.env.SQL_HOST && process.env.SQL_DB_NAME || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL
  );
  if (hasSql) {
    try {
      const pool = getPgPool();
      await pool.query("SELECT 1");
      postgresAvailable = true;
      console.log("\u2705 PostgreSQL connection verified successfully \u2014 persistent database active.");
      await initPostgresSchemaIfNeeded();
      return null;
    } catch (err) {
      const sanitizedMsg = err?.message || String(err);
      console.error(`PostgreSQL connection notice (${sanitizedMsg}).`);
      if (isProd2 && !process.env.VERCEL) {
        throw new Error(`Production database connection failed: ${sanitizedMsg}`);
      }
      postgresAvailable = false;
      pgPoolInstance = null;
    }
  } else if (isProd2 || process.env.VERCEL) {
    console.warn("\u26A0\uFE0F [VectOS]: Running without POSTGRES_URL / DATABASE_URL. For production & Vercel deployment, connect Vercel Postgres to ensure data persists permanently across serverless instances.");
  }
  if (dbInstance) {
    return dbInstance;
  }
  const SQL = await initSqlJs({
    locateFile: (file) => {
      const candidates = [
        path.join(process.cwd(), "api", file),
        path.join(process.cwd(), "public", file),
        path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
        path.join(__dirname, file),
        path.join(__dirname, "..", file),
        path.join(__dirname, "..", "..", "node_modules", "sql.js", "dist", file)
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
function saveDb(dbToSave) {
  if (isPostgres()) return;
  const target = dbToSave || dbInstance;
  if (!target) return;
  try {
    const data = target.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    if (!warnedReadOnly) {
      warnedReadOnly = true;
      console.warn(
        "Warning: Could not persist database file (" + DB_FILE + "). Set DATABASE_URL to a Supabase/PostgreSQL connection string for persistent storage.",
        err
      );
    }
  }
}
async function queryAll(sql, params = []) {
  if (isPostgres()) {
    const txClient = pgTxStorage.getStore();
    if (txClient) {
      const pgSql2 = formatPgSql(sql);
      const res2 = await txClient.query(pgSql2, params);
      return res2.rows;
    }
    const pool = getPgPool();
    const pgSql = formatPgSql(sql);
    const res = await pool.query(pgSql, params);
    return res.rows;
  }
  const db = await getDb();
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}
async function queryOne(sql, params = []) {
  const results = await queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}
async function execute(sql, params = []) {
  if (isPostgres()) {
    const target = pgTxStorage.getStore() || null;
    const doQuery = async (pgSql2) => {
      if (target) return target.query(pgSql2, params);
      return getPgPool().query(pgSql2, params);
    };
    let pgSql = formatPgSql(sql);
    const isInsert = /^\s*INSERT\s+INTO/i.test(sql);
    const hasReturning = /RETURNING/i.test(sql);
    if (isInsert && !hasReturning) {
      pgSql += " RETURNING id";
    }
    try {
      const res2 = await doQuery(pgSql);
      let lastInsertId2 = 0;
      if (res2.rows && res2.rows.length > 0 && res2.rows[0].id !== void 0) {
        lastInsertId2 = Number(res2.rows[0].id);
      }
      return { lastInsertId: lastInsertId2, changes: res2.rowCount || 0 };
    } catch (err) {
      if (isInsert && !hasReturning && err.message?.includes('column "id" does not exist')) {
        const fallbackSql = formatPgSql(sql);
        const res2 = await doQuery(fallbackSql);
        return { lastInsertId: 0, changes: res2.rowCount || 0 };
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
async function withTransaction(fn) {
  if (pgTxStorage.getStore() || sqlJsTxStorage.getStore()) {
    throw new Error("Nested transactions are not supported \u2014 use SAVEPOINT or refactor to single transaction");
  }
  if (isPostgres()) {
    const client = await getPgPool().connect();
    return pgTxStorage.run(client, async () => {
      try {
        await client.query("BEGIN");
        const result = await fn();
        await client.query("COMMIT");
        return result;
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
        }
        throw e;
      } finally {
        client.release();
      }
    });
  } else {
    const db = await getDb();
    if (!db) throw new Error("Database not available for transaction");
    return sqlJsTxStorage.run(true, async () => {
      try {
        db.run("BEGIN IMMEDIATE");
        const result = await fn();
        db.run("COMMIT");
        saveDb(db);
        return result;
      } catch (e) {
        try {
          db.run("ROLLBACK");
        } catch {
        }
        throw e;
      }
    });
  }
}
async function initPostgresSchemaIfNeeded() {
  if (!isPostgres() || postgresSchemaInitialized) return;
  const pool = getPgPool();
  try {
    const checkTable = await pool.query(`SELECT to_regclass('public.users') as exists;`);
    if (!checkTable.rows[0] || !checkTable.rows[0].exists) {
      console.log("Initializing PostgreSQL schema...");
      const schemaSqlPath = path.join(process.cwd(), "database-schema.sql");
      if (fs.existsSync(schemaSqlPath)) {
        const sqlContent = fs.readFileSync(schemaSqlPath, "utf-8");
        await pool.query(sqlContent);
      }
    }
  } catch (err) {
    console.warn("Notice on PostgreSQL initial table check:", err?.message || err);
  }
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
    }
  }
  try {
    const shopCheck = await pool.query("SELECT COUNT(*) as count FROM shops");
    if (parseInt(shopCheck.rows[0]?.count || "0", 10) === 0) {
      console.log("Seeding initial default store and warehouse in Neon Postgres...");
      await pool.query(`
        INSERT INTO shops (id, name, code, owner_name, phone, email, location, status, subscription_plan)
        VALUES (1, 'VectOS Main Store', 'main', 'Administrator', '+250 788 000 000', 'rwemera30@gmail.com', 'Kigali, Rwanda', 'active', 'Standard Store')
        ON CONFLICT DO NOTHING;
      `);
      try {
        await pool.query(`SELECT setval('shops_id_seq', (SELECT COALESCE(MAX(id), 1) FROM shops));`);
      } catch {
      }
    }
    const stockCheck = await pool.query("SELECT COUNT(*) as count FROM stocks");
    if (parseInt(stockCheck.rows[0]?.count || "0", 10) === 0) {
      await pool.query(`
        INSERT INTO stocks (id, shop_id, name, code, location, manager_name, is_main, status)
        VALUES (1, 1, 'Main Warehouse', 'WH-01', 'Kigali Central', 'Store Manager', 1, 'active')
        ON CONFLICT DO NOTHING;
      `);
      try {
        await pool.query(`SELECT setval('stocks_id_seq', (SELECT COALESCE(MAX(id), 1) FROM stocks));`);
      } catch {
      }
    }
  } catch (seedErr) {
    console.warn("Notice on Postgres initial seeding:", seedErr);
  }
  postgresSchemaInitialized = true;
  await ensureAdminAccounts();
}
async function migrateUsersTableIfNeeded(db) {
  if (isPostgres() || !db) return;
  try {
    const tableDefRes = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
    if (tableDefRes.length > 0 && tableDefRes[0].values.length > 0) {
      const tableSql = String(tableDefRes[0].values[0][0]);
      if (tableSql.includes("CHECK(role IN") || tableSql.includes("CHECK (role IN") || tableSql.includes("role IN") && !tableSql.includes("'superadmin'")) {
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
          const oldCols = colsRes[0].values.map((v) => String(v[1]));
          const allNewCols = [
            "id",
            "shop_id",
            "stock_id",
            "name",
            "email",
            "password",
            "role",
            "job_title",
            "phone",
            "is_active",
            "activation_status",
            "activation_note",
            "can_create_orders",
            "can_process_payments",
            "can_release_stock",
            "can_manage_stock",
            "can_import_export_stock",
            "can_partner_borrow",
            "can_view_reports",
            "can_view_buying_prices",
            "can_give_discounts",
            "can_manage_users",
            "can_print_full_receipt",
            "can_print_delivery_note",
            "can_manage_customers",
            "can_manage_partners",
            "can_void_orders",
            "can_edit_company_settings",
            "created_at"
          ];
          const commonCols = allNewCols.filter((c) => oldCols.includes(c));
          const colsStr = commonCols.join(", ");
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
async function ensureAdminAccounts(dbToUse) {
  const adminPass = await bcrypt.hash("password123", 10);
  const primaryEmail = "rwemera30@gmail.com";
  if (isPostgres()) {
    try {
      const existing = await queryOne("SELECT id FROM users WHERE LOWER(TRIM(email)) = ? OR LOWER(TRIM(email)) = ? OR LOWER(TRIM(email)) = ? OR LOWER(TRIM(email)) = ?", [primaryEmail, "admin@vectos.rw", "admin@vectos.co.rw", "admin@quincaille.rw"]);
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
        await execute(
          `
          INSERT INTO users (name, email, password, role, job_title, phone, is_active, activation_status,
            can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow,
            can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note,
            can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions)
          VALUES (?, ?, ?, 'superadmin', 'Platform Administrator', '+250 788 000 000', 1, 'active', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)`,
          ["Rwemera Platform Administrator", primaryEmail, adminPass]
        );
      }
    } catch (err) {
      console.error("Error in ensureAdminAccounts (PG):", err);
    }
    return;
  }
  const db = dbToUse || await getDb();
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
        "Rwemera Platform Administrator",
        primaryEmail,
        adminPass
      ]);
    }
    saveDb(db);
  } catch (err) {
    console.error("Error in ensureAdminAccounts:", err);
  }
}
async function initSchemaAndSeed(db) {
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
    }
  }
  const shopCheck = db.exec("SELECT COUNT(*) FROM shops");
  if (shopCheck.length === 0 || Number(shopCheck[0].values[0][0]) === 0) {
    db.run(`
      INSERT INTO shops (id, name, code, owner_name, phone, email, location, status, subscription_plan)
      VALUES (1, 'VectOS Main Store', 'main', 'Administrator', '+250 788 000 000', 'rwemera30@gmail.com', 'Kigali, Rwanda', 'active', 'Standard Store');
    `);
  }
  try {
    const stockCount = db.exec("SELECT COUNT(*) FROM stocks");
    if (stockCount.length === 0 || Number(stockCount[0].values[0][0]) === 0) {
      db.run(`
        INSERT INTO stocks (id, shop_id, name, code, location, manager_name, is_main, status)
        VALUES (1, 1, 'Main Warehouse', 'WH-01', 'Kigali Central', 'Store Manager', 1, 'active');
      `);
    }
  } catch (e) {
  }
  await ensureAdminAccounts(db);
}
var envLocalPath, Pool, DB_FILE, warnedReadOnly, dbInstance, pgPoolInstance, postgresAvailable, dbInitPromise, postgresSchemaInitialized, pgTxStorage, sqlJsTxStorage;
var init_db = __esm({
  "server/database/db.ts"() {
    envLocalPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envLocalPath)) {
      dotenv.config({ path: envLocalPath });
    }
    dotenv.config();
    neonConfig.webSocketConstructor = ws;
    ({ Pool } = pg);
    pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val) => parseFloat(val));
    pg.types.setTypeParser(pg.types.builtins.INT8, (val) => parseInt(val, 10));
    DB_FILE = resolveDbFile();
    warnedReadOnly = false;
    dbInstance = null;
    pgPoolInstance = null;
    postgresAvailable = false;
    dbInitPromise = null;
    postgresSchemaInitialized = false;
    pgTxStorage = new AsyncLocalStorage();
    sqlJsTxStorage = new AsyncLocalStorage();
  }
});

// firebase-applet-config.json
var firebase_applet_config_default;
var init_firebase_applet_config = __esm({
  "firebase-applet-config.json"() {
    firebase_applet_config_default = {
      projectId: "gen-lang-client-0003292634",
      appId: "1:1082360688402:web:0a2cd8b461b38db59ecdcb",
      apiKey: "AIzaSyCI75MD_RhsHEi65x3gbOzeCrlsqnOFgME",
      authDomain: "gen-lang-client-0003292634.firebaseapp.com",
      storageBucket: "gen-lang-client-0003292634.firebasestorage.app",
      messagingSenderId: "1082360688402"
    };
  }
});

// src/lib/firebase-admin.ts
var firebase_admin_exports = {};
__export(firebase_admin_exports, {
  adminAuth: () => adminAuth
});
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
var adminAuth;
var init_firebase_admin = __esm({
  "src/lib/firebase-admin.ts"() {
    init_firebase_applet_config();
    if (!getApps().length) {
      initializeApp({
        projectId: firebase_applet_config_default.projectId
      });
    }
    adminAuth = getAuth();
  }
});

// server/app.ts
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import crypto5 from "crypto";
import path4 from "path";
import dotenv2 from "dotenv";

// server/routes/apiRoutes.ts
init_db();
import { Router } from "express";
import crypto3 from "crypto";
import bcrypt2 from "bcryptjs";

// server/database/backup.ts
import crypto from "crypto";
init_db();
var ORDERED_TABLES = [
  "shops",
  "stocks",
  "users",
  "customers",
  "partner_shops",
  "products",
  "orders",
  "order_items",
  "payments",
  "inventory_movements",
  "stock_transfers",
  "audit_logs"
];
async function createBackup(shopId) {
  const data = {};
  const recordsCount = {};
  for (const table of ORDERED_TABLES) {
    let sql = `SELECT * FROM ${table}`;
    const params = [];
    if (shopId && shopId > 0) {
      if (table === "shops") {
        sql += ` WHERE id = ?`;
        params.push(shopId);
      } else if (table === "order_items") {
        sql = `SELECT oi.* FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.shop_id = ?`;
        params.push(shopId);
      } else {
        sql += ` WHERE shop_id = ?`;
        params.push(shopId);
      }
    }
    sql += ` ORDER BY id ASC`;
    const rows = await queryAll(sql, params);
    data[table] = rows;
    recordsCount[table] = rows.length;
  }
  const payloadString = JSON.stringify(data);
  const checksum = crypto.createHash("sha256").update(payloadString).digest("hex");
  const manifest = {
    metadata: {
      version: "1.0",
      generated_at: (/* @__PURE__ */ new Date()).toISOString(),
      engine: isPostgres() ? "postgresql" : "sqlite",
      shop_id: shopId || null,
      tables: ORDERED_TABLES,
      records_count: recordsCount,
      checksum
    },
    data
  };
  return manifest;
}
async function restoreBackup(manifest) {
  if (!manifest || !manifest.metadata || !manifest.data) {
    throw new Error("Invalid backup structure: Missing metadata or data payload.");
  }
  const payloadString = JSON.stringify(manifest.data);
  const calculatedChecksum = crypto.createHash("sha256").update(payloadString).digest("hex");
  if (calculatedChecksum !== manifest.metadata.checksum) {
    throw new Error("Integrity verification failed: Backup payload checksum mismatch.");
  }
  const restoredStats = {};
  await withTransaction(async () => {
    const reverseTables = [...ORDERED_TABLES].reverse();
    for (const table of reverseTables) {
      if (manifest.metadata.shop_id) {
        if (table === "shops") {
          await execute(`DELETE FROM shops WHERE id = ?`, [manifest.metadata.shop_id]);
        } else if (table === "order_items") {
          await execute(
            `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE shop_id = ?)`,
            [manifest.metadata.shop_id]
          );
        } else {
          await execute(`DELETE FROM ${table} WHERE shop_id = ?`, [manifest.metadata.shop_id]);
        }
      } else {
        await execute(`DELETE FROM ${table}`);
      }
    }
    for (const table of ORDERED_TABLES) {
      const records = manifest.data[table] || [];
      restoredStats[table] = 0;
      for (const record of records) {
        const keys = Object.keys(record);
        if (keys.length === 0) continue;
        const placeholders = keys.map(() => "?").join(", ");
        const columns = keys.join(", ");
        const values = keys.map((k) => record[k]);
        const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
        await execute(sql, values);
        restoredStats[table]++;
      }
    }
  });
  return {
    success: true,
    stats: restoredStats
  };
}

// server/auth.ts
init_db();
function isApiRequest(req) {
  return Boolean(
    req.originalUrl?.startsWith("/api") || req.path?.startsWith("/api") || req.xhr || req.headers.accept?.includes("application/json")
  );
}
function handleAuthFailure(req, res, status, title, message, redirectUrl = "/login") {
  if (isApiRequest(req)) {
    return res.status(status).json({ error: message, title, status });
  }
  if (status === 401 && redirectUrl) {
    return res.redirect(redirectUrl);
  }
  return res.status(status).render("error", {
    title,
    message,
    path: req.path
  });
}
async function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return handleAuthFailure(req, res, 401, "Authentication Required", "Please log in to access this resource.", "/login");
  }
  const sessionUser = req.session.user;
  if (sessionUser.role === "superadmin") {
    return next();
  }
  if (!sessionUser.shop_id) {
    return handleAuthFailure(
      req,
      res,
      403,
      "403 Tenant Association Missing",
      "Your user account is not associated with an active store tenant. Please contact VectOS support."
    );
  }
  try {
    const dbCheck = await queryOne(`
      SELECT 
        u.id, u.is_active, u.activation_status, u.role, u.shop_id,
        s.status as shop_status, s.name as shop_name,
        (SELECT is_active FROM users WHERE shop_id = u.shop_id AND role = 'manager' LIMIT 1) as manager_active
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      WHERE u.id = ?
    `, [sessionUser.id]);
    if (!dbCheck) {
      req.session.destroy(() => {
      });
      return handleAuthFailure(req, res, 401, "Account Removed", "User account no longer exists.", "/login?error=User+account+no+longer+exists");
    }
    if (dbCheck.shop_status === "suspended") {
      return handleAuthFailure(
        req,
        res,
        403,
        "Company Subscription Suspended \u2014 VectOS",
        "Your company subscription is currently suspended or past due. Please contact VectOS Administration to renew your account."
      );
    }
    if (dbCheck.shop_status === "pending") {
      return handleAuthFailure(
        req,
        res,
        403,
        "Depot Awaiting VectOS Approval",
        "Your company registration is pending verification and activation by the VectOS Administrator. Access will unlock upon subscription setup."
      );
    }
    if (dbCheck.is_active !== 1 || dbCheck.activation_status === "suspended") {
      return handleAuthFailure(
        req,
        res,
        403,
        "User Account Deactivated",
        "Your individual user account has been suspended or deactivated. Please contact your store manager or VectOS Administrator."
      );
    }
    if (dbCheck.activation_status === "pending_approval") {
      return handleAuthFailure(
        req,
        res,
        403,
        "Account Awaiting SuperAdmin Activation",
        "This user account is pending VectOS SuperAdmin billing activation. Once subscription is confirmed with the VectOS team, it will become active."
      );
    }
    if (dbCheck.role !== "manager" && dbCheck.manager_active === 0) {
      return handleAuthFailure(
        req,
        res,
        403,
        "Company Access Temporarily Blocked",
        "The manager account for this depot is currently deactivated, which has temporarily locked all staff access. Please contact VectOS Platform Support."
      );
    }
    return next();
  } catch (err) {
    console.error("Auth verification error:", err);
    return handleAuthFailure(
      req,
      res,
      503,
      "Service Temporarily Unavailable \u2014 VectOS",
      "Unable to verify your session at this time. Please refresh the page and try again."
    );
  }
}
function requireSuperAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return handleAuthFailure(req, res, 401, "Authentication Required", "Please log in as SuperAdmin.", "/login");
  }
  if (req.session.user.role === "superadmin") {
    return next();
  }
  return handleAuthFailure(
    req,
    res,
    403,
    "403 SuperAdmin Privilege Required",
    "This module is restricted to the platform owner / super administrator."
  );
}
function requireManager(req, res, next) {
  if (!req.session || !req.session.user) {
    return handleAuthFailure(req, res, 401, "Authentication Required", "Please log in to continue.", "/login");
  }
  if (req.session.user.role === "manager" || req.session.user.role === "superadmin" || req.session.user.can_manage_users) {
    return next();
  }
  return handleAuthFailure(
    req,
    res,
    403,
    "403 Manager Access Required",
    "You need Store Manager privileges to manage staff users and access store configuration."
  );
}
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return handleAuthFailure(req, res, 401, "Authentication Required", "Please log in to continue.", "/login");
    }
    const user = req.session.user;
    if (user.role === "superadmin" || user.role === "manager") {
      return next();
    }
    if (user[permission] === 1 || user[permission] === true) {
      return next();
    }
    const humanNames = {
      can_create_orders: "Create Orders & Negotiate Selling Prices",
      can_process_payments: "Process & Confirm Payments / Receivables",
      can_release_stock: "Storekeeper Dispatch & Stock Release",
      can_manage_stock: "Manage Inventory & Stock Movements",
      can_import_export_stock: "Bulk Excel/CSV Import & Stock Export",
      can_partner_borrow: "Resolve Rejected Items & Partner Shop Sourcing",
      can_view_reports: "Financial Reports & Profit Analytics",
      can_view_buying_prices: "View Purchase Costs & Wholesale Profit Margins",
      can_give_discounts: "Authorize Special Client Discounts & Custom Rates",
      can_manage_users: "Manage Staff Roles & Security Checklists",
      can_print_full_receipt: "Print Financial Receipts (with Prices)",
      can_print_delivery_note: "Print Stock Delivery Notes (Quantities Only)",
      can_manage_customers: "Manage Customer Profiles & Credit Balances",
      can_manage_partners: "Manage Partner Shops & Sourcing Accounts",
      can_void_orders: "Void / Cancel Sales Orders & Invoices",
      can_view_audit_trail: "View Internal Audit & Approvals Trail",
      can_reset_passwords: "Reset User Passwords & Override Credentials",
      can_view_all_tenants: "View Cross-Tenant Platform Overview",
      can_manage_subscriptions: "Manage Store Billing & Subscription Modules",
      can_edit_company_settings: "Edit Company Profile & TIN Configuration"
    };
    return handleAuthFailure(
      req,
      res,
      403,
      "403 Specific Permission Required",
      `Your account does not currently have permission to: "${humanNames[permission]}". Please ask your store manager to tick this capability in your user profile.`
    );
  };
}
var requireSalesperson = requirePermission("can_create_orders");
var requireAccountant = requirePermission("can_process_payments");
var requireStorekeeper = requirePermission("can_release_stock");

// server/security.ts
init_db();
import helmet from "helmet";
import crypto2 from "crypto";
var helmetMiddleware = helmet({
  frameguard: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://cdn.tailwindcss.com",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://apis.google.com",
        "https://*.firebaseapp.com",
        "https://*.googleapis.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://unpkg.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: [
        "'self'",
        "https://unpkg.com",
        "https://*.googleapis.com",
        "https://*.firebaseio.com",
        "wss://*.firebaseio.com",
        "https://*.cloudfunctions.net",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://firestore.googleapis.com",
        "https://*.firebaseapp.com"
      ],
      frameSrc: [
        "'self'",
        "https://*.firebaseapp.com",
        "https://accounts.google.com",
        "https://*.google.com"
      ],
      frameAncestors: [
        "'self'",
        "https://*.netlify.app",
        "https://*.aistudio.google.com",
        "https://*.google.com",
        "https://*.run.app",
        "https://*.googleusercontent.com"
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://accounts.google.com", "https://*.firebaseapp.com"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "same-origin" }
});
var CSRF_COOKIE = "vcsrf";
function issueToken() {
  return crypto2.randomBytes(32).toString("hex");
}
function csrfEnsure(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = issueToken();
    const isTest2 = process.env.NODE_ENV === "test" || process.env.VECTOS_NO_LISTEN === "1";
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: isTest2 ? "lax" : "none",
      secure: !isTest2,
      path: "/"
    });
  }
  res.locals.csrfToken = token;
  next();
}
function htmlCsrfInjector(req, res, next) {
  const originalSend = res.send.bind(res);
  let injected = false;
  res.send = function(body) {
    const ctype = res.getHeader("Content-Type");
    if (!injected && typeof body === "string" && ctype && String(ctype).includes("text/html")) {
      injected = true;
      const token = res.locals.csrfToken;
      const hiddenInput = `<input type="hidden" name="_csrf" value="${token}">`;
      const metaTag = `<meta name="csrf-token" content="${token}">`;
      body = body.replace(/<head([^>]*)>/i, (m) => `${m}${metaTag}`);
      if (body.includes("</form>")) {
        body = body.split("</form>").join(`${hiddenInput}</form>`);
      }
    }
    return originalSend(body);
  };
  next();
}
function csrfValidate(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (req.path.startsWith("/api/")) {
    return next();
  }
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const supplied = req.body?._csrf || req.headers["x-csrf-token"];
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    if (!cookieToken || !req.headers["x-csrf-token"] || req.headers["x-csrf-token"] !== cookieToken) {
      return res.status(403).render("error", {
        title: "Security Check Failed",
        message: "Your session token was missing or expired. Please go back, refresh the page, and try again.",
        path: req.path
      });
    }
    return next();
  }
  if (!cookieToken || !supplied || supplied !== cookieToken) {
    return res.status(403).render("error", {
      title: "Security Check Failed",
      message: "Your session token was missing or expired. Please go back, refresh the page, and try again.",
      path: req.path
    });
  }
  next();
}
var MAX_ATTEMPTS = 8;
var WINDOW_MINUTES = 15;
function parseThrottleDate(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const str = String(value);
  if (str.includes("Z") || str.includes("+")) return new Date(str).getTime();
  return (/* @__PURE__ */ new Date(str.replace(" ", "T") + "Z")).getTime();
}
function isLocked(row) {
  if (!row.locked_until) return false;
  return parseThrottleDate(row.locked_until) > Date.now();
}
async function throttleCheck(identity) {
  try {
    const row = await queryOne(
      "SELECT attempts, locked_until FROM login_throttle WHERE identity = ?",
      [identity.toLowerCase()]
    );
    if (row && isLocked(row)) {
      const remaining = Math.ceil(
        (parseThrottleDate(row.locked_until) - Date.now()) / 6e4
      );
      return { ok: false, retryAfterMin: Math.max(1, remaining) };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
async function throttleFail(identity) {
  const id = identity.toLowerCase();
  try {
    const row = await queryOne(
      "SELECT attempts, locked_until, updated_at FROM login_throttle WHERE identity = ?",
      [id]
    );
    const cutoff = new Date(Date.now() - WINDOW_MINUTES * 6e4);
    if (row && isLocked(row)) return;
    const rowUpdated = parseThrottleDate(row?.updated_at);
    const attempts = row && rowUpdated > cutoff.getTime() ? row.attempts + 1 : 1;
    const locked = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + WINDOW_MINUTES * 6e4).toISOString() : null;
    if (row) {
      await execute(
        "UPDATE login_throttle SET attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE identity = ?",
        [attempts, locked, id]
      );
    } else {
      await execute(
        "INSERT INTO login_throttle (identity, attempts, locked_until) VALUES (?, ?, ?)",
        [id, attempts, locked]
      );
    }
  } catch {
  }
}
async function throttleClear(identity) {
  try {
    await execute("DELETE FROM login_throttle WHERE identity = ?", [identity.toLowerCase()]);
  } catch {
  }
}

// server/routes/apiRoutes.ts
var router = Router();
function getTenantShopId(req) {
  const user = req.session?.user;
  if (!user) return null;
  if (user.role === "superadmin") {
    const explicit = Number(req.query.shop_id || req.body?.shop_id);
    if (!isNaN(explicit) && explicit > 0) return explicit;
    return user.shop_id || 1;
  }
  return user.shop_id ? Number(user.shop_id) : null;
}
function requireTenant(req, res, next) {
  const shopId = getTenantShopId(req);
  if (!shopId) {
    return res.status(403).json({
      error: "Tenant Store Association Required: Your session is not linked to an active store depot."
    });
  }
  res.locals.shopId = shopId;
  next();
}
async function logApiAudit(req, action, details, explicitShopId) {
  try {
    const shopId = explicitShopId || getTenantShopId(req) || 1;
    const userId = req.session?.user?.id || null;
    const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
    await execute(
      "INSERT INTO audit_logs (shop_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?)",
      [shopId, userId, action, details, ip]
    );
  } catch (err) {
    console.error("API Audit log error:", err);
  }
}
router.get("/auth/me", async (req, res) => {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!req.session?.user) {
    return res.json({
      user: null,
      shop: null,
      availableShops: [],
      isSuperAdmin: false,
      dbPersistent: isPostgres(),
      isServerless
    });
  }
  const user = req.session.user;
  let shop = null;
  const shopId = user.shop_id || (user.role === "superadmin" ? 1 : null);
  if (shopId) {
    shop = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
  }
  let availableShops = [];
  if (user.role === "superadmin") {
    availableShops = await queryAll("SELECT id, name, code, location, status, subscription_plan FROM shops ORDER BY name ASC");
  }
  res.json({
    user,
    shop,
    availableShops,
    isSuperAdmin: user.role === "superadmin",
    dbPersistent: isPostgres(),
    isServerless
  });
});
router.post("/auth/register", async (req, res) => {
  const { storeName, ownerName, email, password, phone, location } = req.body;
  if (!storeName || !ownerName || !email || !password) {
    return res.status(400).json({ error: "Store Name, Owner Name, Email, and Password are required." });
  }
  const cleanEmail = email.trim().toLowerCase();
  if (password.trim().length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long." });
  }
  try {
    const existingUser = await queryOne("SELECT id FROM users WHERE LOWER(TRIM(email)) = ?", [cleanEmail]);
    if (existingUser) {
      return res.status(409).json({ error: "An account with this email already exists. Please sign in instead." });
    }
    const baseCode = storeName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "store";
    let code = baseCode;
    let codeSuffix = 1;
    while (await queryOne("SELECT id FROM shops WHERE code = ?", [code])) {
      code = `${baseCode}${codeSuffix++}`;
    }
    const hashedPassword = await bcrypt2.hash(password.trim(), 10);
    const storeLocation = location?.trim() || "Kigali, Rwanda";
    const storePhone = phone?.trim() || "+250 788 000 000";
    const result = await withTransaction(async () => {
      const shopRes = await execute(
        `INSERT INTO shops (name, code, owner_name, phone, email, location, status, business_type, subscription_plan)
         VALUES (?, ?, ?, ?, ?, ?, 'active', 'Hardware & Electronics', 'Standard Depot')`,
        [storeName.trim(), code, ownerName.trim(), storePhone, cleanEmail, storeLocation]
      );
      const newShopId = shopRes.lastInsertId;
      const stockRes = await execute(
        `INSERT INTO stocks (shop_id, name, code, location, manager_name, is_main, status)
         VALUES (?, ?, 'WH-01', ?, ?, 1, 'active')`,
        [newShopId, `${storeName.trim()} Main Warehouse`, storeLocation, ownerName.trim()]
      );
      const newStockId = stockRes.lastInsertId;
      const userRes = await execute(
        `INSERT INTO users (
          shop_id, stock_id, name, email, password, role, job_title, phone, is_active, activation_status,
          can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
          can_partner_borrow, can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users,
          can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders,
          can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions,
          force_password_change
        ) VALUES (?, ?, ?, ?, ?, 'manager', 'Store Owner & Manager', ?, 1, 'active', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0)`,
        [newShopId, newStockId, ownerName.trim(), cleanEmail, hashedPassword, storePhone]
      );
      const newUserId = userRes.lastInsertId;
      return { shopId: newShopId, stockId: newStockId, userId: newUserId, code };
    });
    const shop = await queryOne("SELECT * FROM shops WHERE id = ?", [result.shopId]);
    const user = await queryOne("SELECT * FROM users WHERE id = ?", [result.userId]);
    req.session.user = {
      id: user.id,
      shop_id: user.shop_id,
      stock_id: user.stock_id,
      name: user.name,
      email: user.email,
      role: user.role,
      job_title: user.job_title,
      phone: user.phone,
      twofa_enabled: false,
      can_create_orders: true,
      can_process_payments: true,
      can_release_stock: true,
      can_manage_stock: true,
      can_import_export_stock: true,
      can_partner_borrow: true,
      can_view_reports: true,
      can_view_buying_prices: true,
      can_give_discounts: true,
      can_manage_users: true,
      can_print_full_receipt: true,
      can_print_delivery_note: true,
      can_manage_customers: true,
      can_manage_partners: true,
      can_void_orders: true,
      can_edit_company_settings: true,
      can_view_audit_trail: true,
      can_reset_passwords: true,
      can_view_all_tenants: false,
      can_manage_subscriptions: false,
      force_password_change: 0
    };
    await logApiAudit(req, "STORE_REGISTERED", `Store ${storeName} registered by owner ${ownerName} (${cleanEmail})`, result.shopId);
    res.json({
      success: true,
      message: "Store registered successfully!",
      user: req.session.user,
      shop
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: err.message || "Failed to complete store registration." });
  }
});
router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const cleanEmail = email.trim().toLowerCase();
  const throttle = await throttleCheck(cleanEmail);
  if (!throttle.ok) {
    return res.status(429).json({
      error: `Too many failed sign-in attempts. This account is temporarily locked. Try again in about ${throttle.retryAfterMin} minute(s).`
    });
  }
  try {
    if (cleanEmail === "rwemera30@gmail.com" || cleanEmail === "admin@vectos.rw" || cleanEmail === "admin@vectos.co.rw" || cleanEmail === "admin@quincaille.rw") {
      const { ensureAdminAccounts: ensureAdminAccounts2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      await ensureAdminAccounts2();
    }
    const user = await queryOne(
      `SELECT u.*, s.name as shop_name, s.status as shop_status 
       FROM users u 
       LEFT JOIN shops s ON u.shop_id = s.id 
       WHERE LOWER(TRIM(u.email)) = ?`,
      [cleanEmail]
    );
    if (!user) {
      await throttleFail(cleanEmail);
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const isValid = await bcrypt2.compare(password, user.password);
    if (!isValid) {
      await throttleFail(cleanEmail);
      return res.status(401).json({ error: "Invalid email or password" });
    }
    await throttleClear(cleanEmail);
    if (user.is_active === 0 || user.activation_status === "suspended") {
      return res.status(403).json({ error: "Account is deactivated or suspended. Please contact your store manager or administrator." });
    }
    if (user.role !== "superadmin" && user.shop_status === "suspended") {
      return res.status(403).json({ error: "Store subscription is currently suspended. Please contact VectOS Platform Administration." });
    }
    req.session.user = {
      id: user.id,
      shop_id: user.shop_id,
      stock_id: user.stock_id,
      name: user.name,
      email: user.email,
      role: user.role,
      job_title: user.job_title,
      phone: user.phone,
      twofa_enabled: Boolean(user.twofa_enabled),
      can_create_orders: Boolean(user.can_create_orders),
      can_process_payments: Boolean(user.can_process_payments),
      can_release_stock: Boolean(user.can_release_stock),
      can_manage_stock: Boolean(user.can_manage_stock),
      can_import_export_stock: Boolean(user.can_import_export_stock),
      can_partner_borrow: Boolean(user.can_partner_borrow),
      can_view_reports: Boolean(user.can_view_reports),
      can_view_buying_prices: Boolean(user.can_view_buying_prices),
      can_give_discounts: Boolean(user.can_give_discounts),
      can_manage_users: Boolean(user.can_manage_users),
      can_print_full_receipt: Boolean(user.can_print_full_receipt),
      can_print_delivery_note: Boolean(user.can_print_delivery_note),
      can_manage_customers: Boolean(user.can_manage_customers),
      can_manage_partners: Boolean(user.can_manage_partners),
      can_void_orders: Boolean(user.can_void_orders),
      can_edit_company_settings: Boolean(user.can_edit_company_settings),
      can_view_audit_trail: Boolean(user.can_view_audit_trail),
      can_reset_passwords: Boolean(user.can_reset_passwords),
      can_view_all_tenants: Boolean(user.can_view_all_tenants),
      can_manage_subscriptions: Boolean(user.can_manage_subscriptions),
      force_password_change: Number(user.force_password_change || 0)
    };
    let shop = null;
    if (user.shop_id) {
      shop = await queryOne("SELECT * FROM shops WHERE id = ?", [user.shop_id]);
    } else if (user.role === "superadmin") {
      shop = await queryOne("SELECT * FROM shops WHERE id = 1");
    }
    await logApiAudit(req, "USER_LOGIN", `User ${user.name} (${user.email}) logged in.`, user.shop_id || 1);
    res.json({
      success: true,
      user: req.session.user,
      shop
    });
  } catch (err) {
    console.error("Login API error:", err);
    res.status(500).json({ error: err.message || "Internal login processing error" });
  }
});
router.post("/auth/firebase-login", async (req, res) => {
  const { idToken, email, displayName } = req.body;
  if (!idToken && !email) {
    return res.status(400).json({ error: "Authentication payload required" });
  }
  try {
    let verifiedEmail = (email || "").trim().toLowerCase();
    try {
      const { adminAuth: adminAuth2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
      if (idToken) {
        const decoded = await adminAuth2.verifyIdToken(idToken);
        if (decoded.email) {
          verifiedEmail = decoded.email.toLowerCase();
        }
      }
    } catch (tokenErr) {
      console.warn("Firebase token verification note (falling back to payload):", tokenErr);
    }
    if (!verifiedEmail) {
      return res.status(400).json({ error: "Valid email required from Firebase authentication." });
    }
    if (verifiedEmail === "rwemera30@gmail.com" || verifiedEmail === "admin@vectos.rw") {
      const { ensureAdminAccounts: ensureAdminAccounts2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      await ensureAdminAccounts2();
    }
    let user = await queryOne(
      `SELECT u.*, s.name as shop_name, s.status as shop_status 
       FROM users u 
       LEFT JOIN shops s ON u.shop_id = s.id 
       WHERE LOWER(TRIM(u.email)) = ?`,
      [verifiedEmail]
    );
    if (!user) {
      const isSuper = verifiedEmail === "rwemera30@gmail.com";
      const role = isSuper ? "superadmin" : "manager";
      const defaultPass = await bcrypt2.hash(crypto3.randomBytes(16).toString("hex"), 10);
      const name = displayName || (isSuper ? "Rwemera Platform Administrator" : verifiedEmail.split("@")[0]);
      await execute(
        `INSERT INTO users (shop_id, name, email, password, role, is_active, activation_status,
          can_create_orders, can_process_payments, can_release_stock, can_manage_stock,
          can_view_reports, can_manage_users, can_view_all_tenants, can_manage_subscriptions)
         VALUES (?, ?, ?, ?, ?, 1, 'active', 1, 1, 1, 1, 1, ?, ?, ?)`,
        [1, name, verifiedEmail, defaultPass, role, isSuper ? 1 : 0, isSuper ? 1 : 0, isSuper ? 1 : 0]
      );
      user = await queryOne(
        `SELECT u.*, s.name as shop_name, s.status as shop_status 
         FROM users u 
         LEFT JOIN shops s ON u.shop_id = s.id 
         WHERE LOWER(TRIM(u.email)) = ?`,
        [verifiedEmail]
      );
    }
    if (!user || user.is_active === 0 || user.activation_status === "suspended") {
      return res.status(403).json({ error: "Account is deactivated or suspended. Please contact administrator." });
    }
    req.session.user = {
      id: user.id,
      shop_id: user.shop_id,
      stock_id: user.stock_id,
      name: user.name,
      email: user.email,
      role: user.role,
      job_title: user.job_title,
      phone: user.phone,
      twofa_enabled: Boolean(user.twofa_enabled),
      can_create_orders: Boolean(user.can_create_orders),
      can_process_payments: Boolean(user.can_process_payments),
      can_release_stock: Boolean(user.can_release_stock),
      can_manage_stock: Boolean(user.can_manage_stock),
      can_import_export_stock: Boolean(user.can_import_export_stock),
      can_partner_borrow: Boolean(user.can_partner_borrow),
      can_view_reports: Boolean(user.can_view_reports),
      can_view_buying_prices: Boolean(user.can_view_buying_prices),
      can_give_discounts: Boolean(user.can_give_discounts),
      can_manage_users: Boolean(user.can_manage_users),
      can_print_full_receipt: Boolean(user.can_print_full_receipt),
      can_print_delivery_note: Boolean(user.can_print_delivery_note),
      can_manage_customers: Boolean(user.can_manage_customers),
      can_manage_partners: Boolean(user.can_manage_partners),
      can_void_orders: Boolean(user.can_void_orders),
      can_edit_company_settings: Boolean(user.can_edit_company_settings),
      can_view_audit_trail: Boolean(user.can_view_audit_trail),
      can_reset_passwords: Boolean(user.can_reset_passwords),
      can_view_all_tenants: Boolean(user.can_view_all_tenants),
      can_manage_subscriptions: Boolean(user.can_manage_subscriptions),
      force_password_change: Number(user.force_password_change || 0)
    };
    let shop = null;
    if (user.shop_id) {
      shop = await queryOne("SELECT * FROM shops WHERE id = ?", [user.shop_id]);
    } else if (user.role === "superadmin") {
      shop = await queryOne("SELECT * FROM shops WHERE id = 1");
    }
    await logApiAudit(req, "USER_FIREBASE_LOGIN", `User ${user.name} (${user.email}) logged in via Firebase.`, user.shop_id || 1);
    res.json({
      success: true,
      user: req.session.user,
      shop
    });
  } catch (err) {
    console.error("Firebase login API error:", err);
    res.status(500).json({ error: err.message || "Firebase login processing error" });
  }
});
router.post("/auth/change-password", requireAuth, async (req, res) => {
  const user = req.session.user;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required." });
  }
  if (newPassword.trim().length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters long." });
  }
  try {
    const dbUser = await queryOne("SELECT * FROM users WHERE id = ?", [user.id]);
    if (!dbUser) {
      return res.status(404).json({ error: "User account not found." });
    }
    const match = await bcrypt2.compare(currentPassword, dbUser.password);
    if (!match) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    const hashed = await bcrypt2.hash(newPassword.trim(), 10);
    await execute("UPDATE users SET password = ?, force_password_change = 0 WHERE id = ?", [hashed, user.id]);
    await logApiAudit(req, "PASSWORD_CHANGED", `User ${user.name} (${user.email}) successfully changed their account password.`, user.shop_id || 1);
    if (req.session.user) {
      req.session.user.force_password_change = 0;
    }
    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to update password." });
  }
});
router.post("/auth/demo-switch", async (req, res) => {
  return res.status(403).json({ error: "Demo accounts are disabled. Please sign in or register your store." });
});
router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});
router.post("/shops/switch", requireAuth, async (req, res) => {
  const { shop_id } = req.body;
  const user = req.session.user;
  if (user.role !== "superadmin" && user.shop_id !== Number(shop_id)) {
    return res.status(403).json({ error: "Permission denied: Only SuperAdmin can switch store tenant views." });
  }
  const shop = await queryOne("SELECT * FROM shops WHERE id = ?", [Number(shop_id)]);
  if (!shop) {
    return res.status(404).json({ error: "Shop tenant not found" });
  }
  req.session.user.shop_id = shop.id;
  res.json({ success: true, shop });
});
router.get("/dashboard/stats", requireAuth, requireTenant, async (req, res) => {
  const shopId = res.locals.shopId;
  try {
    const isPg = isPostgres();
    const todaySql = isPg ? `SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count 
         FROM orders WHERE shop_id = ? AND created_at >= CURRENT_DATE AND fulfillment_status != 'cancelled'` : `SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count 
         FROM orders WHERE shop_id = ? AND date(created_at) = date('now') AND fulfillment_status != 'cancelled'`;
    const allOrders = await queryAll(
      `SELECT * FROM orders WHERE shop_id = ? ORDER BY created_at DESC LIMIT 10`,
      [shopId]
    );
    const totalSalesRow = await queryOne(
      `SELECT COALESCE(SUM(total_amount), 0) as total_sales, COALESCE(SUM(paid_amount), 0) as total_paid, COALESCE(SUM(debt_amount), 0) as total_debt 
       FROM orders WHERE shop_id = ? AND fulfillment_status != 'cancelled'`,
      [shopId]
    );
    const todaySalesRow = await queryOne(todaySql, [shopId]);
    const lowStockProducts = await queryAll(
      `SELECT * FROM products WHERE shop_id = ? AND quantity <= low_stock_threshold ORDER BY quantity ASC LIMIT 8`,
      [shopId]
    );
    const totalProductsRow = await queryOne(
      `SELECT COUNT(*) as count, COALESCE(SUM(quantity * buying_price), 0) as total_inventory_value FROM products WHERE shop_id = ?`,
      [shopId]
    );
    const totalCustomersRow = await queryOne(
      `SELECT COUNT(*) as count, COALESCE(SUM(credit_balance), 0) as total_receivables FROM customers WHERE shop_id = ?`,
      [shopId]
    );
    const stockLocations = await queryAll(
      `SELECT * FROM stocks WHERE shop_id = ? ORDER BY is_main DESC, name ASC`,
      [shopId]
    );
    const paymentBreakdown = await queryAll(
      `SELECT payment_method, COALESCE(SUM(amount), 0) as total_amount, COUNT(*) as count 
       FROM payments WHERE shop_id = ? GROUP BY payment_method`,
      [shopId]
    );
    const recentTrendSql = isPg ? `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as orders_count 
         FROM orders WHERE shop_id = ? AND fulfillment_status != 'cancelled' 
         GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD') 
         ORDER BY date DESC LIMIT 7` : `SELECT strftime('%Y-%m-%d', created_at) as date, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as orders_count 
         FROM orders WHERE shop_id = ? AND fulfillment_status != 'cancelled' 
         GROUP BY strftime('%Y-%m-%d', created_at) 
         ORDER BY date DESC LIMIT 7`;
    const recentDaysTrend = await queryAll(recentTrendSql, [shopId]);
    res.json({
      todaySales: Number(todaySalesRow?.today_sales || 0),
      todayOrderCount: Number(todaySalesRow?.today_count || 0),
      totalSales: Number(totalSalesRow?.total_sales || 0),
      totalPaid: Number(totalSalesRow?.total_paid || 0),
      totalDebt: Number(totalSalesRow?.total_debt || 0),
      productCount: Number(totalProductsRow?.count || 0),
      inventoryValue: Number(totalProductsRow?.total_inventory_value || 0),
      customerCount: Number(totalCustomersRow?.count || 0),
      totalReceivables: Number(totalCustomersRow?.total_receivables || 0),
      lowStockCount: lowStockProducts.length,
      lowStockProducts,
      recentOrders: allOrders,
      stockLocations,
      paymentBreakdown,
      recentDaysTrend: recentDaysTrend.reverse()
    });
  } catch (err) {
    console.error("Dashboard stats API error:", err);
    res.status(500).json({ error: "Failed to load dashboard metrics" });
  }
});
router.get("/products", requireAuth, requireTenant, async (req, res) => {
  const shopId = res.locals.shopId;
  const search = (req.query.q || "").trim().toLowerCase();
  const category = (req.query.category || "").trim();
  try {
    let sql = `SELECT * FROM products WHERE shop_id = ?`;
    const params = [shopId];
    if (search) {
      sql += ` AND (LOWER(name) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(barcode) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category && category !== "all") {
      sql += ` AND category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY name ASC`;
    const products = await queryAll(sql, params);
    const categories = await queryAll(
      `SELECT DISTINCT category FROM products WHERE shop_id = ? AND category IS NOT NULL AND category != '' ORDER BY category ASC`,
      [shopId]
    );
    res.json({
      products,
      categories: categories.map((c) => c.category)
    });
  } catch (err) {
    console.error("Products API error:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});
router.post("/products", requireAuth, requireTenant, requirePermission("can_manage_stock"), async (req, res) => {
  const shopId = res.locals.shopId;
  const {
    name,
    sku,
    barcode,
    category,
    unit,
    buying_price,
    quantity,
    low_stock_threshold,
    description,
    stock_id
  } = req.body;
  if (!name || Number(buying_price) < 0) {
    return res.status(400).json({ error: "Product name and valid buying price are required" });
  }
  try {
    let finalStockId = stock_id ? Number(stock_id) : 1;
    const stockExists = await queryOne("SELECT id FROM stocks WHERE id = ? AND shop_id = ?", [finalStockId, shopId]);
    if (!stockExists) {
      const mainStock = await queryOne("SELECT id FROM stocks WHERE shop_id = ? AND is_main = 1 LIMIT 1", [shopId]);
      finalStockId = mainStock?.id || 1;
    }
    const finalSku = sku || `SKU-${Date.now().toString().slice(-6)}`;
    const finalThreshold = low_stock_threshold !== void 0 ? Math.max(0, Number(low_stock_threshold)) : 10;
    const finalQty = quantity !== void 0 ? Math.max(0, Number(quantity)) : 0;
    const result = await execute(
      `INSERT INTO products (shop_id, stock_id, name, sku, barcode, category, unit, buying_price, quantity, low_stock_threshold, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        finalStockId,
        name.trim(),
        finalSku.trim(),
        barcode ? barcode.trim() : null,
        category ? category.trim() : "Hardware",
        unit ? unit.trim() : "Pcs",
        Number(buying_price),
        finalQty,
        finalThreshold,
        description ? description.trim() : null
      ]
    );
    await logApiAudit(req, "PRODUCT_CREATED", `Created product ${name} (SKU: ${finalSku}) with ${finalQty} initial units`);
    const created = await queryOne("SELECT * FROM products WHERE id = ? AND shop_id = ?", [result.lastInsertId, shopId]);
    res.json({ success: true, product: created });
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ error: "Failed to create product. Ensure SKU is unique within this store." });
  }
});
router.post("/products/bulk-import", requireAuth, requireTenant, requirePermission("can_import_export_stock"), async (req, res) => {
  const shopId = res.locals.shopId;
  const { products: rawProducts, stock_id } = req.body;
  if (!rawProducts || !Array.isArray(rawProducts) || rawProducts.length === 0) {
    return res.status(400).json({ error: "No products provided for bulk import." });
  }
  try {
    let finalStockId = stock_id ? Number(stock_id) : 1;
    const stockExists = await queryOne("SELECT id FROM stocks WHERE id = ? AND shop_id = ?", [finalStockId, shopId]);
    if (!stockExists) {
      const mainStock = await queryOne("SELECT id FROM stocks WHERE shop_id = ? AND is_main = 1 LIMIT 1", [shopId]);
      finalStockId = mainStock?.id || 1;
    }
    let insertedCount = 0;
    let updatedCount = 0;
    const errors = [];
    await withTransaction(async () => {
      for (let i = 0; i < rawProducts.length; i++) {
        const item = rawProducts[i];
        if (!item.name || typeof item.name !== "string" || !item.name.trim()) {
          errors.push(`Row #${i + 1}: Name is required`);
          continue;
        }
        const name = item.name.trim();
        const sku = item.sku && String(item.sku).trim() || `SKU-${Date.now().toString().slice(-5)}${i.toString().padStart(3, "0")}`;
        const barcode = item.barcode ? String(item.barcode).trim() : null;
        const category = item.category && String(item.category).trim() || "General Hardware";
        const unit = item.unit && String(item.unit).trim() || "Pcs";
        const buying_price = !isNaN(Number(item.buying_price)) && Number(item.buying_price) >= 0 ? Number(item.buying_price) : 0;
        const quantity = !isNaN(Number(item.quantity)) && Number(item.quantity) >= 0 ? Number(item.quantity) : 0;
        const low_stock_threshold = !isNaN(Number(item.low_stock_threshold)) ? Math.max(0, Number(item.low_stock_threshold)) : 10;
        const description = item.description ? String(item.description).trim() : null;
        const existing = await queryOne("SELECT id, quantity FROM products WHERE shop_id = ? AND sku = ?", [shopId, sku]);
        if (existing) {
          await execute(
            `UPDATE products SET name = ?, category = ?, unit = ?, buying_price = ?, quantity = quantity + ?, low_stock_threshold = ?, description = COALESCE(?, description) WHERE id = ? AND shop_id = ?`,
            [name, category, unit, buying_price, quantity, low_stock_threshold, description, existing.id, shopId]
          );
          if (quantity > 0) {
            await execute(
              `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
               VALUES (?, ?, ?, ?, 'Stock Received', 'Bulk Import Replenishment', ?)`,
              [shopId, finalStockId, existing.id, quantity, req.session?.user?.id || 1]
            );
          }
          updatedCount++;
        } else {
          const resInsert = await execute(
            `INSERT INTO products (shop_id, stock_id, name, sku, barcode, category, unit, buying_price, quantity, low_stock_threshold, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [shopId, finalStockId, name, sku, barcode, category, unit, buying_price, quantity, low_stock_threshold, description]
          );
          if (quantity > 0) {
            await execute(
              `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
               VALUES (?, ?, ?, ?, 'Stock Received', 'Initial Bulk Import', ?)`,
              [shopId, finalStockId, resInsert.lastInsertId, quantity, req.session?.user?.id || 1]
            );
          }
          insertedCount++;
        }
      }
    });
    await logApiAudit(req, "PRODUCTS_BULK_IMPORTED", `Bulk imported ${insertedCount} new products and updated ${updatedCount} existing items.`);
    res.json({
      success: true,
      message: `Bulk import completed: ${insertedCount} created, ${updatedCount} updated.`,
      insertedCount,
      updatedCount,
      errors: errors.length > 0 ? errors : void 0
    });
  } catch (err) {
    console.error("Bulk import error:", err);
    res.status(500).json({ error: "Bulk product import failed: " + (err.message || "Unknown database error") });
  }
});
router.put("/products/:id", requireAuth, requireTenant, requirePermission("can_manage_stock"), async (req, res) => {
  const shopId = res.locals.shopId;
  const productId = Number(req.params.id);
  const {
    name,
    sku,
    barcode,
    category,
    unit,
    buying_price,
    quantity,
    low_stock_threshold,
    description
  } = req.body;
  try {
    const existing = await queryOne("SELECT * FROM products WHERE id = ? AND shop_id = ?", [productId, shopId]);
    if (!existing) {
      return res.status(404).json({ error: "Product not found in this store" });
    }
    await execute(
      `UPDATE products 
       SET name = ?, sku = ?, barcode = ?, category = ?, unit = ?, buying_price = ?, quantity = ?, low_stock_threshold = ?, description = ?
       WHERE id = ? AND shop_id = ?`,
      [
        name || existing.name,
        sku || existing.sku,
        barcode !== void 0 ? barcode : existing.barcode,
        category || existing.category,
        unit || existing.unit,
        buying_price !== void 0 ? Number(buying_price) : existing.buying_price,
        quantity !== void 0 ? Math.max(0, Number(quantity)) : existing.quantity,
        low_stock_threshold !== void 0 ? Math.max(0, Number(low_stock_threshold)) : existing.low_stock_threshold,
        description !== void 0 ? description : existing.description,
        productId,
        shopId
      ]
    );
    await logApiAudit(req, "PRODUCT_UPDATED", `Updated product #${productId} (${name || existing.name})`);
    const updated = await queryOne("SELECT * FROM products WHERE id = ? AND shop_id = ?", [productId, shopId]);
    res.json({ success: true, product: updated });
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});
router.delete("/products/:id", requireAuth, requireTenant, requirePermission("can_manage_stock"), async (req, res) => {
  const shopId = res.locals.shopId;
  const productId = Number(req.params.id);
  try {
    const existing = await queryOne("SELECT * FROM products WHERE id = ? AND shop_id = ?", [productId, shopId]);
    if (!existing) {
      return res.status(404).json({ error: "Product not found in this store" });
    }
    await execute("DELETE FROM products WHERE id = ? AND shop_id = ?", [productId, shopId]);
    await logApiAudit(req, "PRODUCT_DELETED", `Deleted product #${productId} (${existing.name})`);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({ error: "Failed to delete product. It may be referenced in existing orders." });
  }
});
router.post("/products/:id/adjust-stock", requireAuth, requireTenant, requirePermission("can_manage_stock"), async (req, res) => {
  const shopId = res.locals.shopId;
  const productId = Number(req.params.id);
  const { adjustment_qty, movement_type, reference, notes } = req.body;
  const adj = Number(adjustment_qty);
  if (isNaN(adj) || adj === 0) {
    return res.status(400).json({ error: "Valid non-zero adjustment quantity is required" });
  }
  try {
    const product = await queryOne("SELECT * FROM products WHERE id = ? AND shop_id = ?", [productId, shopId]);
    if (!product) {
      return res.status(404).json({ error: "Product not found in this store" });
    }
    await withTransaction(async () => {
      if (adj < 0) {
        const deductionRes = await execute(
          "UPDATE products SET quantity = quantity - ? WHERE id = ? AND shop_id = ? AND quantity >= ?",
          [Math.abs(adj), productId, shopId, Math.abs(adj)]
        );
        if (deductionRes.changes === 0) {
          throw new Error(`Insufficient stock for reduction. Product only has ${product.quantity} units in stock.`);
        }
      } else {
        await execute(
          "UPDATE products SET quantity = quantity + ? WHERE id = ? AND shop_id = ?",
          [adj, productId, shopId]
        );
      }
      await execute(
        `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          product.stock_id || 1,
          productId,
          adj,
          movement_type || (adj > 0 ? "Stock Received" : "Damage/Correction"),
          reference || notes || "Manual Stock Adjustment",
          req.session?.user?.id || 1
        ]
      );
    });
    await logApiAudit(req, "STOCK_ADJUSTMENT", `Adjusted product #${productId} quantity by ${adj > 0 ? "+" : ""}${adj}`);
    const updated = await queryOne("SELECT * FROM products WHERE id = ? AND shop_id = ?", [productId, shopId]);
    res.json({ success: true, product: updated });
  } catch (err) {
    console.error("Adjust stock error:", err);
    res.status(400).json({ error: err.message || "Failed to adjust stock" });
  }
});
router.get("/stocks", requireAuth, requireTenant, async (req, res) => {
  const shopId = res.locals.shopId;
  try {
    const stocks = await queryAll(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM products p WHERE p.stock_id = s.id AND p.shop_id = s.shop_id) as product_count,
        (SELECT COALESCE(SUM(quantity), 0) FROM products p WHERE p.stock_id = s.id AND p.shop_id = s.shop_id) as total_units
       FROM stocks s 
       WHERE s.shop_id = ? ORDER BY s.is_main DESC, s.name ASC`,
      [shopId]
    );
    const transfers = await queryAll(
      `SELECT t.*, p.name as product_name, p.sku as product_sku, 
              s1.name as from_stock_name, s2.name as to_stock_name, u.name as transferred_by_name
       FROM stock_transfers t
       JOIN products p ON t.product_id = p.id
       JOIN stocks s1 ON t.from_stock_id = s1.id
       JOIN stocks s2 ON t.to_stock_id = s2.id
       LEFT JOIN users u ON t.transferred_by = u.id
       WHERE t.shop_id = ?
       ORDER BY t.created_at DESC LIMIT 20`,
      [shopId]
    );
    res.json({ stocks, transfers });
  } catch (err) {
    console.error("Stocks API error:", err);
    res.status(500).json({ error: "Failed to fetch warehouse stocks" });
  }
});
router.post("/stocks", requireAuth, requireTenant, requireManager, async (req, res) => {
  const shopId = res.locals.shopId;
  const { name, code, location, manager_name, phone, is_main } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Stock location name is required" });
  }
  try {
    const result = await execute(
      `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        shopId,
        name.trim(),
        code ? code.trim() : `WH-${Date.now().toString().slice(-4)}`,
        location ? location.trim() : "Kigali",
        manager_name ? manager_name.trim() : null,
        phone ? phone.trim() : null,
        is_main ? 1 : 0
      ]
    );
    await logApiAudit(req, "STOCK_LOCATION_CREATED", `Created warehouse/stock location ${name}`);
    const created = await queryOne("SELECT * FROM stocks WHERE id = ? AND shop_id = ?", [result.lastInsertId, shopId]);
    res.json({ success: true, stock: created });
  } catch (err) {
    console.error("Create stock error:", err);
    res.status(500).json({ error: "Failed to create stock location" });
  }
});
router.post("/stocks/transfer", requireAuth, requireTenant, requirePermission("can_manage_stock"), async (req, res) => {
  const shopId = res.locals.shopId;
  const { from_stock_id, to_stock_id, product_id, quantity, notes } = req.body;
  const qty = Number(quantity);
  if (!from_stock_id || !to_stock_id || !product_id || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: "Invalid transfer parameters. Quantity must be greater than 0." });
  }
  if (Number(from_stock_id) === Number(to_stock_id)) {
    return res.status(400).json({ error: "Source and destination warehouses cannot be the same." });
  }
  try {
    const fromStock = await queryOne("SELECT id, name FROM stocks WHERE id = ? AND shop_id = ?", [from_stock_id, shopId]);
    const toStock = await queryOne("SELECT id, name FROM stocks WHERE id = ? AND shop_id = ?", [to_stock_id, shopId]);
    if (!fromStock || !toStock) {
      return res.status(404).json({ error: "Source or destination warehouse does not belong to this store." });
    }
    const product = await queryOne("SELECT * FROM products WHERE id = ? AND shop_id = ?", [product_id, shopId]);
    if (!product) {
      return res.status(404).json({ error: "Product not found in this store." });
    }
    await withTransaction(async () => {
      await execute(
        `INSERT INTO stock_transfers (shop_id, from_stock_id, to_stock_id, product_id, quantity, transferred_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [shopId, from_stock_id, to_stock_id, product_id, qty, req.session?.user?.id || 1, notes || null]
      );
      await execute(
        `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, ?, 'Transfer Out', ?, ?)`,
        [shopId, from_stock_id, product_id, -qty, `Transfer to WH #${to_stock_id} (${toStock.name})`, req.session?.user?.id || 1]
      );
      await execute(
        `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, ?, 'Transfer In', ?, ?)`,
        [shopId, to_stock_id, product_id, qty, `Transfer from WH #${from_stock_id} (${fromStock.name})`, req.session?.user?.id || 1]
      );
    });
    await logApiAudit(req, "STOCK_TRANSFER", `Transferred ${qty} of ${product.name} from WH #${from_stock_id} to WH #${to_stock_id}`);
    res.json({ success: true, message: `Successfully transferred ${qty} units.` });
  } catch (err) {
    console.error("Stock transfer error:", err);
    res.status(500).json({ error: err.message || "Failed to process warehouse stock transfer" });
  }
});
router.get("/orders", requireAuth, requireTenant, async (req, res) => {
  const shopId = res.locals.shopId;
  const status = (req.query.status || "").trim();
  const period = (req.query.period || "all").toLowerCase();
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;
  const limit = Math.min(2e3, Math.max(10, Number(req.query.limit) || 100));
  try {
    let sql = `
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, u.name as salesperson_name,
             p_user.name as payment_approved_by_name,
             s_user.name as stock_released_by_name,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON o.salesperson_id = u.id
      LEFT JOIN users p_user ON o.payment_approved_by = p_user.id
      LEFT JOIN users s_user ON o.stock_released_by = s_user.id
      WHERE o.shop_id = ?
    `;
    const params = [shopId];
    if (status && status !== "all") {
      sql += ` AND (o.payment_status = ? OR o.fulfillment_status = ?)`;
      params.push(status, status);
    }
    const now = /* @__PURE__ */ new Date();
    if (period === "day" || period === "today" || period === "daily") {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      sql += ` AND o.created_at >= ?`;
      params.push(d.toISOString());
    } else if (period === "week" || period === "weekly") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      sql += ` AND o.created_at >= ?`;
      params.push(d.toISOString());
    } else if (period === "month" || period === "monthly") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      sql += ` AND o.created_at >= ?`;
      params.push(d.toISOString());
    } else if (startDate && endDate) {
      sql += ` AND o.created_at >= ? AND o.created_at <= ?`;
      params.push(new Date(startDate).toISOString(), new Date(endDate).toISOString());
    } else if (startDate) {
      sql += ` AND o.created_at >= ?`;
      params.push(new Date(startDate).toISOString());
    }
    sql += ` ORDER BY o.created_at DESC LIMIT ?`;
    params.push(limit);
    const orders = await queryAll(sql, params);
    res.json({ orders });
  } catch (err) {
    console.error("Orders API error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});
router.get("/orders/:id", requireAuth, requireTenant, async (req, res) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  try {
    const order = await queryOne(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
              u.name as salesperson_name, 
              p_user.name as payment_approved_by_name,
              s_user.name as stock_released_by_name,
              s.name as shop_name, s.tin_number, s.receipt_footer_text, s.phone as shop_phone
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN users u ON o.salesperson_id = u.id
       LEFT JOIN users p_user ON o.payment_approved_by = p_user.id
       LEFT JOIN users s_user ON o.stock_released_by = s_user.id
       LEFT JOIN shops s ON o.shop_id = s.id
       WHERE o.id = ? AND o.shop_id = ?`,
      [orderId, shopId]
    );
    if (!order) {
      return res.status(404).json({ error: "Order not found in this store" });
    }
    const items = await queryAll(
      `SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit as product_unit
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );
    const payments = await queryAll(
      `SELECT p.*, u.name as recorded_by_name
       FROM payments p
       LEFT JOIN users u ON p.recorded_by = u.id
       WHERE p.order_id = ? AND p.shop_id = ?
       ORDER BY p.created_at ASC`,
      [orderId, shopId]
    );
    res.json({ order, items, payments });
  } catch (err) {
    console.error("Get order detail error:", err);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
});
router.post("/orders", requireAuth, requireTenant, requirePermission("can_create_orders"), async (req, res) => {
  const shopId = res.locals.shopId;
  const {
    customer_id,
    customer_name,
    customer_phone,
    items,
    payment_method,
    paid_amount,
    notes,
    payment_reference
  } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "At least one product item is required to place an order." });
  }
  try {
    const result = await withTransaction(async () => {
      let finalCustomerId = customer_id ? Number(customer_id) : null;
      if (finalCustomerId) {
        const custCheck = await queryOne("SELECT id FROM customers WHERE id = ? AND shop_id = ?", [finalCustomerId, shopId]);
        if (!custCheck) {
          throw new Error("Specified customer does not belong to this store.");
        }
      } else if (customer_name) {
        const existing = await queryOne("SELECT id FROM customers WHERE shop_id = ? AND (name = ? OR (phone != '' AND phone = ?))", [shopId, customer_name.trim(), customer_phone || ""]);
        if (existing) {
          finalCustomerId = existing.id;
        } else {
          const newCust = await execute(
            `INSERT INTO customers (shop_id, name, phone, credit_balance) VALUES (?, ?, ?, 0.0)`,
            [shopId, customer_name.trim(), customer_phone ? customer_phone.trim() : ""]
          );
          finalCustomerId = newCust.lastInsertId;
        }
      } else {
        let walkIn = await queryOne("SELECT id FROM customers WHERE shop_id = ? AND (name = ? OR name = ?)", [shopId, "Walk-in Client", "Walk-in Customer"]);
        if (!walkIn) {
          const newCust = await execute(
            `INSERT INTO customers (shop_id, name, phone, credit_balance) VALUES (?, 'Walk-in Client', '', 0.0)`,
            [shopId]
          );
          finalCustomerId = newCust.lastInsertId;
        } else {
          finalCustomerId = walkIn.id;
        }
      }
      let totalAmount = 0;
      const parsedItems = [];
      for (const item of items) {
        const prod = await queryOne("SELECT * FROM products WHERE id = ? AND shop_id = ?", [item.product_id, shopId]);
        if (!prod) {
          throw new Error(`Product #${item.product_id} not found in this store.`);
        }
        const qty = Number(item.quantity);
        if (isNaN(qty) || qty <= 0) {
          throw new Error(`Invalid quantity for product ${prod.name}`);
        }
        const sellingPrice = item.selling_price !== void 0 ? Number(item.selling_price) : prod.buying_price * 1.15;
        const subtotal = sellingPrice * qty;
        const profit = (sellingPrice - prod.buying_price) * qty;
        totalAmount += subtotal;
        parsedItems.push({
          product: prod,
          product_id: prod.id,
          quantity: qty,
          buying_price: prod.buying_price,
          selling_price: sellingPrice,
          subtotal,
          profit,
          fulfillment_source: item.fulfillment_source || "Store"
        });
      }
      const paid = paid_amount !== void 0 ? Math.min(totalAmount, Math.max(0, Number(paid_amount))) : totalAmount;
      const debt = Math.max(0, totalAmount - paid);
      const paymentStatus = debt === 0 ? "paid" : paid > 0 ? "partial" : "debt";
      const fulfillmentStatus = "pending_store";
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
      const currentUserId = req.session?.user?.id || 1;
      const orderRes = await execute(
        `INSERT INTO orders (
          shop_id, stock_id, order_number, customer_id, salesperson_id,
          total_amount, paid_amount, debt_amount, payment_status, fulfillment_status,
          notes, payment_approved_by, payment_approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          1,
          orderNumber,
          finalCustomerId,
          currentUserId,
          totalAmount,
          paid,
          debt,
          paymentStatus,
          fulfillmentStatus,
          notes || null,
          paid > 0 ? currentUserId : null,
          paid > 0 ? (/* @__PURE__ */ new Date()).toISOString() : null
        ]
      );
      const orderId = orderRes.lastInsertId;
      for (const pi of parsedItems) {
        await execute(
          `INSERT INTO order_items (order_id, product_id, quantity, buying_price, selling_price, subtotal, profit, fulfillment_source, item_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_store')`,
          [orderId, pi.product_id, pi.quantity, pi.buying_price, pi.selling_price, pi.subtotal, pi.profit, pi.fulfillment_source]
        );
        const stockDeduction = await execute(
          `UPDATE products SET quantity = quantity - ? WHERE id = ? AND shop_id = ? AND quantity >= ?`,
          [pi.quantity, pi.product_id, shopId, pi.quantity]
        );
        if (stockDeduction.changes === 0) {
          throw new Error(
            `Insufficient stock for "${pi.product.name}". Requested ${pi.quantity} units, but insufficient available inventory.`
          );
        }
        await execute(
          `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
           VALUES (?, 1, ?, ?, 'Sale', ?, ?)`,
          [shopId, pi.product_id, -pi.quantity, `Sale for Order ${orderNumber}`, currentUserId]
        );
      }
      if (paid > 0) {
        await execute(
          `INSERT INTO payments (shop_id, order_id, amount, payment_method, reference_no, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            shopId,
            orderId,
            paid,
            payment_method || "cash",
            payment_reference || null,
            currentUserId
          ]
        );
      }
      if (debt > 0 && finalCustomerId) {
        await execute(
          `UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ? AND shop_id = ?`,
          [debt, finalCustomerId, shopId]
        );
      }
      return { orderId, orderNumber, totalAmount, paid, debt };
    });
    await logApiAudit(req, "ORDER_CREATED", `Salesperson ${req.session?.user?.name || "Staff"} created Order #${result.orderNumber} for RWF ${result.totalAmount.toLocaleString()} (${result.paid > 0 ? "RWF " + result.paid.toLocaleString() + " paid" : "Unpaid"})`);
    const createdOrder = await queryOne("SELECT * FROM orders WHERE id = ? AND shop_id = ?", [result.orderId, shopId]);
    res.json({ success: true, order: createdOrder });
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(400).json({ error: err.message || "Failed to place order" });
  }
});
router.post("/orders/:id/payments", requireAuth, requireTenant, requirePermission("can_process_payments"), async (req, res) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const { amount, payment_method, reference_no } = req.body;
  const currentUserId = req.session?.user?.id || 1;
  const currentUserName = req.session?.user?.name || "Cashier";
  const payAmt = Number(amount);
  if (isNaN(payAmt) || payAmt <= 0) {
    return res.status(400).json({ error: "Valid payment amount greater than 0 is required" });
  }
  try {
    const order = await queryOne("SELECT * FROM orders WHERE id = ? AND shop_id = ?", [orderId, shopId]);
    if (!order) {
      return res.status(404).json({ error: "Order not found in this store" });
    }
    await withTransaction(async () => {
      await execute(
        `INSERT INTO payments (shop_id, order_id, amount, payment_method, reference_no, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          orderId,
          payAmt,
          payment_method || "cash",
          reference_no || null,
          currentUserId
        ]
      );
      const newPaid = Number(order.paid_amount) + payAmt;
      const newDebt = Math.max(0, Number(order.total_amount) - newPaid);
      const newPaymentStatus = newDebt === 0 ? "paid" : "partial";
      await execute(
        `UPDATE orders 
         SET paid_amount = ?, debt_amount = ?, payment_status = ?, payment_approved_by = ?, payment_approved_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND shop_id = ?`,
        [newPaid, newDebt, newPaymentStatus, currentUserId, orderId, shopId]
      );
      if (order.customer_id) {
        await execute(
          `UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ? AND shop_id = ?`,
          [payAmt, order.customer_id, shopId]
        );
      }
    });
    await logApiAudit(req, "PAYMENT_CONFIRMED", `Payment of RWF ${payAmt.toLocaleString()} (${payment_method || "cash"}) confirmed by ${currentUserName} for Order #${order.order_number || orderId}`);
    const updatedOrder = await queryOne("SELECT * FROM orders WHERE id = ? AND shop_id = ?", [orderId, shopId]);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("Record payment error:", err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});
router.post("/orders/:id/status", requireAuth, requireTenant, requirePermission("can_release_stock"), async (req, res) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const { fulfillment_status, reason } = req.body;
  const currentUserId = req.session?.user?.id || 1;
  const currentUserName = req.session?.user?.name || "Storekeeper";
  try {
    const order = await queryOne("SELECT * FROM orders WHERE id = ? AND shop_id = ?", [orderId, shopId]);
    if (!order) {
      return res.status(404).json({ error: "Order not found in this store" });
    }
    const isReleasing = fulfillment_status === "approved" || fulfillment_status === "dispatched" || fulfillment_status === "completed";
    if (isReleasing) {
      await execute(
        `UPDATE orders SET fulfillment_status = ?, stock_released_by = ?, stock_released_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?`,
        [fulfillment_status, currentUserId, orderId, shopId]
      );
    } else {
      await execute(
        `UPDATE orders SET fulfillment_status = ? WHERE id = ? AND shop_id = ?`,
        [fulfillment_status, orderId, shopId]
      );
    }
    let itemStatus = "pending_store";
    if (isReleasing) {
      itemStatus = "approved";
    }
    if (fulfillment_status === "rejected") itemStatus = "rejected";
    await execute(
      `UPDATE order_items SET item_status = ?, rejection_reason = ? WHERE order_id = ?`,
      [itemStatus, reason || null, orderId]
    );
    if (isReleasing) {
      await logApiAudit(req, "STOCK_RELEASED", `Physical stock for Order #${order.order_number || orderId} released & dispatched from warehouse by ${currentUserName} (Status: ${fulfillment_status})`);
    } else if (fulfillment_status === "rejected") {
      await logApiAudit(req, "STOCK_REJECTED", `Order #${order.order_number || orderId} items rejected at warehouse by ${currentUserName}. Reason: ${reason || "Out of stock"}`);
    } else {
      await logApiAudit(req, "ORDER_STATUS_CHANGED", `Changed Order #${order.order_number || orderId} fulfillment status to ${fulfillment_status} by ${currentUserName}`);
    }
    const updated = await queryOne("SELECT * FROM orders WHERE id = ? AND shop_id = ?", [orderId, shopId]);
    res.json({ success: true, order: updated });
  } catch (err) {
    console.error("Update order status error:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});
router.get("/customers", requireAuth, requireTenant, async (req, res) => {
  const shopId = res.locals.shopId;
  const search = (req.query.q || "").trim().toLowerCase();
  try {
    let sql = `
      SELECT c.*, 
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.shop_id = c.shop_id) as order_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE o.customer_id = c.id AND o.shop_id = c.shop_id) as total_spent
      FROM customers c
      WHERE c.shop_id = ?
    `;
    const params = [shopId];
    if (search) {
      sql += ` AND (LOWER(c.name) LIKE ? OR LOWER(c.phone) LIKE ? OR LOWER(c.email) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ` ORDER BY c.credit_balance DESC, c.name ASC`;
    const customers = await queryAll(sql, params);
    res.json({ customers });
  } catch (err) {
    console.error("Customers API error:", err);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});
router.post("/customers", requireAuth, requireTenant, requirePermission("can_manage_customers"), async (req, res) => {
  const shopId = res.locals.shopId;
  const { name, phone, email, address, id_number } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Customer name is required" });
  }
  try {
    const result = await execute(
      `INSERT INTO customers (shop_id, name, phone, email, address, id_number, credit_balance)
       VALUES (?, ?, ?, ?, ?, ?, 0.0)`,
      [
        shopId,
        name.trim(),
        phone ? phone.trim() : "",
        email ? email.trim() : null,
        address ? address.trim() : null,
        id_number ? id_number.trim() : null
      ]
    );
    await logApiAudit(req, "CUSTOMER_CREATED", `Added customer ${name}`);
    const created = await queryOne("SELECT * FROM customers WHERE id = ? AND shop_id = ?", [result.lastInsertId, shopId]);
    res.json({ success: true, customer: created });
  } catch (err) {
    console.error("Create customer error:", err);
    res.status(500).json({ error: "Failed to create customer" });
  }
});
router.put("/customers/:id", requireAuth, requireTenant, requirePermission("can_manage_customers"), async (req, res) => {
  const shopId = res.locals.shopId;
  const customerId = Number(req.params.id);
  const { name, phone, email, address, id_number } = req.body;
  try {
    const existing = await queryOne("SELECT * FROM customers WHERE id = ? AND shop_id = ?", [customerId, shopId]);
    if (!existing) {
      return res.status(404).json({ error: "Customer not found in this store" });
    }
    await execute(
      `UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, id_number = ? WHERE id = ? AND shop_id = ?`,
      [
        name || existing.name,
        phone !== void 0 ? phone : existing.phone,
        email !== void 0 ? email : existing.email,
        address !== void 0 ? address : existing.address,
        id_number !== void 0 ? id_number : existing.id_number,
        customerId,
        shopId
      ]
    );
    const updated = await queryOne("SELECT * FROM customers WHERE id = ? AND shop_id = ?", [customerId, shopId]);
    res.json({ success: true, customer: updated });
  } catch (err) {
    console.error("Update customer error:", err);
    res.status(500).json({ error: "Failed to update customer" });
  }
});
router.get("/partners", requireAuth, requireTenant, async (req, res) => {
  const shopId = res.locals.shopId;
  try {
    const partners = await queryAll(
      `SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC`,
      [shopId]
    );
    res.json({ partners });
  } catch (err) {
    console.error("Partners API error:", err);
    res.status(500).json({ error: "Failed to fetch partner hardware stores" });
  }
});
router.post("/partners", requireAuth, requireTenant, requirePermission("can_manage_partners"), async (req, res) => {
  const shopId = res.locals.shopId;
  const { name, contact_person, phone, address } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Partner shop name is required" });
  }
  try {
    const result = await execute(
      `INSERT INTO partner_shops (shop_id, name, contact_person, phone, address, current_balance)
       VALUES (?, ?, ?, ?, ?, 0.0)`,
      [
        shopId,
        name.trim(),
        contact_person ? contact_person.trim() : null,
        phone ? phone.trim() : null,
        address ? address.trim() : null
      ]
    );
    await logApiAudit(req, "PARTNER_CREATED", `Added partner store ${name}`);
    const created = await queryOne("SELECT * FROM partner_shops WHERE id = ? AND shop_id = ?", [result.lastInsertId, shopId]);
    res.json({ success: true, partner: created });
  } catch (err) {
    console.error("Create partner error:", err);
    res.status(500).json({ error: "Failed to create partner hardware store" });
  }
});
router.get("/users", requireAuth, requireTenant, requireManager, async (req, res) => {
  const shopId = res.locals.shopId;
  const isSuper = req.session?.user?.role === "superadmin";
  try {
    const sql = isSuper ? `SELECT u.id, u.shop_id, u.stock_id, u.name, u.email, u.role, u.job_title, u.phone, u.is_active, u.activation_status,
                u.can_create_orders, u.can_process_payments, u.can_release_stock, u.can_manage_stock, u.can_import_export_stock,
                u.can_partner_borrow, u.can_view_reports, u.can_view_buying_prices, u.can_give_discounts, u.can_manage_users,
                u.can_print_full_receipt, u.can_print_delivery_note, u.can_manage_customers, u.can_manage_partners, u.can_void_orders,
                u.can_edit_company_settings, u.can_view_audit_trail, u.can_reset_passwords, u.can_view_all_tenants, u.can_manage_subscriptions,
                u.force_password_change, s.name as shop_name 
         FROM users u LEFT JOIN shops s ON u.shop_id = s.id ORDER BY u.role DESC, u.name ASC` : `SELECT id, shop_id, stock_id, name, email, role, job_title, phone, is_active, activation_status,
                can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
                can_partner_borrow, can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users,
                can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders,
                can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions,
                force_password_change
         FROM users WHERE shop_id = ? ORDER BY role DESC, name ASC`;
    const params = isSuper ? [] : [shopId];
    const users = await queryAll(sql, params);
    res.json({ users });
  } catch (err) {
    console.error("Users API error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});
router.post("/users", requireAuth, requireTenant, requireManager, async (req, res) => {
  const currentUser = req.session.user;
  const { name, email, password, role, job_title, phone, permissions, shop_id } = req.body;
  const targetShopId = currentUser.role === "superadmin" && shop_id ? Number(shop_id) : res.locals.shopId;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and initial password are required" });
  }
  const assignedRole = (role || "salesperson").toLowerCase();
  if (assignedRole === "superadmin" && currentUser.role !== "superadmin") {
    return res.status(403).json({ error: "Privilege escalation blocked: Only SuperAdmin can create superadmin accounts." });
  }
  try {
    const hashedPassword = await bcrypt2.hash(password, 10);
    const p = permissions || {};
    const result = await execute(
      `INSERT INTO users (
        shop_id, stock_id, name, email, password, role, job_title, phone, is_active, activation_status,
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
        can_partner_borrow, can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users,
        can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders,
        can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions,
        force_password_change
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        targetShopId,
        name.trim(),
        email.trim().toLowerCase(),
        hashedPassword,
        assignedRole,
        job_title || "Store Staff",
        phone || null,
        p.can_create_orders !== void 0 ? p.can_create_orders ? 1 : 0 : 1,
        p.can_process_payments ? 1 : 0,
        p.can_release_stock ? 1 : 0,
        p.can_manage_stock ? 1 : 0,
        p.can_import_export_stock ? 1 : 0,
        p.can_partner_borrow ? 1 : 0,
        p.can_view_reports ? 1 : 0,
        p.can_view_buying_prices ? 1 : 0,
        p.can_give_discounts ? 1 : 0,
        p.can_manage_users ? 1 : 0,
        p.can_print_full_receipt !== void 0 ? p.can_print_full_receipt ? 1 : 0 : 1,
        p.can_print_delivery_note !== void 0 ? p.can_print_delivery_note ? 1 : 0 : 1,
        p.can_manage_customers !== void 0 ? p.can_manage_customers ? 1 : 0 : 1,
        p.can_manage_partners ? 1 : 0,
        p.can_void_orders ? 1 : 0,
        p.can_edit_company_settings ? 1 : 0,
        p.can_view_audit_trail ? 1 : 0,
        p.can_reset_passwords ? 1 : 0,
        p.can_view_all_tenants ? 1 : 0,
        p.can_manage_subscriptions ? 1 : 0
      ]
    );
    await logApiAudit(req, "USER_CREATED", `Created staff user ${name} (${email}) with role ${assignedRole}`);
    const created = await queryOne("SELECT id, name, email, role, job_title FROM users WHERE id = ?", [result.lastInsertId]);
    res.json({ success: true, user: created });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ error: "Failed to create user. Ensure email is unique." });
  }
});
router.put("/users/:id", requireAuth, requireTenant, requireManager, async (req, res) => {
  const shopId = res.locals.shopId;
  const targetUserId = Number(req.params.id);
  const currentUser = req.session.user;
  const { name, phone, role, job_title, is_active, permissions, password, force_password_change } = req.body;
  try {
    const existing = await queryOne("SELECT * FROM users WHERE id = ?", [targetUserId]);
    if (!existing || currentUser.role !== "superadmin" && existing.shop_id !== shopId) {
      return res.status(404).json({ error: "User account not found in this store" });
    }
    if (role === "superadmin" && currentUser.role !== "superadmin") {
      return res.status(403).json({ error: "Privilege escalation blocked: Only SuperAdmin can assign superadmin role." });
    }
    const updates = [];
    const params = [];
    if (name) {
      updates.push("name = ?");
      params.push(name);
    }
    if (phone !== void 0) {
      updates.push("phone = ?");
      params.push(phone);
    }
    if (role && (currentUser.role === "superadmin" || role !== "superadmin")) {
      updates.push("role = ?");
      params.push(role);
    }
    if (job_title !== void 0) {
      updates.push("job_title = ?");
      params.push(job_title);
    }
    if (is_active !== void 0) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }
    if (force_password_change !== void 0) {
      updates.push("force_password_change = ?");
      params.push(force_password_change ? 1 : 0);
    }
    if (password && password.trim().length >= 6) {
      const hash = await bcrypt2.hash(password.trim(), 10);
      updates.push("password = ?");
      params.push(hash);
    }
    if (permissions) {
      const permKeys = [
        "can_create_orders",
        "can_process_payments",
        "can_release_stock",
        "can_manage_stock",
        "can_import_export_stock",
        "can_partner_borrow",
        "can_view_reports",
        "can_view_buying_prices",
        "can_give_discounts",
        "can_manage_users",
        "can_print_full_receipt",
        "can_print_delivery_note",
        "can_manage_customers",
        "can_manage_partners",
        "can_void_orders",
        "can_edit_company_settings",
        "can_view_audit_trail",
        "can_reset_passwords",
        "can_view_all_tenants",
        "can_manage_subscriptions"
      ];
      for (const pk of permKeys) {
        if (permissions[pk] !== void 0) {
          updates.push(`${pk} = ?`);
          params.push(permissions[pk] ? 1 : 0);
        }
      }
    }
    if (updates.length > 0) {
      let sql = `UPDATE users SET ${updates.join(", ")} WHERE id = ?`;
      params.push(targetUserId);
      await execute(sql, params);
    }
    await logApiAudit(req, "USER_UPDATED", `Updated staff user #${targetUserId} (${name || existing.name})`);
    const updated = await queryOne("SELECT id, name, email, role, job_title, is_active FROM users WHERE id = ?", [targetUserId]);
    res.json({ success: true, user: updated });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ error: "Failed to update user profile" });
  }
});
router.post("/users/:id/reset-password", requireAuth, requireTenant, requirePermission("can_reset_passwords"), async (req, res) => {
  const shopId = res.locals.shopId;
  const targetUserId = Number(req.params.id);
  const currentUser = req.session.user;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.trim().length < 6) {
    return res.status(400).json({ error: "New temporary password must be at least 6 characters long." });
  }
  try {
    const targetUser = await queryOne("SELECT * FROM users WHERE id = ?", [targetUserId]);
    if (!targetUser || currentUser.role !== "superadmin" && targetUser.shop_id !== shopId) {
      return res.status(404).json({ error: "Target user account not found." });
    }
    const hashed = await bcrypt2.hash(newPassword.trim(), 10);
    await execute("UPDATE users SET password = ?, force_password_change = 1 WHERE id = ?", [hashed, targetUserId]);
    await logApiAudit(req, "PASSWORD_RESET", `Administrator ${currentUser.name} reset password for user #${targetUserId} (${targetUser.email}) with required first-login change.`, targetUser.shop_id || 1);
    res.json({
      success: true,
      message: `Password for ${targetUser.name} has been reset. They will be required to change it on their next login.`
    });
  } catch (err) {
    console.error("Admin reset password error:", err);
    res.status(500).json({ error: "Failed to reset password." });
  }
});
router.get("/shops", requireAuth, async (req, res) => {
  const user = req.session.user;
  try {
    if (user.role === "superadmin") {
      const shops = await queryAll(`
        SELECT s.*, 
          (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id) as user_count,
          (SELECT COUNT(*) FROM stocks st WHERE st.shop_id = s.id) as stock_count,
          (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) as product_count,
          (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE o.shop_id = s.id) as total_revenue
        FROM shops s ORDER BY s.id ASC
      `);
      return res.json({ shops });
    }
    if (user.shop_id) {
      const shop = await queryOne("SELECT * FROM shops WHERE id = ?", [user.shop_id]);
      return res.json({ shops: shop ? [shop] : [] });
    }
    return res.status(403).json({ error: "SuperAdmin access required" });
  } catch (err) {
    console.error("Shops API error:", err);
    res.status(500).json({ error: "Failed to fetch shops" });
  }
});
router.post("/shops", requireAuth, requireSuperAdmin, async (req, res) => {
  const { name, code, owner_name, phone, email, location, tin_number, subscription_plan } = req.body;
  if (!name || !owner_name || !email) {
    return res.status(400).json({ error: "Store name, owner name, and email are required" });
  }
  try {
    const finalCode = code || name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    const result = await execute(
      `INSERT INTO shops (name, code, owner_name, phone, email, location, tin_number, status, subscription_plan)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        name.trim(),
        finalCode,
        owner_name.trim(),
        phone ? phone.trim() : "+250 788 000 000",
        email.trim().toLowerCase(),
        location ? location.trim() : "Kigali, Rwanda",
        tin_number ? tin_number.trim() : null,
        subscription_plan || "Standard Depot (RWF 45,000/mo)"
      ]
    );
    const shopId = result.lastInsertId;
    await execute(
      `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'active')`,
      [
        shopId,
        `${name} Main Depot`,
        `WH-${finalCode.toUpperCase()}-01`,
        location || "Kigali",
        owner_name,
        phone
      ]
    );
    await logApiAudit(req, "SHOP_REGISTERED", `Created new store tenant ${name} (#${shopId})`, shopId);
    const created = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    res.json({ success: true, shop: created });
  } catch (err) {
    console.error("Create shop error:", err);
    res.status(500).json({ error: "Failed to register shop. Ensure store code and email are unique." });
  }
});
router.put("/shops/:id", requireAuth, requireManager, async (req, res) => {
  const shopId = Number(req.params.id);
  const user = req.session.user;
  if (user.role !== "superadmin" && user.shop_id !== shopId) {
    return res.status(403).json({ error: "Permission denied: Cannot edit settings for another store." });
  }
  const { name, owner_name, phone, email, location, tin_number, receipt_footer_text, status, subscription_plan } = req.body;
  try {
    const existing = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    if (!existing) {
      return res.status(404).json({ error: "Shop tenant not found" });
    }
    const newStatus = user.role === "superadmin" && status ? status : existing.status;
    const newPlan = user.role === "superadmin" && subscription_plan ? subscription_plan : existing.subscription_plan;
    await execute(
      `UPDATE shops 
       SET name = ?, owner_name = ?, phone = ?, email = ?, location = ?, tin_number = ?, receipt_footer_text = ?, status = ?, subscription_plan = ?
       WHERE id = ?`,
      [
        name || existing.name,
        owner_name || existing.owner_name,
        phone || existing.phone,
        email || existing.email,
        location || existing.location,
        tin_number !== void 0 ? tin_number : existing.tin_number,
        receipt_footer_text !== void 0 ? receipt_footer_text : existing.receipt_footer_text,
        newStatus,
        newPlan,
        shopId
      ]
    );
    await logApiAudit(req, "SHOP_SETTINGS_UPDATED", `Updated store settings for #${shopId}`, shopId);
    const updated = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    res.json({ success: true, shop: updated });
  } catch (err) {
    console.error("Update shop error:", err);
    res.status(500).json({ error: "Failed to update store settings" });
  }
});
router.get("/reports/summary", requireAuth, requireTenant, requirePermission("can_view_reports"), async (req, res) => {
  const shopId = res.locals.shopId;
  const period = (req.query.period || "all").toLowerCase();
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;
  let dateFilter = "";
  const dateParams = [];
  const now = /* @__PURE__ */ new Date();
  if (period === "day" || period === "today" || period === "daily") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    dateFilter = " AND o.created_at >= ?";
    dateParams.push(d.toISOString());
  } else if (period === "week" || period === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    dateFilter = " AND o.created_at >= ?";
    dateParams.push(d.toISOString());
  } else if (period === "month" || period === "monthly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    dateFilter = " AND o.created_at >= ?";
    dateParams.push(d.toISOString());
  } else if (startDate && endDate) {
    dateFilter = " AND o.created_at >= ? AND o.created_at <= ?";
    dateParams.push(new Date(startDate).toISOString(), new Date(endDate).toISOString());
  } else if (startDate) {
    dateFilter = " AND o.created_at >= ?";
    dateParams.push(new Date(startDate).toISOString());
  }
  try {
    const categorySales = await queryAll(
      `SELECT p.category, COALESCE(SUM(oi.subtotal), 0) as revenue, COALESCE(SUM(oi.profit), 0) as profit, SUM(oi.quantity) as units_sold
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled' ${dateFilter}
       GROUP BY p.category ORDER BY revenue DESC`,
      [shopId, ...dateParams]
    );
    const topSellingProducts = await queryAll(
      `SELECT p.name, p.sku, p.category, SUM(oi.quantity) as total_units_sold, SUM(oi.subtotal) as total_revenue, SUM(oi.profit) as total_profit
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled' ${dateFilter}
       GROUP BY p.id, p.name, p.sku, p.category ORDER BY total_revenue DESC LIMIT 20`,
      [shopId, ...dateParams]
    );
    const salespersonPerformance = await queryAll(
      `SELECT u.name, u.email, COUNT(o.id) as total_orders, COALESCE(SUM(o.total_amount), 0) as total_sales
       FROM orders o
       JOIN users u ON o.salesperson_id = u.id
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled' ${dateFilter}
       GROUP BY u.id, u.name, u.email ORDER BY total_sales DESC`,
      [shopId, ...dateParams]
    );
    const financialOverview = await queryOne(
      `SELECT 
         COUNT(o.id) as total_orders,
         COALESCE(SUM(o.total_amount), 0) as total_revenue,
         COALESCE(SUM(o.paid_amount), 0) as total_paid,
         COALESCE(SUM(o.debt_amount), 0) as total_debt
       FROM orders o
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled' ${dateFilter}`,
      [shopId, ...dateParams]
    );
    const auditLogs = await queryAll(
      `SELECT a.*, u.name as user_name, u.role as user_role
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.shop_id = ? ORDER BY a.created_at DESC LIMIT 50`,
      [shopId]
    );
    res.json({
      period,
      financialOverview: financialOverview || { total_orders: 0, total_revenue: 0, total_paid: 0, total_debt: 0 },
      categorySales,
      topSellingProducts,
      salespersonPerformance,
      auditLogs
    });
  } catch (err) {
    console.error("Reports API error:", err);
    res.status(500).json({ error: "Failed to generate store reports" });
  }
});
router.get("/reports/audit", requireAuth, requireTenant, requirePermission("can_view_audit_trail"), async (req, res) => {
  const shopId = res.locals.shopId;
  const user = req.session.user;
  const action = (req.query.action || "").trim();
  const search = (req.query.search || "").trim();
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));
  try {
    let sql = `
      SELECT a.*, u.name as user_name, u.role as user_role, u.email as user_email, s.name as shop_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN shops s ON a.shop_id = s.id
      WHERE 1=1
    `;
    const params = [];
    if (user.role !== "superadmin" || req.query.shop_id) {
      const targetShop = req.query.shop_id ? Number(req.query.shop_id) : shopId;
      sql += ` AND a.shop_id = ?`;
      params.push(targetShop);
    }
    if (action && action !== "all") {
      sql += ` AND a.action = ?`;
      params.push(action);
    }
    if (search) {
      sql += ` AND (a.details LIKE ? OR u.name LIKE ? OR u.email LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY a.created_at DESC LIMIT ?`;
    params.push(limit);
    const logs = await queryAll(sql, params);
    const actionsQuery = user.role === "superadmin" ? `SELECT DISTINCT action FROM audit_logs ORDER BY action ASC` : `SELECT DISTINCT action FROM audit_logs WHERE shop_id = ? ORDER BY action ASC`;
    const actionsParams = user.role === "superadmin" ? [] : [shopId];
    const distinctActions = await queryAll(actionsQuery, actionsParams);
    res.json({
      success: true,
      logs,
      availableActions: distinctActions.map((a) => a.action)
    });
  } catch (err) {
    console.error("Audit trail API error:", err);
    res.status(500).json({ error: "Failed to fetch audit log trail" });
  }
});
router.get("/backup/export", requireAuth, requireTenant, requireManager, async (req, res) => {
  const shopId = res.locals.shopId;
  const user = req.session.user;
  try {
    const targetShopId = user.role === "superadmin" ? shopId || null : shopId;
    const backup = await createBackup(targetShopId);
    await logApiAudit(req, "BACKUP_EXPORTED", `Generated signed backup snapshot for shop #${targetShopId || "ALL"}`);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="vectos-backup-shop-${targetShopId || "full"}-${Date.now()}.json"`);
    res.json(backup);
  } catch (err) {
    console.error("Backup export error:", err);
    res.status(500).json({ error: "Failed to generate store backup: " + err.message });
  }
});
router.post("/backup/restore", requireAuth, requireTenant, requireManager, async (req, res) => {
  const shopId = res.locals.shopId;
  const user = req.session.user;
  const manifest = req.body;
  if (!manifest || !manifest.metadata || !manifest.data) {
    return res.status(400).json({ error: "Invalid backup structure. Missing metadata or data payload." });
  }
  if (user.role !== "superadmin" && manifest.metadata.shop_id !== shopId) {
    return res.status(403).json({ error: "Cross-tenant restore forbidden. Manifest belongs to a different store." });
  }
  try {
    const result = await restoreBackup(manifest);
    await logApiAudit(req, "BACKUP_RESTORED", `Restored data snapshot for shop #${shopId}`);
    res.json({ success: true, stats: result.stats });
  } catch (err) {
    console.error("Backup restore error:", err);
    res.status(400).json({ error: "Restoration failed: " + err.message });
  }
});
var apiRoutes_default = router;

// server/routes/iomsRoutes.ts
init_db();
import { Router as Router2 } from "express";
import path3 from "path";
import bcrypt3 from "bcryptjs";

// server/upload.ts
import multer from "multer";
import path2 from "path";
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  // 50MB max file size
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif|mp4|webm|quicktime|xlsx|xls|csv/;
    const extname = allowedTypes.test(__require("path").extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error("File format not supported. Allowed formats: images, videos, XLSX, XLS, CSV."));
    }
  }
});
var uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  // 10MB max spreadsheet file
  fileFilter: (req, file, cb) => {
    const ext = path2.extname(file.originalname).toLowerCase();
    if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") {
      cb(null, true);
    } else {
      cb(new Error("Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed."));
    }
  }
});

// server/routes/iomsRoutes.ts
import { generateSecret, generateURI, verify as verifyOtp } from "otplib";
import QRCode from "qrcode";
var router2 = Router2();
router2.get(["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"], (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.sendFile(path3.join(process.cwd(), "public", "icon.svg"));
});
async function logAudit(userId, action, details, req, shopId) {
  try {
    const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
    const sId = shopId !== void 0 ? shopId : req.session?.user?.shop_id || 1;
    await execute(
      "INSERT INTO audit_logs (shop_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?)",
      [sId, userId || null, action, details, ip]
    );
  } catch (err) {
    console.error("Audit logging error:", err);
  }
}
function getActiveShopId(req) {
  if (req.session?.user?.role === "superadmin") {
    if (req.session.user.shop_id) return req.session.user.shop_id;
    return 1;
  }
  const sid = req.session?.user?.shop_id;
  if (sid == null || sid === 0) {
    const err = new Error("No shop context \u2014 your session is not associated with a store. Please sign in again.");
    err.status = 403;
    throw err;
  }
  return sid;
}
router2.get("/login", async (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect("/dashboard");
  }
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
  res.render("login", { error: null, shops, csrfToken: res.locals.csrfToken });
});
router2.post("/login", async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const throttle = await throttleCheck(email);
  if (!throttle.ok) {
    const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    return res.render("login", {
      csrfToken: res.locals.csrfToken,
      error: `Too many failed sign-in attempts. This account is temporarily locked. Try again in about ${throttle.retryAfterMin} minute(s) or contact your administrator.`,
      shops
    });
  }
  try {
    if (email === "rwemera30@gmail.com" || email === "admin@vectos.rw" || email === "admin@vectos.co.rw" || email === "admin@quincaille.rw") {
      const { ensureAdminAccounts: ensureAdminAccounts2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      await ensureAdminAccounts2();
    }
    const user = await queryOne(`
      SELECT u.*, s.name as shop_name, s.status as shop_status 
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      WHERE LOWER(TRIM(u.email)) = ?
    `, [email]);
    if (!user) {
      await throttleFail(email);
      const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      return res.render("login", { csrfToken: res.locals.csrfToken, error: "Account not found. Please verify the email address.", shops });
    }
    if (Number(user.is_active) !== 1 || user.activation_status && user.activation_status !== "active") {
      const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      return res.render("login", { csrfToken: res.locals.csrfToken, error: "Your user account is inactive or pending approval. Please contact your manager or platform administrator.", shops });
    }
    const match = await bcrypt3.compare(password, user.password);
    if (!match) {
      await throttleFail(email);
      const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      return res.render("login", { csrfToken: res.locals.csrfToken, error: "Invalid password. Please check your credentials.", shops });
    }
    await throttleClear(email);
    if (user.role !== "superadmin" && user.shop_status === "pending") {
      const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      return res.render("login", {
        csrfToken: res.locals.csrfToken,
        error: "Your Hardware Store registration is pending approval by the Platform Super Administrator. Access will be unlocked upon payment confirmation.",
        shops
      });
    }
    if (user.role !== "superadmin" && user.shop_status === "suspended") {
      const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      return res.render("login", {
        csrfToken: res.locals.csrfToken,
        error: "Your Hardware Store subscription is currently suspended. Please contact the platform admin for renewal.",
        shops
      });
    }
    req.session.user = {
      id: user.id,
      shop_id: user.shop_id,
      shop_name: user.shop_name || "Central Platform",
      shop_status: user.shop_status || "active",
      name: user.name,
      email: user.email,
      role: user.role,
      twofa_enabled: Number(user.twofa_enabled) === 1 ? 1 : 0,
      job_title: user.job_title || user.role,
      phone: user.phone,
      can_create_orders: user.can_create_orders,
      can_process_payments: user.can_process_payments,
      can_release_stock: user.can_release_stock,
      can_manage_stock: user.can_manage_stock,
      can_import_export_stock: user.can_import_export_stock,
      can_partner_borrow: user.can_partner_borrow,
      can_view_buying_prices: user.can_view_buying_prices,
      can_give_discounts: user.can_give_discounts,
      can_view_reports: user.can_view_reports,
      can_manage_users: user.can_manage_users,
      can_print_full_receipt: user.can_print_full_receipt,
      can_print_delivery_note: user.can_print_delivery_note,
      can_manage_customers: user.can_manage_customers,
      can_manage_partners: user.can_manage_partners,
      can_void_orders: user.can_void_orders,
      can_edit_company_settings: user.can_edit_company_settings
    };
    await logAudit(user.id, "USER_LOGIN", `Logged in successfully as ${user.role.toUpperCase()} (${user.job_title || user.role})`, req, user.shop_id);
    req.session.save((err) => {
      if (err) console.error("Session save error:", err);
      if (Number(user.twofa_enabled) === 1) {
        res.redirect("/verify-2fa");
      } else if (user.role === "superadmin") {
        res.redirect("/admin/shops");
      } else {
        res.redirect("/dashboard");
      }
    });
  } catch (err) {
    const shops = await queryAll("SELECT id, name, code, location, status FROM shops WHERE status = 'active' ORDER BY name ASC");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.render("login", { csrfToken: res.locals.csrfToken, error: "Authentication error: " + err.message, shops });
  }
});
router2.get("/forgot-password", (req, res) => {
  res.render("forgot_password", { error: null });
});
router2.get("/register-shop", (req, res) => {
  res.render("register_shop", { error: null, success: null });
});
router2.post("/register-shop", async (req, res) => {
  const {
    shop_name,
    owner_name,
    phone,
    email,
    location,
    tin_number,
    business_type,
    account_count,
    stock_count,
    password,
    confirm_password
  } = req.body;
  try {
    if (password !== confirm_password) {
      return res.render("register_shop", { error: "Passwords do not match.", success: null });
    }
    if (!shop_name || !owner_name || !phone || !email || !password) {
      return res.render("register_shop", { error: "Please fill in all required registration fields.", success: null });
    }
    const existingUser = await queryOne("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUser) {
      return res.render("register_shop", { error: "An account with this email address already exists. Please login.", success: null });
    }
    const accountsNum = Math.max(1, parseInt(account_count) || 1);
    const stocksNum = Math.max(1, parseInt(stock_count) || 1);
    const monthlyFee = 15e3 + accountsNum * 5e3 + stocksNum * 5e3;
    const planName = `VectOS Custom Plan (RWF ${monthlyFee.toLocaleString()}/mo: ${accountsNum} users, ${stocksNum} stocks)`;
    const baseCode = shop_name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20);
    const code = `${baseCode}-${Math.floor(1e3 + Math.random() * 9e3)}`;
    const shopRes = await execute(
      `INSERT INTO shops (
        name, code, owner_name, phone, email, location, tin_number, status, 
        business_type, subscription_plan, billed_accounts, billed_stocks, monthly_fee, billing_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      [
        shop_name.trim(),
        code,
        owner_name.trim(),
        phone.trim(),
        email.trim(),
        location || "Kigali, Rwanda",
        tin_number ? tin_number.trim() : null,
        business_type || "Hardware & Construction",
        planName,
        accountsNum,
        stocksNum,
        monthlyFee,
        `Initial registration: Base RWF 15,000 + ${accountsNum} account(s) + ${stocksNum} stock(s).`
      ]
    );
    const newShopId = shopRes.lastInsertId;
    const stockRes = await execute(
      `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'active')`,
      [
        newShopId,
        `Main ${shop_name.trim()} Central Warehouse`,
        `WH-${code.slice(0, 6).toUpperCase()}-01`,
        location || "Kigali, Rwanda",
        owner_name.trim(),
        phone.trim()
      ]
    );
    const primaryStockId = stockRes.lastInsertId;
    if (stocksNum > 1) {
      for (let i = 2; i <= stocksNum; i++) {
        await execute(
          `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
           VALUES (?, ?, ?, ?, ?, ?, 0, 'active')`,
          [
            newShopId,
            `${shop_name.trim()} Branch Depot #${i}`,
            `WH-${code.slice(0, 6).toUpperCase()}-0${i}`,
            `Branch ${i} Location, Rwanda`,
            owner_name.trim(),
            phone.trim()
          ]
        );
      }
    }
    const hashedPassword = await bcrypt3.hash(password, 10);
    await execute(
      `INSERT INTO users (
        shop_id, stock_id, name, email, password, role, job_title, phone, is_active, activation_status,
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
        can_partner_borrow, can_view_buying_prices, can_give_discounts, can_view_reports, can_manage_users,
        can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners,
        can_void_orders, can_edit_company_settings
      ) VALUES (?, ?, ?, ?, ?, 'manager', 'Store Owner / Manager', ?, 1, 'pending_approval', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)`,
      [newShopId, primaryStockId, owner_name.trim(), email.trim(), hashedPassword, phone.trim()]
    );
    await logAudit(void 0, "SHOP_REGISTER", `New store registered on VectOS: "${shop_name}" (${business_type}) by ${owner_name}. Plan: RWF ${monthlyFee}/mo (Pending VectOS SuperAdmin Activation)`, req, newShopId);
    res.render("register_shop", {
      error: null,
      success: `Congratulations! "${shop_name}" has been registered on VectOS with ${accountsNum} staff account(s) and ${stocksNum} warehouse location(s). The VectOS team will contact you to arrange your preferred payment plan, and your access will be unlocked upon review.`
    });
  } catch (err) {
    res.render("register_shop", { error: "Registration error: " + err.message, success: null });
  }
});
router2.get("/logout", async (req, res) => {
  if (req.session.user) {
    await logAudit(req.session.user.id, "USER_LOGOUT", "User logged out", req);
  }
  req.session.destroy(() => {
    res.redirect("/login");
  });
});
router2.get("/admin/shops", requireSuperAdmin, async (req, res) => {
  const user = req.session.user;
  try {
    const shops = await queryAll(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM users WHERE shop_id = s.id) as user_count,
        (SELECT COUNT(*) FROM users WHERE shop_id = s.id AND activation_status = 'pending_approval') as pending_user_count,
        (SELECT COUNT(*) FROM stocks WHERE shop_id = s.id) as stock_count,
        (SELECT COUNT(*) FROM products WHERE shop_id = s.id) as product_count,
        (SELECT COUNT(*) FROM orders WHERE shop_id = s.id) as order_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE shop_id = s.id) as total_sales
      FROM shops s
      ORDER BY s.id DESC
    `);
    const allUsers = await queryAll(`
      SELECT u.*, s.name as shop_name, st.name as stock_name
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      LEFT JOIN stocks st ON u.stock_id = st.id
      ORDER BY u.activation_status = 'pending_approval' DESC, u.shop_id ASC, u.role = 'manager' DESC
    `);
    const allStocks = await queryAll(`
      SELECT st.*, s.name as shop_name,
        (SELECT COUNT(*) FROM products WHERE stock_id = st.id) as product_count,
        (SELECT COALESCE(SUM(quantity), 0) FROM products WHERE stock_id = st.id) as total_units
      FROM stocks st
      LEFT JOIN shops s ON st.shop_id = s.id
      ORDER BY st.shop_id ASC, st.is_main DESC
    `);
    const stats = {
      totalShops: shops.length,
      activeShops: shops.filter((s) => s.status === "active").length,
      pendingShops: shops.filter((s) => s.status === "pending").length,
      suspendedShops: shops.filter((s) => s.status === "suspended").length,
      platformSales: shops.reduce((acc, s) => acc + (s.total_sales || 0), 0),
      totalMonthlyMRR: shops.filter((s) => s.status === "active").reduce((acc, s) => acc + (s.monthly_fee || 2e4), 0),
      totalPendingStaff: allUsers.filter((u) => u.activation_status === "pending_approval").length
    };
    res.render("admin/shops", { user, shops, allUsers, allStocks, stats, message: req.query.msg || null });
  } catch (err) {
    console.error("SuperAdmin Error:", err);
    res.status(500).render("error", { title: "SuperAdmin Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/admin/shops/approve/:id", requireSuperAdmin, async (req, res) => {
  const shopId = parseInt(req.params.id, 10);
  try {
    const shop = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    if (!shop) return res.status(404).send("Shop not found");
    await execute("UPDATE shops SET status = 'active' WHERE id = ?", [shopId]);
    await execute("UPDATE users SET is_active = 1, activation_status = 'active' WHERE shop_id = ? AND role = 'manager'", [shopId]);
    await logAudit(req.session.user.id, "SUPERADMIN_APPROVE_SHOP", `SuperAdmin approved and activated company: "${shop.name}" (#${shopId})`, req, shopId);
    res.redirect("/admin/shops?msg=Company+and+Manager+approved+and+activated+successfully");
  } catch (err) {
    console.error("Approval Error:", err);
    res.status(500).render("error", { title: "Approval Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/admin/shops/toggle-status/:id", requireSuperAdmin, async (req, res) => {
  const shopId = parseInt(req.params.id, 10);
  const { new_status } = req.body;
  try {
    const shop = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    if (!shop) return res.status(404).send("Shop not found");
    await execute("UPDATE shops SET status = ? WHERE id = ?", [new_status, shopId]);
    if (new_status === "suspended") {
      await execute("UPDATE users SET is_active = 0 WHERE shop_id = ?", [shopId]);
    } else if (new_status === "active") {
      await execute("UPDATE users SET is_active = 1 WHERE shop_id = ? AND role = 'manager'", [shopId]);
    }
    await logAudit(req.session.user.id, "SUPERADMIN_STATUS_CHANGE", `SuperAdmin set company "${shop.name}" status to ${new_status.toUpperCase()} (Cascade applied to all staff accounts)`, req, shopId);
    res.redirect("/admin/shops?msg=Company+status+and+staff+access+updated+successfully");
  } catch (err) {
    console.error("Status Error:", err);
    res.status(500).render("error", { title: "Status Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/admin/shops/update-billing/:id", requireSuperAdmin, async (req, res) => {
  const shopId = parseInt(req.params.id, 10);
  const { billed_accounts, billed_stocks, monthly_fee, billing_notes, subscription_plan } = req.body;
  try {
    const shop = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    if (!shop) return res.status(404).send("Shop not found");
    const rawAccounts = parseInt(billed_accounts, 10);
    const accounts = Number.isFinite(rawAccounts) && rawAccounts >= 1 ? Math.max(1, rawAccounts) : 1;
    const rawStocks = parseInt(billed_stocks, 10);
    const stocks = Number.isFinite(rawStocks) && rawStocks >= 1 ? Math.max(1, rawStocks) : 1;
    const rawFee = parseFloat(monthly_fee);
    const fee = Number.isFinite(rawFee) && rawFee >= 0 ? rawFee : 15e3 + accounts * 5e3 + stocks * 5e3;
    if (!Number.isFinite(fee) || fee < 0) {
      return res.status(400).render("error", { title: "Invalid Billing", message: "Monthly fee must be a valid non-negative finite number.", path: req.path });
    }
    await execute(
      `UPDATE shops SET 
        billed_accounts = ?, billed_stocks = ?, monthly_fee = ?, billing_notes = ?, subscription_plan = ?
       WHERE id = ?`,
      [accounts, stocks, fee, billing_notes || null, subscription_plan || `VectOS Plan (RWF ${fee.toLocaleString()}/mo)`, shopId]
    );
    await logAudit(req.session.user.id, "SUPERADMIN_UPDATE_BILLING", `Updated billing structure for ${shop.name}: RWF ${fee}/mo (${accounts} accounts, ${stocks} stocks)`, req, shopId);
    res.redirect("/admin/shops?msg=Billing+and+pricing+structure+updated");
  } catch (err) {
    console.error("Billing Update Error:", err);
    res.status(500).render("error", { title: "Billing Update Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/admin/users/reset-password/:id", requireSuperAdmin, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  try {
    const targetUser = await queryOne("SELECT * FROM users WHERE id = ?", [targetId]);
    if (!targetUser) return res.status(404).send("User not found");
    const provided = (req.body.new_password || "").trim();
    let tempPassword;
    if (provided.length >= 6) {
      tempPassword = provided;
    } else {
      const words = ["Kigali", "Nyanza", "Muhazi", "Kivu", "Gorilla", "Akagera", "Inyange", "Umuganda"];
      tempPassword = words[Math.floor(Math.random() * words.length)] + "-" + Math.floor(1e3 + Math.random() * 9e3) + "!";
    }
    const hashed = await bcrypt3.hash(tempPassword, 10);
    await execute(
      "UPDATE users SET password = ?, is_active = 1, activation_status = 'active' WHERE id = ?",
      [hashed, targetId]
    );
    await logAudit(req.session.user.id, "SUPERADMIN_PASSWORD_RESET", `SuperAdmin reset password for ${targetUser.name} (${targetUser.email})`, req, targetUser.shop_id);
    res.redirect("/admin/shops?msg=" + encodeURIComponent(`Password reset for ${targetUser.name}. Temporary password: ${tempPassword} \u2014 share it securely; they must change it in Settings.`));
  } catch (err) {
    console.error("Password Reset Error:", err);
    res.status(500).render("error", { title: "Password Reset Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/admin/users/toggle-activation/:id", requireSuperAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { new_status, activation_note } = req.body;
  try {
    const targetUser = await queryOne("SELECT u.*, s.name as shop_name FROM users u LEFT JOIN shops s ON u.shop_id = s.id WHERE u.id = ?", [userId]);
    if (!targetUser) return res.status(404).send("User not found");
    if (targetUser.id === req.session.user.id && new_status !== "active") {
      return res.redirect("/admin/shops?msg=You+cannot+deactivate+your+own+superadmin+account");
    }
    const isActive = new_status === "active" ? 1 : 0;
    await execute(
      "UPDATE users SET is_active = ?, activation_status = ?, activation_note = ? WHERE id = ?",
      [isActive, new_status, activation_note || null, userId]
    );
    if (targetUser.role === "manager" && new_status !== "active") {
      await execute("UPDATE users SET is_active = 0 WHERE shop_id = ?", [targetUser.shop_id]);
      await logAudit(req.session.user.id, "CASCADE_MANAGER_DEACTIVATION", `Manager ${targetUser.name} deactivated; cascaded suspension to all staff in "${targetUser.shop_name}"`, req, targetUser.shop_id);
    }
    if (targetUser.role === "manager" && new_status === "active") {
      await execute(
        "UPDATE users SET is_active = 1 WHERE shop_id = ? AND id <> ? AND activation_status = 'active'",
        [targetUser.shop_id, userId]
      );
      await logAudit(req.session.user.id, "CASCADE_MANAGER_REACTIVATION", `Manager ${targetUser.name} reactivated; restored access for approved staff in "${targetUser.shop_name}"`, req, targetUser.shop_id);
    }
    await logAudit(req.session.user.id, "SUPERADMIN_USER_ACTIVATION", `SuperAdmin set user ${targetUser.name} (${targetUser.email}) activation to ${new_status.toUpperCase()}`, req, targetUser.shop_id);
    res.redirect("/admin/shops?msg=User+activation+status+updated+successfully");
  } catch (err) {
    console.error("User Activation Error:", err);
    res.status(500).render("error", { title: "User Activation Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/admin/switch-shop/:id", requireSuperAdmin, async (req, res) => {
  const shopId = parseInt(req.params.id, 10);
  try {
    const shop = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    if (shop && req.session.user) {
      req.session.user.shop_id = shop.id;
      req.session.user.shop_name = shop.name;
    }
    res.redirect("/dashboard");
  } catch (err) {
    res.redirect("/admin/shops");
  }
});
router2.get("/admin/exit-assist", requireSuperAdmin, async (req, res) => {
  if (req.session.user) {
    req.session.user.shop_id = 0;
    req.session.user.shop_name = "Central Platform (SuperAdmin)";
  }
  res.redirect("/admin/shops");
});
router2.get("/dashboard", requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  try {
    const shopInfo = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    const todaySales = await queryOne(`
      SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count 
      FROM orders 
      WHERE shop_id = ? AND CAST(created_at AS DATE) = CURRENT_DATE
    `, [shopId]).catch(() => null) || { total: 0, count: 0 };
    const todayProfitRes = await queryOne(`
      SELECT COALESCE(SUM(oi.profit), 0) as total_profit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.shop_id = ? AND CAST(o.created_at AS DATE) = CURRENT_DATE AND oi.item_status IN ('approved', 'partner_fulfilled')
    `, [shopId]);
    const todayProfit = todayProfitRes ? todayProfitRes.total_profit : 0;
    const invValRes = await queryOne(`
      SELECT COALESCE(SUM(buying_price * quantity), 0) as total_value, COUNT(*) as total_items,
             SUM(CASE WHEN quantity <= low_stock_threshold THEN 1 ELSE 0 END) as low_stock_count
      FROM products
      WHERE shop_id = ?
    `, [shopId]);
    const pendingStoreCountRes = await queryOne(`
      SELECT COUNT(*) as cnt FROM orders WHERE shop_id = ? AND fulfillment_status = 'pending_store'
    `, [shopId]);
    const pendingStoreCount = pendingStoreCountRes ? pendingStoreCountRes.cnt : 0;
    const pendingAccountantCountRes = await queryOne(`
      SELECT COUNT(*) as cnt FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.shop_id = ? AND oi.item_status = 'rejected'
    `, [shopId]);
    const pendingAccountantCount = pendingAccountantCountRes ? pendingAccountantCountRes.cnt : 0;
    const customerDebtRes = await queryOne(`SELECT COALESCE(SUM(credit_balance), 0) as total_debt FROM customers WHERE shop_id = ?`, [shopId]);
    const partnerBalanceRes = await queryOne(`SELECT COALESCE(SUM(current_balance), 0) as total_partner FROM partner_shops WHERE shop_id = ?`, [shopId]);
    const recentOrders = await queryAll(`
      SELECT o.*, c.name as customer_name, u.name as salesperson_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.salesperson_id = u.id
      WHERE o.shop_id = ?
      ORDER BY o.id DESC LIMIT 6
    `, [shopId]);
    const lowStockProducts = await queryAll(`
      SELECT * FROM products WHERE shop_id = ? AND quantity <= low_stock_threshold ORDER BY quantity ASC LIMIT 5
    `, [shopId]);
    res.render("dashboard", {
      user,
      shopInfo,
      kpis: {
        todaySalesTotal: todaySales.total || 0,
        todaySalesCount: todaySales.count || 0,
        todayProfit: todayProfit || 0,
        inventoryValue: invValRes ? invValRes.total_value : 0,
        totalProductLines: invValRes ? invValRes.total_items : 0,
        lowStockCount: invValRes ? invValRes.low_stock_count : 0,
        pendingStoreCount,
        pendingAccountantCount,
        totalCustomerDebt: customerDebtRes ? customerDebtRes.total_debt : 0,
        totalPartnerBalance: partnerBalanceRes ? partnerBalanceRes.total_partner : 0
      },
      recentOrders,
      lowStockProducts
    });
  } catch (err) {
    console.error("Dashboard Error:", err);
    res.status(500).render("error", { title: "Dashboard Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/products", requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const search = req.query.search ? String(req.query.search).trim() : "";
  const category = req.query.category ? String(req.query.category) : "";
  const msg = req.query.msg ? String(req.query.msg) : null;
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit || "50"), 10) || 50));
  const offset = (page - 1) * limit;
  try {
    let sql = "SELECT * FROM products WHERE shop_id = ?";
    let countSql = "SELECT COUNT(*) as total FROM products WHERE shop_id = ?";
    const params = [shopId];
    const countParams = [shopId];
    if (search) {
      const escSearch = search.replace(/[%_\\]/g, "\\$&");
      sql += ' AND (name LIKE ? ESCAPE "\\" OR sku LIKE ? ESCAPE "\\" OR description LIKE ? ESCAPE "\\")';
      countSql += ' AND (name LIKE ? ESCAPE "\\" OR sku LIKE ? ESCAPE "\\" OR description LIKE ? ESCAPE "\\")';
      params.push(`%${escSearch}%`, `%${escSearch}%`, `%${escSearch}%`);
      countParams.push(`%${escSearch}%`, `%${escSearch}%`, `%${escSearch}%`);
    }
    if (category) {
      sql += " AND category = ?";
      countSql += " AND category = ?";
      params.push(category);
      countParams.push(category);
    }
    sql += " ORDER BY name ASC LIMIT ? OFFSET ?";
    params.push(limit, offset);
    const products = await queryAll(sql, params);
    const countRes = await queryOne(countSql, countParams);
    const total = countRes ? Number(countRes.total) : 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const categoriesRes = await queryAll("SELECT DISTINCT category FROM products WHERE shop_id = ? ORDER BY category ASC", [shopId]);
    const categories = categoriesRes.map((c) => c.category);
    res.render("products", {
      user,
      products,
      categories,
      search,
      selectedCategory: category,
      msg,
      pagination: { page, limit, total, totalPages }
    });
  } catch (err) {
    console.error("Products Error:", err);
    res.status(500).render("error", { title: "Products Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/products/sample-template", requireAuth, async (req, res) => {
  const sampleData = [
    {
      "Product Name": "CIMERWA Cement 32.5R (50kg)",
      "SKU / Code": "CEM-325R",
      "Category": "Cement",
      "Unit": "Bag",
      "Buying Price": 10500,
      "Initial Quantity": 250,
      "Low Stock Alert": 50,
      "Description": "Standard construction cement"
    },
    {
      "Product Name": "Deformed Iron Bars 12mm x 12m",
      "SKU / Code": "IB-12MM",
      "Category": "Steel & Rebar",
      "Unit": "Bar",
      "Buying Price": 11e3,
      "Initial Quantity": 300,
      "Low Stock Alert": 40,
      "Description": "Fe500 grade rebar"
    },
    {
      "Product Name": "Roofing Sheets Gauge 28 Blue (3m)",
      "SKU / Code": "RS-G28-BL",
      "Category": "Roofing",
      "Unit": "Sheet",
      "Buying Price": 14500,
      "Initial Quantity": 100,
      "Low Stock Alert": 20,
      "Description": "Color-coated corrugated iron sheets"
    },
    {
      "Product Name": "PVC Pressure Pipe 110mm PN10 (6m)",
      "SKU / Code": "PVC-110MM",
      "Category": "Plumbing",
      "Unit": "Pipe",
      "Buying Price": 16e3,
      "Initial Quantity": 45,
      "Low Stock Alert": 10,
      "Description": "Heavy duty drainage pipe"
    }
  ];
  const XLSX = await import("xlsx");
  const ws2 = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws2, "Products");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", 'attachment; filename="Quincaille_Stock_Import_Template.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});
router2.post("/products/import-excel", requirePermission("can_manage_stock"), uploadSpreadsheet.single("file"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  if (!req.file || !req.file.buffer) {
    return res.status(400).render("error", {
      title: "Import Error",
      message: "Please select a valid .xlsx, .xls, or .csv file to import.",
      path: req.path
    });
  }
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet);
    if (!rawRows || rawRows.length === 0) {
      return res.status(400).render("error", {
        title: "Empty File",
        message: "The uploaded spreadsheet contains no data rows.",
        path: req.path
      });
    }
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedRows = 0;
    for (const row of rawRows) {
      const name = (row["Product Name"] || row["product_name"] || row["Name"] || row["name"] || row["Item"] || row["item"] || "").toString().trim();
      if (!name) {
        skippedRows++;
        continue;
      }
      const sku = (row["SKU / Code"] || row["SKU"] || row["sku"] || row["Code"] || row["code"] || "").toString().trim() || null;
      const category = (row["Category"] || row["category"] || "General Hardware").toString().trim();
      const unit = (row["Unit"] || row["unit"] || "pcs").toString().trim();
      const rawBuyingPriceStr = row["Buying Price"] || row["buying_price"] || row["Cost"] || row["Price"];
      if (rawBuyingPriceStr === void 0 || rawBuyingPriceStr === null || String(rawBuyingPriceStr).trim() === "") {
        skippedRows++;
        continue;
      }
      const parsedPrice = parseFloat(rawBuyingPriceStr);
      if (!isFinite(parsedPrice) || parsedPrice < 0) {
        skippedRows++;
        continue;
      }
      let buyingPrice = parsedPrice;
      const rawQty = row["Initial Quantity"] || row["Quantity"] || row["quantity"] || row["Stock"] || row["qty"] || 0;
      const quantity = parseInt(rawQty, 10);
      if (isNaN(quantity)) {
        skippedRows++;
        continue;
      }
      if (quantity < 0) {
        skippedRows++;
        continue;
      }
      const rawLow = row["Low Stock Alert"] || row["low_stock_threshold"] || row["Min Stock"];
      let lowStock = parseInt(rawLow, 10);
      if (isNaN(lowStock) || lowStock < 0) lowStock = 10;
      const description = (row["Description"] || row["description"] || "").toString().trim() || null;
      let existing = null;
      if (sku) {
        existing = await queryOne("SELECT * FROM products WHERE shop_id = ? AND sku = ?", [shopId, sku]);
      }
      if (!existing) {
        existing = await queryOne("SELECT * FROM products WHERE shop_id = ? AND LOWER(name) = LOWER(?)", [shopId, name]);
      }
      if (existing) {
        const newQty = existing.quantity + quantity;
        await execute(
          `UPDATE products SET buying_price = ?, quantity = ?, low_stock_threshold = ?, description = COALESCE(?, description), updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [buyingPrice > 0 ? buyingPrice : existing.buying_price, newQty, lowStock, description, existing.id]
        );
        if (quantity > 0) {
          await execute(
            `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
             VALUES (?, ?, ?, 'Stock Received', 'Excel Bulk Import', ?)`,
            [shopId, existing.id, quantity, user.id]
          );
        }
        updatedCount++;
      } else {
        if (buyingPrice < 0 || !isFinite(buyingPrice)) buyingPrice = 0;
        const resProd = await execute(
          `INSERT INTO products (shop_id, name, sku, category, unit, buying_price, quantity, low_stock_threshold, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [shopId, name, sku, category, unit, buyingPrice, quantity, lowStock, description]
        );
        if (quantity > 0) {
          await execute(
            `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
             VALUES (?, ?, ?, 'Stock Received', 'Excel Bulk Import Initial', ?)`,
            [shopId, resProd.lastInsertId, quantity, user.id]
          );
        }
        insertedCount++;
      }
    }
    await logAudit(user.id, "BULK_IMPORT", `Imported spreadsheet with ${insertedCount} new products added and ${updatedCount} existing products updated.`, req, shopId);
    res.redirect(`/products?msg=Bulk+import+successful!+Added+${insertedCount}+new+products,+updated+${updatedCount}+products.`);
  } catch (err) {
    console.error("Excel Import Error:", err);
    res.status(500).render("error", { title: "Bulk Import Failed", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/products/batch-add", requirePermission("can_manage_stock"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { batch_items } = req.body;
  try {
    let items = [];
    if (typeof batch_items === "string") {
      items = JSON.parse(batch_items);
    } else if (Array.isArray(batch_items)) {
      items = batch_items;
    }
    let addedCount = 0;
    for (const item of items) {
      const name = String(item.name || "").trim();
      if (!name) continue;
      const rawBuyPrice = parseFloat(item.buying_price);
      if (!Number.isFinite(rawBuyPrice) || rawBuyPrice < 0) {
        return res.status(400).render("error", { title: "Invalid Product Data", message: `Buying price for "${name}" must be a valid non-negative number.`, path: req.path });
      }
      const buyingPrice = rawBuyPrice;
      const rawQty = parseInt(item.quantity, 10);
      if (!Number.isFinite(rawQty) || rawQty < 0 || !Number.isInteger(rawQty)) {
        return res.status(400).render("error", { title: "Invalid Product Data", message: `Quantity for "${name}" must be a valid non-negative integer.`, path: req.path });
      }
      const quantity = rawQty;
      const category = item.category || "General";
      const unit = item.unit || "pcs";
      const sku = item.sku || null;
      const resProd = await execute(
        `INSERT INTO products (shop_id, name, sku, category, unit, buying_price, quantity, low_stock_threshold, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, 10, ?)`,
        [shopId, name, sku, category, unit, buyingPrice, Math.max(0, quantity), item.description || null]
      );
      if (quantity > 0) {
        await execute(
          `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
           VALUES (?, ?, ?, 'Stock Received', 'Batch Quick Entry', ?)`,
          [shopId, resProd.lastInsertId, quantity, user.id]
        );
      }
      addedCount++;
    }
    await logAudit(user.id, "BATCH_ADD", `Added ${addedCount} products via batch quick entry.`, req, shopId);
    res.redirect(`/products?msg=${addedCount}+products+added+successfully`);
  } catch (err) {
    console.error("Batch Add Error:", err);
    res.status(500).render("error", { title: "Batch Add Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/products/add", requirePermission("can_manage_stock"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { name, sku, category, unit, buying_price, initial_quantity, low_stock_threshold, description } = req.body;
  try {
    const buyPrice = parseFloat(buying_price);
    const initQty = parseInt(initial_quantity, 10);
    const rawThreshold = parseInt(low_stock_threshold, 10);
    const threshold = isNaN(rawThreshold) ? 10 : rawThreshold;
    const trimmedName = String(name || "").trim();
    const trimmedCategory = String(category || "").trim();
    if (!trimmedName) {
      return res.status(400).render("error", { title: "Product Validation Error", message: "Product name is required.", path: req.path });
    }
    if (!trimmedCategory) {
      return res.status(400).render("error", { title: "Product Validation Error", message: "Category is required.", path: req.path });
    }
    if (!isFinite(buyPrice) || buyPrice < 0) {
      return res.status(400).render("error", { title: "Product Validation Error", message: "Buying price must be a valid non-negative number.", path: req.path });
    }
    if (isNaN(initQty) || initQty < 0 || !Number.isInteger(initQty)) {
      return res.status(400).render("error", { title: "Product Validation Error", message: "Initial quantity must be a non-negative integer.", path: req.path });
    }
    if (threshold < 0) {
      return res.status(400).render("error", { title: "Product Validation Error", message: "Low stock threshold cannot be negative.", path: req.path });
    }
    const trimmedSku = String(sku || "").trim() || null;
    if (trimmedSku) {
      const existingSku = await queryOne("SELECT id FROM products WHERE shop_id = ? AND sku = ?", [shopId, trimmedSku]);
      if (existingSku) {
        return res.status(400).render("error", { title: "Duplicate SKU", message: `A product with SKU "${trimmedSku}" already exists in your store.`, path: req.path });
      }
    }
    const resProd = await execute(
      `INSERT INTO products (shop_id, name, sku, category, unit, buying_price, quantity, low_stock_threshold, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [shopId, trimmedName, trimmedSku, trimmedCategory, unit ? String(unit).trim() || "pcs" : "pcs", buyPrice, initQty, threshold, description ? String(description).trim() || null : null]
    );
    if (initQty > 0) {
      await execute(
        `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, 'Stock Received', 'Initial Inventory Setup', ?)`,
        [shopId, resProd.lastInsertId, initQty, user.id]
      );
    }
    await logAudit(user.id, "PRODUCT_ADD", `Added new product: ${name} (${category}, Buy Price: ${buyPrice})`, req, shopId);
    res.redirect("/products?msg=Product+added+successfully");
  } catch (err) {
    const msg = String(err.message || "");
    if (msg.includes("UNIQUE") || msg.toLowerCase().includes("unique") || msg.includes("duplicate")) {
      if (msg.toLowerCase().includes("sku") || msg.includes("idx_products_shop_sku")) {
        return res.status(400).render("error", { title: "Duplicate SKU", message: "A product with this SKU already exists in your store.", path: req.path });
      }
    }
    console.error("Product Creation Error:", err);
    res.status(500).render("error", { title: "Product Creation Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/products/adjust-stock", requirePermission("can_manage_stock"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { product_id, adjustment_qty, movement_type, reference } = req.body;
  try {
    const prodId = parseInt(product_id, 10);
    const adjQty = parseInt(adjustment_qty, 10);
    if (isNaN(prodId) || isNaN(adjQty) || adjQty === 0) {
      return res.redirect("/products");
    }
    const product = await queryOne("SELECT * FROM products WHERE id = ? AND shop_id = ?", [prodId, shopId]);
    if (!product) return res.redirect("/products");
    const newQty = product.quantity + adjQty;
    if (newQty < 0) {
      return res.status(400).render("error", {
        title: "Stock Adjustment Error",
        message: `Cannot reduce quantity below 0. Current stock: ${product.quantity}`,
        path: req.path
      });
    }
    await execute("UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [newQty, prodId]);
    await execute(
      `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [shopId, prodId, adjQty, movement_type || "Adjustment", reference || "Manual Stock Update", user.id]
    );
    await logAudit(user.id, "STOCK_UPDATE", `Updated stock for ${product.name}: ${adjQty > 0 ? "+" : ""}${adjQty} (New Qty: ${newQty})`, req, shopId);
    res.redirect("/products?msg=Stock+updated+successfully");
  } catch (err) {
    console.error("Stock Update Error:", err);
    res.status(500).render("error", { title: "Stock Update Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/customers", requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  try {
    const customers = await queryAll(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND shop_id = ?) as total_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE customer_id = c.id AND shop_id = ?) as total_spent
      FROM customers c
      WHERE c.shop_id = ?
      ORDER BY c.name ASC
    `, [shopId, shopId, shopId]);
    res.render("customers", { user, customers });
  } catch (err) {
    console.error("Customers Error:", err);
    res.status(500).render("error", { title: "Customers Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/customers/add", requirePermission("can_manage_customers"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { name, phone, id_number, email, address } = req.body;
  try {
    const existing = await queryOne("SELECT * FROM customers WHERE shop_id = ? AND phone = ?", [shopId, phone]);
    if (existing) {
      return res.status(400).render("error", {
        title: "Duplicate Customer",
        message: `A customer with phone number ${phone} already exists (${existing.name}).`,
        path: req.path
      });
    }
    await execute(
      "INSERT INTO customers (shop_id, name, phone, id_number, email, address, credit_balance) VALUES (?, ?, ?, ?, ?, ?, 0.0)",
      [shopId, name, phone, id_number || null, email || null, address || null]
    );
    await logAudit(user.id, "CUSTOMER_ADD", `Registered new customer: ${name} (${phone})`, req, shopId);
    res.redirect("/customers");
  } catch (err) {
    console.error("Customer Registration Error:", err);
    const msg = String(err.message || "");
    if (msg.includes("UNIQUE") || msg.toLowerCase().includes("duplicate") || msg.includes("idx_customers_shop_phone")) {
      return res.status(400).render("error", { title: "Duplicate Customer", message: `A customer with phone number ${phone} already exists.`, path: req.path });
    }
    res.status(500).render("error", { title: "Customer Registration Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/orders", requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const filterStatus = req.query.status ? String(req.query.status) : "";
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit || "50"), 10) || 50));
  const offset = (page - 1) * limit;
  try {
    let sql = `
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.id_number as customer_id_number, u.name as salesperson_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.salesperson_id = u.id
      WHERE o.shop_id = ?
    `;
    let countSql = "SELECT COUNT(*) as total FROM orders o WHERE o.shop_id = ?";
    const params = [shopId];
    const countParams = [shopId];
    if (filterStatus) {
      sql += " AND (o.fulfillment_status = ? OR o.payment_status = ?)";
      countSql += " AND (o.fulfillment_status = ? OR o.payment_status = ?)";
      params.push(filterStatus, filterStatus);
      countParams.push(filterStatus, filterStatus);
    }
    sql += " ORDER BY o.id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);
    const orders = await queryAll(sql, params);
    const countRes = await queryOne(countSql, countParams);
    const total = countRes ? Number(countRes.total) : 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.render("orders", { user, orders, filterStatus, pagination: { page, limit, total, totalPages } });
  } catch (err) {
    console.error("Orders List Error:", err);
    res.status(500).render("error", { title: "Orders List Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/orders/new", requirePermission("can_create_orders"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  try {
    const customers = await queryAll("SELECT * FROM customers WHERE shop_id = ? ORDER BY name ASC", [shopId]);
    const products = await queryAll("SELECT * FROM products WHERE shop_id = ? ORDER BY name ASC", [shopId]);
    const partners = await queryAll("SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC", [shopId]);
    res.render("order_new", { user, customers, products, partners });
  } catch (err) {
    console.error("New Order Form Error:", err);
    res.status(500).render("error", { title: "New Order Form Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/orders/create", requirePermission("can_create_orders"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const {
    customer_mode,
    customer_id,
    new_customer_name,
    new_customer_phone,
    new_customer_id_number,
    items,
    notes,
    client_ref
  } = req.body;
  try {
    if (client_ref) {
      const dupe = await queryOne("SELECT id, order_number FROM orders WHERE shop_id = ? AND client_ref = ?", [shopId, String(client_ref)]);
      if (dupe) {
        await logAudit(user.id, "OFFLINE_DUPLICATE_IGNORED", `Duplicate submission of offline order ${dupe.order_number} (ref ${client_ref}) ignored`, req, shopId);
        return res.redirect("/orders?msg=This+order+was+already+received+from+offline+mode");
      }
    }
    let custId = parseInt(customer_id, 10);
    if (customer_mode === "new" || !customer_id && new_customer_name && new_customer_phone) {
      const trimmedName = String(new_customer_name || "").trim();
      const trimmedPhone = String(new_customer_phone || "").trim();
      const trimmedIdNo = String(new_customer_id_number || "").trim();
      if (!trimmedName || !trimmedPhone) {
        return res.status(400).render("error", {
          title: "Customer Details Missing",
          message: "To automatically register a new customer, please enter both Full Name and Phone Number.",
          path: req.path
        });
      }
      let existingCust = await queryOne("SELECT * FROM customers WHERE shop_id = ? AND phone = ?", [shopId, trimmedPhone]);
      if (!existingCust && trimmedIdNo) {
        existingCust = await queryOne("SELECT * FROM customers WHERE shop_id = ? AND id_number = ?", [shopId, trimmedIdNo]);
      }
      if (existingCust) {
        custId = existingCust.id;
        if (trimmedIdNo && !existingCust.id_number) {
          await execute("UPDATE customers SET id_number = ? WHERE id = ? AND shop_id = ?", [trimmedIdNo, custId, shopId]);
        }
      } else {
        const resCust = await execute(
          "INSERT INTO customers (shop_id, name, phone, id_number, credit_balance) VALUES (?, ?, ?, ?, 0.0)",
          [shopId, trimmedName, trimmedPhone, trimmedIdNo || null]
        );
        custId = resCust.lastInsertId;
        await logAudit(user.id, "CUSTOMER_AUTO_REGISTER", `Auto-registered customer ${trimmedName} (${trimmedPhone}) during order placement`, req, shopId);
      }
    }
    if (isNaN(custId)) {
      return res.status(400).render("error", {
        title: "Invalid Client Selection",
        message: "Please select an existing customer or enter details for a new customer to proceed.",
        path: req.path
      });
    }
    let parsedItems = [];
    if (typeof items === "string") {
      try {
        parsedItems = JSON.parse(items);
      } catch {
        return res.status(400).render("error", { title: "Invalid Order Data", message: "Order items could not be parsed. Please try again.", path: req.path });
      }
    } else if (Array.isArray(items)) {
      parsedItems = items;
    }
    if (!parsedItems || parsedItems.length === 0) {
      return res.status(400).render("error", { title: "Empty Order", message: "Order must contain at least one line item.", path: req.path });
    }
    let grandTotal = 0;
    const validatedLines = [];
    for (const item of parsedItems) {
      const qty = parseInt(String(item.quantity), 10);
      const selPrice = parseFloat(String(item.selling_price));
      if (!Number.isFinite(qty) || !Number.isFinite(selPrice) || qty <= 0 || selPrice < 0 || !Number.isInteger(qty)) {
        return res.status(400).render("error", { title: "Invalid Order Data", message: "Each order item must have a valid positive integer quantity and non-negative finite selling price.", path: req.path });
      }
      let prodId = parseInt(String(item.product_id), 10);
      if (isNaN(prodId)) prodId = null;
      let buyPrice = parseFloat(String(item.buying_price)) || 0;
      let fulfillSource = "Store";
      let itemStatus = "pending_store";
      let partnerShopId = item.partner_shop_id ? parseInt(String(item.partner_shop_id), 10) : null;
      if (partnerShopId !== null && isNaN(partnerShopId)) partnerShopId = null;
      let adhocPending = null;
      if (item.is_adhoc || !prodId) {
        const adhocName = String(item.product_name || item.name || "Ad-Hoc Material").trim();
        const adhocCat = String(item.category || "Special Order").trim();
        const adhocUnit = String(item.unit || "pcs").trim();
        const adhocBuyPrice = parseFloat(String(item.buying_price)) || selPrice * 0.85;
        if (!Number.isFinite(adhocBuyPrice) || adhocBuyPrice < 0) {
          return res.status(400).render("error", { title: "Invalid Order Data", message: `Buying price for ad-hoc item "${adhocName}" must be a valid non-negative finite number.`, path: req.path });
        }
        const existingProd = await queryOne("SELECT id FROM products WHERE shop_id = ? AND LOWER(name) = LOWER(?)", [shopId, adhocName]);
        if (existingProd) {
          prodId = existingProd.id;
        } else {
          prodId = null;
          adhocPending = { name: adhocName, cat: adhocCat, unit: adhocUnit, buyPrice: adhocBuyPrice };
        }
        buyPrice = adhocBuyPrice;
        if (item.source_type === "partner" && partnerShopId) {
          const partner = await queryOne("SELECT name FROM partner_shops WHERE id = ? AND shop_id = ?", [partnerShopId, shopId]);
          fulfillSource = partner ? partner.name : "Partner Shop";
          itemStatus = "partner_fulfilled";
        }
      } else {
        const prod = await queryOne("SELECT id, buying_price FROM products WHERE id = ? AND shop_id = ?", [prodId, shopId]);
        if (!prod) continue;
        buyPrice = prod.buying_price;
      }
      const subtotal = selPrice * qty;
      const profit = (selPrice - buyPrice) * qty;
      grandTotal += subtotal;
      validatedLines.push({
        product_id: prodId,
        quantity: qty,
        buying_price: buyPrice,
        selling_price: selPrice,
        subtotal,
        profit,
        fulfillment_source: fulfillSource,
        item_status: itemStatus,
        partner_shop_id: partnerShopId,
        _adhocPending: adhocPending
      });
    }
    if (validatedLines.length === 0) {
      return res.status(400).render("error", { title: "Order Validation Error", message: "No valid items found in order.", path: req.path });
    }
    const allPartner = validatedLines.every((l) => l.item_status === "partner_fulfilled");
    const initFulfillStatus = allPartner ? "completed" : "pending_store";
    let orderStockId = user.stock_id || null;
    if (!orderStockId) {
      const firstStock = await queryOne("SELECT id FROM stocks WHERE shop_id = ? ORDER BY is_main DESC LIMIT 1", [shopId]);
      orderStockId = firstStock ? firstStock.id : 1;
    }
    let orderId = 0;
    let orderNum = "";
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      const countRes = await queryOne("SELECT COUNT(*) as c FROM orders WHERE shop_id = ?", [shopId]);
      const nextSeq = (countRes ? Number(countRes.c) : 0) + attempts;
      orderNum = `ORD-${(/* @__PURE__ */ new Date()).getFullYear()}-${Date.now().toString().slice(-4)}-${String(nextSeq).padStart(3, "0")}`;
      try {
        await withTransaction(async () => {
          for (const line of validatedLines) {
            const adhoc = line._adhocPending;
            if (adhoc && !line.product_id) {
              const existing = await queryOne("SELECT id FROM products WHERE shop_id = ? AND LOWER(name) = LOWER(?)", [shopId, adhoc.name]);
              if (existing) {
                line.product_id = existing.id;
              } else {
                const newProd = await execute(
                  `INSERT INTO products (shop_id, name, category, unit, buying_price, quantity, low_stock_threshold, description) VALUES (?, ?, ?, ?, ?, 0, 5, ?)`,
                  [shopId, adhoc.name, adhoc.cat, adhoc.unit, adhoc.buyPrice, "Auto-created during order entry"]
                );
                line.product_id = newProd.lastInsertId;
              }
            }
            if (line.item_status === "partner_fulfilled" && line.partner_shop_id) {
              const pCost = line.buying_price * line.quantity;
              await execute("UPDATE partner_shops SET current_balance = current_balance + ? WHERE id = ? AND shop_id = ?", [pCost, line.partner_shop_id, shopId]);
            }
            delete line._adhocPending;
          }
          const orderRes = await execute(
            `INSERT INTO orders (shop_id, stock_id, order_number, customer_id, salesperson_id, total_amount, paid_amount, debt_amount, payment_status, fulfillment_status, notes, client_ref)
             VALUES (?, ?, ?, ?, ?, ?, 0.0, ?, 'pending', ?, ?, ?)`,
            [shopId, orderStockId, orderNum, custId, user.id, grandTotal, grandTotal, initFulfillStatus, notes || null, client_ref ? String(client_ref) : null]
          );
          orderId = orderRes.lastInsertId;
          for (const line of validatedLines) {
            await execute(
              `INSERT INTO order_items (order_id, product_id, quantity, buying_price, selling_price, subtotal, profit, fulfillment_source, item_status, partner_shop_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [orderId, line.product_id, line.quantity, line.buying_price, line.selling_price, line.subtotal, line.profit, line.fulfillment_source, line.item_status, line.partner_shop_id || null]
            );
          }
          if (grandTotal > 0) {
            await execute(
              "UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ? AND shop_id = ?",
              [grandTotal, custId, shopId]
            );
          }
        });
        break;
      } catch (txErr) {
        const msg = String(txErr.message || "");
        if (msg.toLowerCase().includes("client_ref") || msg.includes("idx_orders_shop_client_ref")) {
          return res.redirect("/orders?msg=This+order+was+already+received+from+offline+mode");
        }
        if (msg.includes("UNIQUE") || msg.includes("unique") || msg.includes("duplicate")) {
          if (attempts >= 3) throw txErr;
          continue;
        }
        throw txErr;
      }
    }
    if (!orderId) {
      return res.status(500).render("error", { title: "Order Creation Error", message: "Failed to create order after retries. Please try again.", path: req.path });
    }
    await logAudit(user.id, "ORDER_CREATE", `Created order ${orderNum} (Total: RWF ${grandTotal}, Lines: ${validatedLines.length})`, req, shopId);
    res.redirect(`/orders/${orderId}`);
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).render("error", { title: "Order Creation Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/orders/:id", requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const orderId = parseInt(req.params.id, 10);
  try {
    const order = await queryOne(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email, c.address as customer_address, c.id_number as customer_id_number,
             u.name as salesperson_name, u.role as salesperson_role
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.salesperson_id = u.id
      WHERE o.id = ? AND o.shop_id = ?
    `, [orderId, shopId]);
    if (!order) {
      return res.status(404).render("error", { title: "Order Not Found", message: "Requested order does not exist in your store.", path: req.path });
    }
    const items = await queryAll(`
      SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit as product_unit, ps.name as partner_shop_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN partner_shops ps ON oi.partner_shop_id = ps.id
      WHERE oi.order_id = ?
    `, [orderId]);
    const payments = await queryAll(`
      SELECT pay.*, u.name as recorded_by_name, u.role as recorded_by_role
      FROM payments pay
      JOIN users u ON pay.recorded_by = u.id
      WHERE pay.order_id = ?
      ORDER BY pay.created_at ASC
    `, [orderId]);
    const partners = await queryAll("SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC", [shopId]);
    const shopInfo = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    res.render("order_detail", { user, order, items, payments, partners, shopInfo });
  } catch (err) {
    console.error("Order View Error:", err);
    res.status(500).render("error", { title: "Order View Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/orders/:id/receipt", requirePermission("can_print_full_receipt"), async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const shopId = getActiveShopId(req);
  try {
    const order = await queryOne(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address, c.id_number as customer_id_number,
             u.name as salesperson_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.salesperson_id = u.id
      WHERE o.id = ? AND o.shop_id = ?
    `, [orderId, shopId]);
    if (!order) {
      return res.status(404).render("error", { title: "Receipt Not Found", message: "Requested order ID does not exist.", path: req.path });
    }
    const items = await queryAll(`
      SELECT oi.*, p.name as product_name, p.unit as product_unit
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [orderId]);
    const shopInfo = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    const payments = await queryAll("SELECT * FROM payments WHERE order_id = ?", [orderId]);
    res.render("order_receipt", { order, items, shopInfo, payments });
  } catch (err) {
    console.error("Receipt Generation Error:", err);
    res.status(500).render("error", { title: "Receipt Generation Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/orders/:id/delivery-note", requirePermission("can_print_delivery_note"), async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const shopId = getActiveShopId(req);
  try {
    const order = await queryOne(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address, c.id_number as customer_id_number,
             u.name as salesperson_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.salesperson_id = u.id
      WHERE o.id = ? AND o.shop_id = ?
    `, [orderId, shopId]);
    if (!order) {
      return res.status(404).render("error", { title: "Delivery Note Not Found", message: "Requested order does not exist.", path: req.path });
    }
    const items = await queryAll(`
      SELECT oi.id, oi.quantity, oi.fulfillment_source, oi.item_status, p.name as product_name, p.sku as product_sku, p.unit as product_unit
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ? AND oi.item_status != 'unavailable'
    `, [orderId]);
    const shopInfo = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    res.render("delivery_note", { order, items, shopInfo });
  } catch (err) {
    console.error("Delivery Slip Error:", err);
    res.status(500).render("error", { title: "Delivery Slip Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/storekeeper", requirePermission("can_release_stock"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  try {
    const pendingItems = await queryAll(`
      SELECT oi.*, o.order_number, o.created_at as order_date, c.name as customer_name, p.name as product_name, p.quantity as current_stock, p.unit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.shop_id = ? AND oi.item_status = 'pending_store'
      ORDER BY oi.id ASC
    `, [shopId]);
    const recentlyReviewed = await queryAll(`
      SELECT oi.*, o.order_number, p.name as product_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.shop_id = ? AND oi.item_status IN ('approved', 'rejected')
      ORDER BY oi.id DESC LIMIT 10
    `, [shopId]);
    res.render("storekeeper", { user, pendingItems, recentlyReviewed });
  } catch (err) {
    console.error("Storekeeper Module Error:", err);
    res.status(500).render("error", { title: "Storekeeper Module Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/storekeeper/item-review", requirePermission("can_release_stock"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { item_id, action, rejection_reason } = req.body;
  try {
    const itemId = parseInt(item_id, 10);
    const item = await queryOne(`
      SELECT oi.*, p.name as product_name, p.quantity as current_stock, o.order_number, o.shop_id
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.id = ? AND o.shop_id = ?
    `, [itemId, shopId]);
    if (!item) return res.status(404).send("Order item not found.");
    if (item.item_status !== "pending_store") return res.status(400).send("Item has already been reviewed.");
    if (action === "approve") {
      if (item.current_stock < item.quantity) {
        return res.status(400).render("error", {
          title: "Insufficient Inventory",
          message: `Cannot approve item "${item.product_name}". Requested: ${item.quantity}, Available Stock: ${item.current_stock}. Please reject to route to Accountant for Partner Shop sourcing.`,
          path: req.path
        });
      }
      await withTransaction(async () => {
        await execute("UPDATE order_items SET item_status = 'approved', fulfillment_source = 'Store' WHERE id = ? AND order_id IN (SELECT id FROM orders WHERE shop_id = ?)", [itemId, shopId]);
        const upd = await execute("UPDATE products SET quantity = quantity - ? WHERE id = ? AND shop_id = ? AND quantity >= ?", [item.quantity, item.product_id, shopId, item.quantity]);
        if (upd.changes === 0) {
          throw new Error("Stock update failed \u2014 insufficient quantity or product not found.");
        }
        await execute(
          `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
           VALUES (?, ?, ?, 'Sale', ?, ?)`,
          [shopId, item.product_id, -item.quantity, item.order_number, user.id]
        );
      });
      await logAudit(user.id, "STORE_APPROVE_ITEM", `Approved item ${item.product_name} (${item.quantity} qty) for ${item.order_number}`, req, shopId);
    } else if (action === "reject") {
      await execute(
        "UPDATE order_items SET item_status = 'rejected', rejection_reason = ? WHERE id = ? AND order_id IN (SELECT id FROM orders WHERE shop_id = ?)",
        [rejection_reason ? String(rejection_reason).trim().slice(0, 500) : "Out of stock in warehouse", itemId, shopId]
      );
      await logAudit(user.id, "STORE_REJECT_ITEM", `Rejected item ${item.product_name} for ${item.order_number}. Reason: ${rejection_reason}`, req, shopId);
    } else {
      return res.status(400).send("Invalid action.");
    }
    await checkAndUpdateOrderCompletion(item.order_id, shopId);
    res.redirect("/storekeeper");
  } catch (err) {
    console.error("Storekeeper Review Error:", err);
    res.status(500).render("error", { title: "Storekeeper Review Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
async function checkAndUpdateOrderCompletion(orderId, shopId) {
  const pendingItems = await queryAll("SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ? AND item_status = 'pending_store'", [orderId]);
  const rejectedItems = await queryAll("SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ? AND item_status = 'rejected'", [orderId]);
  const pCnt = pendingItems[0] ? pendingItems[0].cnt : 0;
  const rCnt = rejectedItems[0] ? rejectedItems[0].cnt : 0;
  if (shopId !== void 0) {
    if (pCnt === 0 && rCnt === 0) {
      await execute("UPDATE orders SET fulfillment_status = 'completed' WHERE id = ? AND shop_id = ?", [orderId, shopId]);
    } else if (rCnt > 0) {
      await execute("UPDATE orders SET fulfillment_status = 'resolving_rejected' WHERE id = ? AND shop_id = ?", [orderId, shopId]);
    } else {
      await execute("UPDATE orders SET fulfillment_status = 'pending_store' WHERE id = ? AND shop_id = ?", [orderId, shopId]);
    }
  } else {
    if (pCnt === 0 && rCnt === 0) {
      await execute("UPDATE orders SET fulfillment_status = 'completed' WHERE id = ?", [orderId]);
    } else if (rCnt > 0) {
      await execute("UPDATE orders SET fulfillment_status = 'resolving_rejected' WHERE id = ?", [orderId]);
    } else {
      await execute("UPDATE orders SET fulfillment_status = 'pending_store' WHERE id = ?", [orderId]);
    }
  }
}
router2.get("/accountant/rejected-items", requirePermission("can_partner_borrow"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  try {
    const rejectedItems = await queryAll(`
      SELECT oi.*, o.order_number, o.created_at as order_date, c.name as customer_name, p.name as product_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.shop_id = ? AND oi.item_status = 'rejected'
      ORDER BY oi.id ASC
    `, [shopId]);
    const partners = await queryAll("SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC", [shopId]);
    res.render("accountant_rejected", { user, rejectedItems, partners });
  } catch (err) {
    console.error("Accountant Resolution Error:", err);
    res.status(500).render("error", { title: "Accountant Resolution Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/accountant/resolve-item", requirePermission("can_partner_borrow"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { item_id, resolution, partner_shop_id, partner_cost } = req.body;
  try {
    const itemId = parseInt(item_id, 10);
    const item = await queryOne(`
      SELECT oi.*, o.id as order_id, o.order_number, p.name as product_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE oi.id = ? AND o.shop_id = ?
    `, [itemId, shopId]);
    if (!item) return res.status(404).send("Item not found.");
    if (resolution === "partner_shop") {
      const partnerId = parseInt(partner_shop_id, 10);
      const partner = await queryOne("SELECT * FROM partner_shops WHERE id = ? AND shop_id = ?", [partnerId, shopId]);
      if (!partner) return res.status(400).send("Invalid partner shop selected.");
      let cost = parseFloat(partner_cost);
      if (!isFinite(cost) || cost <= 0) cost = item.buying_price * item.quantity;
      if (!isFinite(cost) || cost <= 0) return res.status(400).send("Invalid partner cost.");
      await withTransaction(async () => {
        await execute(`
          UPDATE order_items 
          SET item_status = 'partner_fulfilled', 
              fulfillment_source = ?, 
              partner_shop_id = ?
          WHERE id = ? AND order_id IN (SELECT id FROM orders WHERE shop_id = ?)
        `, [partner.name, partner.id, itemId, shopId]);
        await execute("UPDATE partner_shops SET current_balance = current_balance + ? WHERE id = ? AND shop_id = ?", [cost, partner.id, shopId]);
      });
      await logAudit(user.id, "ACCOUNTANT_PARTNER_FULFILL", `Procured item ${item.product_name} for ${item.order_number} from partner shop: ${partner.name} (Cost: RWF ${cost})`, req, shopId);
    } else if (resolution === "unavailable") {
      await withTransaction(async () => {
        await execute(`
          UPDATE order_items 
          SET item_status = 'unavailable', 
              fulfillment_source = 'Unavailable', 
              selling_price = 0.0, 
              subtotal = 0.0, 
              profit = 0.0 
          WHERE id = ? AND order_id IN (SELECT id FROM orders WHERE shop_id = ?)
        `, [itemId, shopId]);
        const orderItems = await queryAll("SELECT SUM(subtotal) as new_total FROM order_items WHERE order_id = ?", [item.order_id]);
        const newTotalRaw = orderItems[0] ? orderItems[0].new_total : 0;
        const newTotal = newTotalRaw || 0;
        const order = await queryOne("SELECT * FROM orders WHERE id = ? AND shop_id = ?", [item.order_id, shopId]);
        if (order) {
          const newDebt = Math.max(0, newTotal - order.paid_amount);
          let payStatus = order.payment_status;
          if (order.paid_amount >= newTotal) payStatus = "paid";
          await execute(
            "UPDATE orders SET total_amount = ?, debt_amount = ?, payment_status = ? WHERE id = ? AND shop_id = ?",
            [newTotal, newDebt, payStatus, item.order_id, shopId]
          );
          const oldTotal = Number(order.total_amount) || 0;
          const creditReduction = Math.max(0, oldTotal - newTotal);
          if (creditReduction > 0) {
            await execute(
              "UPDATE customers SET credit_balance = CASE WHEN credit_balance - ? < 0 THEN 0 ELSE credit_balance - ? END WHERE id = ? AND shop_id = ?",
              [creditReduction, creditReduction, order.customer_id, shopId]
            );
          }
        }
      });
      await logAudit(user.id, "ACCOUNTANT_MARK_UNAVAILABLE", `Marked item ${item.product_name} as Unavailable for ${item.order_number}`, req, shopId);
    } else {
      return res.status(400).send("Invalid resolution type.");
    }
    await checkAndUpdateOrderCompletion(item.order_id, shopId);
    res.redirect("/accountant/rejected-items");
  } catch (err) {
    console.error("Resolution Error:", err);
    res.status(500).render("error", { title: "Resolution Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/payments", requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  try {
    const payments = await queryAll(`
      SELECT pay.*, o.order_number, o.total_amount, o.paid_amount, o.debt_amount, c.name as customer_name, u.name as recorded_by_name, u.role as recorded_by_role
      FROM payments pay
      JOIN orders o ON pay.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON pay.recorded_by = u.id
      WHERE pay.shop_id = ?
      ORDER BY pay.id DESC
    `, [shopId]);
    const debtOrders = await queryAll(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.shop_id = ? AND o.debt_amount > 0
      ORDER BY o.id DESC
    `, [shopId]);
    res.render("payments", { user, payments, debtOrders });
  } catch (err) {
    console.error("Payments Module Error:", err);
    res.status(500).render("error", { title: "Payments Module Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/payments/record", requirePermission("can_process_payments"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { order_id, payment_amount, payment_method, reference_no } = req.body;
  try {
    const orderId = parseInt(order_id, 10);
    const amount = parseFloat(payment_amount);
    const allowedMethods = ["cash", "momo", "bank_transfer", "debt_credit"];
    const method = String(payment_method || "").trim().toLowerCase();
    if (isNaN(orderId) || !isFinite(amount) || amount <= 0) {
      return res.status(400).send("Invalid payment details.");
    }
    if (method && !allowedMethods.includes(method)) {
      return res.status(400).send("Invalid payment method.");
    }
    const finalMethod = allowedMethods.includes(method) ? method : "cash";
    const order = await queryOne("SELECT * FROM orders WHERE id = ? AND shop_id = ?", [orderId, shopId]);
    if (!order) return res.status(404).send("Order not found.");
    if (order.payment_status === "paid" && order.debt_amount === 0) {
      return res.status(400).send("Order is already fully paid.");
    }
    await withTransaction(async () => {
      const curOrder = await queryOne("SELECT debt_amount, customer_id FROM orders WHERE id = ? AND shop_id = ?", [orderId, shopId]);
      const curDebt = curOrder ? Number(curOrder.debt_amount) || 0 : 0;
      const curCustId = curOrder ? curOrder.customer_id : order.customer_id;
      await execute(
        `INSERT INTO payments (shop_id, order_id, amount, payment_method, reference_no, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [shopId, orderId, amount, finalMethod, reference_no ? String(reference_no).trim() || `PAY-${Date.now()}` : `PAY-${Date.now()}`, user.id]
      );
      await execute(
        `UPDATE orders SET
           paid_amount = paid_amount + ?,
           debt_amount = CASE WHEN total_amount - (paid_amount + ?) < 0 THEN 0 ELSE total_amount - (paid_amount + ?) END,
           payment_status = CASE WHEN (paid_amount + ?) >= total_amount THEN 'paid' ELSE 'partial' END
         WHERE id = ? AND shop_id = ?`,
        [amount, amount, amount, amount, orderId, shopId]
      );
      if (curDebt > 0) {
        const debtReduction = Math.min(curDebt, amount);
        await execute(
          "UPDATE customers SET credit_balance = CASE WHEN credit_balance - ? < 0 THEN 0 ELSE credit_balance - ? END WHERE id = ? AND shop_id = ?",
          [debtReduction, debtReduction, curCustId, shopId]
        );
      }
    });
    await logAudit(user.id, "PAYMENT_RECORDED", `Recorded payment of RWF ${amount} for order ${order.order_number} (${finalMethod.toUpperCase()})`, req, shopId);
    res.redirect("/payments");
  } catch (err) {
    console.error("Payment Recording Error:", err);
    res.status(500).render("error", { title: "Payment Recording Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/partners", requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  try {
    const partners = await queryAll("SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC", [shopId]);
    res.render("partners", { user, partners });
  } catch (err) {
    console.error("Partners Module Error:", err);
    res.status(500).render("error", { title: "Partners Module Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/partners/add", requirePermission("can_manage_partners"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { name, contact_person, phone, address } = req.body;
  try {
    await execute(
      "INSERT INTO partner_shops (shop_id, name, contact_person, phone, address, current_balance) VALUES (?, ?, ?, ?, ?, 0.0)",
      [shopId, name, contact_person, phone, address || null]
    );
    await logAudit(user.id, "PARTNER_ADD", `Added partner shop: ${name} (${phone})`, req, shopId);
    res.redirect("/partners");
  } catch (err) {
    console.error("Partner Registration Error:", err);
    res.status(500).render("error", { title: "Partner Registration Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/stocks", requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const msg = req.query.msg ? String(req.query.msg) : null;
  const error = req.query.error ? String(req.query.error) : null;
  try {
    const stocks = await queryAll(`
      SELECT st.*,
        (SELECT COUNT(*) FROM products WHERE stock_id = st.id) as product_count,
        (SELECT COALESCE(SUM(quantity), 0) FROM products WHERE stock_id = st.id) as total_units,
        (SELECT COALESCE(SUM(quantity * buying_price), 0) FROM products WHERE stock_id = st.id) as total_valuation,
        (SELECT COUNT(*) FROM users WHERE stock_id = st.id) as staff_count
      FROM stocks st
      WHERE st.shop_id = ?
      ORDER BY st.is_main DESC, st.name ASC
    `, [shopId]);
    const shop = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    const products = await queryAll("SELECT id, name, sku, stock_id, quantity, buying_price FROM products WHERE shop_id = ? ORDER BY name ASC", [shopId]);
    const transfers = await queryAll(`
      SELECT t.*, p.name as product_name, p.sku as product_sku,
             fs.name as from_stock_name, ts.name as to_stock_name,
             u.name as transferred_by_name
      FROM stock_transfers t
      JOIN products p ON t.product_id = p.id
      JOIN stocks fs ON t.from_stock_id = fs.id
      JOIN stocks ts ON t.to_stock_id = ts.id
      LEFT JOIN users u ON t.transferred_by = u.id
      WHERE t.shop_id = ?
      ORDER BY t.id DESC LIMIT 50
    `, [shopId]);
    res.render("stocks", {
      user,
      shop,
      stocks,
      products,
      transfers,
      msg,
      error
    });
  } catch (err) {
    console.error("Stocks Module Error:", err);
    res.status(500).render("error", { title: "Stocks Module Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/stocks/add", requireManager, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { name, code, location, manager_name, phone } = req.body;
  try {
    if (!name || !name.trim()) {
      return res.redirect("/stocks?error=Warehouse+depot+name+is+required");
    }
    const finalCode = code && code.trim() ? code.trim().toUpperCase() : `WH-${Math.floor(1e3 + Math.random() * 9e3)}`;
    const stockRes = await execute(
      `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'active')`,
      [
        shopId,
        name.trim(),
        finalCode,
        location ? location.trim() : "Kigali, Rwanda",
        manager_name ? manager_name.trim() : user.name,
        phone ? phone.trim() : user.phone
      ]
    );
    await execute("UPDATE shops SET billed_stocks = (SELECT COUNT(*) FROM stocks WHERE shop_id = ?) WHERE id = ?", [shopId, shopId]);
    await logAudit(user.id, "STOCK_WAREHOUSE_ADD", `Added new stock depot: "${name}" (${finalCode}) at ${location}`, req, shopId);
    res.redirect("/stocks?msg=New+warehouse+depot+registered+successfully");
  } catch (err) {
    console.error("Stocks Error:", err);
    res.redirect("/stocks?error=" + encodeURIComponent("An unexpected error occurred."));
  }
});
router2.post("/stocks/transfer", requirePermission("can_manage_stock"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { product_id, from_stock_id, to_stock_id, quantity, notes } = req.body;
  try {
    const prodId = parseInt(product_id, 10);
    const fromId = parseInt(from_stock_id, 10);
    const toId = parseInt(to_stock_id, 10);
    const qty = parseInt(quantity, 10);
    if (isNaN(prodId) || isNaN(fromId) || isNaN(toId) || isNaN(qty) || qty <= 0) {
      return res.redirect("/stocks?error=Invalid+transfer+parameters");
    }
    if (fromId === toId) {
      return res.redirect("/stocks?error=Origin+and+destination+warehouses+must+be+different");
    }
    const sourceProduct = await queryOne("SELECT * FROM products WHERE id = ? AND shop_id = ?", [prodId, shopId]);
    if (!sourceProduct) {
      return res.redirect("/stocks?error=Selected+product+not+found");
    }
    const fromStockCheck = await queryOne("SELECT * FROM stocks WHERE id = ? AND shop_id = ?", [fromId, shopId]);
    const toStockCheck = await queryOne("SELECT * FROM stocks WHERE id = ? AND shop_id = ?", [toId, shopId]);
    if (!fromStockCheck || !toStockCheck) {
      return res.redirect("/stocks?error=Invalid+warehouse+selection");
    }
    if (sourceProduct.quantity < qty) {
      return res.redirect(`/stocks?error=Insufficient+stock+balance.+Available:+${sourceProduct.quantity}+units`);
    }
    await withTransaction(async () => {
      const upd = await execute("UPDATE products SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ? AND quantity >= ?", [qty, prodId, shopId, qty]);
      if (upd.changes === 0) {
        throw new Error("Insufficient stock or product not found.");
      }
      let destProduct = null;
      if (sourceProduct.sku) {
        destProduct = await queryOne("SELECT * FROM products WHERE shop_id = ? AND stock_id = ? AND sku = ?", [shopId, toId, sourceProduct.sku]);
      } else {
        destProduct = await queryOne("SELECT * FROM products WHERE shop_id = ? AND stock_id = ? AND sku IS NULL AND LOWER(name) = LOWER(?)", [shopId, toId, sourceProduct.name]);
      }
      let destProductIdForMove = destProduct ? destProduct.id : null;
      if (destProduct) {
        await execute("UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?", [qty, destProduct.id, shopId]);
      } else {
        const destRes = await execute(
          `INSERT INTO products (
            shop_id, stock_id, name, sku, category, unit, buying_price, quantity, low_stock_threshold, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            shopId,
            toId,
            sourceProduct.name,
            sourceProduct.sku,
            sourceProduct.category,
            sourceProduct.unit,
            sourceProduct.buying_price,
            qty,
            sourceProduct.low_stock_threshold,
            sourceProduct.description
          ]
        );
        destProductIdForMove = destRes.lastInsertId;
      }
      await execute(
        `INSERT INTO stock_transfers (shop_id, from_stock_id, to_stock_id, product_id, quantity, transferred_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [shopId, fromId, toId, prodId, qty, user.id, notes ? String(notes).trim().slice(0, 500) || null : null]
      );
      await execute(
        `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, 'Transfer Out', ?, ?)`,
        [shopId, prodId, -qty, `Transfer to ${toStockCheck.name}`, user.id]
      );
      await execute(
        `INSERT INTO inventory_movements (shop_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, 'Transfer In', ?, ?)`,
        [shopId, destProductIdForMove || prodId, qty, `Transfer from ${fromStockCheck.name}`, user.id]
      );
    });
    const fromStock = await queryOne("SELECT name FROM stocks WHERE id = ? AND shop_id = ?", [fromId, shopId]);
    const toStock = await queryOne("SELECT name FROM stocks WHERE id = ? AND shop_id = ?", [toId, shopId]);
    await logAudit(
      user.id,
      "STOCK_TRANSFER",
      `Transferred ${qty} units of "${sourceProduct.name}" from [${fromStock?.name}] to [${toStock?.name}]`,
      req,
      shopId
    );
    res.redirect(`/stocks?msg=Successfully+transferred+${qty}+units+of+${encodeURIComponent(sourceProduct.name)}`);
  } catch (err) {
    console.error("Stocks Error:", err);
    res.redirect("/stocks?error=" + encodeURIComponent("An unexpected error occurred."));
  }
});
router2.get("/reports", requirePermission("can_view_reports"), async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const selectedStockId = req.query.stock_id ? String(req.query.stock_id) : "all";
  try {
    const shop = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    const stocks = await queryAll("SELECT * FROM stocks WHERE shop_id = ? ORDER BY is_main DESC, name ASC", [shopId]);
    const stockBreakdown = await queryAll(`
      SELECT st.*,
             (SELECT COUNT(*) FROM products WHERE stock_id = st.id) as product_lines,
             (SELECT COALESCE(SUM(quantity), 0) FROM products WHERE stock_id = st.id) as total_units,
             (SELECT COALESCE(SUM(quantity * buying_price), 0) FROM products WHERE stock_id = st.id) as valuation,
             (SELECT COALESCE(SUM(oi.subtotal), 0) FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id WHERE o.shop_id = ? AND p.stock_id = st.id AND oi.item_status IN ('approved', 'partner_fulfilled')) as sales_revenue,
             (SELECT COALESCE(SUM(oi.profit), 0) FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id WHERE o.shop_id = ? AND p.stock_id = st.id AND oi.item_status IN ('approved', 'partner_fulfilled')) as sales_profit
      FROM stocks st
      WHERE st.shop_id = ?
      ORDER BY st.is_main DESC, st.name ASC
    `, [shopId, shopId, shopId]);
    let spQuery = `
      SELECT u.name as salesperson, COUNT(DISTINCT o.id) as orders_count, 
             COALESCE(SUM(oi.subtotal), 0) as total_sales,
             COALESCE(SUM(oi.profit), 0) as total_profit
      FROM users u
      LEFT JOIN orders o ON o.salesperson_id = u.id AND o.shop_id = ?
    `;
    const spParams = [shopId];
    void selectedStockId;
    spQuery += `
      LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.item_status IN ('approved', 'partner_fulfilled')
      WHERE u.shop_id = ?
      GROUP BY u.id
    `;
    spParams.push(shopId);
    const salespersonProfit = await queryAll(spQuery, spParams);
    let prodQuery = `
      SELECT p.name, p.category, p.buying_price,
             COALESCE(SUM(oi.quantity), 0) as total_units_sold,
             COALESCE(SUM(oi.subtotal), 0) as total_revenue,
             COALESCE(SUM(oi.profit), 0) as total_profit
      FROM products p
    `;
    const prodParams = [];
    if (selectedStockId !== "all") {
      prodQuery += `
        LEFT JOIN order_items oi ON oi.product_id = p.id AND oi.item_status IN ('approved', 'partner_fulfilled')
        WHERE p.shop_id = ? AND (p.stock_id = ? OR p.stock_id IS NULL)
      `;
      prodParams.push(shopId, parseInt(selectedStockId, 10));
    } else {
      prodQuery += `
        LEFT JOIN order_items oi ON oi.product_id = p.id AND oi.item_status IN ('approved', 'partner_fulfilled')
        WHERE p.shop_id = ?
      `;
      prodParams.push(shopId);
    }
    prodQuery += `
      GROUP BY p.id, p.name, p.category, p.buying_price
      ORDER BY total_profit DESC
    `;
    const productPerformance = await queryAll(prodQuery, prodParams);
    const customerDebts = await queryAll(`
      SELECT name, phone, credit_balance FROM customers WHERE shop_id = ? AND credit_balance > 0 ORDER BY credit_balance DESC
    `, [shopId]);
    const partnerBalances = await queryAll(`
      SELECT name, contact_person, phone, current_balance FROM partner_shops WHERE shop_id = ? AND current_balance > 0 ORDER BY current_balance DESC
    `, [shopId]);
    const totalBusinessRevenue = productPerformance.reduce((acc, p) => acc + (p.total_revenue || 0), 0);
    const totalBusinessProfit = productPerformance.reduce((acc, p) => acc + (p.total_profit || 0), 0);
    const totalInventoryValuation = stockBreakdown.reduce((acc, s) => acc + (s.valuation || 0), 0);
    const activeStockName = selectedStockId === "all" ? "All Warehouses (Consolidated Total Business)" : stocks.find((s) => String(s.id) === selectedStockId)?.name || "Selected Warehouse";
    const deadStock = await queryAll(
      `SELECT name, category, quantity, (quantity * buying_price) as tied_value
       FROM products
       WHERE shop_id = ? AND quantity > 0
       AND id NOT IN (SELECT DISTINCT product_id FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.shop_id = ?)
       ORDER BY tied_value DESC LIMIT 10`,
      [shopId, shopId]
    );
    const deadStockValue = deadStock.reduce((acc, d) => acc + (d.tied_value || 0), 0);
    const receivables = customerDebts.reduce((acc, c) => acc + (c.credit_balance || 0), 0);
    const kpis = {
      revenue30: totalBusinessRevenue,
      profit30: totalBusinessProfit,
      receivables,
      deadStockValue
    };
    const topProducts = productPerformance.map((p) => ({
      name: p.name,
      qty: p.total_units_sold || 0
    }));
    const monthly = [
      { ym: "Current Period", revenue: totalBusinessRevenue, collected: totalBusinessRevenue - receivables }
    ];
    const monthlyProfit = [
      { ym: "Current Period", profit: totalBusinessProfit }
    ];
    res.render("reports", {
      user,
      shop,
      stocks,
      selectedStockId,
      activeStockName,
      stockBreakdown,
      salespersonProfit,
      productPerformance,
      customerDebts,
      debtors: customerDebts,
      partnerBalances,
      kpis,
      topProducts,
      deadStock,
      monthly,
      monthlyProfit,
      totals: {
        revenue: totalBusinessRevenue,
        profit: totalBusinessProfit,
        valuation: totalInventoryValuation
      }
    });
  } catch (err) {
    console.log("REPORTS ERROR FULL:", err?.message || err, err?.stack);
    res.status(500).render("error", { title: "Reports Module Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/users", requireManager, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  try {
    let sql = "SELECT * FROM users";
    const params = [];
    if (user.role !== "superadmin") {
      sql += " WHERE shop_id = ?";
      params.push(shopId);
    }
    sql += " ORDER BY role = 'manager' DESC, name ASC";
    const users = await queryAll(sql, params);
    res.render("users", { user, users, msg: req.query.msg || null });
  } catch (err) {
    console.error("Users Module Error:", err);
    res.status(500).render("error", { title: "Users Module Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/users/add", requireManager, async (req, res) => {
  const currentUser = req.session.user;
  const shopId = getActiveShopId(req);
  const {
    name,
    email,
    password,
    job_title,
    phone,
    can_create_orders,
    can_process_payments,
    can_release_stock,
    can_manage_stock,
    can_import_export_stock,
    can_partner_borrow,
    can_view_buying_prices,
    can_give_discounts,
    can_view_reports,
    can_manage_users,
    can_print_full_receipt,
    can_print_delivery_note,
    can_manage_customers,
    can_manage_partners,
    can_void_orders,
    can_edit_company_settings
  } = req.body;
  try {
    const existing = await queryOne("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) {
      return res.status(400).render("error", {
        title: "User Creation Error",
        message: `An account with email ${email} is already in use.`,
        path: req.path
      });
    }
    const hashed = await bcrypt3.hash(password, 10);
    await execute(
      `INSERT INTO users (
        shop_id, name, email, password, role, job_title, phone, is_active, activation_status,
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
        can_partner_borrow, can_view_buying_prices, can_give_discounts, can_view_reports, can_manage_users,
        can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners,
        can_void_orders, can_edit_company_settings
      ) VALUES (?, ?, ?, ?, 'employee', ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        name.trim(),
        email.trim(),
        hashed,
        job_title || "Operations Staff",
        phone || null,
        can_create_orders ? 1 : 0,
        can_process_payments ? 1 : 0,
        can_release_stock ? 1 : 0,
        can_manage_stock ? 1 : 0,
        can_import_export_stock ? 1 : 0,
        can_partner_borrow ? 1 : 0,
        can_view_buying_prices ? 1 : 0,
        can_give_discounts ? 1 : 0,
        can_view_reports ? 1 : 0,
        can_manage_users ? 1 : 0,
        can_print_full_receipt ? 1 : 0,
        can_print_delivery_note ? 1 : 0,
        can_manage_customers ? 1 : 0,
        can_manage_partners ? 1 : 0,
        can_void_orders ? 1 : 0,
        can_edit_company_settings ? 1 : 0
      ]
    );
    await logAudit(currentUser.id, "USER_CREATE", `Created employee account "${name}" (pending SuperAdmin activation)`, req, shopId);
    res.redirect("/users?msg=Employee+account+created+and+activated+successfully");
  } catch (err) {
    console.error("User Creation Error:", err);
    res.status(500).render("error", { title: "User Creation Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/users/edit/:id", requireManager, async (req, res) => {
  const currentUser = req.session.user;
  const shopId = getActiveShopId(req);
  const targetId = parseInt(req.params.id, 10);
  const {
    name,
    email,
    password,
    job_title,
    phone,
    is_active,
    can_create_orders,
    can_process_payments,
    can_release_stock,
    can_manage_stock,
    can_import_export_stock,
    can_partner_borrow,
    can_view_buying_prices,
    can_give_discounts,
    can_view_reports,
    can_manage_users,
    can_print_full_receipt,
    can_print_delivery_note,
    can_manage_customers,
    can_manage_partners,
    can_void_orders,
    can_edit_company_settings
  } = req.body;
  try {
    const target = await queryOne("SELECT * FROM users WHERE id = ?", [targetId]);
    if (!target) return res.status(404).send("User not found.");
    if (currentUser.role !== "superadmin" && target.shop_id !== shopId) {
      return res.status(403).send("Forbidden");
    }
    if (currentUser.role !== "superadmin" && target.role !== "employee") {
      return res.status(403).render("error", {
        title: "Action Prohibited",
        message: "Only the VectOS Administrator can modify manager accounts. You can manage employee accounts only.",
        path: req.path
      });
    }
    let passwordClause = "";
    const params = [
      name.trim(),
      email.trim(),
      job_title || target.job_title,
      phone || null,
      is_active ? 1 : 0,
      can_create_orders ? 1 : 0,
      can_process_payments ? 1 : 0,
      can_release_stock ? 1 : 0,
      can_manage_stock ? 1 : 0,
      can_import_export_stock ? 1 : 0,
      can_partner_borrow ? 1 : 0,
      can_view_buying_prices ? 1 : 0,
      can_give_discounts ? 1 : 0,
      can_view_reports ? 1 : 0,
      can_manage_users ? 1 : 0,
      can_print_full_receipt ? 1 : 0,
      can_print_delivery_note ? 1 : 0,
      can_manage_customers ? 1 : 0,
      can_manage_partners ? 1 : 0,
      can_void_orders ? 1 : 0,
      can_edit_company_settings ? 1 : 0
    ];
    if (password && password.trim().length > 0) {
      const hashed = await bcrypt3.hash(password.trim(), 10);
      passwordClause = ", password = ?";
      params.push(hashed);
    }
    params.push(targetId);
    await execute(
      `UPDATE users SET 
        name = ?, email = ?, job_title = ?, phone = ?, is_active = ?,
        can_create_orders = ?, can_process_payments = ?, can_release_stock = ?, can_manage_stock = ?, can_import_export_stock = ?,
        can_partner_borrow = ?, can_view_buying_prices = ?, can_give_discounts = ?, can_view_reports = ?, can_manage_users = ?,
        can_print_full_receipt = ?, can_print_delivery_note = ?, can_manage_customers = ?, can_manage_partners = ?,
        can_void_orders = ?, can_edit_company_settings = ?
        ${passwordClause}
       WHERE id = ?`,
      params
    );
    await logAudit(currentUser.id, "USER_EDIT_PERMISSIONS", `Updated permissions & profile for employee ${name} (#${targetId})`, req, shopId);
    res.redirect("/users?msg=User+profile+and+permissions+updated+successfully");
  } catch (err) {
    console.error("User Update Error:", err);
    res.status(500).render("error", { title: "User Update Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/users/delete/:id", requireManager, async (req, res) => {
  const currentUserId = req.session.user.id;
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).send("Invalid user ID.");
  if (targetId === currentUserId) {
    return res.status(400).render("error", {
      title: "Action Prohibited",
      message: "You cannot remove or deactivate your own active session account.",
      path: req.path
    });
  }
  try {
    const targetUser = await queryOne("SELECT * FROM users WHERE id = ?", [targetId]);
    if (!targetUser) return res.status(404).send("User not found.");
    const currentUser = req.session.user;
    const shopId = getActiveShopId(req);
    if (currentUser.role !== "superadmin" && targetUser.shop_id !== shopId) {
      return res.status(403).send("Forbidden");
    }
    if (currentUser.role !== "superadmin" && targetUser.role !== "employee") {
      return res.status(403).render("error", {
        title: "Action Prohibited",
        message: "Only the VectOS Administrator can deactivate or delete manager accounts.",
        path: req.path
      });
    }
    try {
      await execute("DELETE FROM users WHERE id = ?", [targetId]);
      await logAudit(currentUserId, "USER_DELETE", `Permanently deleted user account ${targetUser.name}`, req);
    } catch (err) {
      await execute("UPDATE users SET is_active = 0 WHERE id = ?", [targetId]);
      await logAudit(currentUserId, "USER_DEACTIVATE", `Deactivated user account ${targetUser.name}`, req);
    }
    res.redirect("/users?msg=User+status+updated");
  } catch (err) {
    console.error("User Removal Error:", err);
    res.status(500).render("error", { title: "User Removal Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/settings", requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  try {
    const shop = await queryOne("SELECT * FROM shops WHERE id = ?", [shopId]);
    res.render("settings", {
      user,
      shop,
      msg: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Settings Error:", err);
    res.status(500).render("error", { title: "Settings Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.post("/settings/company", requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  const { name, phone, email, location, tin_number, receipt_footer_text } = req.body;
  if (user.role !== "manager" && user.role !== "superadmin" && !user.can_edit_company_settings) {
    return res.status(403).render("error", { title: "Access Denied", message: "You do not have permission to modify company branding/settings.", path: req.path });
  }
  try {
    await execute(
      `UPDATE shops SET 
        name = ?, phone = ?, email = ?, location = ?, tin_number = ?, receipt_footer_text = ?
       WHERE id = ?`,
      [
        name.trim(),
        phone ? phone.trim() : null,
        email ? email.trim() : null,
        location ? location.trim() : null,
        tin_number ? tin_number.trim() : null,
        receipt_footer_text ? receipt_footer_text.trim() : null,
        shopId
      ]
    );
    if (req.session.user) {
      req.session.user.shop_name = name.trim();
    }
    await logAudit(user.id, "COMPANY_SETTINGS_UPDATE", `Updated company profile details for "${name}" (TIN: ${tin_number})`, req, shopId);
    res.redirect("/settings?msg=Company+details+updated+successfully");
  } catch (err) {
    console.error("Settings Error:", err);
    res.redirect("/settings?error=" + encodeURIComponent("An unexpected error occurred."));
  }
});
router2.post("/settings/password", requireAuth, async (req, res) => {
  const user = req.session.user;
  const { current_password, new_password, confirm_password, phone, name } = req.body;
  try {
    const dbUser = await queryOne("SELECT * FROM users WHERE id = ?", [user.id]);
    if (!dbUser) return res.status(404).send("User record not found.");
    if (new_password) {
      if (new_password !== confirm_password) {
        return res.redirect("/settings?error=New+passwords+do+not+match");
      }
      const match = await bcrypt3.compare(current_password, dbUser.password);
      if (!match) {
        return res.redirect("/settings?error=Current+password+is+incorrect");
      }
      const hashed = await bcrypt3.hash(new_password, 10);
      await execute("UPDATE users SET password = ?, name = ?, phone = ? WHERE id = ?", [hashed, name ? name.trim() : dbUser.name, phone ? phone.trim() : dbUser.phone, user.id]);
    } else {
      await execute("UPDATE users SET name = ?, phone = ? WHERE id = ?", [name ? name.trim() : dbUser.name, phone ? phone.trim() : dbUser.phone, user.id]);
    }
    if (name && req.session.user) req.session.user.name = name.trim();
    if (phone && req.session.user) req.session.user.phone = phone.trim();
    await logAudit(user.id, "PASSWORD_PROFILE_UPDATE", `Updated credentials/profile details for ${user.email}`, req, user.shop_id);
    res.redirect("/settings?msg=Profile+updated+successfully");
  } catch (err) {
    console.error("Settings Error:", err);
    res.redirect("/settings?error=" + encodeURIComponent("An unexpected error occurred."));
  }
});
router2.get("/audit-logs", requireManager, async (req, res) => {
  const user = req.session.user;
  const shopId = getActiveShopId(req);
  try {
    let sql = `
      SELECT a.*, u.name as user_name, u.role as user_role, s.name as shop_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN shops s ON a.shop_id = s.id
    `;
    const params = [];
    if (user.role !== "superadmin") {
      sql += " WHERE a.shop_id = ?";
      params.push(shopId);
    }
    sql += " ORDER BY a.id DESC LIMIT 100";
    const logs = await queryAll(sql, params);
    res.render("audit_logs", { user, logs });
  } catch (err) {
    console.error("Audit Logs Error:", err);
    res.status(500).render("error", { title: "Audit Logs Error", message: "An unexpected operational error occurred. Please try again or contact support.", path: req.path });
  }
});
router2.get("/products/search", requireAuth, async (req, res) => {
  const u = req.session.user;
  const shopId = getActiveShopId(req);
  const q = String(req.query.q || "").trim();
  try {
    let sql = "SELECT * FROM products WHERE shop_id = ?";
    const params = [shopId];
    if (q) {
      const escQ = q.toLowerCase().replace(/[%_\\]/g, "\\$&");
      sql += " AND (LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(sku) LIKE ? ESCAPE '\\' OR LOWER(category) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(barcode, '')) LIKE ? ESCAPE '\\')";
      const like = `%${escQ}%`;
      params.push(like, like, like, like);
    }
    sql += " ORDER BY name ASC LIMIT 200";
    const products = await queryAll(sql, params);
    res.render("partials/product_rows", { products, user: u });
  } catch (err) {
    res.status(500).send('<tr><td colspan="7" class="py-8 text-center text-rose-400 text-xs">Search failed. Please refresh.</td></tr>');
  }
});
router2.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", app: "VectOS", time: (/* @__PURE__ */ new Date()).toISOString() });
});
router2.get("/security/2fa", requireSuperAdmin, async (req, res) => {
  const u = req.session.user;
  const current = await queryOne(
    "SELECT twofa_secret, twofa_enabled FROM users WHERE id = ?",
    [u.id]
  );
  let qrDataUrl = null;
  let secret = current?.twofa_secret || null;
  if (!secret) {
    secret = generateSecret();
    await execute("UPDATE users SET twofa_secret = ? WHERE id = ?", [secret, u.id]);
  }
  if (Number(current?.twofa_enabled) !== 1) {
    const otpauth = generateURI({ issuer: "VectOS ERP", label: u.email, secret });
    qrDataUrl = await QRCode.toDataURL(otpauth);
  }
  res.render("security_2fa", {
    title: "Two-Factor Security \u2014 VectOS",
    enabled: Number(current?.twofa_enabled) === 1,
    qrDataUrl,
    secret
  });
});
router2.post("/security/2fa/enable", requireSuperAdmin, async (req, res) => {
  const u = req.session.user;
  const { code } = req.body;
  const row = await queryOne(
    "SELECT twofa_secret FROM users WHERE id = ?",
    [u.id]
  );
  if (!row?.twofa_secret) return res.redirect("/security/2fa");
  try {
    const check = await verifyOtp({ token: (code || "").trim(), secret: row.twofa_secret });
    if (!check.valid) {
      return res.render("error", {
        title: "Invalid Code",
        message: "That 6-digit code was not correct. Check your authenticator app and try again.",
        path: req.path
      });
    }
    await execute("UPDATE users SET twofa_enabled = 1 WHERE id = ?", [u.id]);
    req.session.twofa_verified = true;
    await logAudit(u.id, "2FA_ENABLED", "SuperAdmin enabled two-factor authentication", req);
    res.redirect("/security/2fa?msg=Two-factor+authentication+is+now+ACTIVE");
  } catch {
    res.status(500).render("error", { title: "2FA Error", message: "Could not enable two-factor auth.", path: req.path });
  }
});
router2.post("/security/2fa/disable", requireSuperAdmin, async (req, res) => {
  const u = req.session.user;
  const row = await queryOne("SELECT password FROM users WHERE id = ?", [u.id]);
  const ok = row && await bcrypt3.compare(req.body.password || "", row.password);
  if (!ok) {
    return res.render("error", {
      title: "Wrong Password",
      message: "Password confirmation failed. Two-factor authentication remains active.",
      path: req.path
    });
  }
  await execute("UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?", [u.id]);
  await logAudit(u.id, "2FA_DISABLED", "SuperAdmin disabled two-factor authentication", req);
  res.redirect("/security/2fa?msg=Two-factor+authentication+disabled");
});
router2.get("/verify-2fa", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  if (!req.session.user.twofa_enabled || req.session.twofa_verified) {
    return res.redirect("/");
  }
  res.render("verify_2fa", { title: "Security Verification \u2014 VectOS" });
});
router2.post("/verify-2fa", async (req, res) => {
  const u = req.session.user;
  if (!u) return res.redirect("/login");
  const row = await queryOne(
    "SELECT twofa_secret FROM users WHERE id = ?",
    [u.id]
  );
  const code = (req.body.code || "").trim();
  let otpOk = false;
  if (row?.twofa_secret) {
    const check = await verifyOtp({ token: code, secret: row.twofa_secret });
    otpOk = Boolean(check.valid);
  }
  if (!row?.twofa_secret || !otpOk) {
    await throttleFail("2fa:" + u.email);
    return res.render("verify_2fa", {
      title: "Security Verification \u2014 VectOS",
      error: "Incorrect or expired code. Try again."
    });
  }
  req.session.twofa_verified = true;
  res.redirect(u.role === "superadmin" ? "/admin/shops" : "/dashboard");
});
var iomsRoutes_default = router2;

// server/routes/billingRoutes.ts
import { Router as Router3 } from "express";

// server/billing/paymentService.ts
init_db();
import crypto4 from "crypto";
var MockPaymentProvider = class {
  constructor() {
    this.name = "mock";
  }
  async createPayment(params) {
    const paymentRef = `mock_pay_${Date.now()}_${crypto4.randomBytes(4).toString("hex")}`;
    return {
      paymentRef,
      status: "completed",
      provider: this.name,
      rawResponse: { simulated: true, ...params }
    };
  }
  async verifyPayment(paymentRef) {
    return {
      paymentRef,
      status: "completed",
      provider: this.name
    };
  }
  async refundPayment(paymentRef, amount) {
    return {
      success: true,
      refundRef: `mock_ref_${Date.now()}`
    };
  }
  async getPaymentStatus(paymentRef) {
    return {
      paymentRef,
      status: "completed",
      provider: this.name
    };
  }
  verifyWebhook(headers, rawBody) {
    try {
      const event = JSON.parse(rawBody);
      return { valid: true, event };
    } catch {
      return { valid: false };
    }
  }
};
var StripePaymentProvider = class {
  constructor() {
    this.name = "stripe";
  }
  async createPayment(params) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }
    const paymentRef = `stripe_pi_${Date.now()}`;
    return {
      paymentRef,
      status: "pending",
      provider: this.name
    };
  }
  async verifyPayment(paymentRef) {
    return { paymentRef, status: "completed", provider: this.name };
  }
  async refundPayment(paymentRef) {
    return { success: true, refundRef: `stripe_ref_${Date.now()}` };
  }
  async getPaymentStatus(paymentRef) {
    return { paymentRef, status: "completed", provider: this.name };
  }
  verifyWebhook(headers, rawBody) {
    const sig = headers["stripe-signature"];
    if (!sig && process.env.NODE_ENV === "production") {
      return { valid: false };
    }
    try {
      const event = JSON.parse(rawBody);
      return { valid: true, event };
    } catch {
      return { valid: false };
    }
  }
};
function getPaymentProvider(providerName) {
  if (providerName === "stripe" && process.env.STRIPE_SECRET_KEY) {
    return new StripePaymentProvider();
  }
  return new MockPaymentProvider();
}
async function initBillingTables() {
  if (isPostgres()) {
    const { getPgPool: getPgPool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const pool = getPgPool2();
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
async function processWebhookEvent(eventId, eventType, provider, payload) {
  await initBillingTables();
  const rawPayload = JSON.stringify(payload);
  const existing = await queryOne(
    `SELECT id, status, attempts FROM webhook_events WHERE event_id = ?`,
    [eventId]
  );
  if (existing) {
    if (existing.status === "PROCESSED") {
      return { success: true, status: "ALREADY_PROCESSED" };
    }
    if (existing.status === "DEAD_LETTER") {
      return { success: false, status: "DEAD_LETTER" };
    }
  } else {
    await execute(
      `INSERT INTO webhook_events (event_id, event_type, provider, payload, status, attempts) VALUES (?, ?, ?, ?, 'RECEIVED', 0)`,
      [eventId, eventType, provider, rawPayload]
    );
  }
  await execute(`UPDATE webhook_events SET status = 'PROCESSING', attempts = attempts + 1 WHERE event_id = ?`, [eventId]);
  try {
    if (eventType === "payment.success" || eventType === "charge.succeeded") {
      const data = payload.data || payload;
      const shopId = data.shopId || data.metadata?.shopId || 1;
      const paymentRef = data.paymentRef || data.id || `pay_${eventId}`;
      const amount = data.amount || 15e3;
      const existingPay = await queryOne(`SELECT id FROM payments_ledger WHERE payment_ref = ?`, [paymentRef]);
      if (!existingPay) {
        await execute(
          `INSERT INTO payments_ledger (shop_id, payment_ref, amount, currency, status, provider, metadata) VALUES (?, ?, ?, ?, 'completed', ?, ?)`,
          [shopId, paymentRef, amount, data.currency || "USD", provider, rawPayload]
        );
      }
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    await execute(`UPDATE webhook_events SET status = 'PROCESSED', processed_at = ? WHERE event_id = ?`, [nowIso, eventId]);
    return { success: true, status: "PROCESSED" };
  } catch (err) {
    const errorMsg = err?.message || String(err);
    const eventRow = await queryOne(
      `SELECT attempts, max_attempts FROM webhook_events WHERE event_id = ?`,
      [eventId]
    );
    const attempts = eventRow?.attempts || 1;
    const maxAttempts = eventRow?.max_attempts || 5;
    if (attempts >= maxAttempts) {
      await execute(`UPDATE webhook_events SET status = 'DEAD_LETTER', last_error = ? WHERE event_id = ?`, [errorMsg, eventId]);
      return { success: false, status: "DEAD_LETTER" };
    } else {
      const delaySec = Math.pow(2, attempts) * 10;
      const nextRetry = new Date(Date.now() + delaySec * 1e3).toISOString();
      await execute(
        `UPDATE webhook_events SET status = 'RETRY_PENDING', last_error = ?, next_retry_at = ? WHERE event_id = ?`,
        [errorMsg, nextRetry, eventId]
      );
      return { success: false, status: "RETRY_PENDING" };
    }
  }
}
async function manualRetryWebhook(eventId) {
  const event = await queryOne(
    `SELECT event_id, event_type, provider, payload FROM webhook_events WHERE event_id = ?`,
    [eventId]
  );
  if (!event) throw new Error("Webhook event not found");
  const payloadObj = JSON.parse(event.payload);
  return processWebhookEvent(event.event_id, event.event_type, event.provider, payloadObj);
}

// server/routes/billingRoutes.ts
init_db();
var router3 = Router3();
var billingTablesInitialized = false;
async function ensureBillingTables() {
  if (!billingTablesInitialized) {
    await initBillingTables();
    billingTablesInitialized = true;
  }
}
router3.post("/billing/charge", requireAuth, async (req, res) => {
  const { amount, currency, paymentMethod, clientRef, subscriptionId } = req.body;
  const shopId = req.session?.user?.shop_id || 1;
  if (!amount || !clientRef) {
    return res.status(400).json({ error: "amount and clientRef are required" });
  }
  try {
    await ensureBillingTables();
    const provider = getPaymentProvider();
    const result = await provider.createPayment({
      shopId,
      amount: Number(amount),
      currency: currency || "USD",
      paymentMethod: paymentMethod || "mock",
      clientRef,
      subscriptionId: subscriptionId ? Number(subscriptionId) : void 0
    });
    const existing = await queryOne("SELECT id FROM payments_ledger WHERE payment_ref = ?", [result.paymentRef]);
    if (!existing) {
      await execute(
        `INSERT INTO payments_ledger (shop_id, payment_ref, client_ref, amount, currency, status, provider, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [shopId, result.paymentRef, clientRef, Number(amount), currency || "USD", result.status, result.provider, JSON.stringify(result.rawResponse || {})]
      );
    }
    res.json({ success: true, payment: result });
  } catch (err) {
    console.error("Charge error:", err);
    res.status(500).json({ error: "Failed to process payment charge: " + err.message });
  }
});
router3.post("/webhooks/:provider", async (req, res) => {
  const providerName = req.params.provider;
  const rawBody = JSON.stringify(req.body || {});
  const headers = req.headers;
  try {
    await ensureBillingTables();
    const provider = getPaymentProvider(providerName);
    const verification = provider.verifyWebhook(headers, rawBody);
    if (!verification.valid && process.env.NODE_ENV === "production") {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
    const event = verification.event || req.body;
    const eventId = event.id || event.eventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const eventType = event.type || event.eventType || "payment.success";
    const result = await processWebhookEvent(eventId, eventType, providerName, event);
    res.json({ received: true, ...result });
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).json({ error: "Webhook handler error: " + err.message });
  }
});
router3.get("/admin/webhooks", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    await ensureBillingTables();
    const events = await queryAll("SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 50");
    const dlqCount = await queryOne("SELECT COUNT(*) as count FROM webhook_events WHERE status = ?", ["DEAD_LETTER"]);
    const pendingCount = await queryOne("SELECT COUNT(*) as count FROM webhook_events WHERE status = ?", ["RETRY_PENDING"]);
    res.json({
      events,
      stats: {
        deadLetter: dlqCount?.count || 0,
        pendingRetry: pendingCount?.count || 0
      }
    });
  } catch (err) {
    console.error("Get webhooks error:", err);
    res.status(500).json({ error: "Failed to fetch webhook events" });
  }
});
router3.post("/admin/webhooks/:eventId/retry", requireAuth, requireSuperAdmin, async (req, res) => {
  const eventId = req.params.eventId;
  try {
    await ensureBillingTables();
    const result = await manualRetryWebhook(eventId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Manual retry error:", err);
    res.status(400).json({ error: "Retry failed: " + err.message });
  }
});
var billingRoutes_default = router3;

// server/app.ts
init_db();
import fs2 from "fs";
var envLocalPath2 = path4.resolve(process.cwd(), ".env.local");
if (fs2.existsSync(envLocalPath2)) {
  dotenv2.config({ path: envLocalPath2 });
}
dotenv2.config();
var app = express();
var isProd = process.env.NODE_ENV === "production";
var isTest = process.env.NODE_ENV === "test" || process.env.VECTOS_NO_LISTEN === "1";
if (isProd) {
  const secret = (process.env.SESSION_SECRET || "").trim();
  if (!secret || secret.length < 16) {
    console.warn("Notice [VectOS]: For production, set SESSION_SECRET in your environment variables for maximum session integrity.");
  }
  const hasSql = Boolean(
    process.env.SQL_HOST && process.env.SQL_DB_NAME || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL
  );
  if (!hasSql) {
    console.warn("\u26A0\uFE0F Notice [VectOS]: Running in production without POSTGRES_URL / DATABASE_URL. For Vercel, attach Vercel Postgres to ensure data persists across serverless function instances.");
  }
}
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.set("trust proxy", true);
app.use(helmetMiddleware);
app.use(cookieParser());
app.use(csrfEnsure);
app.use(htmlCsrfInjector);
app.use(csrfValidate);
app.use((req, res, next) => {
  req.headers["x-forwarded-proto"] = "https";
  next();
});
var sessionStore;
var hasDbUrl = Boolean(
  process.env.SQL_HOST && process.env.SQL_DB_NAME || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL
);
if (hasDbUrl) {
  try {
    const PgSession = connectPgSimple(session);
    sessionStore = new PgSession({
      pool: getPgPool(),
      tableName: "session",
      createTableIfMissing: true
    });
  } catch (storeErr) {
    console.warn("Notice: Using standard session store fallback:", storeErr);
  }
}
var sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = isTest ? "test-fallback-secret-at-least-32-chars-long" : crypto5.randomBytes(32).toString("hex");
}
app.use(
  session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: !isTest,
      sameSite: isTest ? "lax" : "none",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1e3
      // 24 hours
    }
  })
);
app.set("view engine", "ejs");
app.set("views", path4.join(process.cwd(), "views"));
app.use(express.static(path4.join(process.cwd(), "public")));
app.use("/public", express.static(path4.join(process.cwd(), "public")));
app.use("/api", apiRoutes_default);
app.use("/api", billingRoutes_default);
app.use("/legacy", iomsRoutes_default);
app.use(iomsRoutes_default);
app.get("/api/health", async (req, res) => {
  let dbHealthy = false;
  try {
    if (isPostgres()) {
      await getPgPool().query("SELECT 1");
      dbHealthy = true;
    } else {
      const db = await getDb();
      dbHealthy = Boolean(db);
    }
  } catch {
    dbHealthy = false;
  }
  let dlqCount = 0;
  let retryCount = 0;
  try {
    const { queryOne: queryOne3 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const dlq = await queryOne3("SELECT COUNT(*) as count FROM webhook_events WHERE status = ?", ["DEAD_LETTER"]);
    const retry = await queryOne3("SELECT COUNT(*) as count FROM webhook_events WHERE status = ?", ["RETRY_PENDING"]);
    dlqCount = dlq?.count || 0;
    retryCount = retry?.count || 0;
  } catch {
  }
  res.json({
    status: dbHealthy ? "ok" : "degraded",
    time: (/* @__PURE__ */ new Date()).toISOString(),
    database: isPostgres() ? "PostgreSQL" : "sql.js (SQLite)",
    dbHealthy,
    queues: {
      deadLetterWebhooks: dlqCount,
      pendingRetryWebhooks: retryCount
    },
    uptimeSec: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});
app.use((err, req, res, next) => {
  console.error("EXPRESS UNHANDLED ERROR:", err?.message || err, err?.stack);
  if (res.headersSent) {
    return next(err);
  }
  const status = typeof err?.status === "number" ? err.status : 500;
  const message = err?.message || "Internal server error";
  if (req.path.startsWith("/api") || req.headers.accept?.includes("application/json")) {
    return res.status(status).json({ error: message });
  }
  try {
    res.status(status).render("error", { title: "Server Error", message, path: req.path });
  } catch {
    res.status(status).type("html").send(`<h1>Server Error</h1><p>${message}</p>`);
  }
});
var dbReady = getDb().then(() => {
  console.log("\u2705 Database initialized successfully");
}).catch((err) => {
  console.error("Database initialization notice:", err);
  if (isProd && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.warn("Continuing despite database initialization notice.");
  }
});

// server/vercel.ts
async function handler(req, res) {
  try {
    await dbReady;
  } catch (err) {
    console.error("Database connection error in Vercel handler:", err);
  }
  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }
  return app(req, res);
}
export {
  handler as default
};
//# sourceMappingURL=index.js.map
