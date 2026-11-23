import React, { useState, useEffect, useRef } from 'react';
import { Order, User, Shop } from '../types';
import { api } from '../services/api';
import { exportOrdersPdf, exportSingleOrderPdf } from '../services/pdfExport';
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
  Plus,
  Download,
  Edit3,
  Ban,
  X,
  Camera,
  ZoomIn,
  ZoomOut,
  RotateCw
} from 'lucide-react';
import { EditOrderModal } from './EditOrderModal';
import { hasPermission } from '../utils/permissions';
import { matchesSearch } from '../utils/searchMatch';
import { useLanguage } from '../i18n/LanguageContext';

interface OrdersViewProps {
  user: User | null;
  shop: Shop | null;
  onPrintReceipt: (order: Order) => void;
  initialSelectedOrderId?: number | null;
  initialEditOrderId?: number | null;
  refreshTrigger?: number;
  onOrderUpdatedExternal?: (updated: Order) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  user,
  shop,
  onPrintReceipt,
  initialSelectedOrderId,
  initialEditOrderId,
  refreshTrigger = 0,
  onOrderUpdatedExternal,
}) => {
  const { tf, trPaymentStatus, trFulfillmentStatus } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'all'>('month');
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

  // Edit Receipt / Order modal state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Selective Stock Release Checklist (item_id -> { checked: boolean, releaseQty: number })
  const [releaseSelection, setReleaseSelection] = useState<Record<number, { checked: boolean; releaseQty: number }>>({});
  const [isReleasingItems, setIsReleasingItems] = useState(false);
  const [isReleaseConfirmOpen, setIsReleaseConfirmOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const handledInitialOrderRef = useRef<number | null>(null);
  const handledInitialEditRef = useRef<number | null>(null);

  // Order Photo Viewer Modal State
  const [photoModalOrder, setPhotoModalOrder] = useState<Order | null>(null);
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);
  const [photoModalLoading, setPhotoModalLoading] = useState(false);
  const [photoModalError, setPhotoModalError] = useState('');
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoRotate, setPhotoRotate] = useState(0);

  const openPhotoViewer = async (order: Order) => {
    setPhotoModalOrder(order);
    setPhotoModalUrl(null);
    setPhotoModalError('');
    setPhotoZoom(1);
    setPhotoRotate(0);

    if (!order.handwritten_photo_key) {
      setPhotoModalError(
        tf('No photo is attached to this order.', 'Nta foto yometse kuri iyi komande.')
      );
      return;
    }

    try {
      setPhotoModalLoading(true);
      const res = await api.getOrderPhotoViewUrl(order.id);
      setPhotoModalUrl(res.viewUrl);
    } catch (err: any) {
      setPhotoModalError(
        err?.message || tf('Unable to load order photo.', 'Ntibyakunze gufungura ifoto ya komande.')
      );
    } finally {
      setPhotoModalLoading(false);
    }
  };

  const handleOrderUpdated = (updated: Order) => {
    setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
    if (selectedOrder && selectedOrder.id === updated.id) {
      setSelectedOrder({
        ...selectedOrder,
        ...updated,
        items: updated.items || selectedOrder.items || []
      });
      if (updated.items && updated.items.length > 0) {
        setOrderItems(updated.items);
        const newSel: Record<number, { checked: boolean; releaseQty: number }> = {};
        updated.items.forEach((it: any) => {
          newSel[it.id] = { checked: true, releaseQty: it.quantity };
        });
        setReleaseSelection(newSel);
      } else {
        handleViewOrder(updated.id);
      }
    }
    setEditingOrder(null);
    setActionFeedback({ type: 'success', message: `Order #${updated.order_number} & receipt updated.` });
    if (onOrderUpdatedExternal) onOrderUpdatedExternal(updated);
    fetchOrders();
  };

  const handleToggleReleaseItem = (itemId: number) => {
    if (!canReleaseStock || selectedOrder?.fulfillment_status === 'cancelled') return;
    setReleaseSelection(prev => {
      const current = prev[itemId] || { checked: true, releaseQty: 1 };
      return {
        ...prev,
        [itemId]: {
          ...current,
          checked: !current.checked
        }
      };
    });
  };

  const handleReleaseQtyChange = (itemId: number, maxQty: number, newQty: number) => {
    const clamped = Math.max(1, Math.min(maxQty, newQty));
    setReleaseSelection(prev => {
      const current = prev[itemId] || { checked: true, releaseQty: maxQty };
      return {
        ...prev,
        [itemId]: {
          ...current,
          releaseQty: clamped
        }
      };
    });
  };

  const handleSelectAllRelease = (checkAll: boolean) => {
    const updated: Record<number, { checked: boolean; releaseQty: number }> = {};
    orderItems.forEach((it: any) => {
      updated[it.id] = { checked: checkAll, releaseQty: it.quantity };
    });
    setReleaseSelection(updated);
  };

  const executeSelectiveRelease = async (updateReceipt: boolean = true) => {
    if (!selectedOrder) return;
    const checkedItems = orderItems.filter(it => releaseSelection[it.id]?.checked);
    if (checkedItems.length === 0) {
      setActionFeedback({ type: 'error', message: 'Please check at least one product to release from stock.' });
      return;
    }

    try {
      setIsReleasingItems(true);
      setActionFeedback(null);
      const payloadItems = checkedItems.map(it => ({
        order_item_id: it.id,
        product_id: it.product_id,
        quantity_released: releaseSelection[it.id]?.releaseQty || it.quantity
      }));

      const res = await api.releaseOrderItems(selectedOrder.id, {
        released_items: payloadItems,
        update_receipt: updateReceipt,
        fulfillment_status: 'approved'
      });

      setIsReleaseConfirmOpen(false);
      if (res && res.order) {
        handleOrderUpdated(res.order);
        setActionFeedback({ type: 'success', message: res.message || 'Stock released and receipt updated successfully!' });
      }
    } catch (err: any) {
      console.error('Selective release error:', err);
      setIsReleaseConfirmOpen(false);
      setActionFeedback({ type: 'error', message: err.message || 'Failed to release stock' });
    } finally {
      setIsReleasingItems(false);
    }
  };

  const handleExecuteSelectiveRelease = async (updateReceipt: boolean = true) => {
    if (!selectedOrder) return;

    const checkedItems = orderItems.filter(it => releaseSelection[it.id]?.checked);
    if (checkedItems.length === 0) {
      setActionFeedback({ type: 'error', message: 'Please check at least one product to release from stock.' });
      return;
    }

    const uncheckedCount = orderItems.length - checkedItems.length;
    const hasPartial = checkedItems.some(it => (releaseSelection[it.id]?.releaseQty || it.quantity) < it.quantity);

    if (uncheckedCount > 0 || hasPartial) {
      setIsReleaseConfirmOpen(true);
      return;
    }

    await executeSelectiveRelease(updateReceipt);
  };

  const canCreateOrders = hasPermission(user, 'can_create_orders');
  const canProcessPayments = hasPermission(user, 'can_process_payments');
  const canReleaseStock = hasPermission(user, 'can_release_stock');
  const canPrintReceipt = hasPermission(user, 'can_print_full_receipt');
  const canPrintDeliveryNote = hasPermission(user, 'can_print_delivery_note');
  const canVoidOrders = hasPermission(user, 'can_void_orders');
  const canEditAnyOrder = canCreateOrders || canProcessPayments;

  useEffect(() => {
    if (user) {
      fetchOrders();
      if (isDetailOpen && selectedOrder) {
        handleViewOrder(selectedOrder.id);
      }
    }
  }, [user, period, refreshTrigger]);

  useEffect(() => {
    if (initialSelectedOrderId && handledInitialOrderRef.current !== initialSelectedOrderId) {
      handledInitialOrderRef.current = initialSelectedOrderId;
      handleViewOrder(initialSelectedOrderId);
    }
  }, [initialSelectedOrderId]);

  useEffect(() => {
    if (initialEditOrderId && handledInitialEditRef.current !== initialEditOrderId) {
      handledInitialEditRef.current = initialEditOrderId;
      if (canEditAnyOrder) {
        api.getOrderDetail(initialEditOrderId).then(res => {
          if (res && res.order && res.order.fulfillment_status !== 'cancelled') {
            setEditingOrder({ ...res.order, items: res.items || [] });
          }
        }).catch(err => console.error('Auto-edit load error:', err));
      }
    }
  }, [initialEditOrderId, canEditAnyOrder]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await api.getOrders({
        status: 'all',
        period,
        limit: 1000
      });
      setOrders(res.orders || []);
    } catch (err: any) {
      if (err?.message?.includes('log in') || err?.message?.includes('Authentication Required')) {
        return;
      }
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPeriodLabel = (p: string) => {
    switch (p) {
      case 'day': return tf('Daily (Today)', 'Uyu Munsi');
      case 'week': return tf('Weekly (Past 7 Days)', 'Icyumweru (Iminsi 7)');
      case 'month': return tf('Monthly (Past 30 Days)', 'Ukwezi (Iminsi 30)');
      default: return tf('All Time', 'Igihe Cyose');
    }
  };

  const handleExportOrdersPdf = () => {
    if (orders.length === 0) {
      setActionFeedback({ type: 'error', message: 'No orders found in this timeframe to export.' });
      return;
    }
    exportOrdersPdf({
      orders: filteredOrders,
      period,
      periodLabel: getPeriodLabel(period),
      statusFilter,
      shop,
      user,
    });
  };

  const handleViewOrder = async (orderId: number) => {
    try {
      setActionFeedback(null);
      const res = await api.getOrderDetail(orderId);
      const fullOrder = {
        ...res.order,
        items: res.items || []
      };
      setSelectedOrder(fullOrder);
      setOrderItems(res.items || []);
      setOrderPayments(res.payments || []);

      const initialSelection: Record<number, { checked: boolean; releaseQty: number }> = {};
      (res.items || []).forEach((it: any) => {
        initialSelection[it.id] = { checked: true, releaseQty: it.quantity };
      });
      setReleaseSelection(initialSelection);

      setIsDetailOpen(true);
    } catch (err) {
      console.error('Error loading order detail:', err);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedOrder) return;
    try {
      setIsSubmitting(true);
      setActionFeedback(null);
      await api.updateOrderStatus(selectedOrder.id, newStatus);
      await handleViewOrder(selectedOrder.id);
      fetchOrders();
      setActionFeedback({ type: 'success', message: `Order #${selectedOrder.order_number} marked as ${newStatus.replace('_', ' ')}.` });
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Failed to update order status' });
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

  const handleVoidOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      setIsVoiding(true);
      setActionFeedback(null);
      const res = await api.voidOrder(selectedOrder.id, voidReason.trim());
      setIsVoidModalOpen(false);
      setVoidReason('');
      if (res && res.order) {
        handleOrderUpdated(res.order);
        setActionFeedback({ type: 'success', message: res.message || `Order #${selectedOrder.order_number} cancelled and stock restored.` });
      }
    } catch (err: any) {
      setIsVoidModalOpen(false);
      setActionFeedback({ type: 'error', message: err.message || 'Failed to cancel order.' });
    } finally {
      setIsVoiding(false);
    }
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  const queueCounts = {
    all: orders.length,
    waiting_payment: orders.filter(o => Number(o.debt_amount || 0) > 0 && o.fulfillment_status !== 'cancelled').length,
    pending_store: orders.filter(o => o.fulfillment_status === 'pending_store').length,
    released: orders.filter(o => o.fulfillment_status === 'approved' || o.fulfillment_status === 'dispatched').length,
    completed: orders.filter(o => o.fulfillment_status === 'completed').length,
    cancelled: orders.filter(o => o.fulfillment_status === 'cancelled').length,
  };

  const filteredOrders = orders.filter((ord) => {
    if (statusFilter === 'waiting_payment' && !(Number(ord.debt_amount || 0) > 0 && ord.fulfillment_status !== 'cancelled')) return false;
    if (statusFilter === 'pending_store' && ord.fulfillment_status !== 'pending_store') return false;
    if (statusFilter === 'released' && !(ord.fulfillment_status === 'approved' || ord.fulfillment_status === 'dispatched')) return false;
    if (statusFilter === 'completed' && ord.fulfillment_status !== 'completed') return false;
    if (statusFilter === 'cancelled' && ord.fulfillment_status !== 'cancelled') return false;

    return matchesSearch(
      searchQuery,
      ord.order_number,
      ord.customer_name,
      ord.customer_phone,
      ord.notes,
      ord.payment_method
    );
  });

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              {tf('Orders & Receipts', "Amategeko n'Inyemezabuguzi")}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {filteredOrders.length} {tf('Orders', 'Amategeko')} ({getPeriodLabel(period)})
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {tf('Track customer orders, confirm payments, release items from the store, or edit receipts.', "Kurikirana amategeko y'abakiriya, wemeze ubwishyu, usohore ububiko, cyangwa uhindure inyemezabuguzi.")}
          </p>
        </div>

        {/* Time Horizon Selector & Export Action */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Selector */}
          <div className="flex items-center bg-[#121620] p-1 rounded-xl border border-slate-800 text-xs">
            {[
              { id: 'day', label: tf('Daily (Today)', 'Uyu Munsi') },
              { id: 'week', label: tf('Weekly (7d)', 'Iminsi 7') },
              { id: 'month', label: tf('Monthly (30d)', 'Iminsi 30') },
              { id: 'all', label: tf('All Time', 'Byose') },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as any)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                  period === p.id
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Export PDF Button */}
          <button
            onClick={handleExportOrdersPdf}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-900/20 border border-rose-500/30 transition"
          >
            <FileText className="w-4 h-4 text-white" />
            <span>{tf('Download Orders PDF', 'Kuramo Raporo PDF')}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={tf('Search orders by Order Number (e.g. ORD-...), Customer Name, or Phone...', 'Shakisha nomero y’itegeko (ORD-...), izina ry’umukiriya, cyangwa telefone...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white transition"
                title={tf('Clear search', 'Siba')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto text-xs">
            {[
              { id: 'all', label: tf('All', 'Byose'), count: queueCounts.all },
              { id: 'waiting_payment', label: tf('Waiting Payment', 'Bitegereje Kwishyurwa'), count: queueCounts.waiting_payment },
              { id: 'pending_store', label: tf('Waiting Store', 'Bitegereje Ububiko'), count: queueCounts.pending_store },
              { id: 'released', label: tf('Released', 'Byasohowe'), count: queueCounts.released },
              { id: 'completed', label: tf('Completed', 'Byarangiye'), count: queueCounts.completed },
              { id: 'cancelled', label: tf('Cancelled', 'Byahagaritswe'), count: queueCounts.cancelled },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-medium transition flex items-center gap-1.5 ${
                  statusFilter === tab.id
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    statusFilter === tab.id
                      ? 'bg-slate-950/20 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {tab.count}
                  </span>
                )}
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
                <th className="py-3 px-4 font-semibold">{tf('Order #', 'Itegeko #')}</th>
                <th className="py-3 px-4 font-semibold">{tf('Date & Time', 'Itariki & Igihe')}</th>
                <th className="py-3 px-4 font-semibold">{tf('Customer', 'Umukiriya')}</th>
                <th className="py-3 px-4 font-semibold">{tf('Total', 'Igiteranyo')}</th>
                <th className="py-3 px-4 font-semibold">{tf('Paid / Balance', 'Ayishyuwe / Asigaye')}</th>
                <th className="py-3 px-4 font-semibold">{tf('Payment', 'Ubwishyu')}</th>
                <th className="py-3 px-4 font-semibold">{tf('Store Status', 'Ububiko')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tf('Actions', 'Ibikorwa')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredOrders.map((ord) => {
                const isCancelled = ord.fulfillment_status === 'cancelled';
                return (
                  <tr key={ord.id} className={isCancelled ? 'bg-rose-950/15 hover:bg-rose-950/25 transition' : 'hover:bg-slate-800/40 transition'}>
                    <td className={`py-3 px-4 font-mono font-bold ${isCancelled ? 'text-rose-400 line-through' : 'text-amber-400'}`}>
                      <div className="flex items-center gap-1.5">
                        <span>{ord.order_number}</span>
                        {ord.handwritten_photo_key && (
                          <button
                            type="button"
                            onClick={() => openPhotoViewer(ord)}
                            title={tf('View attached order photo', 'Reba ifoto yometse kuri komande')}
                            className="p-1 rounded bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 transition"
                          >
                            <Camera className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono">
                      {new Date(ord.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-200">{ord.customer_name || tf('Walk-in Cash Client', 'Umukiriya usanzwe')}</p>
                      {ord.customer_phone && <p className="text-[10px] text-slate-400 font-mono">{ord.customer_phone}</p>}
                    </td>
                    <td className="py-3 px-4 font-bold font-mono">
                      {isCancelled ? (
                        <div>
                          <span className="text-slate-200">RWF 0</span>
                          <p className="text-[10px] text-rose-400 font-bold">
                            ({tf('Cancelled:', 'Yahagaritswe:')} {formatRwf(ord.total_amount)})
                          </p>
                        </div>
                      ) : (
                        <span className="text-white">{formatRwf(ord.total_amount)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {isCancelled ? (
                        <div>
                          <p className="text-slate-200 font-mono font-semibold">RWF 0</p>
                          {Number(ord.paid_amount || 0) > 0 && (
                            <p className="text-rose-400 font-mono text-[10px] font-bold">
                              ({tf('Cancelled:', 'Yahagaritswe:')} {formatRwf(ord.paid_amount)})
                            </p>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="text-emerald-400 font-mono font-semibold">{formatRwf(ord.paid_amount)}</p>
                          {ord.debt_amount > 0 && (
                            <p className="text-rose-400 font-mono text-[10px]">{tf('Due:', 'Asigaye:')} {formatRwf(ord.debt_amount)}</p>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {isCancelled ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          {trFulfillmentStatus('cancelled')}
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          ord.payment_status === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : ord.payment_status === 'partial'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {trPaymentStatus(ord.payment_status)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[11px] font-medium capitalize ${isCancelled ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>
                        {ord.fulfillment_status === 'approved' ? tf('Released', 'Byasohowe') : trFulfillmentStatus(ord.fulfillment_status)}
                      </span>
                    </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleViewOrder(ord.id)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-[11px] font-semibold border border-slate-700 transition"
                      >
                        {tf('Open', 'Fungura')}
                      </button>
                      {canEditAnyOrder && ord.fulfillment_status !== 'cancelled' && (
                        <button
                          onClick={() => setEditingOrder(ord)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-amber-300 text-[11px] font-semibold border border-slate-700 transition flex items-center gap-1"
                          title={tf('Edit Receipt / Order items (quantities, replace out-of-stock items)', 'Hindura inyemezabuguzi cyangwa ibicuruzwa')}
                        >
                          <Edit3 className="w-3 h-3 text-amber-400" />
                          <span>{tf('Edit', 'Hindura')}</span>
                        </button>
                      )}
                      {(canPrintReceipt || canPrintDeliveryNote) && (
                        <button
                          onClick={() => onPrintReceipt(ord)}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                          title={canPrintReceipt ? tf('Print Receipt / Delivery Note', 'Sohora Inyemezabuguzi / Delivery Notice') : tf('Print Delivery Note', 'Sohora Delivery Notice')}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-300">{tf('No orders found', 'Nta tegeko ryabonetse')}</p>
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
          <div className="w-full max-w-2xl bg-[#141923] border-l border-slate-700 h-full p-4 sm:p-6 overflow-y-auto space-y-5 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] uppercase font-mono tracking-wider text-slate-400">
                  {tf('Order Details', 'Amakuru y’Itegeko')}
                </span>
                <h2 className="text-xl font-bold text-white font-mono mt-0.5">
                  {selectedOrder.order_number}
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {canEditAnyOrder && selectedOrder.fulfillment_status !== 'cancelled' && (
                  <button
                    onClick={() => setEditingOrder(selectedOrder)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-400 font-black text-xs transition shadow-md shadow-amber-500/20 active:scale-95"
                    title={tf('Edit items, change quantities, replace products, or modify prices', 'Hindura ibicuruzwa, imibare, cyangwa ibiciro')}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{tf('Edit Receipt & Items', 'Hindura Inyemezabuguzi')}</span>
                  </button>
                )}
                {canVoidOrders && selectedOrder.fulfillment_status !== 'cancelled' && (
                  <button
                    onClick={() => {
                      setVoidReason('');
                      setIsVoidModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-bold text-xs transition"
                    title={tf('Cancel order and return all stock', 'Hagarika itegeko usubize ibicuruzwa mu bubiko')}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>{tf('Cancel Order', 'Hagarika Itegeko')}</span>
                  </button>
                )}
                <button
                  onClick={() => exportSingleOrderPdf({ order: selectedOrder, items: orderItems, payments: orderPayments, shop })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-red-600/20 to-rose-600/20 hover:from-red-600/30 hover:to-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs transition shadow-sm"
                  title={tf('Download Official Commercial Invoice PDF', 'Kuramo Fagitire PDF')}
                >
                  <FileText className="w-3.5 h-3.5 text-rose-400" />
                  <span>{tf('Invoice PDF', 'Fagitire PDF')}</span>
                </button>
                {selectedOrder.handwritten_photo_key && (
                  <button
                    type="button"
                    onClick={() => openPhotoViewer(selectedOrder)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-bold text-xs transition"
                    title={tf('View attached order photo', 'Reba ifoto yometse kuri komande')}
                  >
                    <Camera className="w-3.5 h-3.5 text-sky-400" />
                    <span>{tf('View Photo', 'Reba Ifoto')}</span>
                  </button>
                )}
                {(canPrintReceipt || canPrintDeliveryNote) && (
                  <button
                    onClick={() => onPrintReceipt(selectedOrder)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                    title={canPrintReceipt ? tf('Print Thermal Receipt / Delivery Note', 'Sohora Inyemezabuguzi / Delivery Notice') : tf('Print Delivery Note', 'Sohora Delivery Notice')}
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition hover:bg-slate-700"
                >
                  ✕
                </button>
              </div>
            </div>

            {actionFeedback && (
              <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                actionFeedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center gap-2">
                  {actionFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span className="font-semibold">{actionFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActionFeedback(null)}
                  className="text-slate-400 hover:text-white px-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Status & Quick Action Pipeline */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
              {/* 3-Step Plain-Language Order Progress Bar */}
              {selectedOrder.fulfillment_status === 'cancelled' ? (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{tf('This order was cancelled and all items were returned to stock.', 'Iri tegeko ryarahagaritswe kandi ibicuruzwa byose byasubijwe mu bubiko.')}</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <p className="text-[10px] font-bold uppercase text-emerald-400">{tf('1. Ordered', '1. Byasabwe')}</p>
                    <p className="font-semibold text-white mt-0.5 truncate">{selectedOrder.salesperson_name || tf('Staff', 'Umukozi')}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl border ${
                    selectedOrder.payment_status === 'paid'
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : selectedOrder.payment_status === 'partial'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-rose-500/10 border-rose-500/30'
                  }`}>
                    <p className={`text-[10px] font-bold uppercase ${
                      selectedOrder.payment_status === 'paid'
                        ? 'text-emerald-400'
                        : selectedOrder.payment_status === 'partial'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}>
                      {tf('2. Payment', '2. Ubwishyu')}
                    </p>
                    <p className="font-semibold text-white mt-0.5 truncate">
                      {selectedOrder.payment_status === 'paid'
                        ? tf('Paid', 'Yishyuwe')
                        : selectedOrder.payment_status === 'partial'
                        ? tf('Partial', 'Yishyuwe Igice')
                        : selectedOrder.payment_status === 'debt'
                        ? tf('Credit', 'Ideni')
                        : tf('Waiting Payment', 'Bitegereje Kwishyurwa')}
                    </p>
                  </div>
                  <div className={`p-2.5 rounded-xl border ${
                    selectedOrder.fulfillment_status === 'pending_store'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-emerald-500/10 border-emerald-500/30'
                  }`}>
                    <p className={`text-[10px] font-bold uppercase ${
                      selectedOrder.fulfillment_status === 'pending_store'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}>
                      {tf('3. Store Release', '3. Ububiko')}
                    </p>
                    <p className="font-semibold text-white mt-0.5 truncate">
                      {selectedOrder.fulfillment_status === 'pending_store'
                        ? tf('Waiting Store', 'Bitegereje Ububiko')
                        : selectedOrder.fulfillment_status === 'approved'
                        ? tf('Released', 'Byasohowe')
                        : selectedOrder.fulfillment_status === 'dispatched'
                        ? tf('Dispatched', 'Byoherejwe')
                        : tf('Completed', 'Byarangiye')}
                    </p>
                  </div>
                </div>
              )}

              {/* Status Action Buttons */}
              {selectedOrder.fulfillment_status !== 'cancelled' && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
                  {Number(selectedOrder.debt_amount || 0) > 0 && canProcessPayments && (
                    <button
                      onClick={() => {
                        setPayAmount(String(selectedOrder.debt_amount));
                        setPayRef('');
                        setModalError('');
                        setIsPaymentModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>{tf('Confirm Payment', 'Emeza Ubwishyu')} ({formatRwf(selectedOrder.debt_amount)})</span>
                    </button>
                  )}

                  {(selectedOrder.fulfillment_status === 'pending_store' || selectedOrder.fulfillment_status === 'approved') && canReleaseStock && (
                    <button
                      onClick={() => handleExecuteSelectiveRelease(true)}
                      disabled={isReleasingItems || isSubmitting}
                      className="flex-1 py-2 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                      title={tf('Release ticked items from warehouse and automatically adjust receipt and stock', 'Sohora ibicuruzwa wahisemo mu bubiko')}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isReleasingItems ? tf('Releasing Stock...', 'Birimo gusohoka...') : tf('Release Checked Products & Update Receipt', 'Sohora Ibyahiswemo & Uvugurure Inyemezabuguzi')}
                      </span>
                    </button>
                  )}

                  {selectedOrder.fulfillment_status === 'pending_store' && !canReleaseStock && (
                    <div className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{tf('Waiting for Storekeeper to check and release items.', 'Bitegereje umubitsi ngo asuzume kandi asohore ibicuruzwa.')}</span>
                    </div>
                  )}

                  {selectedOrder.fulfillment_status === 'approved' && canReleaseStock && (
                    <button
                      onClick={() => handleUpdateStatus('dispatched')}
                      disabled={isSubmitting}
                      className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow transition flex items-center justify-center gap-1.5"
                    >
                      <Truck className="w-4 h-4" />
                      <span>{tf('Mark Dispatched', 'Emeza ko Byoherejwe')}</span>
                    </button>
                  )}

                  {selectedOrder.fulfillment_status === 'dispatched' && canReleaseStock && (
                    <button
                      onClick={() => handleUpdateStatus('completed')}
                      disabled={isSubmitting}
                      className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow transition flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{tf('Mark Order Completed', 'Emeza ko Byarangiye')}</span>
                    </button>
                  )}

                  {(canPrintReceipt || canPrintDeliveryNote) && (
                    <button
                      onClick={() => onPrintReceipt(selectedOrder)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                      <span>{canPrintReceipt ? tf('Print Receipt', 'Sohora Inyemezabuguzi') : tf('Print Delivery Note', 'Sohora Delivery Notice')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">{tf('Total Amount', 'Igiteranyo')}</p>
                <p className="text-sm font-bold text-white font-mono mt-1">
                  {selectedOrder.fulfillment_status === 'cancelled' ? 'RWF 0' : formatRwf(selectedOrder.total_amount)}
                </p>
                {selectedOrder.fulfillment_status === 'cancelled' && (
                  <p className="text-[10px] font-mono text-rose-400 font-bold mt-0.5">
                    ({tf('Cancelled:', 'Yahagaritswe:')} {formatRwf(selectedOrder.total_amount)})
                  </p>
                )}
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">{tf('Paid So Far', 'Ayishyuwe')}</p>
                <p className={`text-sm font-bold font-mono mt-1 ${selectedOrder.fulfillment_status === 'cancelled' ? 'text-slate-200' : 'text-emerald-400'}`}>
                  {selectedOrder.fulfillment_status === 'cancelled' ? 'RWF 0' : formatRwf(selectedOrder.paid_amount)}
                </p>
                {selectedOrder.fulfillment_status === 'cancelled' && Number(selectedOrder.paid_amount || 0) > 0 && (
                  <p className="text-[10px] font-mono text-rose-400 font-bold mt-0.5">
                    ({tf('Cancelled:', 'Yahagaritswe:')} {formatRwf(selectedOrder.paid_amount)})
                  </p>
                )}
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">{tf('Debt Outstanding', 'Ideni Risigaye')}</p>
                <p className={`text-sm font-bold font-mono mt-1 ${selectedOrder.fulfillment_status === 'cancelled' ? 'text-slate-300' : 'text-rose-400'}`}>
                  {selectedOrder.fulfillment_status === 'cancelled' ? 'RWF 0' : formatRwf(selectedOrder.debt_amount)}
                </p>
              </div>
            </div>

            {/* Customer Details & Audit Signatures */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{tf('Client Profile', 'Umwirondoro w’Umukiriya')}</p>
                <div className="flex justify-between text-slate-300">
                  <span>{tf('Name:', 'Izina:')}</span>
                  <strong className="text-white">{selectedOrder.customer_name || tf('Walk-in Cash Client', 'Umukiriya usanzwe')}</strong>
                </div>
                {selectedOrder.customer_phone && (
                  <div className="flex justify-between text-slate-300">
                    <span>{tf('Telephone:', 'Telefone:')}</span>
                    <span className="font-mono text-amber-400">{selectedOrder.customer_phone}</span>
                  </div>
                )}
                {selectedOrder.notes && (
                  <div className="pt-2 border-t border-slate-800 text-slate-400 italic">
                    {tf('Notes:', 'Icyitonderwa:')} {selectedOrder.notes}
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 via-[#141A25] to-slate-900 border border-slate-800 space-y-2 text-xs">
                <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                  {tf('Staff Who Handled This Order', 'Abakozi Bakiriye iri Tegeko')}
                </p>
                
                <div className="space-y-1 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{tf('Sold By:', 'Uwagurishije:')}</span>
                    <span className="font-semibold text-white">{selectedOrder.salesperson_name || tf('Staff', 'Umukozi')}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">{tf('Payment Confirmed By:', 'Uwemeje Ubwishyu:')}</span>
                    <span className="font-semibold text-emerald-300">
                      {selectedOrder.payment_approved_by_name ? (
                        `${selectedOrder.payment_approved_by_name}`
                      ) : (
                        <span className="text-slate-400 italic">{tf('Waiting for Cashier', 'Ategereje Keshye')}</span>
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">{tf('Items Released By:', 'Uwabikuye mu Bubiko:')}</span>
                    <span className="font-semibold text-blue-300">
                      {selectedOrder.stock_released_by_name ? (
                        `${selectedOrder.stock_released_by_name}`
                      ) : (
                        <span className="text-slate-400 italic">{tf('Waiting for Storekeeper', 'Ategereje Umubitsi')}</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Warehouse Stock Release Checklist & Order Items */}
            <div className="space-y-3 p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-amber-400" />
                      {tf('Items to Release from Store', 'Ibicuruzwa Bisohoka mu Bubiko')}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      {orderItems.filter(it => releaseSelection[it.id]?.checked).length} / {orderItems.length} {tf('Checked', 'Byatoranyijwe')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {tf('Tick each item that is available in the store. Unchecked items will be removed and the receipt updates automatically.', 'Hitamo buri gicuruzwa kiboneka mu bubiko. Ibitatoranyijwe biravanwaho kandi inyemezabuguzi ihinduke ako kanya.')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {canReleaseStock && (
                    <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleSelectAllRelease(true)}
                        className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white font-semibold transition"
                      >
                        {tf('Check All', 'Hitamo Byose')}
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => handleSelectAllRelease(false)}
                        className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white font-semibold transition"
                      >
                        {tf('Uncheck All', 'Kura Byose')}
                      </button>
                    </div>
                  )}

                  {canEditAnyOrder && selectedOrder.fulfillment_status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => setEditingOrder(selectedOrder)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 transition active:scale-95"
                      title={tf('Edit line items, add replacement products, or adjust prices', 'Hindura ibicuruzwa cyangwa ibiciro')}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{tf('Edit Receipt', 'Hindura Inyemezabuguzi')}</span>
                    </button>
                  )}
                </div>
              </div>

              {Number(selectedOrder.debt_amount || 0) > 0 &&
                selectedOrder.payment_status !== 'debt' &&
                selectedOrder.fulfillment_status !== 'cancelled' && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    {tf('Notice: This order has', 'Icyitonderwa: Iri tegeko rifite')} <strong>{formatRwf(selectedOrder.debt_amount)}</strong> {tf('unpaid. Confirm payment with Cashier or approved credit before handing over goods.', 'atarishyurwa. Emeza ubwishyu cyangwa ideni mbere yo gutanga ibicuruzwa.')}
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="p-2.5 text-center w-12">{tf('Release', 'Sohora')}</th>
                      <th className="p-2.5">{tf('Product', 'Igicuruzwa')}</th>
                      <th className="p-2.5 text-center">{tf('Ordered', 'Byasabwe')}</th>
                      <th className="p-2.5 text-center">{tf('Release Qty', 'Ibisohoka')}</th>
                      <th className="p-2.5 text-right">{tf('Price', 'Igiciro')}</th>
                      <th className="p-2.5 text-right">{tf('Subtotal', 'Igiteranyo')}</th>
                      <th className="p-2.5 text-center">{tf('Status', 'Imiterere')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {orderItems.map((item) => {
                      const sel = releaseSelection[item.id] || { checked: true, releaseQty: item.quantity };
                      const isChecked = sel.checked;
                      const releaseQty = sel.releaseQty;
                      const isPartial = isChecked && releaseQty < item.quantity;
                      const currentSubtotal = (Number(item.selling_price) || 0) * (isChecked ? releaseQty : 0);

                      return (
                        <tr
                          key={item.id}
                          className={`transition ${
                            isChecked
                              ? 'bg-slate-900/40 hover:bg-slate-900/70'
                              : 'bg-rose-500/5 opacity-60 hover:opacity-80'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!canReleaseStock || selectedOrder.fulfillment_status === 'cancelled'}
                              onChange={() => handleToggleReleaseItem(item.id)}
                              className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
                              title={
                                !canReleaseStock
                                  ? 'Only Storekeeper / authorized staff can release stock'
                                  : isChecked
                                  ? 'Untick if item is out of stock / not released'
                                  : 'Tick to release this item'
                              }
                            />
                          </td>

                          {/* Product Details */}
                          <td className="p-2.5">
                            <p className="font-bold text-slate-100">{item.product_name || `Item #${item.product_id}`}</p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {item.product_sku ? `Code: ${item.product_sku} • ` : ''}
                              {item.sold_unit || item.product_unit || 'pcs'}
                              {item.sale_mode === 'pack' && item.pack_size && item.pack_size > 1
                                ? ` (×${item.pack_size} ${item.product_unit || 'pcs'})`
                                : ''}
                            </p>
                          </td>

                          {/* Ordered Qty */}
                          <td className="p-2.5 text-center font-mono text-slate-300">
                            {item.quantity} {item.sold_unit || item.product_unit || 'pcs'}
                          </td>

                          {/* Release Qty (Interactive) */}
                          <td className="p-2.5 text-center">
                            {canReleaseStock && isChecked ? (
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  max={item.quantity}
                                  value={releaseQty}
                                  onChange={(e) => handleReleaseQtyChange(item.id, item.quantity, parseInt(e.target.value) || 1)}
                                  className="w-14 text-center py-1 px-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono font-bold text-xs text-white focus:outline-none focus:border-amber-500"
                                  title="Adjust quantity physically released from warehouse"
                                />
                                <span className="text-[10px] text-slate-400">{item.sold_unit || item.product_unit || 'pcs'}</span>
                              </div>
                            ) : (
                              <span className="font-mono text-xs text-slate-400">
                                {isChecked ? `${releaseQty} ${item.sold_unit || item.product_unit || 'pcs'}` : '—'}
                              </span>
                            )}
                          </td>

                          {/* Unit Price */}
                          <td className="p-2.5 font-mono text-right text-slate-300">
                            {formatRwf(item.selling_price)}
                          </td>

                          {/* Line Subtotal */}
                          <td className="p-2.5 font-mono font-bold text-right text-amber-400">
                            {formatRwf(currentSubtotal)}
                          </td>

                          {/* Status Badge */}
                          <td className="p-2.5 text-center">
                            {isChecked ? (
                              isPartial ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  {tf('Partial', 'Igice')} ({releaseQty}/{item.quantity})
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  {tf('Full Release', 'Byose')}
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                {tf('Excluded / Out of Stock', 'Byakuwemo / Byashize')}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Release Summary & Direct Action Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{tf('Release Calculation:', 'Imibare y’Ibisohorwa:')}</span>
                    <span className="font-mono font-bold text-amber-400">
                      {orderItems.filter(it => releaseSelection[it.id]?.checked).length} {tf('of', 'kuri')} {orderItems.length} {tf('Products Checked', 'Ibicuruzwa Byemejwe')}
                    </span>
                    <span className="text-slate-400">
                      ({orderItems.reduce((acc, it) => releaseSelection[it.id]?.checked ? acc + (releaseSelection[it.id]?.releaseQty || it.quantity) : acc, 0)} {tf('Units', 'Ingano')})
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {tf('Adjusted Order Subtotal:', 'Igiteranyo Gishya cy’Itegeko:')}{' '}
                    <strong className="text-emerald-400 font-mono">{formatRwf(orderItems.reduce((acc, it) => releaseSelection[it.id]?.checked ? acc + ((Number(it.selling_price) || 0) * (releaseSelection[it.id]?.releaseQty || it.quantity)) : acc, 0))}</strong>
                  </p>
                </div>

                {canReleaseStock && selectedOrder.fulfillment_status !== 'cancelled' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleExecuteSelectiveRelease(true)}
                      disabled={isReleasingItems || isSubmitting}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isReleasingItems
                          ? tf('Releasing Stock...', 'Ububiko Burasohoka...')
                          : tf('Release Checked & Update Receipt', 'Sohora Ibyemejwe & Uvugurure Inyemezabuguzi')}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Transactions & Record Payment Button */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{tf('Payment History', 'Amateka y’Ubwishyu')}</h3>
                {selectedOrder.debt_amount > 0 && selectedOrder.fulfillment_status !== 'cancelled' && canProcessPayments && (
                  <button
                    onClick={() => {
                      setPayAmount(String(selectedOrder.debt_amount));
                      setPayRef('');
                      setModalError('');
                      setIsPaymentModalOpen(true);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-amber-400 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> {tf('Add Payment', 'Ongeraho Ubwishyu')}
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
                      {selectedOrder.fulfillment_status === 'cancelled' && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          {tf('CANCELLED', 'CYAHAGARITSWE')}
                        </span>
                      )}
                      {p.reference_no && (
                        <p className="text-[10px] text-slate-400 font-mono">{tf('Ref:', 'Nomero:')} {p.reference_no}</p>
                      )}
                    </div>
                    <div className="text-right">
                      {selectedOrder.fulfillment_status === 'cancelled' ? (
                        <div>
                          <span className="font-mono font-bold text-slate-200">RWF 0</span>
                          <p className="text-[10px] font-mono text-rose-400 font-bold">({tf('Cancelled:', 'Cyakuweho:')} {formatRwf(p.amount)})</p>
                        </div>
                      ) : (
                        <span className="font-mono font-bold text-emerald-400">{formatRwf(p.amount)}</span>
                      )}
                      <p className="text-[10px] text-slate-400">{new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}

                {orderPayments.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3">{tf('No payments logged yet.', 'Nta bwishyu burandikwa.')}</p>
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
              <h3 className="text-base font-bold text-white">{tf('Record Payment for', 'Andika Ubwishyu bwa')} {selectedOrder.order_number}</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('Payment Amount (RWF)', 'Umubare w’Amafaranga Yishyuwe (RWF)')}</label>
                <input
                  type="number"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('Payment Channel', 'Uburyo bwo Kwishyura')}</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="momo">{tf('MTN Mobile Money', 'MTN Mobile Money')}</option>
                  <option value="cash">{tf('Cash (RWF)', 'Cash (RWF)')}</option>
                  <option value="bank_transfer">{tf('Bank Transfer (BK / I&M / Equity)', 'Kuri Banki (BK / I&M / Equity)')}</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('Transaction ID / SMS Reference', 'Nomero ya Transakisi / SMS')}</label>
                <input
                  type="text"
                  placeholder={tf('e.g. TXN4820921', 'urugero: TXN4820921')}
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
                  {tf('Cancel', 'Hagarika')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? tf('Recording...', 'Birandikwa...') : tf('Confirm Receipt', 'Emeza Kwishyurwa')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Selective Release Confirmation Modal (In-app, no browser confirm/alert) */}
      {isReleaseConfirmOpen && selectedOrder && (
        <div className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#141923] border border-amber-500/40 shadow-2xl p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white">{tf('Confirm Partial Stock Release', 'Emeza Gusohora Igice cy’Ububiko')}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {tf('Order', 'Itegeko')} <span className="font-mono text-amber-400 font-bold">{selectedOrder.order_number}</span> {tf('will be updated to match only what was physically released.', 'rirahindurwa rihure n’ibyasohotse mu bubiko gusa.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReleaseConfirmOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
              {orderItems.map(it => {
                const sel = releaseSelection[it.id];
                const isChecked = Boolean(sel?.checked);
                const qtyReleased = isChecked ? (sel?.releaseQty || it.quantity) : 0;
                const diff = it.quantity - qtyReleased;
                return (
                  <div key={it.id} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-100 truncate">{it.product_name || `Product #${it.product_id}`}</p>
                      <p className="text-[10px] text-slate-400">
                        {isChecked ? tf(`Releasing ${qtyReleased} of ${it.quantity}`, `Hasohoka ${qtyReleased} muri ${it.quantity}`) : tf(`Unchecked — returning all ${it.quantity} to stock`, `Ntikihisemo — byose (${it.quantity}) birasubira mu bubiko`)}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      !isChecked
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : diff > 0
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {!isChecked ? tf('Removed & Returned', 'Byavanywemo & Byasubijwe') : diff > 0 ? tf(`Partial (-${diff} returned)`, `Igice (-${diff} byasubijwe)`) : tf('Full Release', 'Byose Bisohoka')}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">{tf('Updated Receipt Total:', 'Igiteranyo Gishya cy’Inyemezabuguzi:')}</span>
              <span className="font-mono font-black text-emerald-400 text-sm">
                {formatRwf(orderItems.reduce((acc, it) => releaseSelection[it.id]?.checked ? acc + ((Number(it.selling_price) || 0) * (releaseSelection[it.id]?.releaseQty || it.quantity)) : acc, 0))}
              </span>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsReleaseConfirmOpen(false)}
                disabled={isReleasingItems}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                {tf('Go Back', 'Subira Inyuma')}
              </button>
              <button
                type="button"
                onClick={() => executeSelectiveRelease(true)}
                disabled={isReleasingItems}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {isReleasingItems ? tf('Releasing Stock...', 'Birimo gusohoka...') : tf('Confirm Release & Update Receipt', 'Emeza Gusohora & Inyemezabuguzi')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel / Void Order Confirmation Modal */}
      {isVoidModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-[95] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-rose-500/40 shadow-2xl p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white">{tf(`Cancel Order ${selectedOrder.order_number}?`, `Uhagarike Itegeko ${selectedOrder.order_number}?`)}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {tf('All products in this order will be returned to store stock and any unpaid balance on the customer account will be cleared.', 'Ibicuruzwa byose biri muri iri tegeko birasubizwa mu bubiko kandi umwenda utarishyurwa urasibwa.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsVoidModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleVoidOrder} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('Reason for Cancelling (Optional)', 'Impamvu yo guhagarika (si itegeko)')}</label>
                <input
                  type="text"
                  placeholder={tf('e.g. Customer changed mind / duplicate order', 'urugero: Umukiriya yahinduye ibitekerezo')}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsVoidModalOpen(false)}
                  disabled={isVoiding}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  {tf('Keep Order', 'Reka Rihagume')}
                </button>
                <button
                  type="submit"
                  disabled={isVoiding}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-900/30 disabled:opacity-50"
                >
                  {isVoiding ? tf('Cancelling...', 'Birimo guhagarikwa...') : tf('Confirm Cancel Order', 'Emeza Guhagarika')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Order & Receipt Modal */}
      {editingOrder && (
        <EditOrderModal
          isOpen={Boolean(editingOrder)}
          order={editingOrder}
          user={user}
          onClose={() => setEditingOrder(null)}
          onOrderUpdated={handleOrderUpdated}
        />
      )}

      {/* Inline Order Photo Viewer Modal */}
      {photoModalOrder && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-4xl rounded-2xl bg-[#131722] border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-sky-400" />
                  <span>{tf('Order Photo Attachment', 'Ifoto Yometse kuri Komande')} &mdash; {photoModalOrder.order_number}</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {photoModalOrder.customer_name || tf('Walk-in Cash Client', 'Umukiriya usanzwe')}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPhotoZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                  title={tf('Zoom Out', 'Gabanya')}
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                  title={tf('Zoom In', 'Zamura')}
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoRotate((r) => (r + 90) % 360)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                  title={tf('Rotate 90°', 'Zengurutsa 90°')}
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoModalOrder(null)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white"
                  title={tf('Close', 'Funga')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-slate-950 flex-1 flex items-center justify-center overflow-auto p-4 min-h-[300px]">
              {photoModalLoading ? (
                <p className="text-xs text-slate-400">{tf('Loading order photo...', 'Ifoto irimo gufungurwa...')}</p>
              ) : photoModalError ? (
                <p className="text-xs text-rose-300 text-center max-w-sm">{photoModalError}</p>
              ) : photoModalUrl ? (
                <img
                  src={photoModalUrl}
                  alt={`Order slip ${photoModalOrder.order_number}`}
                  style={{
                    transform: `scale(${photoZoom}) rotate(${photoRotate}deg)`,
                    transformOrigin: 'center center'
                  }}
                  className="max-h-[74vh] object-contain transition-transform duration-150"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
