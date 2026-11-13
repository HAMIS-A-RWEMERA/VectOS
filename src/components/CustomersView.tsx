import React, { useState, useEffect, useMemo } from 'react';
import { Customer, Shop, User } from '../types';
import { api } from '../services/api';
import { hasPermission } from '../utils/permissions';
import { CustomerStatementModal } from './CustomerStatementModal';
import {
  Users,
  Plus,
  Search,
  CreditCard,
  Wallet,
  FileText,
  Trophy,
  Repeat,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';

interface CustomersViewProps {
  user: User | null;
  shop?: Shop | null;
  onLedgerUpdated?: () => void;
}

type CustomerSortOption = 'debt' | 'top_spent' | 'most_orders' | 'store_credit' | 'name';

export const CustomersView: React.FC<CustomersViewProps> = ({ user, shop = null, onLedgerUpdated }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<CustomerSortOption>('debt');

  // Add Customer Modal
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

  // Statement Modal
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);

  // Bulk Debt Settlement Modal
  const [bulkCustomer, setBulkCustomer] = useState<Customer | null>(null);
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkMethod, setBulkMethod] = useState<'cash' | 'momo' | 'bank_transfer'>('cash');
  const [bulkRef, setBulkRef] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [excessToCredit, setExcessToCredit] = useState(true);
  const [bulkError, setBulkError] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResultBanner, setBulkResultBanner] = useState<string | null>(null);

  // Store Credit (We Owe Client) Modal
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [creditAction, setCreditAction] = useState<'add' | 'payout'>('add');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditMethod, setCreditMethod] = useState<'cash' | 'momo' | 'bank_transfer'>('cash');
  const [creditRef, setCreditRef] = useState('');
  const [creditNotes, setCreditNotes] = useState('');
  const [creditError, setCreditError] = useState('');
  const [creditSubmitting, setCreditSubmitting] = useState(false);

  const canManageCustomers = hasPermission(user, 'can_manage_customers');
  const canProcessPayments = hasPermission(user, 'can_process_payments');

  useEffect(() => {
    if (user) {
      fetchCustomers();
    }
  }, [user, sortBy]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.getCustomers('', sortBy);
      setCustomers(res.customers || []);
    } catch (err: any) {
      if (err?.message?.includes('log in') || err?.message?.includes('Authentication Required')) {
        return;
      }
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
      onLedgerUpdated?.();
    } catch (err: any) {
      setModalError(err.message || 'Failed to register customer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openBulkSettleModal = (c: Customer) => {
    setBulkCustomer(c);
    setBulkAmount(c.credit_balance > 0 ? String(Math.round(c.credit_balance)) : '');
    setBulkMethod('cash');
    setBulkRef('');
    setBulkNotes('');
    setExcessToCredit(true);
    setBulkError('');
  };

  const handleBulkSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkCustomer) return;
    const amt = Number(bulkAmount);
    if (isNaN(amt) || amt <= 0) {
      setBulkError('Please enter a valid payment amount greater than 0.');
      return;
    }

    try {
      setBulkSubmitting(true);
      setBulkError('');
      const res = await api.settleCustomerDebt(bulkCustomer.id, {
        amount: amt,
        payment_method: bulkMethod,
        reference_no: bulkRef,
        notes: bulkNotes,
        excess_to_store_credit: excessToCredit,
      });
      setBulkCustomer(null);
      setBulkResultBanner(res.message);
      setTimeout(() => setBulkResultBanner(null), 8000);
      await fetchCustomers();
      onLedgerUpdated?.();
    } catch (err: any) {
      setBulkError(err.message || 'Failed to process bulk debt settlement.');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const openStoreCreditModal = (c: Customer) => {
    setCreditCustomer(c);
    setCreditAction('add');
    setCreditAmount('');
    setCreditMethod('cash');
    setCreditRef('');
    setCreditNotes('');
    setCreditError('');
  };

  const handleStoreCreditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditCustomer) return;
    const amt = Number(creditAmount);
    if (isNaN(amt) || amt <= 0) {
      setCreditError('Please enter a valid amount greater than 0.');
      return;
    }

    try {
      setCreditSubmitting(true);
      setCreditError('');
      const res = await api.adjustCustomerStoreCredit(creditCustomer.id, {
        action: creditAction,
        amount: amt,
        payment_method: creditMethod,
        reference_no: creditRef,
        notes: creditNotes,
      });
      setCreditCustomer(null);
      setBulkResultBanner(res.message);
      setTimeout(() => setBulkResultBanner(null), 8000);
      await fetchCustomers();
      onLedgerUpdated?.();
    } catch (err: any) {
      setCreditError(err.message || 'Failed to update store credit.');
    } finally {
      setCreditSubmitting(false);
    }
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.id_number && c.id_number.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  const totalOutstandingReceivables = customers.reduce((acc, c) => acc + Number(c.credit_balance || 0), 0);
  const totalStoreCreditOwed = customers.reduce((acc, c) => acc + Number(c.store_credit || 0), 0);

  const topRevenueClient = useMemo(() => {
    return [...customers]
      .filter((c) => Number(c.total_spent || 0) > 0)
      .sort((a, b) => Number(b.total_spent || 0) - Number(a.total_spent || 0))[0] || null;
  }, [customers]);

  const mostFrequentClient = useMemo(() => {
    return [...customers]
      .filter((c) => Number(c.order_count || 0) > 0)
      .sort((a, b) => Number(b.order_count || 0) - Number(a.order_count || 0))[0] || null;
  }, [customers]);

  const numericBulkAmt = Number(bulkAmount) || 0;
  const bulkCurrentDebt = Number(bulkCustomer?.credit_balance || 0);
  const previewRemainingDebt = Math.max(0, bulkCurrentDebt - numericBulkAmt);
  const previewExcessCredit = numericBulkAmt > bulkCurrentDebt ? numericBulkAmt - bulkCurrentDebt : 0;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Customers, Ledgers & Top Buyers
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {customers.length} Customers
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Print finance-ready account statements, settle multi-receipt debts in one payment, track credit we owe clients, and spot top buyers.
          </p>
        </div>

        {canManageCustomers && (
          <button
            type="button"
            onClick={() => {
              setModalError('');
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Customer</span>
          </button>
        )}
      </div>

      {/* Confirmation Banner */}
      {bulkResultBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{bulkResultBanner}</span>
          </div>
          <button type="button" onClick={() => setBulkResultBanner(null)} className="text-emerald-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPI + Biggest Clients Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Debt Owed to Us</span>
          <p className="text-xl font-black text-rose-400 font-mono mt-1">{formatRwf(totalOutstandingReceivables)}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Across {customers.filter((c) => Number(c.credit_balance || 0) > 0).length} account(s)
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Store Credit We Owe Clients</span>
          <p className="text-xl font-black text-purple-300 font-mono mt-1">{formatRwf(totalStoreCreditOwed)}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Deductible on client's next POS order
          </p>
        </div>

        <div
          onClick={() => setSortBy('top_spent')}
          className="p-4 rounded-2xl bg-[#121620] border border-amber-500/30 cursor-pointer hover:bg-[#161b28] transition"
          title="Click to rank customers by highest total spending"
        >
          <span className="text-[11px] font-semibold text-amber-400 uppercase flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> Highest Revenue Client
          </span>
          {topRevenueClient ? (
            <>
              <p className="text-sm font-black text-white mt-1 truncate">{topRevenueClient.name}</p>
              <p className="text-xs font-mono font-bold text-emerald-400 mt-0.5">
                {formatRwf(Number(topRevenueClient.total_spent || 0))} ({topRevenueClient.order_count || 0} orders)
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-400 mt-2">No orders recorded yet</p>
          )}
        </div>

        <div
          onClick={() => setSortBy('most_orders')}
          className="p-4 rounded-2xl bg-[#121620] border border-sky-500/30 cursor-pointer hover:bg-[#161b28] transition"
          title="Click to rank customers by most frequent orders"
        >
          <span className="text-[11px] font-semibold text-sky-400 uppercase flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5" /> Most Frequent Buyer
          </span>
          {mostFrequentClient ? (
            <>
              <p className="text-sm font-black text-white mt-1 truncate">{mostFrequentClient.name}</p>
              <p className="text-xs font-mono font-bold text-sky-300 mt-0.5">
                {mostFrequentClient.order_count || 0} order(s) • {formatRwf(Number(mostFrequentClient.total_spent || 0))}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-400 mt-2">No orders recorded yet</p>
          )}
        </div>
      </div>

      {/* Search & Ranking Controls */}
      <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by client name, mobile phone (078...), or National ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 mr-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" /> Rank by:
            </span>
            {[
              { id: 'debt', label: 'Highest Debt' },
              { id: 'top_spent', label: 'Top Revenue' },
              { id: 'most_orders', label: 'Most Frequent' },
              { id: 'store_credit', label: 'We Owe Credit' },
              { id: 'name', label: 'Name A–Z' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortBy(opt.id as CustomerSortOption)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  sortBy === opt.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Customers Table (Desktop) & Card List (Mobile) */}
      <div className="rounded-2xl bg-[#121620] border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-400">Loading customer accounts...</div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Customer / Contractor</th>
                    <th className="py-3 px-4 font-semibold">Phone & ID</th>
                    <th className="py-3 px-4 font-semibold text-right">Orders & Revenue</th>
                    <th className="py-3 px-4 font-semibold text-right">Debt Owed to Us</th>
                    <th className="py-3 px-4 font-semibold text-right">We Owe Client</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCustomers.map((c) => {
                    const isTopSpender = topRevenueClient && topRevenueClient.id === c.id;
                    const isMostFreq = mostFrequentClient && mostFrequentClient.id === c.id;
                    const storeCredit = Number(c.store_credit || 0);
                    return (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-white text-sm">{c.name}</p>
                            {isTopSpender && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                                Top Spender
                              </span>
                            )}
                            {isMostFreq && (
                              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold border border-sky-500/30">
                                Most Frequent
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {c.address || 'Kigali, Rwanda'} {c.email ? `• ${c.email}` : ''}
                          </p>
                        </td>

                        <td className="py-3 px-4">
                          <p className="font-mono text-amber-400">{c.phone || '—'}</p>
                          {c.id_number && <p className="text-[10px] font-mono text-slate-400">ID: {c.id_number}</p>}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <p className="font-mono font-bold text-white">{formatRwf(Number(c.total_spent || 0))}</p>
                          <p className="text-[10px] font-mono text-slate-400">{c.order_count || 0} order(s)</p>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {Number(c.credit_balance || 0) > 0 ? (
                            <span className="font-mono font-bold text-rose-400">
                              {formatRwf(c.credit_balance)}
                            </span>
                          ) : (
                            <span className="font-mono text-emerald-400 font-semibold">
                              0 RWF
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {storeCredit > 0 ? (
                            <span className="font-mono font-bold text-purple-300">
                              {formatRwf(storeCredit)}
                            </span>
                          ) : (
                            <span className="font-mono text-slate-500">0 RWF</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setStatementCustomer(c)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold flex items-center gap-1 transition"
                              title="View & print transaction statement for client finance department"
                            >
                              <FileText className="w-3.5 h-3.5 text-amber-400" />
                              <span>Statement</span>
                            </button>

                            {canProcessPayments && Number(c.credit_balance || 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => openBulkSettleModal(c)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold flex items-center gap-1 transition"
                                title="Pay one lump sum to settle multiple unpaid receipts"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Settle Debt</span>
                              </button>
                            )}

                            {canProcessPayments && (
                              <button
                                type="button"
                                onClick={() => openStoreCreditModal(c)}
                                className="px-2.5 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[11px] font-bold flex items-center gap-1 transition"
                                title="Record or refund money owed to this client"
                              >
                                <Wallet className="w-3.5 h-3.5" />
                                <span>Credit</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-800/80">
              {filteredCustomers.map((c) => {
                const storeCredit = Number(c.store_credit || 0);
                return (
                  <div key={c.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-white text-sm">{c.name}</p>
                        <p className="text-[11px] font-mono text-amber-400">{c.phone || 'No phone'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono font-bold text-white">{formatRwf(Number(c.total_spent || 0))}</p>
                        <p className="text-[10px] text-slate-400">{c.order_count || 0} order(s)</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Debt Owed to Us</span>
                        <span className={`font-mono font-bold ${Number(c.credit_balance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {formatRwf(Number(c.credit_balance || 0))}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">We Owe Client</span>
                        <span className={`font-mono font-bold ${storeCredit > 0 ? 'text-purple-300' : 'text-slate-500'}`}>
                          {formatRwf(storeCredit)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setStatementCustomer(c)}
                        className="flex-1 py-2 px-3 rounded-xl bg-slate-800 text-slate-100 border border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5 text-amber-400" /> Statement / Print
                      </button>

                      {canProcessPayments && Number(c.credit_balance || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => openBulkSettleModal(c)}
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <CreditCard className="w-3.5 h-3.5" /> Settle Debt
                        </button>
                      )}

                      {canProcessPayments && (
                        <button
                          type="button"
                          onClick={() => openStoreCreditModal(c)}
                          className="py-2 px-3 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <Wallet className="w-3.5 h-3.5" /> Credit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredCustomers.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs">
                <Users className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className="font-semibold text-slate-300">No matching customers found</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Register New Customer / Contractor</h3>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
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

      {/* Bulk Multi-Receipt Debt Settlement Modal */}
      {bulkCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Bulk Debt Settlement</h3>
                <p className="text-[11px] text-slate-400">
                  Settle oldest unpaid receipts automatically for {bulkCustomer.name}
                </p>
              </div>
              <button type="button" onClick={() => setBulkCustomer(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400">Combined Unpaid Debt</span>
                <p className="text-lg font-black text-rose-400 font-mono">{formatRwf(bulkCurrentDebt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setBulkAmount(String(Math.round(bulkCurrentDebt)))}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold hover:bg-amber-500/30"
              >
                Pay Full Debt
              </button>
            </div>

            <form onSubmit={handleBulkSettleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Amount Paid Now (RWF) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 170000"
                  value={bulkAmount}
                  onChange={(e) => setBulkAmount(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {numericBulkAmt > 0 && (
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Applied to Unpaid Orders:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {formatRwf(Math.min(numericBulkAmt, bulkCurrentDebt))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">New Remaining Debt:</span>
                    <span className={`font-mono font-bold ${previewRemainingDebt > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                      {formatRwf(previewRemainingDebt)}
                    </span>
                  </div>
                  {previewExcessCredit > 0 && (
                    <div className="flex justify-between text-purple-300 pt-1 border-t border-slate-800">
                      <span>Excess Added to Store Credit:</span>
                      <span className="font-mono font-bold">{formatRwf(previewExcessCredit)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Payment Method</label>
                  <select
                    value={bulkMethod}
                    onChange={(e) => setBulkMethod(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="cash">Cash (RWF)</option>
                    <option value="momo">MTN MoMo</option>
                    <option value="bank_transfer">Bank Transfer / Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Receipt / Slip Ref</label>
                  <input
                    type="text"
                    placeholder="e.g. MOMO-9812"
                    value={bulkRef}
                    onChange={(e) => setBulkRef(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Partial settlement for last 2 weeks invoices"
                  value={bulkNotes}
                  onChange={(e) => setBulkNotes(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {previewExcessCredit > 0 && (
                <label className="flex items-center gap-2 text-xs text-purple-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excessToCredit}
                    onChange={(e) => setExcessToCredit(e.target.checked)}
                    className="rounded accent-purple-500"
                  />
                  <span>Keep excess ({formatRwf(previewExcessCredit)}) as Store Credit we owe client</span>
                </label>
              )}

              {bulkError && (
                <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setBulkCustomer(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20"
                >
                  {bulkSubmitting ? 'Settling...' : 'Confirm Bulk Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Store Credit (Money We Owe Client) Modal */}
      {creditCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Store Credit (Money We Owe Client)</h3>
                <p className="text-[11px] text-slate-400">{creditCustomer.name}</p>
              </div>
              <button type="button" onClick={() => setCreditCustomer(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-200">Current Store Credit Owed:</span>
              <span className="text-lg font-black text-purple-300 font-mono">
                {formatRwf(Number(creditCustomer.store_credit || 0))}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCreditAction('add')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                  creditAction === 'add'
                    ? 'bg-purple-500/25 border-purple-400 text-purple-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                + Record Credit We Owe
              </button>
              <button
                type="button"
                onClick={() => setCreditAction('payout')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                  creditAction === 'payout'
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                − Refund / Pay Cash Back
              </button>
            </div>

            <form onSubmit={handleStoreCreditSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Amount (RWF) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 50000"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono font-bold text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Method</label>
                  <select
                    value={creditMethod}
                    onChange={(e) => setCreditMethod(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                  >
                    <option value="cash">Cash (RWF)</option>
                    <option value="momo">MTN MoMo</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Reference (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Advance / Return"
                    value={creditRef}
                    onChange={(e) => setCreditRef(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Reason / Notes</label>
                <input
                  type="text"
                  placeholder={creditAction === 'add' ? 'e.g. Advance deposit or returned materials' : 'e.g. Paid cash refund to client'}
                  value={creditNotes}
                  onChange={(e) => setCreditNotes(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                />
              </div>

              {creditError && (
                <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{creditError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreditCustomer(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creditSubmitting}
                  className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs shadow-md"
                >
                  {creditSubmitting ? 'Saving...' : creditAction === 'add' ? 'Record Store Credit' : 'Confirm Cash Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Statement & Printable Report Modal */}
      {statementCustomer && (
        <CustomerStatementModal
          customer={statementCustomer}
          shop={shop}
          user={user}
          canProcessPayments={canProcessPayments}
          onClose={() => setStatementCustomer(null)}
          onOpenBulkSettle={(c) => {
            setStatementCustomer(null);
            openBulkSettleModal(c);
          }}
          onOpenStoreCredit={(c) => {
            setStatementCustomer(null);
            openStoreCreditModal(c);
          }}
        />
      )}
    </div>
  );
};
