import React, { useState, useEffect } from 'react';
import { Shop, User } from '../types';
import { api } from '../services/api';
import { 
  Building, 
  Plus, 
  Store, 
  CreditCard, 
  CheckCircle2, 
  ExternalLink, 
  Users, 
  Boxes, 
  MapPin, 
  Phone, 
  Mail,
  ShieldAlert
} from 'lucide-react';

interface SuperAdminViewProps {
  currentUser: User | null;
  activeShop: Shop | null;
  onSwitchShop: (shopId: number) => void;
}

export const SuperAdminView: React.FC<SuperAdminViewProps> = ({
  currentUser,
  activeShop,
  onSwitchShop
}) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [newShop, setNewShop] = useState({
    name: '',
    code: '',
    owner_name: '',
    phone: '',
    email: '',
    location: 'Kigali, Rwanda',
    tin_number: '',
    business_type: 'hardware_retail',
    subscription_plan: 'starter'
  });
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    try {
      setLoading(true);
      const res = await api.getShops();
      setShops(res.shops || []);
    } catch (err) {
      console.error('Error fetching shops:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShop.name || !newShop.code || !newShop.owner_name) {
      setModalError('Shop Name, Code, and Owner Name are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError('');
      await api.createShop(newShop);
      setIsAddModalOpen(false);
      fetchShops();
    } catch (err: any) {
      setModalError(err.message || 'Failed to provision tenant shop.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              VectOS Multi-Tenant Platform Portal
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {shops.length} Hardware Tenants
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            SuperAdmin tenant directory, monthly SaaS billing, and store context switching.
          </p>
        </div>

        <button
          onClick={() => {
            setModalError('');
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Provision New Store</span>
        </button>
      </div>

      {/* Tenant Shops Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {shops.map((shop) => {
          const isActiveContext = activeShop?.id === shop.id;

          return (
            <div
              key={shop.id}
              className={`p-5 rounded-2xl border transition space-y-4 ${
                isActiveContext
                  ? 'bg-amber-500/10 border-amber-500/50 shadow-xl shadow-amber-500/10'
                  : 'bg-[#121620] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{shop.name}</h3>
                    <p className="text-[11px] font-mono text-slate-400">TIN: {shop.tin_number || 'N/A'}</p>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                  {shop.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{shop.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono text-slate-300">{shop.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>Owner: <strong className="text-slate-200">{shop.owner_name}</strong></span>
                </div>
              </div>

              {/* Stats Summary */}
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center text-xs">
                <div>
                  <p className="text-[10px] text-slate-400">Staff</p>
                  <p className="font-bold text-white mt-0.5">{shop.user_count || 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Products</p>
                  <p className="font-bold text-amber-400 mt-0.5">{shop.product_count || 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Revenue</p>
                  <p className="font-bold text-emerald-400 font-mono mt-0.5">{formatRwf(shop.total_revenue || 0)}</p>
                </div>
              </div>

              {/* Context Switch Button */}
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">
                  Fee: {formatRwf(shop.monthly_fee || 50000)}/mo
                </span>

                {isActiveContext ? (
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Active Context
                  </span>
                ) : (
                  <button
                    onClick={() => onSwitchShop(shop.id)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 hover:text-white border border-slate-700 transition"
                  >
                    Switch Context &rarr;
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Shop Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Provision New Hardware Store Tenant</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateShop} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Store / Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kigali Builders Depot"
                  value={newShop.name}
                  onChange={(e) => setNewShop({ ...newShop, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Store Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. KBD-01"
                    value={newShop.code}
                    onChange={(e) => setNewShop({ ...newShop, code: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">RRA TIN Number</label>
                  <input
                    type="text"
                    placeholder="100987654"
                    value={newShop.tin_number}
                    onChange={(e) => setNewShop({ ...newShop, tin_number: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Managing Owner Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Habimana Alexis"
                  value={newShop.owner_name}
                  onChange={(e) => setNewShop({ ...newShop, owner_name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Contact Telephone</label>
                  <input
                    type="text"
                    placeholder="0788 123 456"
                    value={newShop.phone}
                    onChange={(e) => setNewShop({ ...newShop, phone: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Contact Email</label>
                  <input
                    type="email"
                    placeholder="admin@shop.rw"
                    value={newShop.email}
                    onChange={(e) => setNewShop({ ...newShop, email: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Location / Commercial Sector</label>
                <input
                  type="text"
                  placeholder="e.g. Gisozi Hardware Market, Kigali"
                  value={newShop.location}
                  onChange={(e) => setNewShop({ ...newShop, location: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {modalError && <p className="text-xs text-rose-400 font-semibold">{modalError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? 'Provisioning...' : 'Provision Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
