-- ============================================================================
-- VectOS (Quincaille IOMS Kigali) - Supabase PostgreSQL Database Schema & Seed
-- Target: Supabase (PostgreSQL 15+)
-- Instructions: Run this entire script in your Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 0. EXTENSIONS & CLEANUP
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'suspended')),
  business_type VARCHAR(100) DEFAULT 'Hardware & Construction',
  subscription_plan VARCHAR(100) DEFAULT 'Starter Business (RWF 20,000/mo)',
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

-- 3. USERS (SuperAdmin, Managers, and Granular Permission Employees)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  stock_id INTEGER REFERENCES stocks(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'employee',
  job_title VARCHAR(100) DEFAULT 'Operations Staff',
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. PRODUCTS (Construction, Hardware & Tech Materials)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  stock_id INTEGER DEFAULT 1 REFERENCES stocks(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  category VARCHAR(100) NOT NULL,
  unit VARCHAR(50) DEFAULT 'pcs',
  buying_price NUMERIC(15,2) NOT NULL CHECK(buying_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  low_stock_threshold INTEGER DEFAULT 10,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. CUSTOMERS (Construction Contractors & Individuals)
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
  fulfillment_source VARCHAR(50) DEFAULT 'Store',
  item_status VARCHAR(50) DEFAULT 'pending_store' CHECK(item_status IN ('pending_store', 'approved', 'rejected', 'partner_fulfilled', 'unavailable')),
  rejection_reason TEXT,
  partner_shop_id INTEGER REFERENCES partner_shops(id) ON DELETE SET NULL
);

-- 9. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL CHECK(amount > 0),
  payment_method VARCHAR(50) NOT NULL CHECK(payment_method IN ('cash', 'momo', 'bank_transfer', 'debt_credit')),
  reference_no VARCHAR(100),
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. INVENTORY MOVEMENTS
CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  stock_id INTEGER DEFAULT 1 REFERENCES stocks(id) ON DELETE SET NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  movement_type VARCHAR(50) NOT NULL CHECK(movement_type IN ('Stock Received', 'Sale', 'Adjustment', 'Damage', 'Return', 'Transfer In', 'Transfer Out')),
  reference VARCHAR(100),
  performed_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  details TEXT,
  ip_address VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. STOCK TRANSFERS (Inter-warehouse movements)
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

-- 13. EXPRESS SESSION PERSISTENCE (For Netlify Serverless Lambdas)
-- NOTE: WITH (OIDS) was removed in PostgreSQL 12+ and causes errors on Supabase.
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ============================================================================
-- INITIAL SEED DATA
-- Default password for all seed accounts is: password123
-- ============================================================================

-- Seed Default Active Shops
INSERT INTO shops (id, name, code, owner_name, phone, email, location, tin_number, status, subscription_plan)
VALUES 
  (1, 'Quincaille Kigali Central Depot', 'central', 'Jean-Luc Hakizimana', '+250 788 100 001', 'manager@quincaille.rw', 'Gikondo Industrial Zone, Kigali', '100234567', 'active', 'Enterprise Multi-Store'),
  (2, 'Kwizera & Sons Hardware Ltd', 'kwizera', 'Kwizera Eric', '+250 788 555 123', 'kwizera@hardware.rw', 'Nyabugogo Hardware Center, Kigali', '109876543', 'active', 'Standard Depot (RWF 45,000/mo)')
ON CONFLICT (id) DO NOTHING;

-- Reset Shop sequence
SELECT setval('shops_id_seq', (SELECT COALESCE(MAX(id), 1) FROM shops));

-- Seed Warehouses / Stocks
INSERT INTO stocks (id, shop_id, name, code, location, manager_name, is_main, status)
VALUES
  (1, 1, 'Main Gikondo Central Warehouse', 'WH-GIK-01', 'Gikondo Industrial Zone', 'Jean-Luc Hakizimana', 1, 'active'),
  (2, 1, 'Gisozi Hardware Depot (Branch 2)', 'WH-GSZ-02', 'Gisozi Hardware Market', 'Emmanuel Bizimana', 0, 'active'),
  (3, 2, 'Nyabugogo Central Depot', 'WH-NYA-01', 'Nyabugogo Hardware Center', 'Kwizera Eric', 1, 'active')
ON CONFLICT (id) DO NOTHING;

SELECT setval('stocks_id_seq', (SELECT COALESCE(MAX(id), 1) FROM stocks));

-- Seed SuperAdmin & Staff ($2a$10$95XvNrvuUj61g1Fk7vNl/OHu5W7bcfn3tI5Lq2YkC3YyQW1V6jK2K -> password123)
INSERT INTO users (
  id, shop_id, stock_id, name, email, password, role, job_title, phone, is_active, activation_status,
  can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock, can_partner_borrow,
  can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users, can_print_full_receipt, can_print_delivery_note,
  can_manage_customers, can_manage_partners, can_void_orders, can_edit_company_settings
)
VALUES 
  (1, 1, 1, 'VectOS Super Admin', 'admin@vectos.co.rw', '$2a$10$95XvNrvuUj61g1Fk7vNl/OHu5W7bcfn3tI5Lq2YkC3YyQW1V6jK2K', 'superadmin', 'Platform Owner & Administrator', '+250 788 000 999', 1, 'active', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1),
  (2, 1, 1, 'Jean-Luc Hakizimana', 'manager@quincaille.rw', '$2a$10$95XvNrvuUj61g1Fk7vNl/OHu5W7bcfn3tI5Lq2YkC3YyQW1V6jK2K', 'manager', 'Store Owner / Manager', '+250 788 100 001', 1, 'active', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1),
  (3, 1, 1, 'Marie-Claire Umutoni', 'sales@quincaille.rw', '$2a$10$95XvNrvuUj61g1Fk7vNl/OHu5W7bcfn3tI5Lq2YkC3YyQW1V6jK2K', 'salesperson', 'Sales & Counter Cashier', '+250 788 100 002', 1, 'active', 1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0),
  (4, 1, 1, 'Patrick Nshimiyimana', 'accountant@quincaille.rw', '$2a$10$95XvNrvuUj61g1Fk7vNl/OHu5W7bcfn3tI5Lq2YkC3YyQW1V6jK2K', 'accountant', 'Finance & Head Cashier', '+250 788 100 003', 1, 'active', 0, 1, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0),
  (5, 1, 1, 'Emmanuel Bizimana', 'storekeeper@quincaille.rw', '$2a$10$95XvNrvuUj61g1Fk7vNl/OHu5W7bcfn3tI5Lq2YkC3YyQW1V6jK2K', 'storekeeper', 'Warehouse Storekeeper', '+250 788 100 004', 1, 'active', 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0)
ON CONFLICT (id) DO UPDATE SET 
  password = EXCLUDED.password,
  is_active = 1,
  activation_status = 'active';

SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));

-- Seed Hardware Products
INSERT INTO products (id, shop_id, stock_id, name, sku, category, unit, buying_price, quantity, low_stock_threshold, description)
VALUES
  (1, 1, 1, 'CIMERWA Cement 32.5R (50kg)', 'CEM-325R', 'Cement', 'Bag', 10500, 250, 50, 'High quality Rwandan hydraulic cement for masonry'),
  (2, 1, 1, 'CIMERWA Cement 42.5N Premium (50kg)', 'CEM-425N', 'Cement', 'Bag', 12200, 180, 40, 'High strength cement for structural slabs'),
  (3, 1, 1, 'Deformed Iron Bars 12mm x 12m', 'IB-12MM', 'Steel & Rebar', 'Bar', 11000, 320, 50, 'Fe500 grade steel reinforcement bar'),
  (4, 1, 1, 'Deformed Iron Bars 16mm x 12m', 'IB-16MM', 'Steel & Rebar', 'Bar', 18500, 150, 30, 'Heavy duty steel reinforcement bar'),
  (5, 1, 1, 'Roofing Sheets Gauge 28 Blue (3m)', 'RS-G28-BL', 'Roofing', 'Sheet', 14500, 120, 25, 'Pre-painted corrugated galvanised iron sheet'),
  (6, 1, 1, 'Roofing Sheets Gauge 30 Maroon (3m)', 'RS-G30-MR', 'Roofing', 'Sheet', 11800, 80, 20, 'Versatile color-coated corrugated sheet'),
  (7, 1, 1, 'PVC Pressure Pipe 110mm PN10 (6m)', 'PVC-110MM', 'Plumbing', 'Pipe', 16000, 60, 15, 'High density underground drainage pipe'),
  (8, 1, 1, 'Amandla Weather Guard Paint White (20L)', 'PNT-WG-20L', 'Paint', 'Bucket', 48000, 25, 8, 'Exterior washable weatherguard acrylic paint'),
  (9, 1, 1, 'Roofing Nails Rubber Washer (1kg)', 'NL-RF-1KG', 'Hardware & Fasteners', 'Kg', 2200, 150, 30, 'Galvanised umbrella head roofing nails'),
  (10, 1, 1, 'Lake Sand Washing Clean (10 Tonne Truck)', 'SND-LAKE-10T', 'Aggregates', 'Truck', 140000, 12, 3, 'Washed plaster sand from Lake Kivu'),
  (11, 1, 1, 'Gravel Aggregates 14/20mm (10 Tonne Truck)', 'GRV-20MM-10T', 'Aggregates', 'Truck', 165000, 8, 2, 'Machine crushed hard blue stone aggregates'),
  (12, 1, 1, 'Binding Wire 1.6mm Annealed (25kg Roll)', 'BW-16MM-25KG', 'Hardware & Fasteners', 'Roll', 32000, 20, 5, 'Soft annealed iron wire for rebar tying')
ON CONFLICT (id) DO NOTHING;

SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM products));

-- Seed Customers
INSERT INTO customers (id, shop_id, name, phone, email, address, credit_balance)
VALUES
  (1, 1, 'Kigali Heights Construction Ltd', '+250 788 333 111', 'contracts@kigaliheights.rw', 'Kacyiru, Kigali', 150000.0),
  (2, 1, 'Inyange Commercial Contractors', '+250 788 444 222', 'inyangebuilder@gmail.com', 'Gikondo Industrial Zone', 0.0),
  (3, 1, 'Eric Mugisha (Individual Builder)', '+250 789 555 333', 'eric.mugisha@gmail.com', 'Nyamirambo, Kigali', 45000.0),
  (4, 1, 'Vision City Villa Developers', '+250 788 666 444', 'procurement@visioncity.rw', 'Gacuriro, Kigali', 0.0)
ON CONFLICT (id) DO NOTHING;

SELECT setval('customers_id_seq', (SELECT COALESCE(MAX(id), 1) FROM customers));

-- Seed Partner Suppliers
INSERT INTO partner_shops (id, shop_id, name, contact_person, phone, address, current_balance)
VALUES
  (1, 1, 'Bimaco Hardware Nyabugogo', 'Alain Bimenyimana', '+250 788 777 888', 'Nyabugogo Bus Park Area', 0.0),
  (2, 1, 'Rwanda Building Supplies Gisozi', 'Chantal Uwase', '+250 788 999 000', 'Gisozi Hardware Market', 120000.0),
  (3, 1, 'Muhima Construction Depot', 'Damascene Ndayisaba', '+250 788 222 333', 'Muhima Main Road', 0.0)
ON CONFLICT (id) DO NOTHING;

SELECT setval('partner_shops_id_seq', (SELECT COALESCE(MAX(id), 1) FROM partner_shops));
