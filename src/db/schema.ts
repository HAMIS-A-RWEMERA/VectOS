import { relations } from 'drizzle-orm';
import { integer, numeric, pgTable, serial, text, timestamp, json } from 'drizzle-orm/pg-core';

// 1. SHOPS (Multi-Tenancy)
export const shops = pgTable('shops', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  ownerName: text('owner_name').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull().unique(),
  location: text('location').default('Kigali, Rwanda'),
  tinNumber: text('tin_number'),
  receiptFooterText: text('receipt_footer_text').default('Thank you for choosing us! Goods once sold in good condition are not returnable.'),
  status: text('status').default('pending'),
  businessType: text('business_type').default('Hardware & Construction'),
  subscriptionPlan: text('subscription_plan').default('Starter Business (RWF 20,000/mo)'),
  billedAccounts: integer('billed_accounts').default(1),
  billedStocks: integer('billed_stocks').default(1),
  monthlyFee: numeric('monthly_fee').default('20000.0'),
  billingNotes: text('billing_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. STOCKS (Warehouses / Depots)
export const stocks = pgTable('stocks', {
  id: serial('id').primaryKey(),
  shopId: integer('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  code: text('code'),
  location: text('location'),
  managerName: text('manager_name'),
  phone: text('phone'),
  isMain: integer('is_main').default(0),
  status: text('status').default('active'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. USERS (Firebase Auth UID support + RBAC)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(), // Firebase Auth UID
  shopId: integer('shop_id').references(() => shops.id, { onDelete: 'cascade' }),
  stockId: integer('stock_id').references(() => stocks.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  role: text('role').default('employee').notNull(),
  jobTitle: text('job_title').default('Operations Staff'),
  phone: text('phone'),
  isActive: integer('is_active').default(1),
  activationStatus: text('activation_status').default('active'),
  activationNote: text('activation_note'),
  canCreateOrders: integer('can_create_orders').default(1),
  canProcessPayments: integer('can_process_payments').default(0),
  canReleaseStock: integer('can_release_stock').default(0),
  canManageStock: integer('can_manage_stock').default(0),
  canImportExportStock: integer('can_import_export_stock').default(0),
  canPartnerBorrow: integer('can_partner_borrow').default(0),
  canViewReports: integer('can_view_reports').default(0),
  canViewBuyingPrices: integer('can_view_buying_prices').default(0),
  canGiveDiscounts: integer('can_give_discounts').default(0),
  canManageUsers: integer('can_manage_users').default(0),
  canPrintFullReceipt: integer('can_print_full_receipt').default(1),
  canPrintDeliveryNote: integer('can_print_delivery_note').default(1),
  canManageCustomers: integer('can_manage_customers').default(1),
  canManagePartners: integer('can_manage_partners').default(0),
  canVoidOrders: integer('can_void_orders').default(0),
  canEditCompanySettings: integer('can_edit_company_settings').default(0),
  canViewAuditTrail: integer('can_view_audit_trail').default(0),
  canResetPasswords: integer('can_reset_passwords').default(0),
  canViewAllTenants: integer('can_view_all_tenants').default(0),
  canManageSubscriptions: integer('can_manage_subscriptions').default(0),
  forcePasswordChange: integer('force_password_change').default(0),
  twofaSecret: text('twofa_secret'),
  twofaEnabled: integer('twofa_enabled').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// 4. PRODUCTS
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  shopId: integer('shop_id').default(1).references(() => shops.id, { onDelete: 'cascade' }),
  stockId: integer('stock_id').default(1).references(() => stocks.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  sku: text('sku'),
  barcode: text('barcode'),
  category: text('category').notNull(),
  unit: text('unit').default('pcs'),
  buyingPrice: numeric('buying_price').notNull(),
  quantity: integer('quantity').default(0).notNull(),
  lowStockThreshold: integer('low_stock_threshold').default(10),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 5. CUSTOMERS
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  shopId: integer('shop_id').default(1).references(() => shops.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  idNumber: text('id_number'),
  email: text('email'),
  address: text('address'),
  creditBalance: numeric('credit_balance').default('0.0'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 6. PARTNER SHOPS
export const partnerShops = pgTable('partner_shops', {
  id: serial('id').primaryKey(),
  shopId: integer('shop_id').default(1).references(() => shops.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contactPerson: text('contact_person').notNull(),
  phone: text('phone').notNull(),
  address: text('address'),
  currentBalance: numeric('current_balance').default('0.0'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 7. ORDERS
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  shopId: integer('shop_id').default(1).references(() => shops.id, { onDelete: 'cascade' }),
  stockId: integer('stock_id').default(1).references(() => stocks.id, { onDelete: 'set null' }),
  orderNumber: text('order_number').notNull().unique(),
  customerId: integer('customer_id').notNull().references(() => customers.id),
  salespersonId: integer('salesperson_id').notNull().references(() => users.id),
  totalAmount: numeric('total_amount').default('0.0'),
  paidAmount: numeric('paid_amount').default('0.0'),
  debtAmount: numeric('debt_amount').default('0.0'),
  paymentStatus: text('payment_status').default('pending'),
  fulfillmentStatus: text('fulfillment_status').default('pending_store'),
  notes: text('notes'),
  clientRef: text('client_ref'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 8. ORDER ITEMS
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  buyingPrice: numeric('buying_price').notNull(),
  sellingPrice: numeric('selling_price').notNull(),
  subtotal: numeric('subtotal').notNull(),
  profit: numeric('profit').notNull(),
  fulfillmentSource: text('fulfillment_source').default('Store'),
  itemStatus: text('item_status').default('pending_store'),
  rejectionReason: text('rejection_reason'),
  partnerShopId: integer('partner_shop_id').references(() => partnerShops.id, { onDelete: 'set null' }),
});

// 9. PAYMENTS
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  shopId: integer('shop_id').default(1).references(() => shops.id, { onDelete: 'cascade' }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  amount: numeric('amount').notNull(),
  paymentMethod: text('payment_method').notNull(),
  referenceNo: text('reference_no'),
  recordedBy: integer('recorded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// 10. INVENTORY MOVEMENTS
export const inventoryMovements = pgTable('inventory_movements', {
  id: serial('id').primaryKey(),
  shopId: integer('shop_id').default(1).references(() => shops.id, { onDelete: 'cascade' }),
  stockId: integer('stock_id').default(1).references(() => stocks.id, { onDelete: 'set null' }),
  productId: integer('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  movementType: text('movement_type').notNull(),
  reference: text('reference'),
  performedBy: integer('performed_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// 11. AUDIT LOGS
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  shopId: integer('shop_id').default(1).references(() => shops.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  details: text('details'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 12. STOCK TRANSFERS
export const stockTransfers = pgTable('stock_transfers', {
  id: serial('id').primaryKey(),
  shopId: integer('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  fromStockId: integer('from_stock_id').notNull().references(() => stocks.id),
  toStockId: integer('to_stock_id').notNull().references(() => stocks.id),
  productId: integer('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  transferredBy: integer('transferred_by').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 13. LOGIN THROTTLE
export const loginThrottle = pgTable('login_throttle', {
  id: serial('id').primaryKey(),
  identity: text('identity').notNull().unique(),
  attempts: integer('attempts').default(0),
  lockedUntil: timestamp('locked_until'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 14. SESSION
export const session = pgTable('session', {
  sid: text('sid').primaryKey(),
  sess: json('sess').notNull(),
  expire: timestamp('expire').notNull(),
});

// RELATIONS
export const usersRelations = relations(users, ({ one, many }) => ({
  shop: one(shops, { fields: [users.shopId], references: [shops.id] }),
  stock: one(stocks, { fields: [users.stockId], references: [stocks.id] }),
  orders: many(orders),
  payments: many(payments),
}));

export const shopsRelations = relations(shops, ({ many }) => ({
  users: many(users),
  stocks: many(stocks),
  products: many(products),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  shop: one(shops, { fields: [orders.shopId], references: [shops.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  salesperson: one(users, { fields: [orders.salespersonId], references: [users.id] }),
  items: many(orderItems),
  payments: many(payments),
}));
