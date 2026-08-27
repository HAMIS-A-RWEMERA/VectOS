import { 
  User, 
  Shop, 
  Product, 
  StockLocation, 
  StockTransfer, 
  Order, 
  Customer, 
  PartnerShop, 
  DashboardStats, 
  ReportSummary 
} from '../types';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Server request failed');
  }
  return data;
}

export const api = {
  // Auth
  getMe: () => request<{ user: User | null; shop: Shop | null; availableShops: Shop[]; isSuperAdmin: boolean; dbPersistent: boolean }>('/api/auth/me'),
  login: (email: string, password: string) => request<{ success: boolean; user: User; shop: Shop }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  demoSwitch: (role: string, email?: string) => request<{ success: boolean; user: User; shop: Shop }>('/api/auth/demo-switch', {
    method: 'POST',
    body: JSON.stringify({ role, email })
  }),
  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  switchShop: (shop_id: number) => request<{ success: boolean; shop: Shop }>('/api/shops/switch', {
    method: 'POST',
    body: JSON.stringify({ shop_id })
  }),

  // Dashboard
  getDashboardStats: () => request<DashboardStats>('/api/dashboard/stats'),

  // Products
  getProducts: (search = '', category = '') => {
    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (category) params.append('category', category);
    return request<{ products: Product[]; categories: string[] }>(`/api/products?${params.toString()}`);
  },
  createProduct: (productData: Partial<Product>) => request<{ success: boolean; product: Product }>('/api/products', {
    method: 'POST',
    body: JSON.stringify(productData)
  }),
  updateProduct: (id: number, productData: Partial<Product>) => request<{ success: boolean; product: Product }>(`/api/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(productData)
  }),
  adjustStock: (id: number, adjustment_qty: number, movement_type: string, notes?: string) => request<{ success: boolean; product: Product }>(`/api/products/${id}/adjust-stock`, {
    method: 'POST',
    body: JSON.stringify({ adjustment_qty, movement_type, notes })
  }),

  // Stocks & Warehouses
  getStocks: () => request<{ stocks: StockLocation[]; transfers: StockTransfer[] }>('/api/stocks'),
  createStockLocation: (data: Partial<StockLocation>) => request<{ success: boolean; stock: StockLocation }>('/api/stocks', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  transferStock: (data: { from_stock_id: number; to_stock_id: number; product_id: number; quantity: number; notes?: string }) => 
    request<{ success: boolean; message: string }>('/api/stocks/transfer', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Orders & POS
  getOrders: (status = 'all') => request<{ orders: Order[] }>(`/api/orders?status=${encodeURIComponent(status)}`),
  getOrderDetail: (id: number) => request<{ order: Order; items: any[]; payments: any[] }>(`/api/orders/${id}`),
  createOrder: (orderData: {
    customer_id?: number | null;
    customer_name?: string;
    customer_phone?: string;
    items: { product_id: number; quantity: number; selling_price?: number; fulfillment_source?: string }[];
    payment_method: string;
    paid_amount: number;
    notes?: string;
    payment_reference?: string;
  }) => request<{ success: boolean; order: Order }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderData)
  }),
  recordPayment: (orderId: number, data: { amount: number; payment_method: string; reference_no?: string }) =>
    request<{ success: boolean; order: Order }>(`/api/orders/${orderId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateOrderStatus: (orderId: number, fulfillment_status: string, reason?: string) =>
    request<{ success: boolean; order: Order }>(`/api/orders/${orderId}/status`, {
      method: 'POST',
      body: JSON.stringify({ fulfillment_status, reason })
    }),

  // Customers
  getCustomers: (search = '') => request<{ customers: Customer[] }>(`/api/customers?q=${encodeURIComponent(search)}`),
  createCustomer: (customerData: Partial<Customer>) => request<{ success: boolean; customer: Customer }>('/api/customers', {
    method: 'POST',
    body: JSON.stringify(customerData)
  }),

  // Partners
  getPartners: () => request<{ partners: PartnerShop[] }>('/api/partners'),
  createPartner: (partnerData: Partial<PartnerShop>) => request<{ success: boolean; partner: PartnerShop }>('/api/partners', {
    method: 'POST',
    body: JSON.stringify(partnerData)
  }),

  // Users
  getUsers: () => request<{ users: User[] }>('/api/users'),
  createUser: (userData: any) => request<{ success: boolean; user: User }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(userData)
  }),

  // SuperAdmin & Shops
  getShops: () => request<{ shops: Shop[] }>('/api/shops'),
  createShop: (shopData: Partial<Shop>) => request<{ success: boolean; shop: Shop }>('/api/shops', {
    method: 'POST',
    body: JSON.stringify(shopData)
  }),
  updateShop: (id: number, shopData: Partial<Shop>) => request<{ success: boolean; shop: Shop }>(`/api/shops/${id}`, {
    method: 'PUT',
    body: JSON.stringify(shopData)
  }),

  // Reports
  getReports: () => request<ReportSummary>('/api/reports/summary')
};
