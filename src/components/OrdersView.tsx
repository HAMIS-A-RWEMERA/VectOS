import React, { useState, useEffect } from 'react';
import { Order, User, Shop } from '../types';
import { api } from '../services/api';
import { 
  FileText, 
  Search, 
  Filter, 
  Printer, 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Truck, 
  DollarSign, 
  Eye, 
  AlertCircle,
  Smartphone,
  Building,
  Plus
} from 'lucide-react';

interface OrdersViewProps {
  user: User | null;
  shop: Shop | null;
  onPrintReceipt: (order: Order) => void;
  initialSelectedOrderId?: number | null;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  user,
  shop,
  onPrintReceipt,
  initialSelectedOrderId
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected Order for drawer/detail
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [orderPayments, setOrderPayments] = useState<any[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Payment Recording Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'cash' | 'momo' | 'bank_transfer'>('momo');
  const [payRef, setPayRef] = useState('');
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canProcessPayments = user?.role === 'accountant' || user?.role === 'manager' || user?.role === 'superadmin' || user?.can_process_payments;
  const canReleaseStock = user?.role === 'storekeeper' || user?.role === 'manager' || user?.role === 'superadmin' || user?.can_release_stock;

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  useEffect(() => {
    if (initialSelectedOrderId && orders.length > 0) {
      handleViewOrder(initialSelectedOrderId);
    }
  }, [initialSelectedOrderId, orders]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await api.getOrders(statusFilter);
      setOrders(res.orders || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewOrder = async (orderId: number) => {
    try {
      const res = await api.getOrderDetail(orderId);
      setSelectedOrder(res.order);
      setOrderItems(res.items || []);
      setOrderPayments(res.payments || []);
      setIsDetailOpen(true);
    } catch (err) {
      console.error('Error loading order detail:', err);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedOrder) return;
    try {
      setIsSubmitting(true);
      await api.updateOrderStatus(selectedOrder.id, newStatus);
      handleViewOrder(selectedOrder.id);
      fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Failed to update order status');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const amountNum = Number(payAmount) || 0;
    if (amountNum <= 0) {
      setModalError('Please specify a positive payment amount.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError('');
      await api.recordPayment(selectedOrder.id, {
        amount: amountNum,
        payment_method: payMethod,
        reference_no: payRef
      });
      setIsPaymentModalOpen(false);
      handleViewOrder(selectedOrder.id);
      fetchOrders();
    } catch (err: any) {
      setModalError(err.message || 'Payment recording failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  const filteredOrders = orders.filter((ord) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      ord.order_number.toLowerCase().includes(q) ||
      (ord.customer_name && ord.customer_name.toLowerCase().includes(q)) ||
      (ord.customer_phone && ord.customer_phone.includes(q))
    );
  });

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Orders, Invoices & Dispatch
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {orders.length} Records
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Complete lifecycle management: POS counter orders, warehouse approvals, and credit settlements.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search orders by Order Number (e.g. ORD-...), Customer Name, or Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto text-xs">
            {[
              { id: 'all', label: 'All' },
              { id: 'pending_store', label: 'Store Verification' },
              { id: 'approved', label: 'Approved' },
              { id: 'dispatched', label: 'Dispatched' },
              { id: 'completed', label: 'Completed' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-medium transition ${
                  statusFilter === tab.id
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl bg-[#121620] border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Order Number</th>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Customer Details</th>
                <th className="py-3 px-4 font-semibold">Total Cost</th>
                <th className="py-3 px-4 font-semibold">Paid / Debt</th>
                <th className="py-3 px-4 font-semibold">Payment</th>
                <th className="py-3 px-4 font-semibold">Fulfillment Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredOrders.map((ord) => (
                <tr key={ord.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-mono font-bold text-amber-400">{ord.order_number}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono">
                    {new Date(ord.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-200">{ord.customer_name || 'Walk-in Cash Client'}</p>
                    {ord.customer_phone && <p className="text-[10px] text-slate-400 font-mono">{ord.customer_phone}</p>}
                  </td>
                  <td className="py-3 px-4 font-bold text-white font-mono">{formatRwf(ord.total_amount)}</td>
                  <td className="py-3 px-4">
                    <p className="text-emerald-400 font-mono font-semibold">{formatRwf(ord.paid_amount)}</p>
                    {ord.debt_amount > 0 && (
                      <p className="text-rose-400 font-mono text-[10px]">Due: {formatRwf(ord.debt_amount)}</p>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      ord.payment_status === 'paid'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : ord.payment_status === 'partial'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {ord.payment_status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-medium text-slate-300 capitalize">
                      {ord.fulfillment_status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleViewOrder(ord.id)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-[11px] font-semibold border border-slate-700 transition"
                      >
                        Inspect
                      </button>
                      <button
                        onClick={() => onPrintReceipt(ord)}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                        title="Print Official Receipt / Delivery Note"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-300">No orders found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Drawer Modal */}
      {isDetailOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-end">
          <div className="w-full max-w-2xl bg-[#141923] border-l border-slate-700 h-full p-6 overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] uppercase font-mono tracking-wider text-slate-400">
                  Order Inspection Dossier
                </span>
                <h2 className="text-xl font-bold text-white font-mono mt-0.5">
                  {selectedOrder.order_number}
                </h2>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Status & Quick Action Pipeline */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Current Fulfillment State:</span>
                <span className="font-bold text-amber-400 uppercase tracking-wider font-mono">
                  {selectedOrder.fulfillment_status.replace('_', ' ')}
                </span>
              </div>

              {/* Status Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
                {selectedOrder.fulfillment_status === 'pending_store' && canReleaseStock && (
                  <button
                    onClick={() => handleUpdateStatus('approved')}
                    disabled={isSubmitting}
                    className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow transition flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve Store Release</span>
                  </button>
                )}

                {selectedOrder.fulfillment_status === 'approved' && canReleaseStock && (
                  <button
                    onClick={() => handleUpdateStatus('dispatched')}
                    disabled={isSubmitting}
                    className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow transition flex items-center justify-center gap-1.5"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Mark as Dispatched</span>
                  </button>
                )}

                {selectedOrder.fulfillment_status === 'dispatched' && (
                  <button
                    onClick={() => handleUpdateStatus('completed')}
                    disabled={isSubmitting}
                    className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow transition flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mark Order Completed</span>
                  </button>
                )}

                <button
                  onClick={() => onPrintReceipt(selectedOrder)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  <span>Print Receipt / Waybill</span>
                </button>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Amount</p>
                <p className="text-sm font-bold text-white font-mono mt-1">
                  {formatRwf(selectedOrder.total_amount)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Paid So Far</p>
                <p className="text-sm font-bold text-emerald-400 font-mono mt-1">
                  {formatRwf(selectedOrder.paid_amount)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Debt Outstanding</p>
                <p className="text-sm font-bold text-rose-400 font-mono mt-1">
                  {formatRwf(selectedOrder.debt_amount)}
                </p>
              </div>
            </div>

            {/* Customer Details */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Client Profile</p>
              <div className="flex justify-between text-slate-300">
                <span>Name:</span>
                <strong className="text-white">{selectedOrder.customer_name || 'Walk-in Cash Client'}</strong>
              </div>
              {selectedOrder.customer_phone && (
                <div className="flex justify-between text-slate-300">
                  <span>Telephone:</span>
                  <span className="font-mono text-amber-400">{selectedOrder.customer_phone}</span>
                </div>
              )}
              {selectedOrder.notes && (
                <div className="pt-2 border-t border-slate-800 text-slate-400 italic">
                  Notes: {selectedOrder.notes}
                </div>
              )}
            </div>

            {/* Order Items Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Ordered Hardware Items</h3>
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Item Name</th>
                      <th className="p-2.5">Qty</th>
                      <th className="p-2.5">Price</th>
                      <th className="p-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {orderItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5">
                          <p className="font-bold text-slate-200">{item.product_name || `Item #${item.product_id}`}</p>
                          <p className="text-[10px] text-slate-400 font-mono">SKU: {item.product_sku}</p>
                        </td>
                        <td className="p-2.5 font-mono">{item.quantity} {item.product_unit || 'pcs'}</td>
                        <td className="p-2.5 font-mono">{formatRwf(item.selling_price)}</td>
                        <td className="p-2.5 font-mono font-bold text-amber-400 text-right">
                          {formatRwf(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Transactions & Record Payment Button */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Payment Log</h3>
                {selectedOrder.debt_amount > 0 && canProcessPayments && (
                  <button
                    onClick={() => {
                      setPayAmount(String(selectedOrder.debt_amount));
                      setPayRef('');
                      setModalError('');
                      setIsPaymentModalOpen(true);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-amber-400 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Record Settlement
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {orderPayments.map((p) => (
                  <div key={p.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-200 uppercase font-mono">
                        {p.payment_method === 'momo' ? 'MTN MoMo' : p.payment_method.replace('_', ' ')}
                      </span>
                      {p.reference_no && (
                        <p className="text-[10px] text-slate-400 font-mono">Ref: {p.reference_no}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-400">{formatRwf(p.amount)}</span>
                      <p className="text-[10px] text-slate-400">{new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}

                {orderPayments.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3">No payments logged yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Settlement Modal */}
      {isPaymentModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Record Payment for {selectedOrder.order_number}</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Payment Amount (RWF)</label>
                <input
                  type="number"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Payment Channel</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="momo">MTN Mobile Money</option>
                  <option value="cash">Cash (RWF)</option>
                  <option value="bank_transfer">Bank Transfer (BK / I&M / Equity)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Transaction ID / SMS Reference</label>
                <input
                  type="text"
                  placeholder="e.g. TXN4820921"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {modalError && <p className="text-xs text-rose-400 font-semibold">{modalError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? 'Recording...' : 'Confirm Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
