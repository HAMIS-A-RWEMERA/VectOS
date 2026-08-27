import React, { useState, useEffect } from 'react';
import { Customer, User } from '../types';
import { api } from '../services/api';
import { 
  Users, 
  Plus, 
  Search, 
  Phone, 
  MapPin, 
  DollarSign, 
  CreditCard, 
  ArrowUpRight,
  ShieldCheck
} from 'lucide-react';

interface CustomersViewProps {
  user: User | null;
}

export const CustomersView: React.FC<CustomersViewProps> = ({ user }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    address: 'Kigali, Rwanda',
    id_number: ''
  });
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.getCustomers();
      setCustomers(res.customers || []);
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name) {
      setModalError('Customer Name is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError('');
      await api.createCustomer(newCustomer);
      setIsAddModalOpen(false);
      setNewCustomer({ name: '', phone: '', email: '', address: 'Kigali, Rwanda', id_number: '' });
      fetchCustomers();
    } catch (err: any) {
      setModalError(err.message || 'Failed to register customer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.id_number && c.id_number.toLowerCase().includes(q))
    );
  });

  const totalOutstandingReceivables = customers.reduce((acc, c) => acc + (c.credit_balance || 0), 0);

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Customers & Credit Ledger
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {customers.length} Accounts
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Contractors, builders, trade partners, and store debt credit balances.
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
          <span>Register New Customer</span>
        </button>
      </div>

      {/* Summary KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase">Total Clients</span>
          <p className="text-xl font-black text-white mt-1">{customers.length} Registered</p>
        </div>
        <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase">Total Outstanding Debt</span>
          <p className="text-xl font-black text-rose-400 font-mono mt-1">{formatRwf(totalOutstandingReceivables)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase">Credit Risk Status</span>
          <p className="text-xl font-black text-emerald-400 mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-5 h-5" /> Healthy Ledger
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by client name, mobile phone (078...), or National ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="rounded-2xl bg-[#121620] border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Customer / Contractor</th>
                <th className="py-3 px-4 font-semibold">Phone Contact</th>
                <th className="py-3 px-4 font-semibold">Location / Address</th>
                <th className="py-3 px-4 font-semibold">National ID / TIN</th>
                <th className="py-3 px-4 font-semibold">Credit Debt Balance</th>
                <th className="py-3 px-4 font-semibold">Total Orders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4">
                    <p className="font-bold text-white text-sm">{c.name}</p>
                    {c.email && <p className="text-[10px] text-slate-400">{c.email}</p>}
                  </td>
                  <td className="py-3 px-4 font-mono text-amber-400">{c.phone || '—'}</td>
                  <td className="py-3 px-4 text-slate-300">{c.address || 'Kigali, Rwanda'}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">{c.id_number || '—'}</td>
                  <td className="py-3 px-4">
                    {c.credit_balance > 0 ? (
                      <span className="font-mono font-bold text-rose-400">
                        {formatRwf(c.credit_balance)}
                      </span>
                    ) : (
                      <span className="font-mono text-emerald-400 font-semibold">
                        0 RWF (Settled)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">{c.order_count || 0} order(s)</td>
                </tr>
              ))}

              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-300">No customers registered yet</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Register New Customer / Contractor</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Full Name or Contractor Company *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mugisha Construction Ltd"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Phone Number (MTN / Airtel)</label>
                <input
                  type="text"
                  placeholder="0788 123 456"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="contractor@build.rw"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Site Location / Address</label>
                <input
                  type="text"
                  placeholder="e.g. Kicukiro, Sonatubes"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">National ID / TIN Number</label>
                <input
                  type="text"
                  placeholder="1199... or 100..."
                  value={newCustomer.id_number}
                  onChange={(e) => setNewCustomer({ ...newCustomer, id_number: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
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
                  {isSubmitting ? 'Registering...' : 'Register Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
