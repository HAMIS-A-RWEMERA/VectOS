import React from 'react';
import { DashboardStats, User } from '../types';
import { hasPermission } from '../utils/permissions';
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
import { useLanguage } from '../i18n/LanguageContext';

interface DashboardViewProps {
  user: User | null;
  stats: DashboardStats | null;
  loading: boolean;
  onNavigate: (tab: string) => void;
  onViewOrder: (orderId: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  stats,
  loading,
  onNavigate,
  onViewOrder
}) => {
  const { tf, trPaymentMethod, trPaymentStatus, trFulfillmentStatus } = useLanguage();
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

  const canCreateOrders = hasPermission(user, 'can_create_orders');
  const canManageStock = hasPermission(user, 'can_manage_stock');
  const canViewBuyingPrices = hasPermission(user, 'can_view_buying_prices');
  const canViewReports = hasPermission(user, 'can_view_reports');
  const canViewCustomers = hasPermission(user, 'can_manage_customers') || hasPermission(user, 'can_process_payments') || canCreateOrders;

  const maxTrend = Math.max(...stats.recentDaysTrend.map(d => d.amount), 100000);

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner & Quick Action Buttons */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-[#131822] to-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              {tf('Shop Overview', 'Incamake y’Iduka')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {tf('Updated Live', 'Bigezweho')}
            </span>
          </div>
          <p className="text-xs lg:text-sm text-slate-400 mt-1">
            {tf("Today's sales, store stock levels, and unpaid customer balances.", 'Igurisha ry’uyu munsi, uko ububiko buhagaze, n’amadeni y’abakiriya.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canCreateOrders && (
            <button
              onClick={() => onNavigate('pos')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{tf('New Sale (POS)', 'Igurisha Rishya (POS)')}</span>
            </button>
          )}
          {canManageStock && (
            <>
              <button
                onClick={() => onNavigate('products')}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
              >
                <Package className="w-4 h-4 text-amber-400" />
                <span>{tf('Add Stock', 'Ongeraho Ububiko')}</span>
              </button>
              <button
                onClick={() => onNavigate('stocks')}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
              >
                <Boxes className="w-4 h-4 text-sky-400" />
                <span>{tf('Transfer', 'Imura Ububiko')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div className="p-5 rounded-2xl bg-[#12161F] border border-slate-800 hover:border-amber-500/40 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{tf("Today's Sales", 'Igurisha ry’Uyu Munsi')}</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-3 font-sans">
            {formatRwf(stats.todaySales)}
          </p>
          <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
            <span>{tf(`${stats.todayOrderCount} order(s) today`, `Amategeko ${stats.todayOrderCount} uyu munsi`)}</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
              {tf('Active', 'Bikora')} <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Total Receivables (Customer Credit) */}
        <div className="p-5 rounded-2xl bg-[#12161F] border border-slate-800 hover:border-rose-500/40 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{tf('Customer Debt Owed', 'Amadeni y’Abakiriya')}</span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-300 mt-3 font-sans">
            {formatRwf(stats.totalReceivables || stats.totalDebt)}
          </p>
          <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
            <span>{tf(`From ${stats.customerCount} customers`, `Ku bakiriya ${stats.customerCount}`)}</span>
            {canViewCustomers && (
              <button onClick={() => onNavigate('customers')} className="text-rose-400 hover:underline font-semibold">
                {tf('View Customers', 'Reba Abakiriya')} &rarr;
              </button>
            )}
          </div>
        </div>

        {/* Total Inventory Value OR Action Queue (based on buying price permission) */}
        {canViewBuyingPrices ? (
          <div className="p-5 rounded-2xl bg-[#12161F] border border-slate-800 hover:border-sky-500/40 transition">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">{tf('Stock Value (At Cost)', 'Agaciro k’Ububiko (Kurangura)')}</span>
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Boxes className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-black text-sky-300 mt-3 font-sans">
              {formatRwf(stats.inventoryValue)}
            </p>
            <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
              <span>{tf(`${stats.productCount} products in shop`, `Ibicuruzwa ${stats.productCount} mu iduka`)}</span>
              <span className="text-slate-400 font-medium">{tf('Based on buying cost', 'Ku giciro cyo kurangura')}</span>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-[#12161F] border border-slate-800 hover:border-sky-500/40 transition">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">{tf('Active Order Queue', 'Amategeko Ategereje')}</span>
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-black text-sky-300 mt-3 font-sans">
              {(stats.pendingPaymentCount || 0) + (stats.pendingStoreCount || 0)} {tf('Open', 'Bifunguye')}
            </p>
            <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
              <span>{tf(`${stats.pendingPaymentCount || 0} unpaid • ${stats.pendingStoreCount || 0} at store`, `${stats.pendingPaymentCount || 0} bitishyuwe • ${stats.pendingStoreCount || 0} mu bubiko`)}</span>
              <button onClick={() => onNavigate('orders')} className="text-sky-400 hover:underline font-semibold">
                {tf('Open Queue', 'Reba Urutonde')} &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Low Stock Alerts */}
        <div className={`p-5 rounded-2xl border transition ${
          stats.lowStockCount > 0 
            ? 'bg-amber-950/20 border-amber-500/40' 
            : 'bg-[#12161F] border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{tf('Running Low', 'Ibigiye Gushira')}</span>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              stats.lowStockCount > 0 ? 'bg-amber-500/20 text-amber-400 animate-bounce' : 'bg-slate-800 text-slate-400'
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-300 mt-3 font-sans">
            {tf(`${stats.lowStockCount} Item(s)`, `Ibicuruzwa ${stats.lowStockCount}`)}
          </p>
          <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
            <span>{tf('Items need restocking', 'Bikeneye kurangurwa')}</span>
            <button onClick={() => onNavigate('products')} className="text-amber-400 hover:underline font-semibold">
              {tf('Restock', 'Ongera Ububiko')} &rarr;
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
              <h2 className="text-base font-bold text-white">{tf('Last 7 Days Sales (RWF)', 'Igurisha ry’Iminsi 7 Ishize (RWF)')}</h2>
              <p className="text-xs text-slate-400">{tf('Daily sales totals for the past week', 'Igiteranyo cy’igurisha rya buri munsi mu cyumweru gishize')}</p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-800 text-amber-400 border border-slate-700">
              {tf('Total:', 'Igiteranyo:')} {formatRwf(stats.totalSales)}
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
                {tf('No orders recorded yet this week.', 'Nta gurisha riraboneka muri iki cyumweru.')}
              </div>
            )}
          </div>
        </div>

        {/* Payment Channels Breakdown */}
        <div className="p-6 rounded-2xl bg-[#12161F] border border-slate-800 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-white">{tf('Payment Methods', 'Uburyo bwo Kwishyura')}</h2>
            <p className="text-xs text-slate-400">{tf('Cash, Mobile Money & Bank payments', 'Kwishyura mu ntoki, Mobile Money na Banki')}</p>

            <div className="mt-4 space-y-3">
              {stats.paymentBreakdown.map((pb, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-200 capitalize">
                        {trPaymentMethod(pb.payment_method)}
                      </p>
                      <p className="text-[11px] text-slate-400">{tf(`${pb.count} payment(s)`, `Inshuro ${pb.count}`)}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-100 font-mono">
                    {formatRwf(pb.total_amount)}
                  </span>
                </div>
              ))}

              {stats.paymentBreakdown.length === 0 && (
                <p className="text-xs text-slate-400 py-6 text-center">{tf('No payments recorded yet.', 'Nta bwishyu burandikwa.')}</p>
              )}
            </div>
          </div>

          {canViewReports && (
            <button
              onClick={() => onNavigate('reports')}
              className="w-full mt-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-400 border border-slate-700 transition"
            >
              {tf('View Full Reports', 'Reba Raporo Zose')} &rarr;
            </button>
          )}
        </div>
      </div>

      {/* Bottom Section: Recent Orders Table & Low Stock Urgent List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders Stream */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#12161F] border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">{tf('Recent Orders', 'Amategeko Aheruka')}</h2>
              <p className="text-xs text-slate-400">{tf('Latest orders from sale to store release', 'Amategeko aheruka kuva agurishwa kugera asohotse mu bubiko')}</p>
            </div>
            <button
              onClick={() => onNavigate('orders')}
              className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1"
            >
              {tf(`All Orders (${stats.recentOrders.length})`, `Amategeko Yose (${stats.recentOrders.length})`)} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 font-semibold">{tf('Order #', 'Itegeko #')}</th>
                  <th className="py-2.5 font-semibold">{tf('Customer', 'Umukiriya')}</th>
                  <th className="py-2.5 font-semibold">{tf('Total', 'Igiteranyo')}</th>
                  <th className="py-2.5 font-semibold">{tf('Payment', 'Ubwishyu')}</th>
                  <th className="py-2.5 font-semibold">{tf('Store Status', 'Ububiko')}</th>
                  <th className="py-2.5 font-semibold text-right">{tf('Action', 'Igikorwa')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stats.recentOrders.map((ord) => {
                  const isCancelled = ord.fulfillment_status === 'cancelled';
                  return (
                    <tr key={ord.id} className={isCancelled ? 'bg-rose-950/15 hover:bg-rose-950/25 transition' : 'hover:bg-slate-800/40 transition'}>
                      <td className={`py-3 font-mono font-bold ${isCancelled ? 'text-rose-400 line-through' : 'text-amber-400'}`}>
                        {ord.order_number}
                      </td>
                      <td className="py-3 text-slate-300">{ord.customer_name || tf('Walk-in Cash Client', 'Umukiriya usanzwe')}</td>
                      <td className="py-3 font-semibold font-mono">
                        {isCancelled ? (
                          <div>
                            <span className="text-slate-200">RWF 0</span>
                            <span className="block text-[10px] text-rose-400 font-bold">
                              ({tf('Cancelled:', 'Yahagaritswe:')} {formatRwf(ord.total_amount)})
                            </span>
                          </div>
                        ) : (
                          <span className="text-white">{formatRwf(ord.total_amount)}</span>
                        )}
                      </td>
                      <td className="py-3">
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
                      <td className="py-3">
                        <span className={`text-[11px] font-medium capitalize ${isCancelled ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>
                          {trFulfillmentStatus(ord.fulfillment_status)}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => onViewOrder(ord.id)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-amber-400 font-semibold border border-slate-700 transition"
                        >
                          {tf('Open', 'Fungura')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {stats.recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      {tf('No customer orders yet. Click Make a Sale to start selling.', 'Nta mategeko arakorwa. Kanda Gurisha utangire kugurisha.')}
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
              <h2 className="text-base font-bold text-white">{tf('Items to Restock', 'Ibicuruzwa Bikeneye Kurangurwa')}</h2>
              <p className="text-xs text-slate-400">{tf('Running low in store', 'Birabura gushira mu bubiko')}</p>
            </div>
            <span className="text-xs font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              {tf(`${stats.lowStockProducts.length} Items`, `Ibicuruzwa ${stats.lowStockProducts.length}`)}
            </span>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-72 pr-1">
            {stats.lowStockProducts.map((p) => (
              <div key={p.id} className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between">
                <div className="truncate pr-2">
                  <p className="text-xs font-bold text-slate-200 truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{tf('Code:', 'Kode:')} {p.sku} • {p.category}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-black text-rose-400 font-mono">
                    {p.quantity} {p.unit}
                  </span>
                  <p className="text-[10px] text-slate-400">{tf('Min:', 'Ntarengwa:')} {p.low_stock_threshold}</p>
                </div>
              </div>
            ))}

            {stats.lowStockProducts.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="font-semibold text-slate-300">{tf('All Stock Levels Good', 'Ububiko Bwose Buhagije')}</p>
                <p className="text-[11px] text-slate-400 mt-1">{tf('No items are running low right now.', 'Nta bicuruzwa biri gushira ubu.')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
