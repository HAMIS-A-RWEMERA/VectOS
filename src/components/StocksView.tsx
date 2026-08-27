import React, { useState, useEffect } from 'react';
import { StockLocation, StockTransfer, Product, User } from '../types';
import { api } from '../services/api';
import { 
  Boxes, 
  Plus, 
  ArrowRightLeft, 
  Building2, 
  MapPin, 
  UserCheck, 
  History, 
  Clock, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

interface StocksViewProps {
  user: User | null;
}

export const StocksView: React.FC<StocksViewProps> = ({ user }) => {
  const [stocks, setStocks] = useState<StockLocation[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);

  // Transfer Form
  const [fromStockId, setFromStockId] = useState<number>(0);
  const [toStockId, setToStockId] = useState<number>(0);
  const [selectedProductId, setSelectedProductId] = useState<number>(0);
  const [transferQty, setTransferQty] = useState<string>('5');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Warehouse Form
  const [newStockData, setNewStockData] = useState({
    name: '',
    code: '',
    location: 'Kigali, Rwanda',
    manager_name: '',
    phone: '',
    is_main: 0
  });

  const canManage = user?.role === 'manager' || user?.role === 'superadmin' || user?.role === 'storekeeper';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [stockRes, prodRes] = await Promise.all([
        api.getStocks(),
        api.getProducts()
      ]);
      setStocks(stockRes.stocks || []);
      setTransfers(stockRes.transfers || []);
      setProducts(prodRes.products || []);

      if (stockRes.stocks.length >= 2) {
        setFromStockId(stockRes.stocks[0].id);
        setToStockId(stockRes.stocks[1].id);
      }
      if (prodRes.products.length > 0) {
        setSelectedProductId(prodRes.products[0].id);
      }
    } catch (err) {
      console.error('Error loading warehouse data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromStockId === toStockId) {
      setModalError('Origin and Destination warehouse locations must be different.');
      return;
    }
    const qtyNum = Number(transferQty) || 0;
    if (qtyNum <= 0) {
      setModalError('Transfer quantity must be greater than zero.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError('');
      await api.transferStock({
        from_stock_id: fromStockId,
        to_stock_id: toStockId,
        product_id: selectedProductId,
        quantity: qtyNum,
        notes: transferNotes
      });
      setIsTransferModalOpen(false);
      loadData();
    } catch (err: any) {
      setModalError(err.message || 'Transfer failed. Check warehouse inventory.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStockData.name || !newStockData.code) {
      setModalError('Warehouse Name and Code are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.createStockLocation(newStockData);
      setIsAddStockModalOpen(false);
      loadData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to create warehouse.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Warehouses & Multi-Stock Transfers
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
              {stocks.length} Locations Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Inter-warehouse stock movements, central depots, and dispatch verification.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {canManage && (
            <>
              <button
                onClick={() => {
                  setModalError('');
                  setIsTransferModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Inter-Stock Transfer</span>
              </button>
              <button
                onClick={() => {
                  setModalError('');
                  setIsAddStockModalOpen(true);
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Add Warehouse</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Warehouse Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stocks.map((stock) => (
          <div
            key={stock.id}
            className="p-5 rounded-2xl bg-[#121620] border border-slate-800 hover:border-slate-700 transition space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  stock.is_main ? 'bg-amber-500/10 text-amber-400' : 'bg-sky-500/10 text-sky-400'
                }`}>
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{stock.name}</h3>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    CODE: {stock.code}
                  </span>
                </div>
              </div>

              {stock.is_main ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Main Depot
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
                  Branch
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{stock.location || 'Kigali, Rwanda'}</span>
              </div>
              <div className="flex items-center gap-2">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>Manager: <strong className="text-slate-200">{stock.manager_name || 'Assigned Storekeeper'}</strong></span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Status</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Operational
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Transfer Movement Audit Trail */}
      <div className="p-6 rounded-2xl bg-[#121620] border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-bold text-white">Stock Transfer Log & Audit Trail</h2>
          </div>
          <span className="text-xs text-slate-400">{transfers.length} movements logged</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Date & Time</th>
                <th className="py-2.5 px-4 font-semibold">Product Item</th>
                <th className="py-2.5 px-4 font-semibold">Quantity</th>
                <th className="py-2.5 px-4 font-semibold">From Warehouse</th>
                <th className="py-2.5 px-4 font-semibold">To Warehouse</th>
                <th className="py-2.5 px-4 font-semibold">Transferred By</th>
                <th className="py-2.5 px-4 font-semibold">Audit Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-200">
                    {t.product_name || `Product #${t.product_id}`}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-amber-400">
                    {t.quantity} units
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {t.from_stock_name || `Stock #${t.from_stock_id}`}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {t.to_stock_name || `Stock #${t.to_stock_id}`}
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {t.transferred_by_name || 'System Operator'}
                  </td>
                  <td className="py-3 px-4 text-slate-400 italic">
                    {t.notes || 'Routine branch balancing'}
                  </td>
                </tr>
              ))}

              {transfers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No warehouse transfers recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Execute Stock Transfer</h3>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Select Product to Move</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (SKU: {p.sku}) — Available: {p.quantity} {p.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Source Warehouse</label>
                  <select
                    value={fromStockId}
                    onChange={(e) => setFromStockId(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    {stocks.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Destination Warehouse</label>
                  <select
                    value={toStockId}
                    onChange={(e) => setToStockId(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    {stocks.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Quantity to Transfer</label>
                <input
                  type="number"
                  required
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Transfer Reason / Dispatch Reference</label>
                <input
                  type="text"
                  placeholder="e.g. Branch replenishment, Truck dispatch #TRK-102"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? 'Transferring...' : 'Authorize Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Warehouse Modal */}
      {isAddStockModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Add New Warehouse / Branch Depot</h3>
              <button onClick={() => setIsAddStockModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateWarehouse} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Warehouse Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nyabugogo Hardware Depot"
                  value={newStockData.name}
                  onChange={(e) => setNewStockData({ ...newStockData, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Location Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WH-NYAB"
                  value={newStockData.code}
                  onChange={(e) => setNewStockData({ ...newStockData, code: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Physical Address</label>
                <input
                  type="text"
                  value={newStockData.location}
                  onChange={(e) => setNewStockData({ ...newStockData, location: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Assigned Storekeeper / Manager</label>
                <input
                  type="text"
                  placeholder="e.g. Jean Damascene"
                  value={newStockData.manager_name}
                  onChange={(e) => setNewStockData({ ...newStockData, manager_name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {modalError && <p className="text-xs text-rose-400 font-semibold">{modalError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? 'Saving...' : 'Register Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
