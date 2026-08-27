import React, { useState, useEffect } from 'react';
import { ReportSummary, User } from '../types';
import { api } from '../services/api';
import { 
  BarChart3, 
  TrendingUp, 
  ShieldAlert, 
  Award, 
  Layers, 
  Download,
  Calendar,
  FileSpreadsheet
} from 'lucide-react';

interface ReportsViewProps {
  user: User | null;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ user }) => {
  const [reports, setReports] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeReportTab, setActiveReportTab] = useState<'categories' | 'products' | 'staff' | 'audit'>('categories');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const data = await api.getReports();
      setReports(data);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  if (loading || !reports) {
    return (
      <div className="p-8 space-y-6 animate-pulse max-w-7xl mx-auto">
        <div className="h-40 bg-slate-900/60 rounded-2xl border border-slate-800" />
      </div>
    );
  }

  const exportCsv = () => {
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
      csvContent += 'Date,Action,User,Role,IP Address,Details\n';
      reports.auditLogs.forEach(l => {
        csvContent += `"${l.created_at}","${l.action}","${l.user_name || ''}","${l.user_role || ''}","${l.ip_address}","${l.details}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `VectOS_${activeReportTab}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Business Intelligence & Audit Logs
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Audited
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Category turnover, item margins, salesperson rankings, and system security events.
          </p>
        </div>

        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
        >
          <Download className="w-4 h-4 text-amber-400" />
          <span>Export {activeReportTab.toUpperCase()} CSV</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 text-xs overflow-x-auto">
        {[
          { id: 'categories', label: 'Sales by Category', icon: Layers },
          { id: 'products', label: 'Top Selling Products', icon: TrendingUp },
          { id: 'staff', label: 'Salesperson Leaderboard', icon: Award },
          { id: 'audit', label: 'Security & Action Audit', icon: ShieldAlert },
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
                <th className="py-3 px-4">Gross Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {reports.categorySales.map((cat, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="py-3.5 px-4 font-bold text-white">{cat.category}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">{cat.units_sold} units</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-amber-400">{formatRwf(cat.revenue)}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">{formatRwf(cat.profit)}</td>
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
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Units Sold</th>
                <th className="py-3 px-4">Revenue Generated</th>
                <th className="py-3 px-4">Profit Generated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {reports.topSellingProducts.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="py-3.5 px-4">
                    <p className="font-bold text-white">{p.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</p>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300">{p.category}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-amber-400">{p.total_units_sold}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-white">{formatRwf(p.total_revenue)}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">{formatRwf(p.total_profit)}</td>
                </tr>
              ))}
              {reports.topSellingProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">No sales recorded yet.</td>
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

      {/* Tab 4: Security Audit Logs */}
      {activeReportTab === 'audit' && (
        <div className="rounded-2xl bg-[#121620] border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 text-[11px] uppercase">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Operator</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Event Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {reports.auditLogs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-200">
                    {l.user_name || 'System'}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-amber-400">
                    {l.action}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {l.ip_address}
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">
                    {l.details}
                  </td>
                </tr>
              ))}
              {reports.auditLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">No security audit logs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
