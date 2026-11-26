import React, { useEffect, useState } from 'react';
import { DashboardStats, Order, ProductWatchAlert, Shop, User } from '../types';
import { hasPermission, canViewStockLevels } from '../utils/permissions';
import { api } from '../services/api';
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
  ChevronRight,
  Eye,
  Flag,
  ShieldCheck
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface DashboardViewProps {
  user: User | null;
  shop?: Shop | null;
  stats: DashboardStats | null;
  loading: boolean;
  onNavigate: (tab: string) => void;
  onViewOrder: (orderId: number) => void;
  onToast?: (msg: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  shop,
  stats,
  loading,
  onNavigate,
  onViewOrder,
  onToast
}) => {
  const { tf, trPaymentMethod, trPaymentStatus, trFulfillmentStatus } = useLanguage();

  const isStrictChain = shop?.workflow_mode === 'strict_chain';
  const isStockOnly = shop?.pricing_mode === 'stock_only';

  const canCreateOrders = hasPermission(user, 'can_create_orders');
  const canManageStock = hasPermission(user, 'can_manage_stock');
  const canViewBuyingPrices = hasPermission(user, 'can_view_buying_prices');
  const canViewReports = hasPermission(user, 'can_view_reports');
  const canResolveFlagged = hasPermission(user, 'can_resolve_flagged_orders');
  const canAuditWatch = isStrictChain && (canViewReports || canResolveFlagged);
  const canViewCustomers = hasPermission(user, 'can_manage_customers') || hasPermission(user, 'can_process_payments') || canCreateOrders;
  const showStockLevels = !isStrictChain || canViewStockLevels(user);

  const [watchAlerts, setWatchAlerts] = useState<ProductWatchAlert[]>([]);
  const [unauditedCount, setUnauditedCount] = useState<number>(0);
  const [watchFilter, setWatchFilter] = useState<'unaudited' | 'all'>('unaudited');
  const [watchLoading, setWatchLoading] = useState(false);
  const [auditingId, setAuditingId] = useState<number | null>(null);
  const [auditNoteInput, setAuditNoteInput] = useState<Record<number, string>>({});
  const [chainOrders, setChainOrders] = useState<Order[]>([]);

  const loadStrictChainWidgets = async (filterMode: 'unaudited' | 'all' = watchFilter) => {
    if (!user || !isStrictChain) return;
    try {
      const ordersPromise = api.chain.getOrders('all').catch(() => ({ orders: [] }));
      const alertsPromise = canAuditWatch
        ? api.chain.getWatchAlerts(filterMode).catch(() => ({ alerts: [], unauditedCount: 0 }))
        : Promise.resolve({ alerts: [], unauditedCount: 0 });
      setWatchLoading(true);
      const [ordRes, alertRes] = await Promise.all([ordersPromise, alertsPromise]);
      setChainOrders(ordRes.orders || []);
      setWatchAlerts(alertRes.alerts || []);
      setUnauditedCount(Number(alertRes.unauditedCount || 0));
    } finally {
      setWatchLoading(false);
    }
  };

  useEffect(() => {
    if (user && isStrictChain) {
      loadStrictChainWidgets(watchFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, shop?.id, isStrictChain, canAuditWatch, watchFilter]);

  const handleMarkAudited = async (alert: ProductWatchAlert) => {
    try {
      setAuditingId(alert.id);
      const note = auditNoteInput[alert.id]?.trim();
      await api.chain.markWatchAlertAudited(alert.id, note || undefined);
      onToast?.(
        tf(
          `Marked "${alert.product_name}" (${alert.order_number}) as audited.`,
          `Wemeje ko "${alert.product_name}" (${alert.order_number}) yagenzuwe.`
        )
      );
      await loadStrictChainWidgets(watchFilter);
    } catch (err: any) {
      onToast?.(err?.message || tf('Failed to mark alert audited.', 'Kwemeza ubugenzuzi byanze.'));
    } finally {
      setAuditingId(null);
    }
  };

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

  const pendingVerify1Count = chainOrders.filter((o) => o.chain_status === 'pending_supervisor_1').length;
  const inReleaseCount = chainOrders.filter((o) => o.chain_status === 'in_release').length;
  const flaggedCount = chainOrders.filter((o) => o.chain_status === 'flagged_for_manager').length;

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
            {isStockOnly
              ? tf('Stock movement overview, verification chain status, and watched-product audits.', 'Incamake y’imikorere ya sitoki, uruhererekane rw’igenzura, n’ibicuruzwa bikurikiranwa.')
              : tf("Today's sales, store stock levels, and unpaid customer balances.", 'Igurisha ry’uyu munsi, uko ububiko buhagaze, n’amadeni y’abakiriya.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isStrictChain ? (
            (canCreateOrders ||
              hasPermission(user, 'can_release_stock') ||
              hasPermission(user, 'can_verify_orders') ||
              canResolveFlagged) && (
              <button
                onClick={() => onNavigate('chain')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{tf('Open Verification Chain', 'Fungura Uruhererekane rw’Igenzura')}</span>
              </button>
            )
          ) : (
            canCreateOrders && (
              <button
                onClick={() => onNavigate('pos')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{tf('New Sale (POS)', 'Igurisha Rishya (POS)')}</span>
              </button>
            )
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
      {isStockOnly ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#12161F] border border-slate-800 hover:border-amber-500/40 transition">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">{tf('Pending Verify #1', 'Itegereje Igenzura #1')}</span>
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-black text-amber-300 mt-3 font-sans">{pendingVerify1Count}</p>
            <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
              <span>{tf('Awaiting supervisor review', 'Bitegereje igenzura rya 1')}</span>
              <button onClick={() => onNavigate('chain')} className="text-amber-400 hover:underline font-semibold">
                {tf('Open', 'Fungura')} &rarr;
              </button>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#12161F] border border-slate-800 hover:border-sky-500/40 transition">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">{tf('In Physical Release', 'Mu Isohorwa')}</span>
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Boxes className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-black text-sky-300 mt-3 font-sans">{inReleaseCount}</p>
            <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
              <span>{tf('At Shop / Warehouse & #2', 'Mu iduka, ububiko & #2')}</span>
              <button onClick={() => onNavigate('chain')} className="text-sky-400 hover:underline font-semibold">
                {tf('Track', 'Kurikirana')} &rarr;
              </button>
            </div>
          </div>

          <div className={`p-5 rounded-2xl border transition ${flaggedCount > 0 ? 'bg-rose-950/25 border-rose-500/40' : 'bg-[#12161F] border-slate-800'}`}>
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">{tf('Flagged for Manager', 'Ibibazo ku Muyobozi')}</span>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${flaggedCount > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
                <Flag className="w-5 h-5" />
              </div>
            </div>
            <p className={`text-2xl font-black mt-3 font-sans ${flaggedCount > 0 ? 'text-rose-300' : 'text-white'}`}>{flaggedCount}</p>
            <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
              <span>{tf('Discrepancies frozen', 'Komande zafunzwe')}</span>
              <button onClick={() => onNavigate('chain')} className="text-rose-300 hover:underline font-semibold">
                {tf('Resolve', 'Kemura')} &rarr;
              </button>
            </div>
          </div>

          {showStockLevels ? (
            <div className={`p-5 rounded-2xl border transition ${stats.lowStockCount > 0 ? 'bg-amber-950/20 border-amber-500/40' : 'bg-[#12161F] border-slate-800'}`}>
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">{tf('Running Low', 'Ibigiye Gushira')}</span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stats.lowStockCount > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-amber-300 mt-3 font-sans">
                {tf(`${stats.lowStockCount} Item(s)`, `Ibicuruzwa ${stats.lowStockCount}`)}
              </p>
              <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
                <span>{tf(`${stats.productCount} products tracked`, `Ibicuruzwa ${stats.productCount} bikurikiranwa`)}</span>
                <button onClick={() => onNavigate('products')} className="text-amber-400 hover:underline font-semibold">
                  {tf('Check Stock', 'Reba Sitoki')} &rarr;
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl border bg-[#12161F] border-slate-800 transition">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">{tf('Catalog Products', 'Urutonde rw’Ibicuruzwa')}</span>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-800 text-slate-300">
                  <Package className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-white mt-3 font-sans">
                {tf(`${stats.productCount} Item(s)`, `Ibicuruzwa ${stats.productCount}`)}
              </p>
              <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
                <span>{tf('Quantities hidden for this role', 'Imibare ya sitoki ihishwe')}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
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
      )}

      {/* Special Watched Products Manager Audit Panel (for strict_chain tenants) */}
      {isStrictChain && canAuditWatch && (
        <div className="p-6 rounded-2xl bg-[#12161F] border border-purple-500/40 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <Eye className="w-5 h-5 text-purple-400" />
                <h2 className="text-base font-bold text-white">
                  {tf('Special Watched Products Audit', 'Igenzura ry’Ibicuruzwa Byihariye Bikurikiranwa')}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${
                  unauditedCount > 0
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}>
                  {unauditedCount > 0
                    ? tf(`${unauditedCount} Unaudited Alert(s)`, `Ibimenyetso ${unauditedCount} Bitaragenzurwa`)
                    : tf('All Caught Up', 'Byose Byagenzuwe')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {tf(
                  'Every time a monitored product completes release, it is logged here permanently so you can verify who bought it, who released it, and remaining stock—even after days away.',
                  'Buri gihe igicuruzwa gikurikiranwa gisohotse, cyandikwa hano kugira ngo urebe uwakiguze, uwacyemeje, n’ibisigaye—n’igihe wari udahari.'
                )}
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs self-start">
              <button
                type="button"
                onClick={() => setWatchFilter('unaudited')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  watchFilter === 'unaudited'
                    ? 'bg-purple-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf('Unaudited Only', 'Bitaragenzurwa Gusa')}
              </button>
              <button
                type="button"
                onClick={() => setWatchFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  watchFilter === 'all'
                    ? 'bg-purple-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf('All History', 'Amateka Yose')}
              </button>
            </div>
          </div>

          {watchLoading ? (
            <p className="text-xs text-slate-400 py-6 text-center">{tf('Loading watched product alerts...', 'Birimo gufungura amakuru...')}</p>
          ) : watchAlerts.length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
              <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-1.5" />
              {watchFilter === 'unaudited'
                ? tf('No unaudited special-product releases waiting for your review.', 'Nta bicuruzwa bikurikiranwa bitegereje ubugenzuzi bwawe.')
                : tf('No watched product sales recorded yet.', 'Nta gicuruzwa gikurikiranwa kiragurishwa.')}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {watchAlerts.map((al) => {
                const audited = Boolean(al.is_audited);
                return (
                  <div
                    key={al.id}
                    className={`p-3.5 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                      audited
                        ? 'bg-slate-900/50 border-slate-800/80 opacity-85'
                        : 'bg-purple-950/20 border-purple-500/40'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-white">{al.product_name}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono text-[11px] font-bold">
                          -{al.quantity_sold} {al.sold_unit || 'pcs'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                          {al.stock_name || 'Main Shop'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-300">
                          {tf('Left:', 'Hasigaye:')} <strong>{al.stock_remaining_after}</strong>
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        <span className="font-mono text-amber-400">{al.order_number}</span> &bull;{' '}
                        {tf('Buyer:', 'Umukiriya:')} <strong>{al.customer_name || tf('Walk-in', 'Usanzwe')}</strong> &bull;{' '}
                        {tf('Seller:', 'Umucuruzi:')} <strong>{al.seller_name}</strong> &bull;{' '}
                        {tf('Verified by:', 'Byemejwe na:')} <strong>{al.first_verifier_name}</strong>
                        {al.final_verifier_name ? ` → ${al.final_verifier_name}` : ''} &bull;{' '}
                        <span className="text-slate-400">{new Date(al.created_at).toLocaleString()}</span>
                      </p>
                      {audited && al.audited_by_name && (
                        <p className="text-[10px] text-emerald-300">
                          {tf('Audited by:', 'Byagenzuwe na:')} <strong>{al.audited_by_name}</strong>
                          {al.audit_note ? ` — "${al.audit_note}"` : ''}
                        </p>
                      )}
                    </div>

                    {!audited && (
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="text"
                          value={auditNoteInput[al.id] || ''}
                          onChange={(e) =>
                            setAuditNoteInput((prev) => ({ ...prev, [al.id]: e.target.value }))
                          }
                          placeholder={tf('Optional audit note...', 'Inyandiko (si ngombwa)...')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white w-44"
                        />
                        <button
                          type="button"
                          disabled={auditingId === al.id}
                          onClick={() => handleMarkAudited(al)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs whitespace-nowrap"
                        >
                          {auditingId === al.id ? tf('Saving...', 'Birabikwa...') : tf('Mark Audited', 'Emeza ko Byagenzuwe')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Middle Section: 7-Day Trend Chart & Payment Methods (Standard Pricing Mode Only) */}
      {!isStockOnly && (
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
      )}

      {/* Bottom Section: Recent Orders Table & Low Stock Urgent List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders Stream */}
        <div className={`${showStockLevels ? 'lg:col-span-2' : 'lg:col-span-3'} p-6 rounded-2xl bg-[#12161F] border border-slate-800`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">{tf('Recent Orders', 'Amategeko Aheruka')}</h2>
              <p className="text-xs text-slate-400">{tf('Latest orders from sale to store release', 'Amategeko aheruka kuva agurishwa kugera asohotse mu bubiko')}</p>
            </div>
            <button
              onClick={() => onNavigate(isStrictChain ? 'chain' : 'orders')}
              className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1"
            >
              {tf(`All Orders (${isStrictChain ? chainOrders.length : stats.recentOrders.length})`, `Amategeko Yose (${isStrictChain ? chainOrders.length : stats.recentOrders.length})`)} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 font-semibold">{tf('Order #', 'Itegeko #')}</th>
                  <th className="py-2.5 font-semibold">{tf('Customer', 'Umukiriya')}</th>
                  {!isStockOnly && <th className="py-2.5 font-semibold">{tf('Total', 'Igiteranyo')}</th>}
                  {!isStockOnly && <th className="py-2.5 font-semibold">{tf('Payment', 'Ubwishyu')}</th>}
                  <th className="py-2.5 font-semibold">{isStrictChain ? tf('Verification Stage', 'Urwego rw’Igenzura') : tf('Store Status', 'Ububiko')}</th>
                  <th className="py-2.5 font-semibold text-right">{tf('Action', 'Igikorwa')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(isStrictChain ? chainOrders.slice(0, 10) : stats.recentOrders).map((ord) => {
                  const isCancelled = ord.fulfillment_status === 'cancelled' || ord.chain_status === 'cancelled';
                  return (
                    <tr key={ord.id} className={isCancelled ? 'bg-rose-950/15 hover:bg-rose-950/25 transition' : 'hover:bg-slate-800/40 transition'}>
                      <td className={`py-3 font-mono font-bold ${isCancelled ? 'text-rose-400 line-through' : 'text-amber-400'}`}>
                        {ord.order_number}
                      </td>
                      <td className="py-3 text-slate-300">{ord.customer_name || tf('Walk-in Cash Client', 'Umukiriya usanzwe')}</td>
                      {!isStockOnly && (
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
                      )}
                      {!isStockOnly && (
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
                      )}
                      <td className="py-3">
                        <span className={`text-[11px] font-medium capitalize ${isCancelled ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>
                          {isStrictChain ? (ord.chain_status || trFulfillmentStatus(ord.fulfillment_status)).replace(/_/g, ' ') : trFulfillmentStatus(ord.fulfillment_status)}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => (isStrictChain ? onNavigate('chain') : onViewOrder(ord.id))}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-amber-400 font-semibold border border-slate-700 transition"
                        >
                          {tf('Open', 'Fungura')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {(isStrictChain ? chainOrders : stats.recentOrders).length === 0 && (
                  <tr>
                    <td colSpan={isStockOnly ? 4 : 6} className="py-6 text-center text-slate-400">
                      {isStrictChain
                        ? tf('No verification chain orders yet. Open Verification Chain to create one.', 'Nta komande zirakorwa. Fungura Uruhererekane utangire.')
                        : tf('No customer orders yet. Click Make a Sale to start selling.', 'Nta mategeko arakorwa. Kanda Gurisha utangire kugurisha.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Fast Reorder Card */}
        {showStockLevels && (
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
        )}
      </div>
    </div>
  );
};
