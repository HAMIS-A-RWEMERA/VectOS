import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  PackageCheck,
  Camera,
  FileImage,
  X
} from 'lucide-react';
import { hasPermission, isSoloAllInOneUser } from '../utils/permissions';
import { SearchableSelect, SearchableSelectOption } from './SearchableSelect';
import { matchesSearch } from '../utils/searchMatch';
import { useLanguage } from '../i18n/LanguageContext';
import { compressOrderPhoto } from '../utils/imageCompression';
import {
  formatPackStock,
  getPackSize,
  getPackUnitLabel,
  getPackSellingPrice,
  getRetailSellingPrice,
  getRetailUnitLabel,
  isPackProduct,
} from '../utils/unitConversion';

interface CartItem {
  cartKey: string;
  product: Product;
  sale_mode: 'pack' | 'retail';
  sold_unit: string;
  pack_size: number;
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
  const { tf } = useLanguage();
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

  // Order Photo Capture & R2 Storage State
  const isPhotoMandatory = Boolean(Number(shop?.require_order_photo));
  const [r2Configured, setR2Configured] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoMetrics, setPhotoMetrics] = useState<{
    originalBytes: number;
    compressedBytes: number;
  } | null>(null);
  const [compressingPhoto, setCompressingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  // Optional Payment Proof Photo State (Cashier / Solo Operator at Checkout)
  const payProofCameraInputRef = useRef<HTMLInputElement | null>(null);
  const payProofGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreviewUrl, setPaymentProofPreviewUrl] = useState<string | null>(null);
  const [paymentProofMetrics, setPaymentProofMetrics] = useState<{
    originalBytes: number;
    compressedBytes: number;
  } | null>(null);
  const [compressingPayProof, setCompressingPayProof] = useState(false);
  const [payProofError, setPayProofError] = useState('');

  const canProcessPayments = hasPermission(user, 'can_process_payments');
  const canGiveDiscounts = hasPermission(user, 'can_give_discounts');
  const canViewBuyingPrices = hasPermission(user, 'can_view_buying_prices');
  const canPrintReceipt = hasPermission(user, 'can_print_full_receipt');
  const canUploadPhotos = hasPermission(user, 'can_upload_photos');
  const isSoloOperator = isSoloAllInOneUser(user);

  // Load products, categories, customers, stocks, and R2 status
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  useEffect(() => {
    return () => {
      if (paymentProofPreviewUrl) URL.revokeObjectURL(paymentProofPreviewUrl);
    };
  }, [paymentProofPreviewUrl]);

  const loadData = async () => {
    try {
      const [prodRes, custRes, stockRes, r2Res] = await Promise.all([
        api.getProducts(),
        api.getCustomers(),
        api.getStocks(),
        api.getOrderR2Status().catch(() => ({ configured: false }))
      ]);
      setProducts(prodRes.products || []);
      setCategories(['All', ...(prodRes.categories || [])]);
      setCustomers(custRes.customers || []);
      setStocks(stockRes.stocks || []);
      setR2Configured(Boolean(r2Res?.configured));
    } catch (err: any) {
      if (err?.message?.includes('log in') || err?.message?.includes('Authentication Required')) {
        return;
      }
      console.error('POS Load Error:', err);
    }
  };

  const formatKb = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  const handleSelectPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setCompressingPhoto(true);
      setPhotoError('');
      setErrorMsg('');
      const result = await compressOrderPhoto(file);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      const url = URL.createObjectURL(result.blob);
      setPhotoFile(file);
      setPhotoPreviewUrl(url);
      setPhotoMetrics({
        originalBytes: result.originalBytes,
        compressedBytes: result.compressedBytes
      });
    } catch (err: any) {
      setPhotoError(
        err?.message || tf('Could not read or compress selected photo.', 'Ntibyakunze gufata iyi foto.')
      );
    } finally {
      setCompressingPhoto(false);
    }
  };

  const clearDraftPhoto = () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoMetrics(null);
    setPhotoError('');
  };

  const handleSelectPaymentProofFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setCompressingPayProof(true);
      setPayProofError('');
      setErrorMsg('');
      const result = await compressOrderPhoto(file);
      if (paymentProofPreviewUrl) URL.revokeObjectURL(paymentProofPreviewUrl);
      const url = URL.createObjectURL(result.blob);
      setPaymentProofFile(file);
      setPaymentProofPreviewUrl(url);
      setPaymentProofMetrics({
        originalBytes: result.originalBytes,
        compressedBytes: result.compressedBytes
      });
    } catch (err: any) {
      setPayProofError(
        err?.message || tf('Could not read or compress selected proof image.', 'Ntibyakunze gufata iyi foto y’ubwishyu.')
      );
    } finally {
      setCompressingPayProof(false);
    }
  };

  const clearPaymentProof = () => {
    if (paymentProofPreviewUrl) URL.revokeObjectURL(paymentProofPreviewUrl);
    setPaymentProofFile(null);
    setPaymentProofPreviewUrl(null);
    setPaymentProofMetrics(null);
    setPayProofError('');
  };

  // Filter products by search and category
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
      const matchSearch = matchesSearch(searchQuery, p.name, p.sku, p.barcode, p.category);
      return matchCat && matchSearch;
    });
  }, [products, searchQuery, selectedCategory]);

  const customerSelectOptions = useMemo<SearchableSelectOption[]>(() => {
    return customers.map((c) => {
      const debt = Number(c.credit_balance || 0);
      const storeCredit = Number(c.store_credit || 0);
      const parts: string[] = [];
      if (c.phone) parts.push(c.phone);
      if (c.id_number) parts.push(`ID: ${c.id_number}`);
      if (debt > 0) parts.push(`Debt: ${Math.round(debt).toLocaleString()} RWF`);
      if (storeCredit > 0) parts.push(`We owe: ${Math.round(storeCredit).toLocaleString()} RWF`);

      return {
        value: c.id,
        label: c.name,
        sublabel: parts.join(' • ') || c.address || 'Saved client account',
        badge: debt > 0
          ? `Owes ${Math.round(debt).toLocaleString()}`
          : storeCredit > 0
          ? `Credit ${Math.round(storeCredit).toLocaleString()}`
          : undefined,
        badgeTone: debt > 0 ? 'rose' : storeCredit > 0 ? 'purple' : 'slate',
        searchText: `${c.name} ${c.phone || ''} ${c.id_number || ''} ${c.email || ''} ${c.address || ''}`,
      };
    });
  }, [customers]);

  // Mobile View Tab State: 'catalog' | 'cart'
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  const getCatalogPrice = (product: Product, mode: 'pack' | 'retail' = 'retail'): number => {
    const modePrice = mode === 'pack' && isPackProduct(product)
      ? getPackSellingPrice(product)
      : getRetailSellingPrice(product);
    return modePrice > 0 ? modePrice : 1000;
  };

  const getModeBuyingPrice = (product: Product, mode: 'pack' | 'retail'): number => {
    if (mode === 'pack' && isPackProduct(product)) {
      const explicitPackBuy = Number(product.pack_buying_price || 0);
      if (explicitPackBuy > 0) return explicitPackBuy;
      return Number(product.buying_price || 0) * getPackSize(product);
    }
    return Number(product.buying_price || 0);
  };

  const getUsedBaseUnits = (productId: number, cartList: CartItem[] = cart): number => {
    return cartList.reduce(
      (sum, item) => (item.product.id === productId ? sum + item.quantity * item.pack_size : sum),
      0
    );
  };

  const getRemainingBaseUnits = (product: Product, cartList: CartItem[] = cart): number => {
    return Math.max(0, Math.round(Number(product.quantity || 0)) - getUsedBaseUnits(product.id, cartList));
  };

  // Cart operations (shared base-unit inventory pool across pack & retail lines)
  const addToCart = (product: Product, mode: 'pack' | 'retail' = 'retail') => {
    const packEnabled = isPackProduct(product);
    const effectiveMode: 'pack' | 'retail' = mode === 'pack' && packEnabled ? 'pack' : 'retail';
    const packSize = effectiveMode === 'pack' ? getPackSize(product) : 1;
    const soldUnit = effectiveMode === 'pack' ? getPackUnitLabel(product) : getRetailUnitLabel(product);
    const cartKey = `${product.id}_${effectiveMode}`;

    setCart((prev) => {
      const remaining = getRemainingBaseUnits(product, prev);
      if (remaining < packSize) return prev; // Cannot exceed remaining unified stock pool

      const existing = prev.find((item) => item.cartKey === cartKey);
      if (existing) {
        return prev.map((item) =>
          item.cartKey === cartKey
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          cartKey,
          product,
          sale_mode: effectiveMode,
          sold_unit: soldUnit,
          pack_size: packSize,
          quantity: 1,
          selling_price: getCatalogPrice(product, effectiveMode),
          fulfillment_source: 'main_store',
        },
      ];
    });
  };

  const updateQuantity = (cartKey: string, delta: number) => {
    setCart((prev) => {
      const target = prev.find((it) => it.cartKey === cartKey);
      if (!target) return prev;

      const updated = prev
        .map((item) => {
          if (item.cartKey === cartKey) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            const usedByOtherMode = prev.reduce(
              (sum, other) =>
                other.product.id === item.product.id && other.cartKey !== cartKey
                  ? sum + other.quantity * other.pack_size
                  : sum,
              0
            );
            const totalBaseNeeded = usedByOtherMode + newQty * item.pack_size;
            if (totalBaseNeeded > Math.round(Number(item.product.quantity || 0))) {
              return item; // capped at available unified stock
            }
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

  const updateItemPrice = (cartKey: string, price: number) => {
    const validPrice = Math.max(0, isNaN(price) ? 0 : price);
    setCart((prev) => {
      const updated = prev.map((item) =>
        item.cartKey === cartKey ? { ...item, selling_price: validPrice } : item
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

  const resetItemPrice = (cartKey: string) => {
    setCart((prev) => {
      const updated = prev.map((item) => {
        if (item.cartKey === cartKey) {
          return { ...item, selling_price: getCatalogPrice(item.product, item.sale_mode) };
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

  const removeFromCart = (cartKey: string) => {
    setCart((prev) => {
      const updated = prev.filter((item) => item.cartKey !== cartKey);
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
    clearDraftPhoto();
    clearPaymentProof();
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
    clearPaymentProof();
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
        setErrorMsg(tf('Please specify a valid payment amount or choose Credit/Debt.', 'Andika amafaranga yishyuwe cyangwa uhitemo Ideni.'));
        setIsSubmitting(false);
        return;
      }

      if (isPhotoMandatory && !photoFile) {
        setErrorMsg(
          !canUploadPhotos
            ? tf(
                'This store requires attaching an order photo, and your account does not have Upload Photos enabled yet. Ask your manager to enable it in Staff & Duties.',
                'Iri duka ritegeka ifoto ya komande, kandi konti yawe ntifite uburenganzira bwo gufata amafoto. Saba umuyobozi kubigufungurira.'
              )
            : tf(
                'This store requires attaching an order photo before completing an order. Please take or upload a photo first.',
                'Iri duka ritegeka gufata ifoto ya komande mbere yo kwemeza igurisha. Banza ufate cyangwa uhitemo ifoto.'
              )
        );
        setIsSubmitting(false);
        return;
      }

      let uploadedPhotoKey: string | null = null;
      if (photoFile && canUploadPhotos) {
        if (r2Configured) {
          const uploaded = await api.uploadCompressedOrderPhoto(
            photoFile,
            selectedCustomer?.name || customCustomerName || 'order',
            'order'
          );
          uploadedPhotoKey = uploaded.photoKey;
        } else if (isPhotoMandatory) {
          setErrorMsg(
            tf(
              'Order photo upload is required by store settings, but R2 cloud storage is not configured on the server.',
              'Ifoto ya komande ni itegeko muri iri duka, ariko ububiko bw’amafoto (R2) ntiburashyirwaho kuri seriveri.'
            )
          );
          setIsSubmitting(false);
          return;
        }
      }

      let uploadedPayProofKey: string | null = null;
      if (
        canProcessPayments &&
        canUploadPhotos &&
        paymentMethod !== 'debt_credit' &&
        (Number(paidAmount) || 0) > 0 &&
        paymentProofFile &&
        r2Configured
      ) {
        const uploadedProof = await api.uploadCompressedOrderPhoto(
          paymentProofFile,
          selectedCustomer?.name || customCustomerName || 'payment',
          'payment'
        );
        uploadedPayProofKey = uploadedProof.photoKey;
      }

      const payload = {
        customer_id: selectedCustomerId,
        customer_name: selectedCustomer?.name || customCustomerName || 'Walk-in Cash Client',
        customer_phone: selectedCustomer?.phone || customCustomerPhone || '',
        items: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          selling_price: item.selling_price,
          fulfillment_source: item.fulfillment_source,
          sale_mode: item.sale_mode,
          sold_unit: item.sold_unit,
          pack_size: item.pack_size
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
        release_immediately: isSoloOperator && releaseImmediately,
        handwritten_photo_key: uploadedPhotoKey,
        payment_proof_photo_key: uploadedPayProofKey
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
      setErrorMsg(err.message || tf('Failed to complete order. Check stock availability.', 'Kugurisha byanze. Reba ko ibicuruzwa bihari mu bubiko.'));
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
          <span>{tf('Catalog', 'Ibicuruzwa')} ({filteredProducts.length})</span>
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
          <span>{tf('Cart', 'Agatebo')} ({cart.reduce((a, b) => a + b.quantity, 0)})</span>
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
                placeholder={tf('Search by item name, code, or barcode...', 'Shakisha izina ry’igicuruzwa, kode, cyangwa barcode...')}
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
                  {tf('Clear', 'Siba')}
                </button>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-amber-400 shrink-0">
              <Barcode className="w-4 h-4" />
              <span>{tf('Barcode Ready', 'Barcode Iriteguye')}</span>
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
                {cat === 'All' ? tf('All', 'Byose') : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid (Touch optimized for mobile screens) */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 content-start">
          {filteredProducts.map((p) => {
            const packEnabled = isPackProduct(p);
            const packSize = getPackSize(p);
            const packUnit = getPackUnitLabel(p);
            const retailUnit = getRetailUnitLabel(p);
            const stockView = formatPackStock(p.quantity, p.units_per_pack, retailUnit, packUnit);

            const packCartItem = cart.find((c) => c.cartKey === `${p.id}_pack`);
            const retailCartItem = cart.find((c) => c.cartKey === `${p.id}_retail`);
            const anyInCart = Boolean(packCartItem || retailCartItem);
            const remainingBase = getRemainingBaseUnits(p);
            const isOutOfStock = p.quantity <= 0;
            const isLowStock = p.quantity > 0 && p.quantity <= p.low_stock_threshold;

            const retailPrice = getCatalogPrice(p, 'retail');
            const packPrice = getCatalogPrice(p, 'pack');

            if (packEnabled) {
              const canAddPack = remainingBase >= packSize;
              const canAddRetail = remainingBase >= 1;

              return (
                <div
                  key={p.id}
                  className={`group relative p-3 sm:p-3.5 rounded-2xl border transition-all select-none flex flex-col justify-between ${
                    isOutOfStock
                      ? 'bg-slate-900/40 border-slate-800/40 opacity-50'
                      : anyInCart
                      ? 'bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-500/10'
                      : 'bg-[#121620] hover:bg-[#161C28] border-slate-800/90 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[9px] sm:text-[10px] uppercase font-mono tracking-wider text-slate-400 truncate">
                        {p.category}
                      </span>
                      <span
                        title={`Total: ${stockView.totalText} (1 ${packUnit} = ${packSize} ${retailUnit})`}
                        className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                          isOutOfStock
                            ? 'bg-rose-500/20 text-rose-300'
                            : isLowStock
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-slate-800 text-emerald-400'
                        }`}
                      >
                        {stockView.short}
                      </span>
                    </div>

                    <h3 className="text-xs sm:text-sm font-bold text-slate-100 group-hover:text-amber-300 transition line-clamp-2 mt-1 sm:mt-1.5">
                      {p.name}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                      {p.sku} • 1 {packUnit} = {packSize} {retailUnit}
                    </p>
                  </div>

                  {/* Two Quick-Add Buttons: Wholesale Pack vs Loose Retail */}
                  <div className="mt-2.5 sm:mt-3 pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={!canAddPack}
                      onClick={() => addToCart(p, 'pack')}
                      className={`p-1.5 rounded-xl border text-left transition active:scale-95 relative ${
                        !canAddPack
                          ? 'bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed'
                          : packCartItem
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                          : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-200'
                      }`}
                      title={
                        canAddPack
                          ? `Add 1 ${packUnit} (${packSize} ${retailUnit})`
                          : `Less than 1 full ${packUnit} (${packSize} ${retailUnit}) remaining`
                      }
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black uppercase truncate">
                          + {packUnit}
                        </span>
                        {packCartItem && (
                          <span className="px-1 rounded bg-slate-950 text-amber-400 text-[9px] font-mono font-black">
                            {packCartItem.quantity}
                          </span>
                        )}
                      </div>
                      <p className={`text-[10px] font-mono font-bold mt-0.5 truncate ${
                        packCartItem ? 'text-slate-900' : 'text-amber-300'
                      }`}>
                        {formatRwf(packPrice)}
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={!canAddRetail}
                      onClick={() => addToCart(p, 'retail')}
                      className={`p-1.5 rounded-xl border text-left transition active:scale-95 relative ${
                        !canAddRetail
                          ? 'bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed'
                          : retailCartItem
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow'
                          : 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 text-slate-200'
                      }`}
                      title={`Add 1 ${retailUnit} (retail)`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black uppercase truncate">
                          + {retailUnit}
                        </span>
                        {retailCartItem && (
                          <span className="px-1 rounded bg-slate-950 text-emerald-400 text-[9px] font-mono font-black">
                            {retailCartItem.quantity}
                          </span>
                        )}
                      </div>
                      <p className={`text-[10px] font-mono font-bold mt-0.5 truncate ${
                        retailCartItem ? 'text-slate-900' : 'text-emerald-300'
                      }`}>
                        {formatRwf(retailPrice)}
                      </p>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={p.id}
                onClick={() => !isOutOfStock && addToCart(p, 'retail')}
                className={`group relative p-3 sm:p-3.5 rounded-2xl border transition-all select-none flex flex-col justify-between active:scale-[0.98] ${
                  isOutOfStock
                    ? 'bg-slate-900/40 border-slate-800/40 opacity-50 cursor-not-allowed'
                    : anyInCart
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
                      {p.quantity} {retailUnit}
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
                    {formatRwf(retailPrice)}
                  </span>
                  {retailCartItem ? (
                    <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow">
                      {retailCartItem.quantity}
                    </span>
                  ) : (
                    <span className="text-[10px] sm:text-xs text-slate-400 group-hover:text-amber-300 flex items-center gap-0.5">
                      <Plus className="w-3 h-3" /> {tf('Add', 'Ongeraho')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-400 text-xs">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <p className="font-semibold text-slate-300">{tf('No matching products found', 'Nta gicuruzwa cyabonetse')}</p>
              <p className="text-[11px] text-slate-400 mt-1">{tf('Try adjusting your search keywords or category filters.', 'Gerageza guhindura ijambo ushakisha cyangwa icyiciro.')}</p>
            </div>
          )}
        </div>

        {/* Mobile floating bar when items are in cart to jump to Cart */}
        {cart.length > 0 && (
          <div className="lg:hidden sticky bottom-0 left-0 right-0 p-3 bg-[#0F131A]/95 backdrop-blur border-t border-slate-800 z-30 flex items-center justify-between gap-3 shadow-2xl">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">{tf('Active Cart', 'Agatebo Karimo')}</span>
              <p className="text-sm font-black text-amber-400 font-mono">
                {formatRwf(cartSubtotal)} <span className="text-xs font-normal text-slate-300">({cart.reduce((a, b) => a + b.quantity, 0)} {tf('items', 'ibintu')})</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileTab('cart')}
              className="py-2.5 px-4 rounded-xl bg-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 active:scale-95 transition"
            >
              <span>{canProcessPayments ? tf('Take Payment', 'Akira Ubwishyu') : tf('Send Order to Cashier', 'Ohereza kwa Keshye')}</span>
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
            <h2 className="text-sm font-bold text-white">{tf('Current Cart', 'Agatebo k’Ubu')} ({cart.length})</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileTab('catalog')}
              className="lg:hidden text-[11px] font-semibold text-amber-400 hover:underline flex items-center gap-1"
            >
              + {tf('Add Items', 'Ongeraho Ibindi')}
            </button>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> {tf('Clear', 'Siba Byose')}
              </button>
            )}
          </div>
        </div>

        {/* Customer Assignment Field */}
        <div className="p-3 bg-[#0F131A] border-b border-slate-800/80 space-y-2 shrink-0">
          <label className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            {tf('Customer / Client', 'Umukiriya')}
          </label>
          <SearchableSelect
            value={selectedCustomerId}
            onChange={(val) => setSelectedCustomerId(val ? Number(val) : null)}
            options={customerSelectOptions}
            emptyOptionLabel={tf('Walk-in Cash Client', 'Umukiriya usanzwe')}
            emptyOptionSublabel={tf('Cash / one-off buyer (no saved account)', 'Umukiriya ugura rimwe (nta konti yanditse)')}
            placeholder={tf('Walk-in Cash Client', 'Umukiriya usanzwe')}
            searchPlaceholder={tf('Search client by name, phone, or ID...', 'Shakisha izina, telefone, cyangwa irangamuntu...')}
            noResultsText={tf('No matching customer found', 'Nta mukiriya wabonetse')}
            allowClear
            ariaLabel={tf('Customer or Client', 'Umukiriya')}
          />

          {selectedCustomer && (Number(selectedCustomer.credit_balance || 0) > 0 || Number(selectedCustomer.store_credit || 0) > 0) && (
            <div className="flex flex-wrap gap-2 text-[10px] pt-0.5">
              {Number(selectedCustomer.credit_balance || 0) > 0 && (
                <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono font-bold">
                  {tf('Owes us:', 'Araturimo:')} {formatRwf(selectedCustomer.credit_balance)}
                </span>
              )}
              {Number(selectedCustomer.store_credit || 0) > 0 && (
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-bold">
                  {tf('We owe client:', 'Tumurimo:')} {formatRwf(Number(selectedCustomer.store_credit))}
                </span>
              )}
            </div>
          )}

          {!selectedCustomerId && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <input
                type="text"
                placeholder={tf('Client Name (optional)', 'Izina (si itegeko)')}
                value={customCustomerName}
                onChange={(e) => setCustomCustomerName(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-amber-500"
              />
              <input
                type="text"
                placeholder={tf('Client Phone (optional)', 'Telefone (si itegeko)')}
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
            const catalogPrice = getCatalogPrice(item.product, item.sale_mode);
            const isNegotiated = item.selling_price !== catalogPrice;
            const buyingPriceNum = getModeBuyingPrice(item.product, item.sale_mode);
            const isBelowCost = canViewBuyingPrices && buyingPriceNum > 0 && item.selling_price < buyingPriceNum;
            const diffPrice = item.selling_price - catalogPrice;
            const remainingBase = getRemainingBaseUnits(item.product);
            const stockBreakdown = formatPackStock(
              item.product.quantity,
              item.product.units_per_pack,
              getRetailUnitLabel(item.product),
              getPackUnitLabel(item.product)
            );
            const canIncrement = remainingBase >= item.pack_size;

            return (
              <div
                key={item.cartKey}
                className={`p-2.5 sm:p-3 rounded-xl border flex flex-col gap-2 transition ${
                  isNegotiated
                    ? 'bg-[#151c28] border-amber-500/40 shadow-sm'
                    : 'bg-[#131822] border-slate-800/90'
                }`}
              >
                {/* Product Name & Remove button */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-bold text-slate-100 truncate">{item.product.name}</p>
                      <span
                        className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                          item.sale_mode === 'pack'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {item.sold_unit}
                        {item.pack_size > 1 ? ` (×${item.pack_size})` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5 flex-wrap">
                      <span>{tf('Code:', 'Kode:')} {item.product.sku}</span>
                      <span>•</span>
                      <span>{tf('Avail:', 'Ahari:')} {stockBreakdown.short}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.cartKey)}
                    className="text-slate-400 hover:text-rose-400 p-1 transition shrink-0"
                    title={tf('Remove item', 'Kura mu gatebo')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Per-Item Price Bargaining / Negotiation Editor */}
                <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <span>{canGiveDiscounts ? tf(`Negotiated / ${item.sold_unit}:`, `Igiciro cyumvikanywe / ${item.sold_unit}:`) : tf(`Price / ${item.sold_unit}:`, `Igiciro / ${item.sold_unit}:`)}</span>
                    </span>
                    {!canGiveDiscounts ? (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> {tf('Fixed price', 'Igiciro ntahinduka')}
                      </span>
                    ) : (
                      isNegotiated && (
                        <button
                          type="button"
                          onClick={() => resetItemPrice(item.cartKey)}
                          className="text-[10px] text-slate-400 hover:text-amber-400 flex items-center gap-1 underline transition"
                          title={tf('Reset to standard catalog price', 'Subiza ku giciro gisanzwe')}
                        >
                          <RotateCcw className="w-2.5 h-2.5" /> {tf('Reset', 'Subizaho')}
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
                        onChange={(e) => updateItemPrice(item.cartKey, Number(e.target.value))}
                        className="w-full bg-transparent text-xs font-mono font-bold text-white focus:outline-none disabled:cursor-not-allowed"
                        title={canGiveDiscounts ? tf('Edit agreed bargaining price per unit', 'Hindura igiciro mwumvikanye') : tf('Fixed catalog price (discount permission disabled)', 'Igiciro gisanzwe (ntiwemerewe kugabanya)')}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                      /{item.sold_unit}
                    </span>
                  </div>

                  {/* Negotiation status indicator */}
                  <div className="flex items-center justify-between text-[10px]">
                    {isNegotiated ? (
                      <span className={`font-mono font-semibold ${diffPrice < 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                        {diffPrice < 0 ? `${tf('Discounted', 'Wagabanyije')} -${formatRwf(Math.abs(diffPrice))}` : `${tf('Premium', 'Wongeye')} +${formatRwf(diffPrice)}`}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono">{tf('Normal price', 'Igiciro gisanzwe')}</span>
                    )}

                    {catalogPrice > 0 && isNegotiated && (
                      <span className="text-slate-400 line-through font-mono">
                        {tf('Orig:', 'Mbere:')} {formatRwf(catalogPrice)}
                      </span>
                    )}
                  </div>

                  {/* Below Cost Warning (Only shown to users allowed to view buying prices) */}
                  {isBelowCost && (
                    <div className="text-[10px] font-semibold text-rose-300 bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0 text-rose-400" />
                      <span>{tf(`Below cost (Cost: ${formatRwf(buyingPriceNum)})`, `Munsi y’ikiguzi (Byaranguwe: ${formatRwf(buyingPriceNum)})`)}</span>
                    </div>
                  )}
                </div>

                {/* Quantity Stepper and Line Total */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.cartKey, -1)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition active:scale-95"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const targetQty = Math.max(1, Math.round(Number(e.target.value) || 1));
                        const delta = targetQty - item.quantity;
                        if (delta !== 0) updateQuantity(item.cartKey, delta);
                      }}
                      className="w-12 text-center py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.cartKey, 1)}
                      disabled={!canIncrement}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 flex items-center justify-center transition active:scale-95"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] text-slate-400 font-mono">{item.sold_unit}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono">
                      {formatRwf(item.selling_price * item.quantity)}
                    </span>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {item.quantity} {item.sold_unit} × {formatRwf(item.selling_price)}
                      {item.pack_size > 1 ? ` (-${item.quantity * item.pack_size} ${getRetailUnitLabel(item.product)})` : ''}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-12">
              <ShoppingBag className="w-10 h-10 text-slate-400 mb-2" />
              <p className="font-semibold text-slate-300">{tf('Your Cart is Empty', 'Nta kintu kiri mu gatebo')}</p>
              <p className="text-[11px] text-slate-400 mt-1 text-center px-4">
                {tf('Tap any product on the catalog or scan a barcode to add it to this sales register.', 'Kanda ku gicuruzwa ibumoso cyangwa usikane barcode kugira ngo ucyongere mu gatebo.')}
              </p>
              <button
                type="button"
                onClick={() => setMobileTab('catalog')}
                className="lg:hidden mt-3 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold"
              >
                {tf('Browse Catalog', 'Reba Ibicuruzwa')}
              </button>
            </div>
          )}
        </div>

        {/* Cart Checkout Footer */}
        <div className="p-3 sm:p-4 bg-[#111622] border-t border-slate-800/90 space-y-3 shrink-0">
          {/* Hidden camera/gallery file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleSelectPhotoFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleSelectPhotoFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          {/* Compact Order Photo Attachment Strip (Only shown if permitted or required by store) */}
          {(canUploadPhotos || isPhotoMandatory) && (
          <div className={`p-2.5 rounded-xl border space-y-2 ${
            isPhotoMandatory && !photoPreviewUrl
              ? 'bg-amber-500/10 border-amber-500/40'
              : 'bg-slate-900/80 border-slate-800'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-[11px] font-bold text-slate-200 truncate">
                  {tf('Order Photo', 'Ifoto ya Komande')}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 ${
                  isPhotoMandatory
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {isPhotoMandatory ? tf('Required', 'Itegeko') : tf('Optional', 'Si Itegeko')}
                </span>
              </div>

              {!canUploadPhotos ? (
                <span className="text-[10px] text-rose-300 font-semibold">
                  {tf('Ask manager for Upload Photos duty', 'Saba uburenganzira bw’amafoto')}
                </span>
              ) : !photoPreviewUrl ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={compressingPhoto}
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] transition"
                  >
                    <Camera className="w-3 h-3" />
                    <span>{compressingPhoto ? '...' : tf('Take Photo', 'Fata Ifoto')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={compressingPhoto}
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[10px] transition"
                    title={tf('Upload image from device', 'Hitamo ifoto kuri telefoni')}
                  >
                    <FileImage className="w-3 h-3 text-sky-400" />
                    <span>{tf('Upload', 'Hitamo')}</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={clearDraftPhoto}
                  className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-0.5"
                >
                  <X className="w-3 h-3" />
                  <span>{tf('Remove', 'Kuraho')}</span>
                </button>
              )}
            </div>

            {photoPreviewUrl && (
              <div className="flex items-center gap-2.5 bg-slate-950/70 p-1.5 rounded-lg border border-slate-800">
                <img
                  src={photoPreviewUrl}
                  alt={tf('Order photo preview', 'Ifoto ya komande')}
                  className="w-10 h-10 rounded object-cover border border-slate-700 shrink-0"
                />
                <div className="min-w-0 flex-1 text-[10px]">
                  <p className="font-bold text-emerald-300 truncate">
                    {tf('Photo ready for upload', 'Ifoto iriteguye')}
                  </p>
                  {photoMetrics && (
                    <p className="text-slate-400 font-mono">
                      {formatKb(photoMetrics.originalBytes)} → <strong className="text-emerald-400">{formatKb(photoMetrics.compressedBytes)}</strong>
                    </p>
                  )}
                  {!r2Configured && (
                    <p className="text-amber-300">
                      {tf('Cloud storage (R2) not configured yet.', 'Ububiko bwa R2 ntiburashyirwaho.')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {photoError && (
              <p className="text-[10px] text-rose-300">{photoError}</p>
            )}
          </div>
          )}

          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>{tf('Items Count', 'Umubare w’ibicuruzwa')}</span>
              <span className="font-mono">{cart.reduce((a, b) => a + b.quantity, 0)} {tf('units', 'uduce')}</span>
            </div>
            <div className="flex justify-between text-base font-black text-white pt-1 border-t border-slate-800">
              <span>{tf('Total to Pay', 'Igiteranyo cyo Kwishyura')}</span>
              <span className="text-amber-400 font-mono">{formatRwf(cartSubtotal)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={openCheckout}
            disabled={cart.length === 0}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition flex items-center justify-center gap-2 active:scale-95"
          >
            <span>{canProcessPayments ? tf('Take Payment', 'Akira Ubwishyu') : tf('Send Order to Cashier', 'Ohereza kwa Keshye')}</span>
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
                  {canProcessPayments ? tf('Payment & Order Confirmation', 'Kwishyuza & Kwemeza Igurisha') : tf('Send Order to Cashier', 'Ohereza Itegeko kwa Keshye')}
                </h3>
                <p className="text-xs text-slate-400">
                  {canProcessPayments
                    ? tf('Review items, confirm payment received, and complete sale', 'Reba ibicuruzwa, wemeze ubwishyu, urangize igurisha')
                    : tf('Review customer items before sending to the Cashier & Store', 'Reba ibyo umukiriya aguze mbere yo kohereza kwa Keshye no mu Bubiko')}
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
                  {appliedStoreCredit > 0 ? tf('Remaining Due After Store Credit', 'Asigaye nyuma yo gukuramo ayo tumurimo') : tf('Total Due', 'Igiteranyo cyo Kwishyura')}
                </p>
                <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono mt-0.5">
                  {formatRwf(netDueAfterStoreCredit)}
                </p>
                {appliedStoreCredit > 0 && (
                  <p className="text-[10px] text-purple-300 font-mono mt-0.5">
                    {tf('Order:', 'Itegeko:')} {formatRwf(cartSubtotal)} − {tf('Store Credit:', 'Ayo tumurimo:')} {formatRwf(appliedStoreCredit)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-400">{tf('Customer', 'Umukiriya')}</p>
                <p className="text-xs font-bold text-slate-200">
                  {selectedCustomer?.name || customCustomerName || tf('Walk-in Client', 'Umukiriya usanzwe')}
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
                      {tf('Deduct Money We Owe Client', 'Kuramo Amafaranga Tubereyemo Umukiriya')}
                    </span>
                    <span className="text-xs font-mono font-black text-purple-300">
                      {tf('Avail:', 'Ahari:')} {formatRwf(availableCustomerCredit)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {useStoreCredit
                      ? tf(`Applying ${formatRwf(appliedStoreCredit)} from client credit. Client only pays missing ${formatRwf(netDueAfterStoreCredit)}.`, `Hakuwemo ${formatRwf(appliedStoreCredit)}. Umukiriya arishyura asigaye ${formatRwf(netDueAfterStoreCredit)}.`)
                      : tf('Check this box to subtract what we owe this client from today’s order total.', 'Hitamo hano kugira ngo uvemo amafaranga uyu mukiriya abereyemo iduka.')}
                  </p>
                </div>
              </label>
            )}

            {/* Itemized Line Items Review */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  {canGiveDiscounts ? tf('Adjust Item Prices (Discounts)', 'Hindura Ibiciro (Igabanyirizwa)') : tf('Order Items Review', 'Reba Ibicuruzwa Biguzwe')}
                </label>
                <span className="text-[10px] text-slate-400">
                  {tf(`${cart.length} item${cart.length > 1 ? 's' : ''} in order`, `Ibicuruzwa ${cart.length} mu itegeko`)}
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                {cart.map((item) => {
                  const modeCost = getModeBuyingPrice(item.product, item.sale_mode);
                  return (
                    <div
                      key={item.cartKey}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-100 truncate">{item.product.name}</p>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 shrink-0">
                            {item.sold_unit}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Qty: {item.quantity} {item.sold_unit}
                          {canViewBuyingPrices && modeCost > 0
                            ? ` • Cost: ${formatRwf(modeCost)}`
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
                            onChange={(e) => updateItemPrice(item.cartKey, Number(e.target.value))}
                            className="w-20 bg-transparent text-xs font-mono font-bold text-white focus:outline-none disabled:cursor-not-allowed"
                            title={canGiveDiscounts ? 'Edit negotiated price for this unit' : 'Fixed catalog price'}
                          />
                        </div>

                        <div className="text-right min-w-[70px]">
                          <span className="text-xs font-bold text-amber-400 font-mono">
                            {formatRwf(item.selling_price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {canProcessPayments ? (
              <>
                {/* Payment Method Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">{tf('Select Payment Method', 'Hitamo Uburyo bwo Kwishyura')}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'cash', label: tf('Cash (RWF)', 'Amafaranga (Cash)'), icon: DollarSign },
                      { id: 'momo', label: 'MTN MoMo', icon: Smartphone },
                      { id: 'bank_transfer', label: tf('Bank / POS', 'Banki / POS'), icon: CreditCard },
                      { id: 'debt_credit', label: tf('Credit / Debt', 'Ideni / Kwizera'), icon: Building },
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
                        {appliedStoreCredit > 0 ? tf('Missing Cash / MoMo Received (RWF)', 'Ayasigaye Yakiriwe (RWF)') : tf('Amount Received (RWF)', 'Amafaranga Yakiriwe (RWF)')}
                      </label>
                      <button
                        type="button"
                        onClick={() => setPaidAmount(String(netDueAfterStoreCredit))}
                        className="text-[10px] text-amber-400 hover:underline font-semibold"
                      >
                        {tf(`Pay Remaining (${formatRwf(netDueAfterStoreCredit)})`, `Yishyure Yose (${formatRwf(netDueAfterStoreCredit)})`)}
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
                        {tf('Change to Return:', 'Ayasubizwa:')} {formatRwf(Number(paidAmount) - netDueAfterStoreCredit)}
                      </p>
                    )}
                    {Number(paidAmount) < netDueAfterStoreCredit && (Number(paidAmount) > 0 || appliedStoreCredit > 0) && (
                      <p className="text-xs text-amber-400 font-semibold font-mono">
                        {tf('Remaining Balance Due (Debt):', 'Ideni Risigaye:')} {formatRwf(netDueAfterStoreCredit - Number(paidAmount))}
                      </p>
                    )}
                  </div>
                )}

                {/* Reference Number for MoMo / Bank */}
                {(paymentMethod === 'momo' || paymentMethod === 'bank_transfer') && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">{tf('Transaction Reference / SMS ID', 'Kode y’Ubwishyu / SMS Reference')}</label>
                    <input
                      type="text"
                      placeholder="e.g. TXN987654321 / BK-Slip"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {/* Optional Proof of Payment Photo (MoMo screenshot / bank slip / cash receipt) */}
                {canUploadPhotos && paymentMethod !== 'debt_credit' && (
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                    <input
                      ref={payProofCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        handleSelectPaymentProofFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <input
                      ref={payProofGalleryInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleSelectPaymentProofFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileImage className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-xs font-bold text-slate-200">
                          {tf('Proof of Payment Photo', 'Ifoto y’Icyemezo cy’Ubwishyu')}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          {tf('Optional', 'Ku Bushake')}
                        </span>
                      </div>

                      {!paymentProofPreviewUrl ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={compressingPayProof}
                            onClick={() => payProofCameraInputRef.current?.click()}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[10px] transition"
                          >
                            <Camera className="w-3 h-3 text-emerald-400" />
                            <span>{compressingPayProof ? '...' : tf('Take Photo', 'Fata Ifoto')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={compressingPayProof}
                            onClick={() => payProofGalleryInputRef.current?.click()}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[10px] transition"
                          >
                            <FileImage className="w-3 h-3 text-sky-400" />
                            <span>{tf('Upload', 'Hitamo')}</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={clearPaymentProof}
                          className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-0.5"
                        >
                          <X className="w-3 h-3" />
                          <span>{tf('Remove', 'Kuraho')}</span>
                        </button>
                      )}
                    </div>

                    {paymentProofPreviewUrl ? (
                      <div className="flex items-center gap-2.5 bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
                        <img
                          src={paymentProofPreviewUrl}
                          alt={tf('Payment proof preview', 'Ifoto y’ubwishyu')}
                          className="w-10 h-10 rounded object-cover border border-slate-700 shrink-0"
                        />
                        <div className="min-w-0 flex-1 text-[10px]">
                          <p className="font-bold text-emerald-300 truncate">
                            {tf('Payment proof ready', 'Icyemezo kiriteguye')}
                          </p>
                          {paymentProofMetrics && (
                            <p className="text-slate-400 font-mono">
                              {formatKb(paymentProofMetrics.originalBytes)} → <strong className="text-emerald-400">{formatKb(paymentProofMetrics.compressedBytes)}</strong>
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400">
                        {tf('Optional: attach MoMo screenshot, bank slip, or cash receipt photo.', 'Ku bushake: ifoto ya MoMo, banki, cyangwa inyemezabwishyu.')}
                      </p>
                    )}

                    {payProofError && (
                      <p className="text-[10px] text-rose-300">{payProofError}</p>
                    )}
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
                        {tf('Also mark items released from store now', 'Emeza kandi ko ibicuruzwa bisohotse mu bubiko ubu')}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {tf('Turn this on if you are working solo and handing the goods to the customer right now.', 'Kanda hano niba ukora wenyine kandi ugiye guhita uha umukiriya ibicuruzwa bye.')}
                      </p>
                    </div>
                  </label>
                )}
              </>
            ) : (
              /* Salesperson (no payment permission) handoff choice */
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-slate-300">{tf('How will the customer pay?', 'Umukiriya arwishyura ate?')}</label>
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
                      <p className="text-xs font-bold">{tf('Customer Pays at Cashier Desk', 'Arishyura kwa Keshye')}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{tf('Cash, MoMo, or Bank handled by Cashier', 'Cash, MoMo, cyangwa Banki byakirwa na Keshye')}</p>
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
                      <p className="text-xs font-bold">{tf('Approved Credit / Account', 'Ideni Ryemewe')}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{tf('Recorded on customer balance', 'Byandikwa ku ideni ry’umukiriya')}</p>
                    </div>
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{tf('Order will be sent to the Cashier for payment and to the Store for release.', 'Itegeko riryohererezwa kwa Keshye kwishyuza no mu Bubiko gusohora ibicuruzwa.')}</span>
                </div>
              </div>
            )}

            {/* Order Photo Confirmation / Capture inside Checkout Modal (Only shown if permitted or required by store) */}
            {(canUploadPhotos || isPhotoMandatory) && (
            <div className={`p-3 rounded-xl border space-y-2 ${
              isPhotoMandatory && !photoPreviewUrl
                ? 'bg-rose-500/10 border-rose-500/40'
                : 'bg-slate-900 border-slate-800'
            }`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-bold text-white">
                    {tf('Order Photo Attachment', 'Ifoto ya Komande')}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                    isPhotoMandatory
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}>
                    {isPhotoMandatory ? tf('Required', 'Ni Itegeko') : tf('Optional', 'Ku Bushake')}
                  </span>
                </div>

                {!canUploadPhotos ? (
                  <span className="text-[11px] font-semibold text-rose-300">
                    {tf('Ask manager to enable Upload Photos', 'Saba umuyobozi gufungura ifoto')}
                  </span>
                ) : !photoPreviewUrl ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={compressingPhoto}
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] transition"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{compressingPhoto ? tf('Shrinking...', 'Biragabanywa...') : tf('Take Photo', 'Fata Ifoto')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={compressingPhoto}
                      onClick={() => galleryInputRef.current?.click()}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-[11px] transition"
                    >
                      <FileImage className="w-3.5 h-3.5 text-sky-400" />
                      <span>{tf('Upload', 'Hitamo')}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={clearDraftPhoto}
                    className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{tf('Remove', 'Kuraho')}</span>
                  </button>
                )}
              </div>

              {photoPreviewUrl ? (
                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <img
                    src={photoPreviewUrl}
                    alt={tf('Order photo preview', 'Ifoto ya komande')}
                    className="w-11 h-11 rounded object-cover border border-slate-700 shrink-0"
                  />
                  <div className="text-[11px] min-w-0">
                    <p className="font-bold text-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{tf('Compressed photo ready to upload', 'Ifoto iriteguye koherezwa')}</span>
                    </p>
                    {photoMetrics && (
                      <p className="text-slate-400 font-mono text-[10px]">
                        {formatKb(photoMetrics.originalBytes)} &rarr; <strong className="text-emerald-400">{formatKb(photoMetrics.compressedBytes)}</strong>
                      </p>
                    )}
                  </div>
                </div>
              ) : isPhotoMandatory ? (
                <p className="text-[11px] text-rose-200">
                  {!canUploadPhotos
                    ? tf(
                        'Your manager requires an order photo on all new orders, and needs to grant your account the Upload Photos permission.',
                        'Umuyobozi yashyizeho itegeko ry’ifoto ya komande, kandi akeneye kuguha uburenganzira bwo gufata amafoto.'
                      )
                    : tf(
                        'Your manager requires an order photo on all new orders. Take or upload a photo before completing this order.',
                        'Umuyobozi yashyizeho itegeko ryo gufotora komande zose nshya. Fata cyangwa uhitemo ifoto mbere yo kurangiza.'
                      )}
                </p>
              ) : (
                <p className="text-[11px] text-slate-400">
                  {tf(
                    'Optional: attach a compressed photo of the client/handwritten order.',
                    'Ku bushake: ushobora kongeraho ifoto y’urupapuro rwa komande.'
                  )}
                </p>
              )}
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
                <span>{tf('Order will be saved and sent to Store for release.', 'Itegeko rirabikwa kandi ryoherezwe mu Bubiko gusohoka.')}</span>
              </div>
            )}

            {/* Process Action */}
            <div className="flex gap-2.5 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
              >
                {tf('Cancel', 'Hagarika')}
              </button>
              <button
                type="button"
                onClick={handleProcessOrder}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 active:scale-95"
              >
                {isSubmitting
                  ? tf('Processing...', 'Birimo gutunganywa...')
                  : !canProcessPayments
                  ? tf('Send Order to Cashier', 'Ohereza kwa Keshye')
                  : canPrintReceipt
                  ? (isSoloOperator && releaseImmediately ? tf('Complete, Release & Print', 'Rangiza, Sohora & Inyemezabuguzi') : tf('Complete & Print Receipt', 'Rangiza & Sohora Inyemezabuguzi'))
                  : tf('Complete Order', 'Rangiza Igurisha')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
