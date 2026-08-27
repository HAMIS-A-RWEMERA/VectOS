import React from 'react';
import { DashboardStats, Order, Product } from '../types';
import { 
  TrendingUp, 
  DollarSign, 
  Package, 
  Users, 
  AlertTriangle, 
  ShoppingBag, 
  ArrowUpRight,
  Boxes,
  FileText,
  CreditCard,
  Building,
  CheckCircle2,
  Clock,
  ChevronRight
} from 'lucide-react';

interface DashboardViewProps {
  stats: DashboardStats | null;
  loading: boolean;
  onNavigate: (tab: string) => void;
  onViewOrder: (orderId: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  loading,
  onNavigate,
  onViewOrder
}) => {
  if (loading || !stats) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-slate-900/60 rounded-2xl border border-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  const maxTrend = Math.max(...stats.recentDaysTrend.map(d => d.amount), 100000);

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner & Quick Action Buttons */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-[#131822] to-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Store Operations Dashboard
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Live Real-Time
            </span>
          </div>
          <p className="text-xs lg:text-sm text-slate-400 mt-1">
            Real-time multi-stock overview, sales turnover, and customer receivables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigate('pos')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>New Sale (POS)</span>
          </button>
          <button
            onClick={() => onNavigate('products')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
          >
            <Package className="w-4 h-4 text-amber-400" />
            <span>Add Stock</span>
          </button>
          <button
            onClick={() => onNavigate('stocks')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
          >
            <Boxes className="w-4 h-4 text-sky-400" />
            <span>Transfer</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div className="p-5 rounded-2xl bg-[#12161F] border border-slate-800 hover:border-amber-500/40 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Today's Revenue</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-3 font-sans">
            {formatRwf(stats.todaySales)}
          </p>
          <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
            <span>{stats.todayOrderCount} order(s) today</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
              Active <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Total Receivables (Customer Credit) */}
        <div className="p-5 rounded-2xl bg-[#12161F] border border-slate-800 hover:border-rose-500/40 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Customer Debt / Credit</span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-300 mt-3 font-sans">
            {formatRwf(stats.totalReceivables || stats.totalDebt)}
          </p>
          <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
            <span>From {stats.customerCount} customers</span>
            <button onClick={() => onNavigate('customers')} className="text-rose-400 hover:underline font-semibold">
              View Ledger &rarr;
            </button>
          </div>
        </div>

        {/* Total Inventory Value */}
        <div className="p-5 rounded-2xl bg-[#12161F] border border-slate-800 hover:border-sky-500/40 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Inventory Value</span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-sky-300 mt-3 font-sans">
            {formatRwf(stats.inventoryValue)}
          </p>
          <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
            <span>{stats.productCount} distinct products</span>
            <span className="text-slate-400 font-medium">Cost valuation</span>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className={`p-5 rounded-2xl border transition ${
          stats.lowStockCount > 0 
            ? 'bg-amber-950/20 border-amber-500/40' 
            : 'bg-[#12161F] border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Low Stock Warnings</span>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              stats.lowStockCount > 0 ? 'bg-amber-500/20 text-amber-400 animate-bounce' : 'bg-slate-800 text-slate-400'
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-300 mt-3 font-sans">
            {stats.lowStockCount} Item(s)
          </p>
          <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
            <span>Below reorder threshold</span>
            <button onClick={() => onNavigate('products')} className="text-amber-400 hover:underline font-semibold">
              Restock &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Middle Section: 7-Day Trend Chart & Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Revenue Trend */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#12161F] border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">7-Day Sales Turnover (RWF)</h2>
              <p className="text-xs text-slate-400">Daily sales performance across all checkout registers</p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-800 text-amber-400 border border-slate-700">
              Total: {formatRwf(stats.totalSales)}
            </span>
          </div>

          <div className="h-56 flex items-end gap-3 pt-6 pb-2">
            {stats.recentDaysTrend.length > 0 ? (
              stats.recentDaysTrend.map((day, idx) => {
                const heightPct = Math.max(10, Math.round((day.amount / maxTrend) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                    <span className="text-[10px] font-bold text-amber-300 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                      {Math.round(day.amount / 1000)}k
                    </span>
                    <div 
                      style={{ height: `${heightPct}%` }}
                      className="w-full max-w-[48px] bg-gradient-to-t from-amber-600 to-amber-400 rounded-t-lg transition-all group-hover:brightness-125 shadow-lg shadow-amber-500/10"
                    />
                    <span className="text-[11px] text-slate-400 font-medium">
                      {day.date.slice(5)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                No orders recorded yet this week.
              </div>
            )}
          </div>
        </div>

        {/* Payment Channels Breakdown */}
        <div className="p-6 rounded-2xl bg-[#12161F] border border-slate-800 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Payment Methods</h2>
            <p className="text-xs text-slate-400">Kigali cash vs. mobile money vs. bank channels</p>

            <div className="mt-4 space-y-3">
              {stats.paymentBreakdown.map((pb, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-200 capitalize">
                        {pb.payment_method === 'momo' ? 'MTN Mobile Money' : pb.payment_method.replace('_', ' ')}
                      </p>
                      <p className="text-[11px] text-slate-400">{pb.count} transaction(s)</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-100 font-mono">
                    {formatRwf(pb.total_amount)}
                  </span>
                </div>
              ))}

              {stats.paymentBreakdown.length === 0 && (
                <p className="text-xs text-slate-400 py-6 text-center">No payment transactions recorded.</p>
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigate('reports')}
            className="w-full mt-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-400 border border-slate-700 transition"
          >
            Financial Reconciliation &rarr;
          </button>
        </div>
      </div>

      {/* Bottom Section: Recent Orders Table & Low Stock Urgent List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders Stream */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#12161F] border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Recent Sales & Dispatches</h2>
              <p className="text-xs text-slate-400">Real-time status from checkout through delivery</p>
            </div>
            <button
              onClick={() => onNavigate('orders')}
              className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1"
            >
              All Orders ({stats.recentOrders.length}) <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 font-semibold">Order Ref</th>
                  <th className="py-2.5 font-semibold">Customer</th>
                  <th className="py-2.5 font-semibold">Total Amount</th>
                  <th className="py-2.5 font-semibold">Payment</th>
                  <th className="py-2.5 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stats.recentOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 font-mono font-bold text-amber-400">{ord.order_number}</td>
                    <td className="py-3 text-slate-300">{ord.customer_name || 'Walk-in Cash Client'}</td>
                    <td className="py-3 font-semibold text-white">{formatRwf(ord.total_amount)}</td>
                    <td className="py-3">
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
                    <td className="py-3">
                      <span className="text-[11px] font-medium text-slate-300 capitalize">
                        {ord.fulfillment_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => onViewOrder(ord.id)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-amber-400 font-semibold border border-slate-700 transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
                {stats.recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      No customer orders yet. Open the POS Counter to start sales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Fast Reorder Card */}
        <div className="p-6 rounded-2xl bg-[#12161F] border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Reorder Checklist</h2>
              <p className="text-xs text-slate-400">Items below safety buffer</p>
            </div>
            <span className="text-xs font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              {stats.lowStockProducts.length} Items
            </span>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-72 pr-1">
            {stats.lowStockProducts.map((p) => (
              <div key={p.id} className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between">
                <div className="truncate pr-2">
                  <p className="text-xs font-bold text-slate-200 truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">SKU: {p.sku} • {p.category}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-black text-rose-400 font-mono">
                    {p.quantity} {p.unit}
                  </span>
                  <p className="text-[10px] text-slate-400">Min: {p.low_stock_threshold}</p>
                </div>
              </div>
            ))}

            {stats.lowStockProducts.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="font-semibold text-slate-300">All Stock Buffers Healthy</p>
                <p className="text-[11px] text-slate-400 mt-1">No items currently below safety inventory levels.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
