import React, { useState, useEffect } from 'react';
import { Order, OrderItem, Product } from '../types';
import { api } from '../services/api';
import { 
  X, 
  Trash2, 
  Plus, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Package, 
  Save, 
  RefreshCw,
  Edit3
} from 'lucide-react';

interface EditOrderModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onOrderUpdated: (updatedOrder: Order) => void;
}

interface EditableItem {
  tempId: string;
  product_id: number;
  product_name: string;
  product_sku?: string;
  unit?: string;
  quantity: number;
  selling_price: number;
  buying_price: number;
  subtotal: number;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({
  isOpen,
  order,
  onClose,
  onOrderUpdated,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [items, setItems] = useState<EditableItem[]>([]);
  
  // Product Catalog for adding new items
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize data whenever order changes or modal opens
  useEffect(() => {
    if (order && isOpen) {
      setCustomerName(order.customer_name || 'Walk-in Client');
      setCustomerPhone(order.customer_phone || '');
      setNotes(order.notes || '');
      setPaidAmount(Number(order.paid_amount || 0));
      setError(null);

      // Load products for the add product selector
      api.getProducts().then(res => {
        setCatalogProducts(res.products || []);
      }).catch(err => {
        console.error('Failed to load products for edit order modal:', err);
      });

      // Map any existing items immediately for responsive UI
      if (order.items && order.items.length > 0) {
        const initialMapped = (order.items || []).map((it: any, idx: number) => ({
          tempId: `item-${it.product_id}-${idx}-${Date.now()}`,
          product_id: Number(it.product_id),
          product_name: it.product_name || it.name || `Product #${it.product_id}`,
          product_sku: it.product_sku || it.sku || '',
          unit: it.product_unit || it.unit || 'pcs',
          quantity: Math.max(1, Number(it.quantity || 1)),
          selling_price: Number(it.selling_price !== undefined ? it.selling_price : (it.buying_price || 0)),
          buying_price: Number(it.buying_price || 0),
          subtotal: Number(it.subtotal || (Number(it.selling_price || 0) * Number(it.quantity || 1)))
        }));
        setItems(initialMapped);
      }

      // Always fetch fresh order detail from server to guarantee complete items and prices
      api.getOrderDetail(order.id).then(res => {
        if (res && res.order) {
          if (res.order.customer_name) setCustomerName(res.order.customer_name);
          if (res.order.customer_phone !== undefined) setCustomerPhone(res.order.customer_phone || '');
          if (res.order.notes !== undefined) setNotes(res.order.notes || '');
          if (res.order.paid_amount !== undefined) setPaidAmount(Number(res.order.paid_amount || 0));
        }
        if (res && res.items && res.items.length > 0) {
          const loadedItems = res.items.map((it: any, idx: number) => ({
            tempId: `item-${it.product_id}-${idx}-${Date.now()}`,
            product_id: Number(it.product_id),
            product_name: it.product_name || it.name || `Product #${it.product_id}`,
            product_sku: it.product_sku || it.sku || '',
            unit: it.product_unit || it.unit || 'pcs',
            quantity: Math.max(1, Number(it.quantity || 1)),
            selling_price: Number(it.selling_price !== undefined ? it.selling_price : (it.buying_price || 0)),
            buying_price: Number(it.buying_price || 0),
            subtotal: Number(it.subtotal || (Number(it.selling_price || 0) * Number(it.quantity || 1)))
          }));
          setItems(loadedItems);
        }
      }).catch(err => {
        console.error('Failed to load fresh order details:', err);
      });
    }
  }, [order?.id, isOpen]);

  if (!isOpen || !order) return null;

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  // Recalculate totals
  const totalAmount = items.reduce((acc, it) => acc + (it.selling_price * it.quantity), 0);
  const balanceDue = Math.max(0, totalAmount - paidAmount);

  // Update item quantity
  const handleQuantityChange = (tempId: string, newQty: number) => {
    if (newQty < 1) return;
    setItems(prev => prev.map(item => {
      if (item.tempId === tempId) {
        return {
          ...item,
          quantity: newQty,
          subtotal: item.selling_price * newQty
        };
      }
      return item;
    }));
  };

  // Update item unit selling price
  const handlePriceChange = (tempId: string, newPrice: number) => {
    if (newPrice < 0) return;
    setItems(prev => prev.map(item => {
      if (item.tempId === tempId) {
        return {
          ...item,
          selling_price: newPrice,
          subtotal: newPrice * item.quantity
        };
      }
      return item;
    }));
  };

  // Remove item (e.g. out of stock or accidental entry)
  const handleRemoveItem = (tempId: string) => {
    if (items.length <= 1) {
      setError('An order must have at least one product. If the whole order is invalid, please void or cancel it.');
      return;
    }
    setError(null);
    setItems(prev => prev.filter(item => item.tempId !== tempId));
  };

  // Add new item from store catalog
  const handleAddProduct = () => {
    if (!selectedProductId) return;
    const prod = catalogProducts.find(p => p.id === Number(selectedProductId));
    if (!prod) return;

    // Check if already in order
    const existingIndex = items.findIndex(it => it.product_id === prod.id);
    if (existingIndex >= 0) {
      // Increase quantity by 1
      setItems(prev => prev.map((it, idx) => {
        if (idx === existingIndex) {
          const updatedQty = it.quantity + 1;
          return {
            ...it,
            quantity: updatedQty,
            subtotal: it.selling_price * updatedQty
          };
        }
        return it;
      }));
    } else {
      const price = prod.selling_price && Number(prod.selling_price) > 0 
        ? Number(prod.selling_price) 
        : Number(prod.buying_price || 0);

      const newItem: EditableItem = {
        tempId: `new-${prod.id}-${Date.now()}`,
        product_id: prod.id,
        product_name: prod.name,
        product_sku: prod.sku,
        unit: prod.unit || 'pcs',
        quantity: 1,
        selling_price: price,
        buying_price: Number(prod.buying_price || 0),
        subtotal: price * 1
      };
      setItems(prev => [...prev, newItem]);
    }

    setSelectedProductId('');
    setIsAddingProduct(false);
    setError(null);
  };

  // Submit updated order
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setError('Please add at least one item to the order.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        customer_name: customerName.trim() || 'Walk-in Client',
        customer_phone: customerPhone.trim() || '',
        notes: notes.trim() || undefined,
        paid_amount: paidAmount,
        items: items.map(it => ({
          product_id: it.product_id,
          quantity: it.quantity,
          selling_price: it.selling_price,
          fulfillment_source: 'Store'
        }))
      };

      const res = await api.updateOrder(order.id, payload);
      if (res && res.order) {
        onOrderUpdated(res.order);
        onClose();
      } else {
        throw new Error(res?.message || 'Failed to update order');
      }
    } catch (err: any) {
      console.error('Error updating order:', err);
      setError(err?.message || 'Failed to update order. Please check inputs and stock availability.');
    } finally {
      setLoading(false);
    }
  };

  const filteredCatalog = catalogProducts.filter(p => 
    !catalogSearch ||
    p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    p.sku.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    p.category?.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#141923] text-slate-100 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 my-auto">
        
        {/* Header */}
        <div className="p-4 bg-[#0F131A] border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Edit Receipt & Order</h2>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {order.order_number}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Adjust quantities, remove out-of-stock items, or add new items. Physical stock & receipt totals adjust automatically.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer & Order Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Customer Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Walk-in Client"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Phone Number <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="e.g. 0788123456"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-400" />
                  Order Items ({items.length})
                </h3>
                <span className="text-[11px] text-slate-400">
                  Delete any item that was out of stock, or update quantity & selling price.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingProduct(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs font-bold transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAddingProduct ? 'Close Selector' : '+ Add Product to Order'}</span>
              </button>
            </div>

            {/* Add Product Inline Panel */}
            {isAddingProduct && (
              <div className="p-4 rounded-xl bg-slate-900 border border-amber-500/30 space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search store inventory by name, SKU or category..."
                      value={catalogSearch}
                      onChange={e => setCatalogSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedProductId}
                    onChange={e => setSelectedProductId(e.target.value ? Number(e.target.value) : '')}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Choose a product from catalog ({filteredCatalog.length} available) --</option>
                    {filteredCatalog.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} [{p.sku}] - Stock: {p.quantity} {p.unit || 'pcs'} - Price: {formatRwf(p.selling_price || p.buying_price)}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleAddProduct}
                    disabled={!selectedProductId}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition"
                  >
                    Add Item
                  </button>
                </div>
              </div>
            )}

            {/* Items List Table */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price (RWF)</th>
                    <th className="py-2.5 px-3 text-right">Subtotal (RWF)</th>
                    <th className="py-2.5 px-3 text-center w-12">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {items.map((it) => (
                    <tr key={it.tempId} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-white">{it.product_name}</p>
                        <span className="text-[10px] text-slate-400">
                          {it.product_sku ? `SKU: ${it.product_sku} • ` : ''}{it.unit || 'pcs'}
                        </span>
                      </td>

                      {/* Qty Input with +/- */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(it.tempId, it.quantity - 1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={e => handleQuantityChange(it.tempId, Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-12 text-center py-0.5 rounded bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(it.tempId, it.quantity + 1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Unit Price */}
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          value={it.selling_price}
                          onChange={e => handlePriceChange(it.tempId, Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-24 text-right py-0.5 px-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                        />
                      </td>

                      {/* Subtotal */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-300">
                        {formatRwf(it.subtotal)}
                      </td>

                      {/* Delete Action */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(it.tempId)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Remove item (e.g. out of stock)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Calculation & Payment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900/90 border border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Amount Paid by Customer (RWF)
              </label>
              <input
                type="number"
                min="0"
                value={paidAmount}
                onChange={e => setPaidAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm font-mono font-bold text-emerald-400 focus:outline-none focus:border-amber-500"
              />
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPaidAmount(totalAmount)}
                  className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold transition"
                >
                  Pay Full ({formatRwf(totalAmount)})
                </button>
                <button
                  type="button"
                  onClick={() => setPaidAmount(Math.min(totalAmount, Number(order.paid_amount || 0)))}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-medium transition"
                >
                  Original ({formatRwf(order.paid_amount || 0)})
                </button>
                <button
                  type="button"
                  onClick={() => setPaidAmount(0)}
                  className="px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[10px] font-medium transition"
                >
                  Unpaid (0 RWF)
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Set to equal order total if paid in full, or enter partial deposit.
              </p>
            </div>

            <div className="space-y-1.5 text-right flex flex-col justify-center">
              <div className="flex justify-between text-xs text-slate-400">
                <span>New Order Total:</span>
                <span className="font-mono font-bold text-white text-sm">{formatRwf(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Paid Amount:</span>
                <span className="font-mono font-semibold text-emerald-400">{formatRwf(paidAmount)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 border-t border-slate-800 pt-1">
                <span>Balance Due (Debt):</span>
                <span className={`font-mono font-bold text-sm ${balanceDue > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {formatRwf(balanceDue)}
                </span>
              </div>
            </div>
          </div>

          {/* Revision Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Revision Notes <span className="text-slate-500 font-normal">(Optional explanation for changes)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Removed out-of-stock attache 14m, replaced with 16m"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Real-time Inventory Guarantee notice */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
            <RefreshCw className="w-4 h-4 shrink-0 text-amber-400 animate-spin-slow" />
            <span>
              Real-time synchronization: Submitting this will automatically replenish the stock of removed items and deduct the newly added items from your warehouse inventory.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Saving Changes...' : 'Save & Update Receipt'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
