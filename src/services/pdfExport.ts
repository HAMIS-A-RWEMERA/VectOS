import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportSummary, Order, Shop, User } from '../types';

const formatCurrency = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

const formatDate = (isoString?: string) => {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
};

/**
 * Generates a branded executive Financial & Business Intelligence PDF Report
 * with support for Daily, Weekly, Monthly, or Custom intervals.
 */
export function exportReportsPdf({
  reports,
  period,
  periodLabel,
  activeTab,
  shop,
  user,
}: {
  reports: ReportSummary;
  period: 'day' | 'week' | 'month' | 'all';
  periodLabel: string;
  activeTab: 'categories' | 'products' | 'staff' | 'audit' | 'all';
  shop: Shop | null;
  user: User | null;
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let currentY = 16;

  // 1. BRAND HEADER
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(245, 158, 11); // amber-500
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('VectOS ERP', margin, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Quincaillerie & Tech Retail Operating System', margin + 35, 12);

  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  const titleText = 'EXECUTIVE FINANCIAL & OPERATIONAL SUMMARY';
  doc.text(titleText, margin, 20);

  // Interval Badge (Daily / Weekly / Monthly)
  const badgeText = `PERIOD: ${periodLabel.toUpperCase()}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setFillColor(245, 158, 11);
  doc.setTextColor(15, 23, 42);
  const badgeWidth = doc.getTextWidth(badgeText) + 8;
  doc.roundedRect(pageWidth - margin - badgeWidth, 13, badgeWidth, 8, 2, 2, 'F');
  doc.text(badgeText, pageWidth - margin - badgeWidth + 4, 18.5);

  currentY = 34;

  // 2. STORE & METADATA SECTION
  doc.setTextColor(30, 41, 59); // slate-800
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(shop?.name || 'Quincaille Central Store', margin, currentY);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  currentY += 5;
  doc.text(`Location: ${shop?.location || 'Kigali, Rwanda'} | TIN: ${shop?.tin_number || 'N/A'} | Phone: ${shop?.phone || 'N/A'}`, margin, currentY);
  currentY += 4.5;
  doc.text(`Report Generated: ${formatDate(new Date().toISOString())} | Prepared By: ${user?.name || 'Store Manager'} (${user?.role || 'Staff'})`, margin, currentY);

  currentY += 8;

  // 3. FINANCIAL KPI SUMMARY CARDS
  const totalCategoryRevenue = reports.categorySales.reduce((sum, c) => sum + Number(c.revenue || 0), 0);
  const totalCategoryProfit = reports.categorySales.reduce((sum, c) => sum + Number(c.profit || 0), 0);
  const totalUnitsSold = reports.categorySales.reduce((sum, c) => sum + Number(c.units_sold || 0), 0);
  const marginPercent = totalCategoryRevenue > 0 ? ((totalCategoryProfit / totalCategoryRevenue) * 100).toFixed(1) : '0.0';

  const cardWidth = (pageWidth - margin * 2 - 9) / 4;
  const cardHeight = 18;

  const kpis = [
    { label: 'Total Turnover', val: formatCurrency(totalCategoryRevenue), color: [16, 185, 129] },
    { label: 'Gross Profit', val: formatCurrency(totalCategoryProfit), color: [245, 158, 11] },
    { label: 'Units Sold', val: totalUnitsSold.toLocaleString() + ' pcs', color: [59, 130, 246] },
    { label: 'Gross Margin', val: `${marginPercent}%`, color: [139, 92, 246] },
  ];

  kpis.forEach((kpi, index) => {
    const x = margin + index * (cardWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, currentY, cardWidth, cardHeight, 2, 2, 'FD');

    // color bar
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(x, currentY, 2, cardHeight, 'F');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 5, currentY + 6);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.val, x + 5, currentY + 13);
  });

  currentY += cardHeight + 8;

  // 4. DATA TABLES ACCORDING TO USER'S SELECTION OR COMPREHENSIVE
  if (activeTab === 'categories' || activeTab === 'all') {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('1. Sales Performance by Category', margin, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Category', 'Units Sold', 'Revenue (RWF)', 'Gross Profit (RWF)', 'Profit Margin']],
      body: reports.categorySales.map((c) => {
        const rev = Number(c.revenue || 0);
        const prof = Number(c.profit || 0);
        const pct = rev > 0 ? `${((prof / rev) * 100).toFixed(1)}%` : '0%';
        return [c.category, Number(c.units_sold || 0).toLocaleString(), formatCurrency(rev), formatCurrency(prof), pct];
      }),
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'center' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  if (activeTab === 'products' || activeTab === 'all') {
    // Check if new page needed
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('2. Top Selling Hardware Products', margin, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Product Name', 'SKU', 'Category', 'Units', 'Revenue (RWF)', 'Profit (RWF)']],
      body: reports.topSellingProducts.map((p) => [
        p.name,
        p.sku || '-',
        p.category,
        Number(p.total_units_sold || 0).toLocaleString(),
        formatCurrency(Number(p.total_revenue || 0)),
        formatCurrency(Number(p.total_profit || 0)),
      ]),
      headStyles: {
        fillColor: [245, 158, 11],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 25 },
        2: { cellWidth: 30 },
        3: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  if (activeTab === 'staff' || activeTab === 'all') {
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('3. Sales Staff Leaderboard & Invoiced Volume', margin, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Salesperson', 'Email Address', 'Orders Closed', 'Total Sales Volume']],
      body: reports.salespersonPerformance.map((s) => [
        s.name,
        s.email,
        Number(s.total_orders || 0).toLocaleString(),
        formatCurrency(Number(s.total_sales || 0)),
      ]),
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 55 },
        2: { halign: 'center' },
        3: { halign: 'right' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  if (activeTab === 'audit') {
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Internal Audit & Security Trail', margin, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Timestamp', 'Operator', 'Role', 'Action', 'IP Address', 'Details']],
      body: (reports.auditLogs || []).map((l: any) => [
        formatDate(l.created_at),
        l.user_name || 'System',
        l.user_role || '-',
        l.action,
        l.ip_address || '127.0.0.1',
        l.details || '-',
      ]),
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // SIGNATURE SECTION
  if (currentY > pageHeight - 35) {
    doc.addPage();
    currentY = 25;
  } else {
    currentY = Math.max(currentY, pageHeight - 35);
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);

  // Store Manager sign line
  doc.line(margin, currentY + 12, margin + 60, currentY + 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Store Manager Signature', margin, currentY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text('Date: ________________', margin, currentY + 22);

  // Auditor / Accountant sign line
  const rightSignX = pageWidth - margin - 60;
  doc.line(rightSignX, currentY + 12, rightSignX + 60, currentY + 12);
  doc.setFont('helvetica', 'bold');
  doc.text('Finance / Auditor Verification', rightSignX, currentY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text('Date: ________________', rightSignX, currentY + 22);

  // Add Page Numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `VectOS Kigali ERP — Confidential Internal Document | Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  // Save the PDF
  const filename = `VectOS_Financial_Report_${period}_${Date.now()}.pdf`;
  doc.save(filename);
}

/**
 * Generates a comprehensive Transaction Records & Orders PDF Report
 * with support for Daily, Weekly, Monthly, or Custom intervals.
 */
export function exportOrdersPdf({
  orders,
  period,
  periodLabel,
  statusFilter,
  shop,
  user,
}: {
  orders: Order[];
  period: 'day' | 'week' | 'month' | 'all';
  periodLabel: string;
  statusFilter: string;
  shop: Shop | null;
  user: User | null;
}) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let currentY = 14;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setTextColor(245, 158, 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('VectOS ERP', margin, 11);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Sales Orders & Financial Transactions Registry', margin + 35, 11);

  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`STORE: ${shop?.name || 'Quincaille Central Depot'} | TIN: ${shop?.tin_number || '100234567'}`, margin, 18);

  // Period Badge
  const badgeText = `TIMEFRAME: ${periodLabel.toUpperCase()}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setFillColor(245, 158, 11);
  doc.setTextColor(15, 23, 42);
  const badgeWidth = doc.getTextWidth(badgeText) + 8;
  doc.roundedRect(pageWidth - margin - badgeWidth, 8, badgeWidth, 8, 2, 2, 'F');
  doc.text(badgeText, pageWidth - margin - badgeWidth + 4, 13.5);

  currentY = 30;

  // Financial Overview / Reconciliation Box
  const totalInvoiced = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const totalPaid = orders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0);
  const totalDebt = orders.reduce((sum, o) => sum + Number(o.debt_amount || 0), 0);
  const paidCount = orders.filter((o) => o.payment_status === 'paid').length;

  const cardW = (pageWidth - margin * 2 - 12) / 5;
  const cardH = 14;

  const stats = [
    { label: 'Total Orders', val: orders.length.toString() },
    { label: 'Total Invoiced', val: formatCurrency(totalInvoiced) },
    { label: 'Total Collected', val: formatCurrency(totalPaid) },
    { label: 'Total Outstanding Debt', val: formatCurrency(totalDebt) },
    { label: 'Fully Paid Orders', val: `${paidCount} (${orders.length > 0 ? Math.round((paidCount / orders.length) * 100) : 0}%)` },
  ];

  stats.forEach((stat, i) => {
    const x = margin + i * (cardW + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, currentY, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(stat.label, x + 4, currentY + 5);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(stat.val, x + 4, currentY + 11);
  });

  currentY += cardH + 6;

  // Filter Info & Subtitle
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Status Filter: ${statusFilter.toUpperCase()} | Generated on ${formatDate(new Date().toISOString())} by ${user?.name || 'Manager'}`,
    margin,
    currentY
  );
  currentY += 3;

  // Transactions AutoTable
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [
      [
        'Order Number',
        'Date & Time',
        'Customer Name',
        'Customer Phone',
        'Salesperson',
        'Total (RWF)',
        'Paid (RWF)',
        'Debt (RWF)',
        'Payment Status',
        'Fulfillment',
      ],
    ],
    body: orders.map((o) => [
      o.order_number,
      formatDate(o.created_at),
      o.customer_name || 'Walk-in Client',
      o.customer_phone || '-',
      o.salesperson_name || 'Sales Staff',
      formatCurrency(o.total_amount),
      formatCurrency(o.paid_amount),
      formatCurrency(o.debt_amount),
      (o.payment_status || 'pending').toUpperCase(),
      (o.fulfillment_status || 'pending').replace('_', ' ').toUpperCase(),
    ]),
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 26 },
      2: { cellWidth: 35 },
      3: { cellWidth: 24 },
      4: { cellWidth: 26 },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'center' },
      9: { halign: 'center' },
    },
  });

  // Footer & Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `VectOS ERP Kigali — Audit Records | Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  // Save the PDF
  const filename = `VectOS_Transactions_${period}_${Date.now()}.pdf`;
  doc.save(filename);
}

/**
 * Generates an individual Order Transaction Receipt / Invoice PDF
 */
export function exportSingleOrderPdf({
  order,
  items,
  payments,
  shop,
}: {
  order: Order;
  items: any[];
  payments: any[];
  shop: Shop | null;
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let currentY = 16;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setTextColor(245, 158, 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('VectOS ERP', margin, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Official Sales Invoice & Delivery Order', margin + 35, 12);

  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`INVOICE REF: ${order.order_number}`, margin, 19);

  currentY = 32;

  // Store and Customer 2-column info
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('SELLER / STORE DETAILS', margin, currentY);
  doc.text('CUSTOMER / BILL TO', pageWidth / 2 + 5, currentY);

  currentY += 5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  // Seller details
  doc.text(shop?.name || 'Quincaille Central Store', margin, currentY);
  doc.text(`Location: ${shop?.location || 'Kigali, Rwanda'}`, margin, currentY + 4);
  doc.text(`TIN: ${shop?.tin_number || '100234567'}`, margin, currentY + 8);
  doc.text(`Phone: ${shop?.phone || '+250 788 100 001'}`, margin, currentY + 12);

  // Customer details
  const custX = pageWidth / 2 + 5;
  doc.text(`Name: ${order.customer_name || 'Walk-in Client'}`, custX, currentY);
  doc.text(`Phone: ${order.customer_phone || 'N/A'}`, custX, currentY + 4);
  doc.text(`Salesperson: ${order.salesperson_name || 'Sales Staff'}`, custX, currentY + 8);
  doc.text(`Date: ${formatDate(order.created_at)}`, custX, currentY + 12);

  currentY += 20;

  // Line items table
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['#', 'Item Description', 'Unit', 'Qty', 'Unit Price (RWF)', 'Subtotal (RWF)']],
    body: items.map((item, idx) => [
      idx + 1,
      item.product_name || item.name || 'Hardware Material',
      item.unit || 'pcs',
      Number(item.quantity).toLocaleString(),
      formatCurrency(item.selling_price),
      formatCurrency(item.subtotal),
    ]),
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 70 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Total Summary box on the right
  const summaryWidth = 75;
  const summaryX = pageWidth - margin - summaryWidth;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(summaryX, currentY, summaryWidth, 24, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Total Amount:', summaryX + 4, currentY + 6);
  doc.text('Amount Paid:', summaryX + 4, currentY + 12);
  doc.text('Balance / Debt:', summaryX + 4, currentY + 18);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(order.total_amount), summaryX + summaryWidth - 4, currentY + 6, { align: 'right' });
  doc.setTextColor(16, 185, 129); // green
  doc.text(formatCurrency(order.paid_amount), summaryX + summaryWidth - 4, currentY + 12, { align: 'right' });
  doc.setTextColor(order.debt_amount > 0 ? 239 : 15, order.debt_amount > 0 ? 68 : 23, order.debt_amount > 0 ? 68 : 42); // red if debt
  doc.text(formatCurrency(order.debt_amount), summaryX + summaryWidth - 4, currentY + 18, { align: 'right' });

  // Payment Records if available
  if (payments && payments.length > 0) {
    currentY += 30;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Payment Transactions Log', margin, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Ref No', 'Date', 'Method', 'Recorded By', 'Amount (RWF)']],
      body: payments.map((p) => [
        p.reference_no || 'N/A',
        formatDate(p.created_at),
        (p.payment_method || 'cash').toUpperCase(),
        p.recorded_by_name || 'Cashier',
        formatCurrency(p.amount),
      ]),
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: [255, 255, 255],
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 7.5,
      },
      columnStyles: {
        4: { halign: 'right', fontStyle: 'bold' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Footer Disclaimer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  const footerText = shop?.receipt_footer_text || 'Goods once sold in good condition are not returnable. Thank you for choosing us!';
  doc.text(footerText, pageWidth / 2, pageHeight - 12, { align: 'center' });

  const filename = `Invoice_${order.order_number}_${Date.now()}.pdf`;
  doc.save(filename);
}
