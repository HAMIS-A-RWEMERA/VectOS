import React, { useState, useEffect, useMemo } from 'react';
import { Product, User } from '../types';
import { api } from '../services/api';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  AlertTriangle, 
  Edit3, 
  SlidersHorizontal, 
  Boxes, 
  CheckCircle2, 
  X,
  ArrowUpDown
} from 'lucide-react';

interface ProductsViewProps {
  user: User | null;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ user }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'low' | 'out'>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);

  // Form states
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    sku: '',
    barcode: '',
    category: 'Building Materials',
    unit: 'pcs',
    buying_price: 0,
    quantity: 0,
    low_stock_threshold: 5,
    description: ''
  });

  const [adjustQty, setAdjustQty] = useState<string>('10');
  const [adjustType, setAdjustType] = useState<string>('purchase_restock');
  const [adjustNotes, setAdjustNotes] = useState<string>('');
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManageStock = user?.role === 'manager' || user?.role === 'superadmin' || user?.role === 'storekeeper' || user?.can_manage_stock;
  const canViewBuyingPrices = user?.role === 'manager' || user?.role === 'superadmin' || user?.role === 'accountant' || user?.can_view_buying_prices;

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await api.getProducts();
      setProducts(res.products || []);
      setCategories(['All', ...(res.categories || [])]);
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q));
      
      let matchStock = true;
      if (filterStockStatus === 'low') {
        matchStock = p.quantity > 0 && p.quantity <= p.low_stock_threshold;
      } else if (filterStockStatus === 'out') {
        matchStock = p.quantity <= 0;
      }

      return matchCat && matchQuery && matchStock;
    });
  }, [products, searchQuery, selectedCategory, filterStockStatus]);

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      barcode: '',
      category: categories[1] || 'Building Materials',
      unit: 'pcs',
      buying_price: 1000,
      quantity: 10,
      low_stock_threshold: 5,
      description: ''
    });
    setModalError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setCurrentProduct(p);
    setFormData({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || '',
      category: p.category,
      unit: p.unit,
      buying_price: p.buying_price,
      quantity: p.quantity,
      low_stock_threshold: p.low_stock_threshold,
      description: p.description || ''
    });
    setModalError('');
    setIsEditModalOpen(true);
  };

  const handleOpenAdjust = (p: Product) => {
    setCurrentProduct(p);
    setAdjustQty('10');
    setAdjustType('purchase_restock');
    setAdjustNotes('');
    setModalError('');
    setIsAdjustModalOpen(true);
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.sku) {
      setModalError('Product Name and SKU are required.');
      return;
    }
    try {
      setIsSubmitting(true);
      await api.createProduct(formData);
      setIsAddModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProduct) return;
    try {
      setIsSubmitting(true);
      await api.updateProduct(currentProduct.id, formData);
      setIsEditModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setModalError(err.message || 'Failed to update product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProduct) return;
    try {
      setIsSubmitting(true);
      const qtyNum = Number(adjustQty) || 0;
      await api.adjustStock(currentProduct.id, qtyNum, adjustType, adjustNotes);
      setIsAdjustModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setModalError(err.message || 'Failed to adjust stock.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Inventory & Products
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {products.length} Items Listed
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manage construction supplies, electrical gear, safety stock levels, and buying prices.
          </p>
        </div>

        {canManageStock && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Product</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by product name, SKU code, or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Stock Health Filter */}
          <div className="flex gap-2">
            {[
              { id: 'all', label: 'All Stock' },
              { id: 'low', label: 'Low Stock' },
              { id: 'out', label: 'Out of Stock' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setFilterStockStatus(st.id as any)}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition ${
                  filterStockStatus === st.id
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-2xl bg-[#121620] border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">SKU / Code</th>
                <th className="py-3 px-4 font-semibold">Product Name & Category</th>
                <th className="py-3 px-4 font-semibold">Unit</th>
                {canViewBuyingPrices && <th className="py-3 px-4 font-semibold">Buying Cost</th>}
                <th className="py-3 px-4 font-semibold">Suggested Selling</th>
                <th className="py-3 px-4 font-semibold">In Stock</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredProducts.map((p) => {
                const isOutOfStock = p.quantity <= 0;
                const isLowStock = p.quantity > 0 && p.quantity <= p.low_stock_threshold;
                const sellingPrice = p.buying_price > 0 ? Math.round(p.buying_price * 1.25) : 1000;

                return (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-bold text-amber-400">{p.sku}</td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-100">{p.name}</p>
                      <p className="text-[10px] text-slate-400">{p.category}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-mono">{p.unit}</td>
                    {canViewBuyingPrices && (
                      <td className="py-3 px-4 text-slate-400 font-mono">{formatRwf(p.buying_price)}</td>
                    )}
                    <td className="py-3 px-4 font-bold text-slate-200 font-mono">{formatRwf(sellingPrice)}</td>
                    <td className="py-3 px-4 font-mono font-black text-white">{p.quantity}</td>
                    <td className="py-3 px-4">
                      {isOutOfStock ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Out of Stock
                        </span>
                      ) : isLowStock ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Low Stock ({p.quantity} &lt; {p.low_stock_threshold})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Healthy
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canManageStock && (
                          <button
                            onClick={() => handleOpenAdjust(p)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 text-[11px] font-semibold border border-slate-700 transition"
                            title="Adjust inventory level"
                          >
                            Adjust
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-300">No products found matching criteria</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {isAddModalOpen ? 'Register New Product' : `Edit Product: ${currentProduct?.name}`}
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setIsEditModalOpen(false);
                }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={isAddModalOpen ? handleSaveAdd : handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">SKU Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Building Materials">Building Materials (Cement, Iron bars)</option>
                    <option value="Electrical Supplies">Electrical Supplies (Cables, Sockets)</option>
                    <option value="Plumbing & Pipes">Plumbing & Pipes (PVC, Taps)</option>
                    <option value="Paints & Finishes">Paints & Finishes (Exterior, Primer)</option>
                    <option value="Power Tools & Hardware">Power Tools & Hardware</option>
                    <option value="Solar & Electronics">Solar & Electronics</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Unit of Measure</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="bags">Bags (50kg)</option>
                    <option value="meters">Meters (m)</option>
                    <option value="rolls">Rolls</option>
                    <option value="liters">Liters (L)</option>
                    <option value="boxes">Boxes</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Buying Cost (RWF)</label>
                  <input
                    type="number"
                    value={formData.buying_price}
                    onChange={(e) => setFormData({ ...formData, buying_price: Number(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Initial Quantity in Stock</label>
                  <input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Low Stock Alert Threshold</label>
                  <input
                    type="number"
                    value={formData.low_stock_threshold}
                    onChange={(e) => setFormData({ ...formData, low_stock_threshold: Number(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Barcode / EAN (Optional)</label>
                  <input
                    type="text"
                    value={formData.barcode || ''}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {modalError && (
                <p className="text-xs text-rose-400 font-semibold">{modalError}</p>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setIsEditModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {isAdjustModalOpen && currentProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Stock Level Adjustment</h3>
                <p className="text-xs text-slate-400">{currentProduct.name} (Current: {currentProduct.quantity} {currentProduct.unit})</p>
              </div>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveAdjust} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Adjustment Quantity (+ to add, - to reduce)</label>
                <input
                  type="number"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  New stock will be: <strong className="text-amber-400">{currentProduct.quantity + (Number(adjustQty) || 0)} {currentProduct.unit}</strong>
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Adjustment Reason</label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="purchase_restock">Supplier Shipment / Purchase Restock (+)</option>
                  <option value="customer_return">Customer Return (+)</option>
                  <option value="inventory_audit">Inventory Audit Correction (+/-)</option>
                  <option value="damaged_written_off">Damaged / Broken Goods Write-off (-)</option>
                  <option value="theft_loss">Theft / Shrinkage Loss (-)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Internal Audit Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Received shipment from Kigali Central Depot, Invoice #INV-88"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {modalError && (
                <p className="text-xs text-rose-400 font-semibold">{modalError}</p>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? 'Updating...' : 'Confirm Stock Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
