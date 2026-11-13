import { 
  User, 
  Shop, 
  Product, 
  StockLocation, 
  StockTransfer, 
  Order, 
  Customer, 
  CustomerStatement,
  PartnerShop, 
  DashboardStats, 
  ReportSummary 
} from '../types';

function persistToken(token?: string) {
  try {
    if (typeof window !== 'undefined' && window.localStorage && token) {
      window.localStorage.setItem('vectos_auth_token', token);
    }
  } catch (_) {}
}

function clearToken() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('vectos_auth_token');
    }
  } catch (_) {}
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let authToken: string | null = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      authToken = window.localStorage.getItem('vectos_auth_token');
    }
  } catch (_) {}

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    'Accept': 'application/json',
    ...(authToken ? { 
      'Authorization': `Bearer ${authToken}`,
      'x-auth-token': authToken 
    } : {}),
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

    // Auto-persist new or refreshed token from server if returned
    if (data && typeof data === 'object' && typeof data.token === 'string' && data.token.trim()) {
      persistToken(data.token.trim());
    }

    if (!response.ok) {
      let errMsg = `Server request failed (${response.status})`;
      if (typeof data === 'string' && data.trim()) {
        errMsg = data;
      } else if (data && typeof data === 'object') {
        if (typeof data.error === 'string') {
          errMsg = data.error;
        } else if (data.error && typeof data.error === 'object') {
          errMsg = data.error.message || data.error.code || (data.error.code ? `Error: ${data.error.code}` : JSON.stringify(data.error));
        } else if (typeof data.message === 'string') {
          errMsg = data.message;
        } else if (typeof data.details === 'string') {
          errMsg = data.details;
        }
      }
      throw new Error(errMsg);
    }
    return data;
  } catch (err: any) {
    throw err;
  }
}

export const api = {
  // Auth
  getMe: async () => {
    const res = await request<{ user: User | null; shop: Shop | null; availableShops: Shop[]; isSuperAdmin: boolean; dbPersistent: boolean; isServerless?: boolean; token?: string }>('/api/auth/me');
    if (res?.token) persistToken(res.token);
    return res;
  },
  login: async (email: string, password: string) => {
    const res = await request<{ success: boolean; user: User; shop: Shop; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res?.token) persistToken(res.token);
    return res;
  },
  firebaseLogin: async (idToken: string, email: string, displayName?: string) => {
    const res = await request<{ success: boolean; user: User; shop: Shop; token?: string }>('/api/auth/firebase-login', {
      method: 'POST',
      body: JSON.stringify({ idToken, email, displayName })
    });
    if (res?.token) persistToken(res.token);
    return res;
  },
  register: async (data: {
    storeName: string;
    ownerName: string;
    email: string;
    password: string;
    phone?: string;
    location?: string;
  }) => {
    const res = await request<{ success: boolean; message: string; user: User; shop: Shop; token?: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res?.token) persistToken(res.token);
    return res;
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await request<{ success: boolean; message: string; token?: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (res?.token) persistToken(res.token);
    return res;
  },
  demoSwitch: (role: string, email?: string) => request<{ success: boolean; user: User; shop: Shop }>('/api/auth/demo-switch', {
    method: 'POST',
    body: JSON.stringify({ role, email })
  }),
  logout: async () => {
    clearToken();
    try {
      return await request<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
    } catch {
      return { success: true };
    }
  },
  switchShop: async (shop_id: number) => {
    const res = await request<{ success: boolean; shop: Shop; token?: string }>('/api/shops/switch', {
      method: 'POST',
      body: JSON.stringify({ shop_id })
    });
    if (res?.token) persistToken(res.token);
    return res;
  },

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
  aiExtractInvoice: (formData: FormData) => request<{ success: boolean; count: number; items: any[]; message?: string }>('/api/products/ai-extract-invoice', {
    method: 'POST',
    body: formData
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
    use_store_credit?: boolean;
    store_credit_amount?: number;
    notes?: string;
    payment_reference?: string;
    release_immediately?: boolean;
  }) => request<{ success: boolean; order: Order; store_credit_applied?: number }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderData)
  }),
  updateOrder: (id: number, orderData: {
    customer_name?: string;
    customer_phone?: string;
    notes?: string;
    paid_amount?: number;
    items: { product_id: number; quantity: number; selling_price?: number; fulfillment_source?: string }[];
  }) => request<{ success: boolean; order: Order; message?: string }>(`/api/orders/${id}`, {
    method: 'PUT',
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
  releaseOrderItems: (orderId: number, data: {
    released_items: { order_item_id: number; product_id?: number; quantity_released: number }[];
    update_receipt?: boolean;
    fulfillment_status?: string;
    notes?: string;
  }) => request<{ success: boolean; order: Order; message: string }>(`/api/orders/${orderId}/release-items`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  voidOrder: (orderId: number, reason?: string) =>
    request<{ success: boolean; order: Order; message?: string }>(`/api/orders/${orderId}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  // Customers
  getCustomers: (search = '', sort = 'debt') => {
    const q = new URLSearchParams();
    if (search) q.append('q', search);
    if (sort) q.append('sort', sort);
    return request<{ customers: Customer[] }>(`/api/customers?${q.toString()}`);
  },
  createCustomer: (customerData: Partial<Customer>) => request<{ success: boolean; customer: Customer }>('/api/customers', {
    method: 'POST',
    body: JSON.stringify(customerData)
  }),
  getCustomerStatement: (
    customerId: number,
    params?: { period?: 'day' | 'week' | 'month' | 'all' | 'custom'; startDate?: string; endDate?: string }
  ) => {
    const q = new URLSearchParams();
    if (params?.period) q.append('period', params.period);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    const qs = q.toString();
    return request<CustomerStatement>(`/api/customers/${customerId}/statement${qs ? `?${qs}` : ''}`);
  },
  settleCustomerDebt: (
    customerId: number,
    data: {
      amount: number;
      payment_method?: string;
      reference_no?: string;
      notes?: string;
      excess_to_store_credit?: boolean;
    }
  ) => request<{
    success: boolean;
    message: string;
    customer: Customer;
    appliedToDebt: number;
    addedToStoreCredit: number;
    remainingDebt: number;
    settledOrders: {
      order_id: number;
      order_number: string;
      applied_amount: number;
      previous_debt: number;
      remaining_debt: number;
      new_payment_status: string;
    }[];
  }>(`/api/customers/${customerId}/settle-debt`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  adjustCustomerStoreCredit: (
    customerId: number,
    data: {
      action: 'add' | 'payout';
      amount: number;
      payment_method?: string;
      reference_no?: string;
      notes?: string;
    }
  ) => request<{ success: boolean; message: string; customer: Customer }>(`/api/customers/${customerId}/store-credit`, {
    method: 'POST',
    body: JSON.stringify(data)
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
  updateShop: async (id: number, shopData: Partial<Shop>) => {
    const res = await request<{ success: boolean; shop: Shop; token?: string }>(`/api/shops/${id}`, {
      method: 'PUT',
      body: JSON.stringify(shopData)
    });
    if (res?.token) persistToken(res.token);
    return res;
  },
  getAdminSettings: () => request<{ autoApproveNewStores: boolean; pendingShopsCount: number; pendingUsersCount: number }>('/api/admin/settings'),
  updateAdminSettings: (autoApproveNewStores: boolean) => request<{ success: boolean; autoApproveNewStores: boolean }>('/api/admin/settings', {
    method: 'POST',
    body: JSON.stringify({ autoApproveNewStores })
  }),
  getPendingApprovals: () => request<{ pendingShops: Shop[]; pendingUsers: User[] }>('/api/admin/pending'),
  updateShopStatus: (id: number, status: 'active' | 'pending' | 'suspended') => request<{ success: boolean; shop: Shop }>(`/api/admin/shops/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  }),
  updateUserStatus: (id: number, activation_status: 'active' | 'pending_approval' | 'suspended') => request<{ success: boolean; user: User }>(`/api/admin/users/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ activation_status })
  }),
  approveAllPending: () => request<{ success: boolean; approvedShops: number; approvedUsers: number; message: string }>('/api/admin/approve-all', {
    method: 'POST'
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
  },

  // VectOS AI Help Assistant
  askAiHelp: (question: string, history?: { role: string; text: string }[]) => request<{ success: boolean; reply: string }>('/api/ai/help', {
    method: 'POST',
    body: JSON.stringify({ question, history })
  })
};
