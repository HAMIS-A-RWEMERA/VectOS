import React, { useState, useEffect } from 'react';
import { ReportSummary, User, Shop, AuditLogEntry } from '../types';
import { api } from '../services/api';
import { exportReportsPdf } from '../services/pdfExport';
import { 
  BarChart3, 
  TrendingUp, 
  ShieldAlert, 
  Award, 
  Layers, 
  Download,
  Calendar,
  FileSpreadsheet,
  FileText,
  Search,
  Filter,
  CheckCircle2,
  Lock,
  UserCheck,
  Package,
  CreditCard,
  Building2,
  RefreshCw,
  ChevronDown
} from 'lucide-react';

interface ReportsViewProps {
  user: User | null;
  shop?: Shop | null;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ user, shop }) => {
  const [reports, setReports] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeReportTab, setActiveReportTab] = useState<'categories' | 'products' | 'staff' | 'audit'>('categories');
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'all'>('month');
  const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);

  // Audit Tab specific state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchReports();
    }
  }, [user, period]);

  useEffect(() => {
    if (activeReportTab === 'audit' && user) {
      fetchAuditLogs();
    }
  }, [activeReportTab, selectedAction]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const data = await api.getReports({ period });
      setReports(data);
    } catch (err: any) {
      if (err?.message?.includes('log in') || err?.message?.includes('Authentication Required')) {
        return;
      }
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPeriodLabel = (p: string) => {
    switch (p) {
      case 'day': return 'Daily (Today)';
      case 'week': return 'Weekly (Past 7 Days)';
      case 'month': return 'Monthly (Past 30 Days)';
      default: return 'All Time';
    }
  };

  const handleExportPdf = (mode: 'active' | 'all') => {
    if (!reports) return;
    setIsPdfDropdownOpen(false);
    exportReportsPdf({
      reports,
      period,
      periodLabel: getPeriodLabel(period),
      activeTab: mode === 'all' ? 'all' : activeReportTab,
      shop: shop || null,
      user,
    });
  };

  const fetchAuditLogs = async () => {
    try {
      setAuditLoading(true);
      const res = await api.getAuditLogs({
        search: auditSearch,
        action: selectedAction !== 'all' ? selectedAction : undefined,
        limit: 150
      });
      setAuditLogs(res.logs || []);
      if (res.availableActions && res.availableActions.length > 0) {
        setAvailableActions(res.availableActions);
      }
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleAuditSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAuditLogs();
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  const getActionBadge = (action: string) => {
    if (action.includes('PAYMENT')) {
      return { label: action, bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: CreditCard };
    }
    if (action.includes('STOCK') || action.includes('DISPATCH') || action.includes('IMPORT')) {
      return { label: action, bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40', icon: Package };
    }
    if (action.includes('PASSWORD') || action.includes('AUTH') || action.includes('LOGIN')) {
      return { label: action, bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40', icon: Lock };
    }
    if (action.includes('USER') || action.includes('ROLE')) {
      return { label: action, bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: UserCheck };
    }
    return { label: action, bg: 'bg-slate-800 text-slate-300 border-slate-700', icon: ShieldAlert };
  };

  const exportCsv = () => {
    if (!reports) return;
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (activeReportTab === 'categories') {
      csvContent += 'Category,Revenue (RWF),Units Sold,Gross Profit (RWF)\n';
      reports.categorySales.forEach(c => {
        csvContent += `"${c.category}",${c.revenue},${c.units_sold},${c.profit}\n`;
      });
    } else if (activeReportTab === 'products') {
      csvContent += 'Product,SKU,Category,Units Sold,Revenue (RWF),Profit (RWF)\n';
      reports.topSellingProducts.forEach(p => {
        csvContent += `"${p.name}","${p.sku}","${p.category}",${p.total_units_sold},${p.total_revenue},${p.total_profit}\n`;
      });
    } else if (activeReportTab === 'staff') {
      csvContent += 'Staff Name,Email,Total Orders,Total Sales (RWF)\n';
      reports.salespersonPerformance.forEach(s => {
        csvContent += `"${s.name}","${s.email}",${s.total_orders},${s.total_sales}\n`;
      });
    } else {
      csvContent += 'Timestamp,Operator Name,Operator Role,Action,IP Address,Details\n';
      const logsToExport = auditLogs.length > 0 ? auditLogs : (reports.auditLogs as any[]);
      logsToExport.forEach(l => {
        csvContent += `"${l.created_at}","${l.user_name || 'System'}","${l.user_role || ''}","${l.action}","${l.ip_address}","${l.details}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `VectOS_${activeReportTab}_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !reports) {
    return (
      <div className="p-8 space-y-6 animate-pulse max-w-7xl mx-auto">
        <div className="h-40 bg-slate-900/60 rounded-2xl border border-slate-800" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Business Intelligence & Financial Reports
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {getPeriodLabel(period)}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Category turnover, top products, cashier/storekeeper approval tracking, and immutable security trail.
          </p>
        </div>

        {/* Time Horizon Selector & Export Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Selector */}
          <div className="flex items-center bg-[#121620] p-1 rounded-xl border border-slate-800 text-xs">
            {[
              { id: 'day', label: 'Daily (Today)' },
              { id: 'week', label: 'Weekly (7d)' },
              { id: 'month', label: 'Monthly (30d)' },
              { id: 'all', label: 'All Time' },
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

          {/* PDF Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-900/20 border border-rose-500/30 transition"
            >
              <FileText className="w-4 h-4 text-white" />
              <span>Export PDF</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>

            {isPdfDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#121620] border border-slate-800 shadow-2xl p-2 z-50 text-xs">
                <button
                  onClick={() => handleExportPdf('all')}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200 transition font-medium flex flex-col gap-0.5"
                >
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    Complete Financial Summary
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Includes category turnover, products & leaderboard ({getPeriodLabel(period)})
                  </span>
                </button>
                <div className="my-1 border-t border-slate-800" />
                <button
                  onClick={() => handleExportPdf('active')}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200 transition font-medium flex flex-col gap-0.5"
                >
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    Active Tab Only ({activeReportTab.toUpperCase()})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Exports only currently focused dataset
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* CSV Export */}
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 text-xs overflow-x-auto">
        {[
          { id: 'categories', label: 'Sales by Category', icon: Layers },
          { id: 'products', label: 'Top Selling Products', icon: TrendingUp },
          { id: 'staff', label: 'Salesperson Leaderboard', icon: Award },
          { id: 'audit', label: 'Internal Audit & Approvals Trail', icon: ShieldAlert },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeReportTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveReportTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition whitespace-nowrap ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-[#121620] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Category Sales */}
      {activeReportTab === 'categories' && (
        <div className="rounded-2xl bg-[#121620] border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 text-[11px] uppercase">
              <tr>
                <th className="py-3 px-4">Hardware Department</th>
                <th className="py-3 px-4">Units Sold</th>
                <th className="py-3 px-4">Gross Revenue</th>
                <th className="py-3 px-4 font-semibold">Estimated Gross Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {reports.categorySales.map((c, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    {c.category}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">{c.units_sold.toLocaleString()} units</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-100">{formatRwf(c.revenue)}</td>
                  <td className="py-3.5 px-4 font-mono font-black text-emerald-400">{formatRwf(c.profit)}</td>
                </tr>
              ))}
              {reports.categorySales.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">No category sales recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Top Selling Products */}
      {activeReportTab === 'products' && (
        <div className="rounded-2xl bg-[#121620] border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 text-[11px] uppercase">
              <tr>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Units Sold</th>
                <th className="py-3 px-4">Total Revenue</th>
                <th className="py-3 px-4 font-semibold">Gross Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {reports.topSellingProducts.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="py-3.5 px-4 font-bold text-white">{p.name}</td>
                  <td className="py-3.5 px-4 font-mono text-amber-400">{p.sku}</td>
                  <td className="py-3.5 px-4 text-slate-300">{p.category}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-200">{p.total_units_sold}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-100">{formatRwf(p.total_revenue)}</td>
                  <td className="py-3.5 px-4 font-mono font-black text-emerald-400">{formatRwf(p.total_profit)}</td>
                </tr>
              ))}
              {reports.topSellingProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">No product sales logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Salesperson Leaderboard */}
      {activeReportTab === 'staff' && (
        <div className="rounded-2xl bg-[#121620] border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 text-[11px] uppercase">
              <tr>
                <th className="py-3 px-4">Rank & Salesperson</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Completed Invoices</th>
                <th className="py-3 px-4 font-semibold">Total Revenue Generated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {reports.salespersonPerformance.map((s, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="py-3.5 px-4 flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                      idx === 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="font-bold text-white">{s.name}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">{s.email}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-200">{s.total_orders} orders</td>
                  <td className="py-3.5 px-4 font-mono font-black text-amber-400">{formatRwf(s.total_sales)}</td>
                </tr>
              ))}
              {reports.salespersonPerformance.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">No salesperson data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Internal Audit Trail & Approvals (Enhanced) */}
      {activeReportTab === 'audit' && (
        <div className="space-y-4">
          {/* Filter & Search Toolbar */}
          <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <form onSubmit={handleAuditSearchSubmit} className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="text"
                placeholder="Search audit details, staff name, email..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </form>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Action Types</option>
                {availableActions.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>

              <button
                onClick={fetchAuditLogs}
                disabled={auditLoading}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                title="Refresh audit stream"
              >
                <RefreshCw className={`w-4 h-4 ${auditLoading ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="rounded-2xl bg-[#121620] border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 text-[11px] uppercase">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Role / Perm</th>
                  <th className="py-3 px-4">Action Event</th>
                  <th className="py-3 px-4">Activity Description & Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {(auditLogs.length > 0 ? auditLogs : reports.auditLogs).map((l: any) => {
                  const badge = getActionBadge(l.action);
                  return (
                    <tr key={l.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap text-[11px]">
                        {new Date(l.created_at).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-white block">{l.user_name || 'System Auto-Agent'}</span>
                        {l.user_email && <span className="text-[10px] text-slate-400 font-mono">{l.user_email}</span>}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                          {l.user_role || 'system'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${badge.bg}`}>
                          <badge.icon className="w-3 h-3" />
                          <span>{l.action}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 text-xs font-mono">
                        {l.details}
                      </td>
                    </tr>
                  );
                })}
                {(auditLogs.length === 0 && reports.auditLogs.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      No internal audit logs found matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
