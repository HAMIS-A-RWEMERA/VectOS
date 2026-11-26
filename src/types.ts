export type UserRole = 'superadmin' | 'platform_ops' | 'manager' | 'accountant' | 'storekeeper' | 'salesperson' | 'cashier' | 'employee';

export interface User {
  id: number;
  shop_id?: number | null;
  stock_id?: number | null;
  name: string;
  email: string;
  role: UserRole;
  job_title: string;
  phone?: string;
  is_active?: number;
  activation_status?: 'active' | 'pending_approval' | 'suspended';
  force_password_change?: number;
  twofa_enabled?: boolean;
  can_create_orders?: boolean;
  can_process_payments?: boolean;
  can_release_stock?: boolean;
  can_manage_stock?: boolean;
  can_import_export_stock?: boolean;
  can_partner_borrow?: boolean;
  can_view_reports?: boolean;
  can_view_buying_prices?: boolean;
  can_give_discounts?: boolean;
  can_manage_users?: boolean;
  can_print_full_receipt?: boolean;
  can_print_delivery_note?: boolean;
  can_manage_customers?: boolean;
  can_manage_partners?: boolean;
  can_void_orders?: boolean;
  can_edit_company_settings?: boolean;
  can_view_audit_trail?: boolean;
  can_reset_passwords?: boolean;
  can_view_all_tenants?: boolean;
  can_manage_subscriptions?: boolean;
  can_verify_orders?: boolean;
  can_resolve_flagged_orders?: boolean;
  can_upload_photos?: boolean;
  can_view_stock_levels?: boolean;
  shop_name?: string;
  created_at?: string;
}

export interface Shop {
  id: number;
  name: string;
  code: string;
  owner_name: string;
  phone: string;
  email: string;
  location: string;
  tin_number?: string;
  receipt_footer_text?: string;
  status: 'pending' | 'active' | 'suspended';
  business_type?: string;
  subscription_plan?: string;
  billed_accounts?: number;
  billed_stocks?: number;
  monthly_fee?: number;
  user_count?: number;
  stock_count?: number;
  product_count?: number;
  total_revenue?: number;
  workflow_mode?: 'standard' | 'strict_chain';
  pricing_mode?: 'standard' | 'stock_only';
  require_order_photo?: boolean | number;
  created_at?: string;
}

export interface Product {
  id: number;
  shop_id: number;
  stock_id?: number;
  stock_name?: string;
  name: string;
  sku: string;
  barcode?: string | null;
  category: string;
  unit: string;
  units_per_pack?: number;
  pack_unit?: string | null;
  buying_price: number | null;
  selling_price?: number;
  pack_buying_price?: number | null;
  pack_selling_price?: number;
  quantity: number | null;
  physical_quantity?: number | null;
  low_stock_threshold: number | null;
  is_watched?: boolean | number;
  reserved_quantity?: number | null;
  available_quantity?: number | null;
  in_stock?: boolean;
  pack_in_stock?: boolean;
  stock_levels_hidden?: boolean;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  last_stocked_at?: string;
  total_units_sold?: number | null;
}

export interface StockLocation {
  id: number;
  shop_id: number;
  name: string;
  code: string;
  location: string;
  manager_name?: string;
  phone?: string;
  is_main: number;
  status: string;
  product_count?: number;
  total_units?: number;
}

export interface StockTransfer {
  id: number;
  shop_id: number;
  from_stock_id: number;
  to_stock_id: number;
  product_id: number;
  product_name?: string;
  product_sku?: string;
  from_stock_name?: string;
  to_stock_name?: string;
  quantity: number;
  transferred_by?: number;
  transferred_by_name?: string;
  notes?: string;
  created_at: string;
}

export interface OrderItem {
  id?: number;
  order_id?: number;
  product_id: number | null;
  product_name?: string;
  product_sku?: string;
  product_unit?: string;
  custom_product_name?: string | null;
  partner_shop_id?: number | null;
  partner_shop_name?: string | null;
  quantity: number;
  sale_mode?: 'pack' | 'retail';
  sold_unit?: string;
  pack_size?: number;
  buying_price: number | null;
  selling_price: number;
  subtotal: number;
  profit: number | null;
  fulfillment_source?: string;
  item_status?: 'pending_store' | 'approved' | 'rejected' | 'partner_fulfilled' | 'unavailable';
  source_stock_id?: number | null;
  source_stock_name?: string | null;
  leg_type?: 'shop' | 'warehouse' | 'partner';
  leg_status?: 'pending' | 'seller_released' | 'warehouse_released' | 'partner_released' | 'supervisor_confirmed' | 'flagged';
  leg_released_by?: number | null;
  leg_released_by_name?: string | null;
  leg_released_at?: string | null;
  leg_verified_by?: number | null;
  leg_verified_by_name?: string | null;
  leg_verified_at?: string | null;
  rejection_reason?: string;
}

export interface Payment {
  id: number;
  shop_id: number;
  order_id: number;
  amount: number;
  payment_method: 'cash' | 'momo' | 'bank_transfer' | 'debt_credit';
  reference_no?: string;
  proof_photo_key?: string | null;
  recorded_by?: number;
  recorded_by_name?: string;
  created_at: string;
}

export interface Order {
  id: number;
  shop_id: number;
  stock_id: number;
  order_number: string;
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  salesperson_id: number;
  salesperson_name?: string;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  payment_status: 'pending' | 'paid' | 'partial' | 'debt' | 'unpaid';
  fulfillment_status: 'pending_store' | 'approved' | 'dispatched' | 'completed' | 'rejected' | 'cancelled';
  status?: string;
  notes?: string;
  created_at: string;
  item_count?: number;
  items?: OrderItem[];
  payments?: Payment[];
  shop_name?: string;
  stock_name?: string;
  tin_number?: string;
  receipt_footer_text?: string;
  shop_phone?: string;
  payment_approved_by?: number | null;
  payment_approved_by_name?: string | null;
  payment_approved_at?: string | null;
  stock_released_by?: number | null;
  stock_released_by_name?: string | null;
  stock_released_at?: string | null;
  handwritten_photo_key?: string | null;
  chain_status?: 'pending_supervisor_1' | 'returned_to_seller' | 'in_release' | 'flagged_for_manager' | 'completed' | 'cancelled';
  first_verified_by?: number | null;
  first_verified_by_name?: string | null;
  first_verified_at?: string | null;
  final_verified_by?: number | null;
  final_verified_by_name?: string | null;
  final_verified_at?: string | null;
  flagged_by?: number | null;
  flagged_by_name?: string | null;
  flagged_at?: string | null;
  flag_reason?: string | null;
  resolved_by?: number | null;
  resolved_by_name?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
}

export interface ProductWatchAlert {
  id: number;
  shop_id: number;
  order_id: number;
  order_number: string;
  product_id: number;
  product_name: string;
  stock_id?: number | null;
  stock_name?: string | null;
  quantity_sold: number;
  sold_unit?: string | null;
  stock_remaining_after: number;
  customer_name?: string | null;
  seller_name?: string | null;
  first_verifier_name?: string | null;
  final_verifier_name?: string | null;
  is_audited: number | boolean;
  audited_by?: number | null;
  audited_by_name?: string | null;
  audited_at?: string | null;
  audit_note?: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  shop_id: number;
  user_id?: number | null;
  action: string;
  details: string;
  ip_address: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
  user_role?: string;
  user_job_title?: string;
}

export interface Customer {
  id: number;
  shop_id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  id_number?: string;
  credit_balance: number;
  store_credit?: number;
  order_count?: number;
  total_spent?: number;
  total_paid?: number;
  last_order_at?: string | null;
  created_at?: string;
}

export interface CustomerCreditEntry {
  id: number;
  shop_id: number;
  customer_id: number;
  order_id?: number | null;
  order_number?: string | null;
  amount: number;
  entry_type: 'credit_added' | 'credit_used' | 'credit_payout' | 'bulk_payment';
  payment_method?: string | null;
  reference_no?: string | null;
  proof_photo_key?: string | null;
  notes?: string | null;
  recorded_by?: number | null;
  recorded_by_name?: string | null;
  created_at: string;
}

export interface CustomerStatementOrderItem {
  id?: number;
  product_id: number;
  product_name: string;
  product_unit?: string;
  quantity: number;
  sale_mode?: 'pack' | 'retail';
  sold_unit?: string;
  pack_size?: number;
  selling_price: number;
  subtotal: number;
}

export interface CustomerStatementOrder extends Order {
  statement_items?: CustomerStatementOrderItem[];
}

export interface CustomerStatement {
  customer: Customer;
  shop: Partial<Shop>;
  period: string;
  periodLabel: string;
  startDate?: string | null;
  endDate?: string | null;
  summary: {
    ordersCount: number;
    totalOrdered: number;
    totalPaidOnOrders: number;
    periodDebt: number;
    paymentsReceivedInPeriod: number;
    creditAddedInPeriod: number;
    creditUsedInPeriod: number;
    currentDebtBalance: number;
    currentStoreCredit: number;
    lifetimeOrders: number;
    lifetimeSpent: number;
    lifetimePaid: number;
  };
  orders: CustomerStatementOrder[];
  payments: (Payment & { order_number?: string; order_status?: string })[];
  creditLedger: CustomerCreditEntry[];
}

export interface PartnerShop {
  id: number;
  shop_id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  address?: string;
  current_balance: number;
}

export interface DashboardStats {
  todaySales: number;
  todayOrderCount: number;
  totalSales: number;
  totalPaid: number;
  totalDebt: number;
  productCount: number;
  inventoryValue: number;
  customerCount: number;
  totalReceivables: number;
  lowStockCount: number;
  stockLevelsHidden?: boolean;
  pendingPaymentCount?: number;
  pendingStoreCount?: number;
  lowStockProducts: Product[];
  recentOrders: Order[];
  stockLocations: StockLocation[];
  paymentBreakdown: { payment_method: string; total_amount: number; count: number }[];
  recentDaysTrend: { date: string; amount: number; orders_count: number }[];
}

export interface ReportSummary {
  categorySales: { category: string; revenue: number; profit: number | null; units_sold: number }[];
  topSellingProducts: { name: string; sku: string; category: string; total_units_sold: number; total_revenue: number; total_profit: number | null }[];
  salespersonPerformance: { name: string; email: string; total_orders: number; total_sales: number }[];
  auditLogs: { id: number; action: string; details: string; ip_address: string; created_at: string; user_name?: string; user_role?: string }[];
}
