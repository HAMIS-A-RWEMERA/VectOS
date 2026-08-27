export type UserRole = 'superadmin' | 'manager' | 'accountant' | 'storekeeper' | 'salesperson' | 'cashier' | 'employee';

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
}

export interface Product {
  id: number;
  shop_id: number;
  stock_id?: number;
  name: string;
  sku: string;
  barcode?: string | null;
  category: string;
  unit: string;
  buying_price: number;
  quantity: number;
  low_stock_threshold: number;
  description?: string | null;
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
  product_id: number;
  product_name?: string;
  product_sku?: string;
  product_unit?: string;
  quantity: number;
  buying_price: number;
  selling_price: number;
  subtotal: number;
  profit: number;
  fulfillment_source?: string;
  item_status?: 'pending_store' | 'approved' | 'rejected' | 'partner_fulfilled' | 'unavailable';
  rejection_reason?: string;
}

export interface Payment {
  id: number;
  shop_id: number;
  order_id: number;
  amount: number;
  payment_method: 'cash' | 'momo' | 'bank_transfer' | 'debt_credit';
  reference_no?: string;
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
  payment_status: 'paid' | 'partial' | 'unpaid';
  fulfillment_status: 'pending_store' | 'approved' | 'dispatched' | 'completed' | 'rejected';
  status?: string;
  notes?: string;
  created_at: string;
  item_count?: number;
  items?: OrderItem[];
  payments?: Payment[];
  shop_name?: string;
  tin_number?: string;
  receipt_footer_text?: string;
  shop_phone?: string;
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
  order_count?: number;
  total_spent?: number;
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
  lowStockProducts: Product[];
  recentOrders: Order[];
  stockLocations: StockLocation[];
  paymentBreakdown: { payment_method: string; total_amount: number; count: number }[];
  recentDaysTrend: { date: string; amount: number; orders_count: number }[];
}

export interface ReportSummary {
  categorySales: { category: string; revenue: number; profit: number; units_sold: number }[];
  topSellingProducts: { name: string; sku: string; category: string; total_units_sold: number; total_revenue: number; total_profit: number }[];
  salespersonPerformance: { name: string; email: string; total_orders: number; total_sales: number }[];
  auditLogs: { id: number; action: string; details: string; ip_address: string; created_at: string; user_name?: string; user_role?: string }[];
}
