import React, { useEffect, useState } from 'react';
import { Customer, CustomerStatement, Shop, User } from '../types';
import { api } from '../services/api';
import { exportCustomerStatementPdf } from '../services/pdfExport';
import {
  X,
  Printer,
  Download,
  Calendar,
  FileText,
  CreditCard,
  Wallet,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface CustomerStatementModalProps {
  customer: Customer;
  shop: Shop | null;
  user: User | null;
  canProcessPayments: boolean;
  onClose: () => void;
  onOpenBulkSettle?: (customer: Customer) => void;
  onOpenStoreCredit?: (customer: Customer) => void;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({
  customer,
  shop,
  user,
  canProcessPayments,
  onClose,
  onOpenBulkSettle,
  onOpenStoreCredit,
}) => {
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'all' | 'custom'>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'orders' | 'payments'>('orders');

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;
  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  useEffect(() => {
    if (period === 'custom' && !startDate && !endDate) {
      return;
    }
    fetchStatement();
  }, [customer.id, period, startDate, endDate]);

  const fetchStatement = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.getCustomerStatement(customer.id, {
        period,
        startDate: period === 'custom' ? startDate : undefined,
        endDate: period === 'custom' ? endDate : undefined,
      });
      setStatement(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load customer statement.');
    } finally {
      setLoading(false);
    }
  };

  const escapeHtml = (str: string): string =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const handleDirectPrint = () => {
    if (!statement) return;

    let iframe = document.getElementById('vectos-statement-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'vectos-statement-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);
    }

    const shopName = escapeHtml(shop?.name || statement.shop?.name || 'Hardware Store');
    const shopLoc = escapeHtml(shop?.location || statement.shop?.location || '');
    const shopPhone = escapeHtml(shop?.phone || statement.shop?.phone || '');
    const shopTin = escapeHtml((shop?.tin_number || statement.shop?.tin_number || '').trim());
    const c = statement.customer;

    const ordersRows = statement.orders.length > 0
      ? statement.orders.map((o, idx) => {
          const itemsList = (o.statement_items && o.statement_items.length > 0)
            ? o.statement_items.map(it => `${escapeHtml(it.product_name)} × ${it.quantity} (@ ${Math.round(it.selling_price).toLocaleString()})`).join('<br/>')
            : 'Order items';
          return `
            <tr>
              <td class="center">${idx + 1}</td>
              <td>${escapeHtml(formatDate(o.created_at))}</td>
              <td class="bold">${escapeHtml(o.order_number)}</td>
              <td>${itemsList}</td>
              <td class="right mono">${formatRwf(o.total_amount)}</td>
              <td class="right mono">${formatRwf(o.paid_amount)}</td>
              <td class="right mono bold">${formatRwf(o.debt_amount)}</td>
              <td class="center">${escapeHtml((o.payment_status || '').toUpperCase())}</td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="8" class="center">No orders recorded in this period.</td></tr>`;

    const paymentsRows = statement.payments.map((p) => `
      <tr>
        <td>${escapeHtml(formatDate(p.created_at))}</td>
        <td class="bold">${escapeHtml(p.order_number || `Order #${p.order_id}`)}</td>
        <td>Payment (${escapeHtml((p.payment_method || 'cash').replace('_', ' ').toUpperCase())})</td>
        <td class="right mono bold">${formatRwf(p.amount)}</td>
        <td>${escapeHtml(p.reference_no || p.recorded_by_name || 'Confirmed')}</td>
      </tr>
    `).join('');

    const ledgerRows = statement.creditLedger.map((l) => {
      const label = l.entry_type === 'credit_added'
        ? 'Store Credit Added (Owed to Client)'
        : l.entry_type === 'credit_used'
        ? 'Store Credit Deducted on Order'
        : l.entry_type === 'credit_payout'
        ? 'Store Credit Refund Paid Out'
        : 'Bulk Payment Allocation';
      return `
        <tr>
          <td>${escapeHtml(formatDate(l.created_at))}</td>
          <td class="bold">${escapeHtml(l.order_number || l.reference_no || 'Account')}</td>
          <td>${label}</td>
          <td class="right mono bold">${formatRwf(l.amount)}</td>
          <td>${escapeHtml(l.notes || 'Recorded')}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Customer Statement - ${escapeHtml(c.name)}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; color: #111827; }
          body { margin: 0; font-size: 11px; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4px; }
          .subtitle { font-size: 12px; font-weight: 700; color: #b45309; text-transform: uppercase; margin-top: 2px; }
          .badge { border: 1.5px solid #111827; padding: 4px 10px; font-weight: 800; font-size: 11px; border-radius: 4px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
          .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px 11px; background: #f8fafc; }
          .box h4 { margin: 0 0 5px 0; font-size: 10px; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }
          .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
          .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; }
          .kpi-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .kpi-val { font-size: 13px; font-weight: 900; margin-top: 3px; font-family: monospace; }
          h3 { font-size: 12px; text-transform: uppercase; margin: 14px 0 6px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: top; font-size: 10px; }
          th { background: #1e293b; color: #ffffff; font-weight: 700; text-transform: uppercase; font-size: 9.5px; }
          tr:nth-child(even) td { background: #f8fafc; }
          .right { text-align: right; }
          .center { text-align: center; }
          .bold { font-weight: 700; }
          .mono { font-family: monospace; }
          .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 26px; }
          .sign-line { border-top: 1px solid #64748b; padding-top: 5px; font-weight: 700; font-size: 10px; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${shopName}</div>
            <div class="subtitle">Customer Account Statement & Transaction Proof</div>
            <div>${shopLoc ? `${shopLoc} | ` : ''}${shopPhone ? `Tel: ${shopPhone}` : ''}${shopTin ? ` | TIN: ${shopTin}` : ''}</div>
          </div>
          <div class="badge">PERIOD: ${escapeHtml(statement.periodLabel.toUpperCase())}</div>
        </div>

        <div class="grid">
          <div class="box">
            <h4>Client / Finance Department</h4>
            <div><strong>${escapeHtml(c.name)}</strong></div>
            ${c.phone ? `<div>Phone: ${escapeHtml(c.phone)}</div>` : ''}
            ${c.id_number ? `<div>ID / TIN: ${escapeHtml(c.id_number)}</div>` : ''}
            ${c.address ? `<div>Address: ${escapeHtml(c.address)}</div>` : ''}
            ${c.email ? `<div>Email: ${escapeHtml(c.email)}</div>` : ''}
          </div>
          <div class="box">
            <h4>Statement Metadata</h4>
            <div>Generated: ${escapeHtml(formatDate(new Date().toISOString()))}</div>
            <div>Prepared By: ${escapeHtml(user?.name || 'Store Accountant')}</div>
            <div>Lifetime Orders: <strong>${statement.summary.lifetimeOrders}</strong></div>
            <div>Lifetime Purchases: <strong>${formatRwf(statement.summary.lifetimeSpent)}</strong></div>
          </div>
        </div>

        <div class="kpis">
          <div class="kpi">
            <div class="kpi-label">Orders in Period (${statement.summary.ordersCount})</div>
            <div class="kpi-val">${formatRwf(statement.summary.totalOrdered)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Paid on Period Orders</div>
            <div class="kpi-val">${formatRwf(statement.summary.totalPaidOnOrders)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Total Unpaid Debt Now</div>
            <div class="kpi-val">${formatRwf(statement.summary.currentDebtBalance)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Store Credit (We Owe Client)</div>
            <div class="kpi-val">${formatRwf(statement.summary.currentStoreCredit)}</div>
          </div>
        </div>

        <h3>1. Client's Orders & Itemized Breakdown</h3>
        <table>
          <thead>
            <tr>
              <th class="center">#</th>
              <th>Date</th>
              <th>Order Ref</th>
              <th>Items Purchased</th>
              <th class="right">Order Total</th>
              <th class="right">Paid</th>
              <th class="right">Debt</th>
              <th class="center">Status</th>
            </tr>
          </thead>
          <tbody>${ordersRows}</tbody>
        </table>

        ${(statement.payments.length > 0 || statement.creditLedger.length > 0) ? `
          <h3>2. Payments & Store Credit Ledger</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Order / Ref</th>
                <th>Activity</th>
                <th class="right">Amount</th>
                <th>Reference / Notes</th>
              </tr>
            </thead>
            <tbody>${paymentsRows}${ledgerRows}</tbody>
          </table>
        ` : ''}

        <div class="signs">
          <div class="sign-line">Prepared & Verified by Store Finance</div>
          <div class="sign-line">Received by Client Finance / Representative</div>
        </div>
      </body>
      </html>
    `;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 250);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-2xl bg-[#121620] border border-slate-700 shadow-2xl flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-[#0F131C] border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-5 h-5 text-amber-400 shrink-0" />
              <h2 className="text-base sm:text-lg font-black text-white truncate">
                {customer.name} — Account Statement
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {customer.phone || 'No phone'} {customer.id_number ? `• ID/TIN: ${customer.id_number}` : ''} {customer.address ? `• ${customer.address}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {statement && (
              <>
                <button
                  type="button"
                  onClick={handleDirectPrint}
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Statement (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportCustomerStatementPdf({ statement, shop, user })}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Save Finance PDF</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Close statement"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Timeframe Selector Bar */}
        <div className="px-4 sm:px-5 py-3 bg-[#141923] border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Calendar className="w-4 h-4 text-amber-400 mr-1" />
            {[
              { id: 'day', label: 'Today' },
              { id: 'week', label: '7 Days' },
              { id: 'month', label: '30 Days' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom Range' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  period === p.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
              />
              <button
                type="button"
                onClick={fetchStatement}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold"
              >
                Apply
              </button>
            </div>
          )}

          {canProcessPayments && (
            <div className="flex items-center gap-2 flex-wrap">
              {(statement?.summary.currentDebtBalance ?? customer.credit_balance) > 0 && onOpenBulkSettle && (
                <button
                  type="button"
                  onClick={() => onOpenBulkSettle(statement?.customer || customer)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Settle Debt (Bulk)</span>
                </button>
              )}
              {onOpenStoreCredit && (
                <button
                  type="button"
                  onClick={() => onOpenStoreCredit(statement?.customer || customer)}
                  className="px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Store Credit (We Owe)</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
              <p className="text-xs font-semibold">Loading customer transaction statement...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : statement ? (
            <>
              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase">
                    Ordered ({statement.periodLabel})
                  </span>
                  <p className="text-base sm:text-lg font-black text-white font-mono mt-1">
                    {formatRwf(statement.summary.totalOrdered)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {statement.summary.ordersCount} order(s) • Lifetime: {statement.summary.lifetimeOrders}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase">
                    Paid in Period
                  </span>
                  <p className="text-base sm:text-lg font-black text-emerald-400 font-mono mt-1">
                    {formatRwf(statement.summary.totalPaidOnOrders)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Receipts logged: {formatRwf(statement.summary.paymentsReceivedInPeriod)}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-rose-500/30">
                  <span className="text-[11px] font-semibold text-rose-300 uppercase">
                    Current Debt Owed to Us
                  </span>
                  <p className="text-base sm:text-lg font-black text-rose-400 font-mono mt-1">
                    {formatRwf(statement.summary.currentDebtBalance)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Total unpaid across all receipts
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-purple-500/30">
                  <span className="text-[11px] font-semibold text-purple-300 uppercase">
                    Store Credit (We Owe Client)
                  </span>
                  <p className="text-base sm:text-lg font-black text-purple-300 font-mono mt-1">
                    {formatRwf(statement.summary.currentStoreCredit)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Deductible on next POS order
                  </p>
                </div>
              </div>

              {/* Sub-navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                    activeTab === 'orders'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Orders & Items ({statement.orders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('payments')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                    activeTab === 'payments'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Payments & Credit Ledger ({statement.payments.length + statement.creditLedger.length})
                </button>
              </div>

              {/* Tab 1: Orders Table */}
              {activeTab === 'orders' && (
                <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-900 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">Date & Order</th>
                          <th className="py-2.5 px-3">Items Bought</th>
                          <th className="py-2.5 px-3 text-right">Order Total</th>
                          <th className="py-2.5 px-3 text-right">Paid</th>
                          <th className="py-2.5 px-3 text-right">Debt Balance</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {statement.orders.map((o) => (
                          <tr key={o.id} className="hover:bg-slate-900/50">
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <p className="font-bold text-amber-400 font-mono">{o.order_number}</p>
                              <p className="text-[10px] text-slate-400">{formatDate(o.created_at)}</p>
                            </td>
                            <td className="py-2.5 px-3 min-w-[210px]">
                              {o.statement_items && o.statement_items.length > 0 ? (
                                <ul className="space-y-0.5 text-[11px] text-slate-300">
                                  {o.statement_items.map((it, i) => (
                                    <li key={i}>
                                      <span className="font-semibold text-white">{it.product_name}</span>{' '}
                                      <span className="text-slate-400 font-mono">
                                        × {it.quantity} (@ {Math.round(it.selling_price).toLocaleString()})
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-white whitespace-nowrap">
                              {formatRwf(o.total_amount)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-400 whitespace-nowrap">
                              {formatRwf(o.paid_amount)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                              {Number(o.debt_amount) > 0 ? (
                                <span className="text-rose-400">{formatRwf(o.debt_amount)}</span>
                              ) : (
                                <span className="text-emerald-400">0</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {o.payment_status === 'paid' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                                  <CheckCircle2 className="w-3 h-3" /> Paid
                                </span>
                              ) : o.payment_status === 'partial' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300">
                                  <Clock className="w-3 h-3" /> Partial
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300">
                                  Debt
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}

                        {statement.orders.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-slate-400">
                              No transactions recorded for this customer in the selected timeframe.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 2: Payments & Store Credit Ledger */}
              {activeTab === 'payments' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60">
                    <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-300">
                      Payment Receipts History ({statement.payments.length})
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Order</th>
                            <th className="py-2 px-3">Method</th>
                            <th className="py-2 px-3 text-right">Amount Paid</th>
                            <th className="py-2 px-3">Reference / Staff</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {statement.payments.map((p) => (
                            <tr key={p.id}>
                              <td className="py-2 px-3 text-slate-300 whitespace-nowrap">{formatDate(p.created_at)}</td>
                              <td className="py-2 px-3 font-mono text-amber-400 font-bold">{p.order_number || `#${p.order_id}`}</td>
                              <td className="py-2 px-3 uppercase text-slate-200">{(p.payment_method || '').replace('_', ' ')}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">{formatRwf(p.amount)}</td>
                              <td className="py-2 px-3 text-slate-400">{p.reference_no || p.recorded_by_name || 'Confirmed'}</td>
                            </tr>
                          ))}
                          {statement.payments.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-slate-400">
                                No payments logged in this period.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60">
                    <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-purple-300">
                      Store Credit & Bulk Settlement Ledger ({statement.creditLedger.length})
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Type</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                            <th className="py-2 px-3">Notes / Ref</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {statement.creditLedger.map((l) => (
                            <tr key={l.id}>
                              <td className="py-2 px-3 text-slate-300 whitespace-nowrap">{formatDate(l.created_at)}</td>
                              <td className="py-2 px-3 font-semibold text-white">
                                {l.entry_type === 'credit_added'
                                  ? 'Credit Added (We Owe Client)'
                                  : l.entry_type === 'credit_used'
                                  ? 'Credit Used on Order'
                                  : l.entry_type === 'credit_payout'
                                  ? 'Credit Refund Paid Out'
                                  : 'Bulk Debt Settlement'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-purple-300">{formatRwf(l.amount)}</td>
                              <td className="py-2 px-3 text-slate-300">{l.notes || l.reference_no || '—'}</td>
                            </tr>
                          ))}
                          {statement.creditLedger.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-slate-400">
                                No bulk settlements or store credit entries in this period.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
