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

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    let data: any = {};
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => ({}));
    } else {
      const text = await response.text().catch(() => '');
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text || `HTTP ${response.status}` };
      }
    }

    if (!response.ok) {
      const errMsg = data.error || data.message || `Server request failed (${response.status})`;
      throw new Error(errMsg);
    }
    return data;
  } catch (err: any) {
    throw err;
  }
}

export const api = {
  // Auth
  getMe: () => request<{ user: User | null; shop: Shop | null; availableShops: Shop[]; isSuperAdmin: boolean; dbPersistent: boolean }>('/api/auth/me'),
  login: (email: string, password: string) => request<{ success: boolean; user: User; shop: Shop }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  changePassword: (currentPassword: string, newPassword: string) => request<{ success: boolean; message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword })
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
  bulkImportProducts: (products: any[], stock_id?: number) => request<{ success: boolean; message: string; insertedCount: number; updatedCount: number; errors?: string[] }>('/api/products/bulk-import', {
    method: 'POST',
    body: JSON.stringify({ products, stock_id })
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
  getOrders: (params?: string | { status?: string; period?: string; startDate?: string; endDate?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (typeof params === 'string') {
      q.append('status', params);
    } else if (params) {
      if (params.status) q.append('status', params.status);
      if (params.period) q.append('period', params.period);
      if (params.startDate) q.append('startDate', params.startDate);
      if (params.endDate) q.append('endDate', params.endDate);
      if (params.limit) q.append('limit', String(params.limit));
    }
    return request<{ orders: Order[] }>(`/api/orders?${q.toString()}`);
  },
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
  updateUser: (id: number, userData: any) => request<{ success: boolean; user: User }>(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(userData)
  }),
  resetUserPassword: (id: number, newPassword: string) => request<{ success: boolean; message: string }>(`/api/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword })
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

  // Reports & Audits
  getReports: (params?: { period?: string; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.append('period', params.period);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    const queryString = q.toString();
    return request<ReportSummary>(queryString ? `/api/reports/summary?${queryString}` : '/api/reports/summary');
  },
  getAuditLogs: (params?: { search?: string; action?: string; limit?: number; shop_id?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.action) q.append('action', params.action);
    if (params?.limit) q.append('limit', String(params.limit));
    if (params?.shop_id) q.append('shop_id', String(params.shop_id));
    return request<{ success: boolean; logs: any[]; availableActions: string[] }>(`/api/reports/audit?${q.toString()}`);
  }
};
