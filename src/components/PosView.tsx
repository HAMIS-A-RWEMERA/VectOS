import React, { useState, useEffect, useMemo } from 'react';
import { Product, Customer, User, Shop, StockLocation } from '../types';
import { api } from '../services/api';
import { 
  Search, 
  Barcode, 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  UserPlus, 
  CreditCard, 
  CheckCircle2, 
  DollarSign, 
  ArrowRight, 
  Printer, 
  RotateCcw,
  Smartphone,
  Building,
  AlertCircle
} from 'lucide-react';

interface CartItem {
  product: Product;
  quantity: number;
  selling_price: number;
  fulfillment_source: string;
}

interface PosViewProps {
  user: User | null;
  shop: Shop | null;
  onOrderCompleted: (order: any) => void;
}

export const PosView: React.FC<PosViewProps> = ({ user, shop, onOrderCompleted }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stocks, setStocks] = useState<StockLocation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customCustomerName, setCustomCustomerName] = useState('');
  const [customCustomerPhone, setCustomCustomerPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  
  // Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'momo' | 'bank_transfer' | 'debt_credit'>('cash');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [paymentRef, setPaymentRef] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastCreatedOrder, setLastCreatedOrder] = useState<any | null>(null);

  // Load products, categories, customers, stocks
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [prodRes, custRes, stockRes] = await Promise.all([
        api.getProducts(),
        api.getCustomers(),
        api.getStocks()
      ]);
      setProducts(prodRes.products || []);
      setCategories(['All', ...(prodRes.categories || [])]);
      setCustomers(custRes.customers || []);
      setStocks(stockRes.stocks || []);
    } catch (err: any) {
      console.error('POS Load Error:', err);
    }
  };

  // Filter products by search and category
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        p.name.toLowerCase().includes(q) || 
        p.sku.toLowerCase().includes(q) || 
        (p.barcode && p.barcode.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [products, searchQuery, selectedCategory]);

  // Cart operations
  const addToCart = (product: Product) => {
    if (product.quantity <= 0) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) return prev; // Cannot exceed available stock
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        product,
        quantity: 1,
        selling_price: product.buying_price > 0 ? Math.round(product.buying_price * 1.25) : 1000,
        fulfillment_source: 'main_store'
      }];
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > item.product.quantity) return item; // capped at current stock
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const updateItemPrice = (productId: number, price: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, selling_price: Math.max(0, price) } : item
      )
    );
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomerId(null);
    setCustomCustomerName('');
    setCustomCustomerPhone('');
    setOrderNotes('');
    setErrorMsg('');
  };

  // Totals calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.selling_price * item.quantity, 0);
  }, [cart]);

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  const openCheckout = () => {
    if (cart.length === 0) return;
    setPaidAmount(String(cartSubtotal));
    setPaymentRef('');
    setErrorMsg('');
    setIsCheckoutOpen(true);
  };

  const handleProcessOrder = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const numericPaid = Number(paidAmount) || 0;
      if (paymentMethod !== 'debt_credit' && numericPaid <= 0 && cartSubtotal > 0) {
        setErrorMsg('Please specify a valid payment amount or choose Credit/Debt.');
        setIsSubmitting(false);
        return;
      }

      const payload = {
        customer_id: selectedCustomerId,
        customer_name: selectedCustomer?.name || customCustomerName || 'Walk-in Cash Client',
        customer_phone: selectedCustomer?.phone || customCustomerPhone || '',
        items: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          selling_price: item.selling_price,
          fulfillment_source: item.fulfillment_source
        })),
        payment_method: paymentMethod,
        paid_amount: paymentMethod === 'debt_credit' ? 0 : Math.min(numericPaid, cartSubtotal),
        payment_reference: paymentRef,
        notes: orderNotes
      };

      const res = await api.createOrder(payload);
      if (res.success && res.order) {
        setLastCreatedOrder(res.order);
        setIsCheckoutOpen(false);
        clearCart();
        loadData(); // refresh product stock counts
        onOrderCompleted(res.order);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to complete order. Check stock availability.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  return (
    <div className="h-[calc(100vh-61px)] flex flex-col lg:flex-row overflow-hidden bg-[#0A0D12]">
      {/* Left: Product Catalog & Fast Live Search */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-800/80">
        {/* Top Control Bar: Search & Category Chips */}
        <div className="p-4 bg-[#0F131A] border-b border-slate-800/80 space-y-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search hardware by name, SKU, or scan barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-amber-400">
              <Barcode className="w-4 h-4" />
              <span>Scanner Ready</span>
            </div>
          </div>

          {/* Category Chips Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/20'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
          {filteredProducts.map((p) => {
            const inCart = cart.find(c => c.product.id === p.id);
            const isOutOfStock = p.quantity <= 0;
            const isLowStock = p.quantity > 0 && p.quantity <= p.low_stock_threshold;

            return (
              <div
                key={p.id}
                onClick={() => !isOutOfStock && addToCart(p)}
                className={`group relative p-3.5 rounded-2xl border transition-all select-none flex flex-col justify-between ${
                  isOutOfStock
                    ? 'bg-slate-900/40 border-slate-800/40 opacity-50 cursor-not-allowed'
                    : inCart
                    ? 'bg-amber-500/10 border-amber-500/50 cursor-pointer shadow-lg shadow-amber-500/10'
                    : 'bg-[#121620] hover:bg-[#161C28] border-slate-800/90 hover:border-slate-700 cursor-pointer'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 truncate">
                      {p.category}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      isOutOfStock
                        ? 'bg-rose-500/20 text-rose-300'
                        : isLowStock
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-800 text-emerald-400'
                    }`}>
                      {p.quantity} {p.unit}
                    </span>
                  </div>

                  <h3 className="text-xs sm:text-sm font-bold text-slate-100 group-hover:text-amber-300 transition line-clamp-2 mt-1.5">
                    {p.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">SKU: {p.sku}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono">
                    {formatRwf(p.buying_price > 0 ? p.buying_price * 1.25 : 1000)}
                  </span>
                  {inCart && (
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow">
                      {inCart.quantity}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-400 text-xs">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <p className="font-semibold text-slate-300">No matching products found</p>
              <p className="text-[11px] text-slate-400 mt-1">Try adjusting your search keywords or category filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Active POS Cart & Immediate Checkout Terminal */}
      <div className="w-full lg:w-96 bg-[#0D1017] flex flex-col h-full overflow-hidden shrink-0 border-t lg:border-t-0 border-slate-800">
        {/* Cart Header */}
        <div className="p-4 bg-[#111622] border-b border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Current Cart ({cart.length})</h2>
          </div>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* Customer Assignment Field */}
        <div className="p-3 bg-[#0F131A] border-b border-slate-800/80 space-y-2 shrink-0">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Customer / Client
          </label>
          <div className="flex gap-2">
            <select
              value={selectedCustomerId || ''}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                setSelectedCustomerId(val);
              }}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="">Walk-in Cash Client</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({formatRwf(c.credit_balance)} debt)
                </option>
              ))}
            </select>
          </div>

          {!selectedCustomerId && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <input
                type="text"
                placeholder="Client Name (opt)"
                value={customCustomerName}
                onChange={(e) => setCustomCustomerName(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-amber-500"
              />
              <input
                type="text"
                placeholder="Phone (078...)"
                value={customCustomerPhone}
                onChange={(e) => setCustomCustomerPhone(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
        </div>

        {/* Cart Item Stream */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.map((item) => (
            <div
              key={item.product.id}
              className="p-2.5 rounded-xl bg-[#131822] border border-slate-800/90 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="truncate">
                  <p className="text-xs font-bold text-slate-100 truncate">{item.product.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    SKU: {item.product.sku} • Stock: {item.product.quantity}
                  </p>
                </div>
                <button
                  onClick={() => removeFromCart(item.product.id)}
                  className="text-slate-400 hover:text-rose-400 p-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quantity Stepper and Price Editor */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => updateQuantity(item.product.id, -1)}
                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold text-white font-mono">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.product.id, 1)}
                    disabled={item.quantity >= item.product.quantity}
                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 flex items-center justify-center transition"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-amber-400 font-mono">
                    {formatRwf(item.selling_price * item.quantity)}
                  </span>
                  <p className="text-[10px] text-slate-400 font-mono">
                    @{formatRwf(item.selling_price)}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-12">
              <ShoppingBag className="w-10 h-10 text-slate-400 mb-2" />
              <p className="font-semibold text-slate-300">Your Cart is Empty</p>
              <p className="text-[11px] text-slate-400 mt-1 text-center px-4">
                Click any product on the left catalog or scan a barcode to add it to the register.
              </p>
            </div>
          )}
        </div>

        {/* Cart Checkout Footer */}
        <div className="p-4 bg-[#111622] border-t border-slate-800/90 space-y-3 shrink-0">
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Items Count</span>
              <span className="font-mono">{cart.reduce((a, b) => a + b.quantity, 0)} units</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Tax (Rwandan 18% VAT included)</span>
              <span className="font-mono">{formatRwf(cartSubtotal * 0.18 / 1.18)}</span>
            </div>
            <div className="flex justify-between text-base font-black text-white pt-1 border-t border-slate-800">
              <span>Payable Total</span>
              <span className="text-amber-400 font-mono">{formatRwf(cartSubtotal)}</span>
            </div>
          </div>

          <button
            onClick={openCheckout}
            disabled={cart.length === 0}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition flex items-center justify-center gap-2"
          >
            <span>Proceed to Payment</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Payment & Checkout Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Payment & Receipt Generation</h3>
                <p className="text-xs text-slate-400">Select payment channel & confirm receipt</p>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Total Display */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Total Due</p>
                <p className="text-2xl font-black text-amber-400 font-mono mt-0.5">
                  {formatRwf(cartSubtotal)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Customer</p>
                <p className="text-xs font-bold text-slate-200">
                  {selectedCustomer?.name || customCustomerName || 'Walk-in Client'}
                </p>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Select Payment Method</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'cash', label: 'Cash (RWF)', icon: DollarSign },
                  { id: 'momo', label: 'MTN MoMo', icon: Smartphone },
                  { id: 'bank_transfer', label: 'Bank / POS', icon: CreditCard },
                  { id: 'debt_credit', label: 'Credit / Debt', icon: Building },
                ].map((m) => {
                  const Icon = m.icon;
                  const isSelected = paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={`p-3 rounded-xl border text-left flex flex-col justify-between gap-2 transition ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-xs">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paid Amount Input (Cash or Partial) */}
            {paymentMethod !== 'debt_credit' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Amount Tendered (RWF)</label>
                <input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                />
                {Number(paidAmount) > cartSubtotal && (
                  <p className="text-xs text-emerald-400 font-semibold font-mono">
                    Change to Return: {formatRwf(Number(paidAmount) - cartSubtotal)}
                  </p>
                )}
              </div>
            )}

            {/* Reference Number for MoMo / Bank */}
            {(paymentMethod === 'momo' || paymentMethod === 'bank_transfer') && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Transaction Reference / SMS ID</label>
                <input
                  type="text"
                  placeholder="e.g. TXN987654321 / BK-Slip"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Process Action */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProcessOrder}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2"
              >
                {isSubmitting ? 'Processing...' : 'Complete & Generate Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
