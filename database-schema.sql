-- ============================================================================
-- VectOS (Quincaille IOMS Kigali) - PostgreSQL Database Schema
-- Production Ready for: Vercel Postgres / Neon / Cloud SQL / Supabase
-- ============================================================================

-- 1. SHOPS / HARDWARE & TECH STORES (Multi-Tenancy)
CREATE TABLE IF NOT EXISTS shops (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE NOT NULL,
  owner_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  location VARCHAR(255) DEFAULT 'Kigali, Rwanda',
  tin_number VARCHAR(50),
  receipt_footer_text TEXT DEFAULT 'Thank you for choosing us! Goods once sold in good condition are not returnable.',
  status VARCHAR(50) DEFAULT 'active' CHECK(status IN ('pending', 'active', 'suspended')),
  business_type VARCHAR(100) DEFAULT 'Hardware & Electronics',
  subscription_plan VARCHAR(100) DEFAULT 'Standard Depot',
  billed_accounts INTEGER DEFAULT 1,
  billed_stocks INTEGER DEFAULT 1,
  monthly_fee NUMERIC(15,2) DEFAULT 20000.0,
  billing_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. STOCKS / WAREHOUSES & BRANCH LOCATIONS
CREATE TABLE IF NOT EXISTS stocks (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100),
  location VARCHAR(255),
  manager_name VARCHAR(255),
  phone VARCHAR(50),
  is_main INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active' CHECK(status IN ('active', 'pending_approval', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. USERS (SuperAdmin, Store Owners/Managers, and Staff)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  stock_id INTEGER REFERENCES stocks(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'employee',
  job_title VARCHAR(100) DEFAULT 'Store Staff',
  phone VARCHAR(50),
  is_active INTEGER DEFAULT 1,
  activation_status VARCHAR(50) DEFAULT 'active' CHECK(activation_status IN ('active', 'pending_approval', 'suspended')),
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. PRODUCTS (Hardware, Construction & Tech Materials)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  stock_id INTEGER DEFAULT 1 REFERENCES stocks(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  barcode TEXT,
  category VARCHAR(100) NOT NULL,
  unit VARCHAR(50) DEFAULT 'pcs',
  buying_price NUMERIC(15,2) NOT NULL CHECK(buying_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  low_stock_threshold INTEGER DEFAULT 10,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. CUSTOMERS (Contractors & Individuals)
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  id_number VARCHAR(100),
  email VARCHAR(255),
  address TEXT,
  credit_balance NUMERIC(15,2) DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. PARTNER SHOPS (External Hardware Suppliers for Sourcing)
CREATE TABLE IF NOT EXISTS partner_shops (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  address TEXT,
  current_balance NUMERIC(15,2) DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. ORDERS (Header records)
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  stock_id INTEGER DEFAULT 1 REFERENCES stocks(id) ON DELETE SET NULL,
  order_number VARCHAR(100) UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  salesperson_id INTEGER NOT NULL REFERENCES users(id),
  total_amount NUMERIC(15,2) DEFAULT 0.0,
  paid_amount NUMERIC(15,2) DEFAULT 0.0,
  debt_amount NUMERIC(15,2) DEFAULT 0.0,
  payment_status VARCHAR(50) DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid', 'partial', 'debt')),
  fulfillment_status VARCHAR(50) DEFAULT 'pending_store' CHECK(fulfillment_status IN ('pending_accountant', 'pending_store', 'resolving_rejected', 'completed', 'cancelled')),
  notes TEXT,
  client_ref TEXT,
  payment_approved_by INTEGER REFERENCES users(id),
  payment_approved_at TIMESTAMP WITH TIME ZONE,
  stock_released_by INTEGER REFERENCES users(id),
  stock_released_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  buying_price NUMERIC(15,2) NOT NULL,
  selling_price NUMERIC(15,2) NOT NULL CHECK(selling_price >= 0),
  subtotal NUMERIC(15,2) NOT NULL,
  profit NUMERIC(15,2) NOT NULL,
  fulfillment_source VARCHAR(100) DEFAULT 'Store',
  item_status VARCHAR(50) DEFAULT 'pending_store' CHECK(item_status IN ('pending_store', 'approved', 'rejected', 'partner_fulfilled', 'unavailable')),
  rejection_reason TEXT,
  partner_shop_id INTEGER REFERENCES partner_shops(id)
);

-- 9. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL CHECK(amount > 0),
  payment_method VARCHAR(50) NOT NULL CHECK(payment_method IN ('cash', 'momo', 'bank_transfer', 'debt_credit')),
  reference_no VARCHAR(255),
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. INVENTORY MOVEMENTS (Stock card audit trail)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  stock_id INTEGER DEFAULT 1 REFERENCES stocks(id) ON DELETE SET NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  movement_type VARCHAR(50) NOT NULL CHECK(movement_type IN ('Stock Received', 'Sale', 'Adjustment', 'Damage', 'Return', 'Transfer In', 'Transfer Out')),
  reference VARCHAR(255),
  performed_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. AUDIT LOGS (Immutable Activity Log)
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  details TEXT,
  ip_address VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. STOCK TRANSFERS BETWEEN DEPOTS
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

-- 13. LOGIN THROTTLE (Brute-force protection)
CREATE TABLE IF NOT EXISTS login_throttle (
  id SERIAL PRIMARY KEY,
  identity TEXT UNIQUE NOT NULL,
  attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. EXPRESS SESSION PERSISTENCE (For Vercel Serverless Functions)
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Unique constraints for multi-tenant data integrity
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shop_sku ON products(shop_id, sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shop_client_ref ON orders(shop_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shop_phone ON customers(shop_id, phone);

-- ============================================================================
-- INITIAL PLATFORM SUPERADMIN (Only if users table is empty)
-- ============================================================================
INSERT INTO shops (id, name, code, owner_name, phone, email, location, status)
VALUES (1, 'VectOS Main Store', 'main', 'Administrator', '+250 788 000 000', 'rwemera30@gmail.com', 'Kigali, Rwanda', 'active')
ON CONFLICT (id) DO NOTHING;

SELECT setval('shops_id_seq', (SELECT COALESCE(MAX(id), 1) FROM shops));

INSERT INTO stocks (id, shop_id, name, code, location, is_main, status)
VALUES (1, 1, 'Main Warehouse', 'WH-01', 'Kigali Central', 1, 'active')
ON CONFLICT (id) DO NOTHING;

SELECT setval('stocks_id_seq', (SELECT COALESCE(MAX(id), 1) FROM stocks));

-- Single platform admin user ($2b$10$BQyIVHjk9BpFCUZV/HGFZuAjzLBgLfFnBpOVrtDBWL.28fqW1jMJ6 -> password123)
-- Linked to rwemera30@gmail.com. Users can also register their own store directly via the UI Sign-up tab.
INSERT INTO users (
  id, shop_id, stock_id, name, email, password, role, job_title, phone, is_active, activation_status,
  can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow,
  can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note,
  can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions
)
VALUES (
  1, 1, 1, 'Rwemera Platform Administrator', 'rwemera30@gmail.com', '$2b$10$BQyIVHjk9BpFCUZV/HGFZuAjzLBgLfFnBpOVrtDBWL.28fqW1jMJ6', 'superadmin', 'Platform Administrator', '+250 788 000 000', 1, 'active',
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
)
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));
