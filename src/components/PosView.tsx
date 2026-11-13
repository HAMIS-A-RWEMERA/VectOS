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
  AlertCircle,
  Lock,
  PackageCheck
} from 'lucide-react';
import { hasPermission, isSoloAllInOneUser } from '../utils/permissions';

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
  const [releaseImmediately, setReleaseImmediately] = useState(false);
  const [useStoreCredit, setUseStoreCredit] = useState(false);

  const canProcessPayments = hasPermission(user, 'can_process_payments');
  const canGiveDiscounts = hasPermission(user, 'can_give_discounts');
  const canViewBuyingPrices = hasPermission(user, 'can_view_buying_prices');
  const canPrintReceipt = hasPermission(user, 'can_print_full_receipt');
  const isSoloOperator = isSoloAllInOneUser(user);

  // Load products, categories, customers, stocks
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

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
      if (err?.message?.includes('log in') || err?.message?.includes('Authentication Required')) {
        return;
      }
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

  // Mobile View Tab State: 'catalog' | 'cart'
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  const getCatalogPrice = (product: Product): number => {
    const buyPrice = Number(product.buying_price || 0);
    return (product.selling_price && Number(product.selling_price) > 0)
      ? Number(product.selling_price)
      : (buyPrice > 0 ? buyPrice : 1000);
  };

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
        selling_price: getCatalogPrice(product),
        fulfillment_source: 'main_store'
      }];
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) => {
      const updated = prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > item.product.quantity) return item; // capped at current stock
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
      
      // If checkout is open, keep paidAmount in sync with new total
      if (isCheckoutOpen) {
        const newTotal = updated.reduce((acc, it) => acc + it.selling_price * it.quantity, 0);
        const creditAvail = Number(selectedCustomer?.store_credit || 0);
        const creditDed = canProcessPayments && useStoreCredit ? Math.min(newTotal, creditAvail) : 0;
        setPaidAmount(canProcessPayments ? String(Math.max(0, newTotal - creditDed)) : '0');
      }
      return updated;
    });
  };

  const updateItemPrice = (productId: number, price: number) => {
    const validPrice = Math.max(0, isNaN(price) ? 0 : price);
    setCart((prev) => {
      const updated = prev.map((item) =>
        item.product.id === productId ? { ...item, selling_price: validPrice } : item
      );
      if (isCheckoutOpen) {
        const newTotal = updated.reduce((acc, it) => acc + it.selling_price * it.quantity, 0);
        const creditAvail = Number(selectedCustomer?.store_credit || 0);
        const creditDed = canProcessPayments && useStoreCredit ? Math.min(newTotal, creditAvail) : 0;
        setPaidAmount(canProcessPayments ? String(Math.max(0, newTotal - creditDed)) : '0');
      }
      return updated;
    });
  };

  const resetItemPrice = (productId: number) => {
    setCart((prev) => {
      const updated = prev.map((item) => {
        if (item.product.id === productId) {
          return { ...item, selling_price: getCatalogPrice(item.product) };
        }
        return item;
      });
      if (isCheckoutOpen) {
        const newTotal = updated.reduce((acc, it) => acc + it.selling_price * it.quantity, 0);
        const creditAvail = Number(selectedCustomer?.store_credit || 0);
        const creditDed = canProcessPayments && useStoreCredit ? Math.min(newTotal, creditAvail) : 0;
        setPaidAmount(canProcessPayments ? String(Math.max(0, newTotal - creditDed)) : '0');
      }
      return updated;
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => {
      const updated = prev.filter((item) => item.product.id !== productId);
      if (isCheckoutOpen) {
        const newTotal = updated.reduce((acc, it) => acc + it.selling_price * it.quantity, 0);
        const creditAvail = Number(selectedCustomer?.store_credit || 0);
        const creditDed = canProcessPayments && useStoreCredit ? Math.min(newTotal, creditAvail) : 0;
        setPaidAmount(canProcessPayments ? String(Math.max(0, newTotal - creditDed)) : '0');
      }
      return updated;
    });
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomerId(null);
    setCustomCustomerName('');
    setCustomCustomerPhone('');
    setOrderNotes('');
    setUseStoreCredit(false);
    setErrorMsg('');
  };

  // Totals calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.selling_price * item.quantity, 0);
  }, [cart]);

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  const availableCustomerCredit = Math.max(0, Number(selectedCustomer?.store_credit || 0));
  const appliedStoreCredit = canProcessPayments && useStoreCredit && availableCustomerCredit > 0
    ? Math.min(cartSubtotal, availableCustomerCredit)
    : 0;
  const netDueAfterStoreCredit = Math.max(0, cartSubtotal - appliedStoreCredit);

  const openCheckout = () => {
    if (cart.length === 0) return;
    setUseStoreCredit(false);
    setPaidAmount(canProcessPayments ? String(cartSubtotal) : '0');
    if (!canProcessPayments && paymentMethod !== 'debt_credit') {
      setPaymentMethod('cash');
    }
    setPaymentRef('');
    setReleaseImmediately(false);
    setErrorMsg('');
    setIsCheckoutOpen(true);
  };

  const handleToggleStoreCredit = (checked: boolean) => {
    setUseStoreCredit(checked);
    const creditDed = checked && availableCustomerCredit > 0
      ? Math.min(cartSubtotal, availableCustomerCredit)
      : 0;
    const remaining = Math.max(0, cartSubtotal - creditDed);
    if (canProcessPayments) {
      setPaidAmount(String(remaining));
    }
  };

  const handleProcessOrder = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const numericPaid = canProcessPayments ? (Number(paidAmount) || 0) : 0;
      if (canProcessPayments && paymentMethod !== 'debt_credit' && (numericPaid + appliedStoreCredit) <= 0 && cartSubtotal > 0) {
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
        payment_method: canProcessPayments
          ? paymentMethod
          : (paymentMethod === 'debt_credit' ? 'debt_credit' : 'cash'),
        paid_amount: !canProcessPayments || paymentMethod === 'debt_credit'
          ? 0
          : Math.min(numericPaid, netDueAfterStoreCredit),
        use_store_credit: appliedStoreCredit > 0,
        store_credit_amount: appliedStoreCredit > 0 ? appliedStoreCredit : undefined,
        payment_reference: canProcessPayments ? paymentRef : '',
        notes: orderNotes,
        release_immediately: isSoloOperator && releaseImmediately
      };

      const res = await api.createOrder(payload);
      if (res.success && res.order) {
        setLastCreatedOrder(res.order);
        setIsCheckoutOpen(false);
        clearCart();
        loadData(); // refresh product stock counts and customer credit balances
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
    <div className="min-h-[calc(100vh-61px)] flex flex-col lg:flex-row overflow-hidden bg-[#0A0D12] pb-16 lg:pb-0">
      {/* Mobile Screen Tab Toggle: Switch between Catalog and Cart */}
      <div className="lg:hidden flex items-center p-2.5 bg-[#0F131A] border-b border-slate-800 gap-2 shrink-0 sticky top-0 z-20">
        <button
          type="button"
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            mobileTab === 'catalog'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 border border-slate-800'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Catalog ({filteredProducts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 relative ${
            mobileTab === 'cart'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 border border-slate-800'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Cart ({cart.reduce((a, b) => a + b.quantity, 0)})</span>
          {cart.length > 0 && (
            <span className={`ml-1 text-[11px] font-mono font-black ${mobileTab === 'cart' ? 'text-slate-950' : 'text-amber-400'}`}>
              • {formatRwf(cartSubtotal)}
            </span>
          )}
        </button>
      </div>

      {/* Left: Product Catalog & Fast Live Search */}
      <div className={`flex-1 flex flex-col h-full overflow-hidden border-r border-slate-800/80 ${
        mobileTab === 'catalog' ? 'flex' : 'hidden lg:flex'
      }`}>
        {/* Top Control Bar: Search & Category Chips */}
        <div className="p-3 sm:p-4 bg-[#0F131A] border-b border-slate-800/80 space-y-2.5 sm:space-y-3 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by item name, code, or barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-12 py-2 sm:py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-amber-400 shrink-0">
              <Barcode className="w-4 h-4" />
              <span>Barcode Ready</span>
            </div>
          </div>

          {/* Category Chips Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition text-xs ${
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

        {/* Product Cards Grid (Touch optimized for mobile screens) */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 content-start">
          {filteredProducts.map((p) => {
            const inCart = cart.find(c => c.product.id === p.id);
            const isOutOfStock = p.quantity <= 0;
            const isLowStock = p.quantity > 0 && p.quantity <= p.low_stock_threshold;
            const catalogPrice = getCatalogPrice(p);

            return (
              <div
                key={p.id}
                onClick={() => !isOutOfStock && addToCart(p)}
                className={`group relative p-3 sm:p-3.5 rounded-2xl border transition-all select-none flex flex-col justify-between active:scale-[0.98] ${
                  isOutOfStock
                    ? 'bg-slate-900/40 border-slate-800/40 opacity-50 cursor-not-allowed'
                    : inCart
                    ? 'bg-amber-500/10 border-amber-500/60 cursor-pointer shadow-lg shadow-amber-500/10'
                    : 'bg-[#121620] hover:bg-[#161C28] border-slate-800/90 hover:border-slate-700 cursor-pointer'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[9px] sm:text-[10px] uppercase font-mono tracking-wider text-slate-400 truncate">
                      {p.category}
                    </span>
                    <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                      isOutOfStock
                        ? 'bg-rose-500/20 text-rose-300'
                        : isLowStock
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-800 text-emerald-400'
                    }`}>
                      {p.quantity} {p.unit}
                    </span>
                  </div>

                  <h3 className="text-xs sm:text-sm font-bold text-slate-100 group-hover:text-amber-300 transition line-clamp-2 mt-1 sm:mt-1.5">
                    {p.name}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                    Code: {p.sku}
                  </p>
                </div>

                <div className="mt-2.5 sm:mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono">
                    {formatRwf(catalogPrice)}
                  </span>
                  {inCart ? (
                    <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow">
                      {inCart.quantity}
                    </span>
                  ) : (
                    <span className="text-[10px] sm:text-xs text-slate-400 group-hover:text-amber-300 flex items-center gap-0.5">
                      <Plus className="w-3 h-3" /> Add
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

        {/* Mobile floating bar when items are in cart to jump to Cart */}
        {cart.length > 0 && (
          <div className="lg:hidden sticky bottom-0 left-0 right-0 p-3 bg-[#0F131A]/95 backdrop-blur border-t border-slate-800 z-30 flex items-center justify-between gap-3 shadow-2xl">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Active Cart</span>
              <p className="text-sm font-black text-amber-400 font-mono">
                {formatRwf(cartSubtotal)} <span className="text-xs font-normal text-slate-300">({cart.reduce((a, b) => a + b.quantity, 0)} items)</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileTab('cart')}
              className="py-2.5 px-4 rounded-xl bg-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 active:scale-95 transition"
            >
              <span>{canProcessPayments ? 'Take Payment' : 'Send Order to Cashier'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Right: Active POS Cart & Immediate Checkout Terminal with Price Negotiation */}
      <div className={`w-full lg:w-96 bg-[#0D1017] flex flex-col h-full overflow-hidden shrink-0 border-t lg:border-t-0 border-slate-800 ${
        mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'
      }`}>
        {/* Cart Header */}
        <div className="p-3 sm:p-4 bg-[#111622] border-b border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Current Cart ({cart.length})</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileTab('catalog')}
              className="lg:hidden text-[11px] font-semibold text-amber-400 hover:underline flex items-center gap-1"
            >
              + Add Items
            </button>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Customer Assignment Field */}
        <div className="p-3 bg-[#0F131A] border-b border-slate-800/80 space-y-2 shrink-0">
          <label className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
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
                  {c.name} ({formatRwf(c.credit_balance)} debt{Number(c.store_credit || 0) > 0 ? ` | We owe: ${formatRwf(Number(c.store_credit))}` : ''})
                </option>
              ))}
            </select>
          </div>

          {selectedCustomer && (Number(selectedCustomer.credit_balance || 0) > 0 || Number(selectedCustomer.store_credit || 0) > 0) && (
            <div className="flex flex-wrap gap-2 text-[10px] pt-0.5">
              {Number(selectedCustomer.credit_balance || 0) > 0 && (
                <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono font-bold">
                  Owes us: {formatRwf(selectedCustomer.credit_balance)}
                </span>
              )}
              {Number(selectedCustomer.store_credit || 0) > 0 && (
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-bold">
                  We owe client: {formatRwf(Number(selectedCustomer.store_credit))}
                </span>
              )}
            </div>
          )}

          {!selectedCustomerId && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <input
                type="text"
                placeholder="Client Name (optional)"
                value={customCustomerName}
                onChange={(e) => setCustomCustomerName(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-amber-500"
              />
              <input
                type="text"
                placeholder="Client Phone (optional)"
                value={customCustomerPhone}
                onChange={(e) => setCustomCustomerPhone(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
        </div>

        {/* Cart Item Stream with Per-Item Price Bargaining / Negotiation */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2.5">
          {cart.map((item) => {
            const catalogPrice = getCatalogPrice(item.product);
            const isNegotiated = item.selling_price !== catalogPrice;
            const buyingPriceNum = Number(item.product.buying_price || 0);
            const isBelowCost = canViewBuyingPrices && buyingPriceNum > 0 && item.selling_price < buyingPriceNum;
            const diffPrice = item.selling_price - catalogPrice;

            return (
              <div
                key={item.product.id}
                className={`p-2.5 sm:p-3 rounded-xl border flex flex-col gap-2 transition ${
                  isNegotiated
                    ? 'bg-[#151c28] border-amber-500/40 shadow-sm'
                    : 'bg-[#131822] border-slate-800/90'
                }`}
              >
                {/* Product Name & Remove button */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-100 truncate">{item.product.name}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                      <span>Code: {item.product.sku}</span>
                      <span>•</span>
                      <span>Stock: {item.product.quantity} {item.product.unit || 'pcs'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.product.id)}
                    className="text-slate-400 hover:text-rose-400 p-1 transition shrink-0"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Per-Item Price Bargaining / Negotiation Editor */}
                <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <span>{canGiveDiscounts ? 'Negotiated Unit Price:' : 'Unit Price:'}</span>
                    </span>
                    {!canGiveDiscounts ? (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Fixed price
                      </span>
                    ) : (
                      isNegotiated && (
                        <button
                          type="button"
                          onClick={() => resetItemPrice(item.product.id)}
                          className="text-[10px] text-slate-400 hover:text-amber-400 flex items-center gap-1 underline transition"
                          title="Reset to standard catalog price"
                        >
                          <RotateCcw className="w-2.5 h-2.5" /> Reset
                        </button>
                      )
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className={`relative flex-1 flex items-center rounded-lg border px-2 py-1 transition ${
                      canGiveDiscounts
                        ? 'bg-slate-900 border-slate-700 focus-within:border-amber-500'
                        : 'bg-slate-900/50 border-slate-800 opacity-75'
                    }`}>
                      <span className="text-[11px] font-mono font-bold text-amber-400 mr-1.5 shrink-0">RWF</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        disabled={!canGiveDiscounts}
                        value={item.selling_price}
                        onChange={(e) => updateItemPrice(item.product.id, Number(e.target.value))}
                        className="w-full bg-transparent text-xs font-mono font-bold text-white focus:outline-none disabled:cursor-not-allowed"
                        title={canGiveDiscounts ? 'Edit agreed bargaining price per unit' : 'Fixed catalog price (discount permission disabled)'}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                      /{item.product.unit || 'pcs'}
                    </span>
                  </div>

                  {/* Negotiation status indicator */}
                  <div className="flex items-center justify-between text-[10px]">
                    {isNegotiated ? (
                      <span className={`font-mono font-semibold ${diffPrice < 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                        {diffPrice < 0 ? `Discounted -${formatRwf(Math.abs(diffPrice))}` : `Premium +${formatRwf(diffPrice)}`}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono">Normal price</span>
                    )}

                    {catalogPrice > 0 && isNegotiated && (
                      <span className="text-slate-400 line-through font-mono">
                        Orig: {formatRwf(catalogPrice)}
                      </span>
                    )}
                  </div>

                  {/* Below Cost Warning (Only shown to users allowed to view buying prices) */}
                  {isBelowCost && (
                    <div className="text-[10px] font-semibold text-rose-300 bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0 text-rose-400" />
                      <span>Below cost (Cost: {formatRwf(buyingPriceNum)})</span>
                    </div>
                  )}
                </div>

                {/* Quantity Stepper and Line Total */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition active:scale-95"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-8 text-center text-xs font-bold text-white font-mono">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product.id, 1)}
                      disabled={item.quantity >= item.product.quantity}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 flex items-center justify-center transition active:scale-95"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="text-right">
                    <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono">
                      {formatRwf(item.selling_price * item.quantity)}
                    </span>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {item.quantity} × {formatRwf(item.selling_price)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-12">
              <ShoppingBag className="w-10 h-10 text-slate-400 mb-2" />
              <p className="font-semibold text-slate-300">Your Cart is Empty</p>
              <p className="text-[11px] text-slate-400 mt-1 text-center px-4">
                Tap any product on the catalog or scan a barcode to add it to this sales register.
              </p>
              <button
                type="button"
                onClick={() => setMobileTab('catalog')}
                className="lg:hidden mt-3 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold"
              >
                Browse Catalog
              </button>
            </div>
          )}
        </div>

        {/* Cart Checkout Footer */}
        <div className="p-3 sm:p-4 bg-[#111622] border-t border-slate-800/90 space-y-3 shrink-0">
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Items Count</span>
              <span className="font-mono">{cart.reduce((a, b) => a + b.quantity, 0)} units</span>
            </div>
            <div className="flex justify-between text-base font-black text-white pt-1 border-t border-slate-800">
              <span>Total to Pay</span>
              <span className="text-amber-400 font-mono">{formatRwf(cartSubtotal)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={openCheckout}
            disabled={cart.length === 0}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition flex items-center justify-center gap-2 active:scale-95"
          >
            <span>{canProcessPayments ? 'Take Payment' : 'Send Order to Cashier'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Payment & Checkout Modal with Itemized Price Editing */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  {canProcessPayments ? 'Payment & Order Confirmation' : 'Send Order to Cashier'}
                </h3>
                <p className="text-xs text-slate-400">
                  {canProcessPayments
                    ? 'Review items, confirm payment received, and complete sale'
                    : 'Review customer items before sending to the Cashier & Store'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="text-slate-400 hover:text-white text-base p-1"
              >
                ✕
              </button>
            </div>

            {/* Total Due Banner */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-semibold">
                  {appliedStoreCredit > 0 ? 'Remaining Due After Store Credit' : 'Total Due'}
                </p>
                <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono mt-0.5">
                  {formatRwf(netDueAfterStoreCredit)}
                </p>
                {appliedStoreCredit > 0 && (
                  <p className="text-[10px] text-purple-300 font-mono mt-0.5">
                    Order: {formatRwf(cartSubtotal)} − Store Credit: {formatRwf(appliedStoreCredit)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-400">Customer</p>
                <p className="text-xs font-bold text-slate-200">
                  {selectedCustomer?.name || customCustomerName || 'Walk-in Client'}
                </p>
              </div>
            </div>

            {/* Store Credit Offset Card (When we owe money to this client) */}
            {canProcessPayments && availableCustomerCredit > 0 && (
              <label className="flex items-start gap-3 p-3 rounded-xl bg-purple-500/15 border border-purple-500/40 cursor-pointer hover:bg-purple-500/20 transition">
                <input
                  type="checkbox"
                  checked={useStoreCredit}
                  onChange={(e) => handleToggleStoreCredit(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-purple-500 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-purple-200">
                      Deduct Money We Owe Client
                    </span>
                    <span className="text-xs font-mono font-black text-purple-300">
                      Avail: {formatRwf(availableCustomerCredit)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {useStoreCredit
                      ? `Applying ${formatRwf(appliedStoreCredit)} from client credit. Client only pays missing ${formatRwf(netDueAfterStoreCredit)}.`
                      : 'Check this box to subtract what we owe this client from today’s order total.'}
                  </p>
                </div>
              </label>
            )}

            {/* Itemized Line Items Review */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  {canGiveDiscounts ? 'Adjust Item Prices (Discounts)' : 'Order Items Review'}
                </label>
                <span className="text-[10px] text-slate-400">
                  {cart.length} item{cart.length > 1 ? 's' : ''} in order
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-100 truncate">{item.product.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Qty: {item.quantity}
                        {canViewBuyingPrices && Number(item.product.buying_price || 0) > 0
                          ? ` • Cost: ${formatRwf(Number(item.product.buying_price))}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${
                        canGiveDiscounts
                          ? 'bg-slate-950 border-slate-700 focus-within:border-amber-500'
                          : 'bg-slate-950/50 border-slate-800 opacity-75'
                      }`}>
                        <span className="text-[10px] font-bold text-amber-400">RWF</span>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          disabled={!canGiveDiscounts}
                          value={item.selling_price}
                          onChange={(e) => updateItemPrice(item.product.id, Number(e.target.value))}
                          className="w-20 bg-transparent text-xs font-mono font-bold text-white focus:outline-none disabled:cursor-not-allowed"
                          title={canGiveDiscounts ? 'Edit negotiated price for this product' : 'Fixed catalog price'}
                        />
                      </div>

                      <div className="text-right min-w-[70px]">
                        <span className="text-xs font-bold text-amber-400 font-mono">
                          {formatRwf(item.selling_price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {canProcessPayments ? (
              <>
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
                          className={`p-2.5 sm:p-3 rounded-xl border text-left flex flex-col justify-between gap-1.5 sm:gap-2 transition active:scale-95 ${
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
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        {appliedStoreCredit > 0 ? 'Missing Cash / MoMo Received (RWF)' : 'Amount Received (RWF)'}
                      </label>
                      <button
                        type="button"
                        onClick={() => setPaidAmount(String(netDueAfterStoreCredit))}
                        className="text-[10px] text-amber-400 hover:underline font-semibold"
                      >
                        Pay Remaining ({formatRwf(netDueAfterStoreCredit)})
                      </button>
                    </div>
                    <input
                      type="number"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                    {Number(paidAmount) > netDueAfterStoreCredit && (
                      <p className="text-xs text-emerald-400 font-semibold font-mono">
                        Change to Return: {formatRwf(Number(paidAmount) - netDueAfterStoreCredit)}
                      </p>
                    )}
                    {Number(paidAmount) < netDueAfterStoreCredit && (Number(paidAmount) > 0 || appliedStoreCredit > 0) && (
                      <p className="text-xs text-amber-400 font-semibold font-mono">
                        Remaining Balance Due (Debt): {formatRwf(netDueAfterStoreCredit - Number(paidAmount))}
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

                {/* Solo Operator Immediate Stock Release Toggle */}
                {isSoloOperator && (
                  <label className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/15 transition">
                    <input
                      type="checkbox"
                      checked={releaseImmediately}
                      onChange={(e) => setReleaseImmediately(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <PackageCheck className="w-3.5 h-3.5" />
                        Also mark items released from store now
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Turn this on if you are working solo and handing the goods to the customer right now.
                      </p>
                    </div>
                  </label>
                )}
              </>
            ) : (
              /* Salesperson (no payment permission) handoff choice */
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-slate-300">How will the customer pay?</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition ${
                      paymentMethod !== 'debt_credit'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <DollarSign className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold">Customer Pays at Cashier Desk</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Cash, MoMo, or Bank handled by Cashier</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('debt_credit')}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition ${
                      paymentMethod === 'debt_credit'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Building className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold">Approved Credit / Account</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Recorded on customer balance</p>
                    </div>
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Order will be sent to the Cashier for payment and to the Store for release.</span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {canProcessPayments && !canPrintReceipt && (
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Order will be saved and sent to Store for release.</span>
              </div>
            )}

            {/* Process Action */}
            <div className="flex gap-2.5 sm:gap-3 pt-2">
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
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 active:scale-95"
              >
                {isSubmitting
                  ? 'Processing...'
                  : !canProcessPayments
                  ? 'Send Order to Cashier'
                  : canPrintReceipt
                  ? (isSoloOperator && releaseImmediately ? 'Complete, Release & Print' : 'Complete & Print Receipt')
                  : 'Complete Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
