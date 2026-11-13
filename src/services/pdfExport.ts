import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportSummary, Order, Product, Shop, User, CustomerStatement } from '../types';

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
  const reportTin = (shop?.tin_number || '').trim();
  const reportInfoParts = [
    `Location: ${shop?.location || 'Kigali, Rwanda'}`,
    ...(reportTin ? [`TIN: ${reportTin}`] : []),
    ...(shop?.phone ? [`Phone: ${shop.phone}`] : [])
  ];
  doc.text(reportInfoParts.join(' | '), margin, currentY);
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
  const ordersTin = (shop?.tin_number || '').trim();
  const ordersHeaderParts = [
    `STORE: ${shop?.name || 'Quincaille Central Depot'}`,
    ...(ordersTin ? [`TIN: ${ordersTin}`] : []),
    ...(shop?.phone ? [`TEL: ${shop.phone}`] : [])
  ];
  doc.text(ordersHeaderParts.join(' | '), margin, 18);

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
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text("Client's Order", margin + 35, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`ORDER REF: ${order.order_number}`, margin, 19);

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

  // Seller details (omit TIN completely if shop has no TIN)
  const sellerTin = (shop?.tin_number || order?.tin_number || '').trim();
  let sellerY = currentY;
  doc.text(shop?.name || order?.shop_name || 'Hardware Store', margin, sellerY);
  sellerY += 4;
  if (shop?.location) {
    doc.text(`Location: ${shop.location}`, margin, sellerY);
    sellerY += 4;
  }
  doc.text(`Phone: ${shop?.phone || order?.shop_phone || 'N/A'}`, margin, sellerY);
  sellerY += 4;
  if (sellerTin) {
    doc.text(`TIN: ${sellerTin}`, margin, sellerY);
    sellerY += 4;
  }

  // Customer details
  const custX = pageWidth / 2 + 5;
  doc.text(`Name: ${order.customer_name || 'Walk-in Client'}`, custX, currentY);
  doc.text(`Phone: ${order.customer_phone || 'N/A'}`, custX, currentY + 4);
  doc.text(`Salesperson: ${order.salesperson_name || 'Sales Staff'}`, custX, currentY + 8);
  doc.text(`Date: ${formatDate(order.created_at)}`, custX, currentY + 12);

  currentY = Math.max(sellerY + 4, currentY + 20);

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

  const filename = `Clients_Order_${order.order_number}_${Date.now()}.pdf`;
  doc.save(filename);
}

/**
 * Generates a branded Stock Inventory & Valuation PDF sheet matching the user's sort/filter view.
 * Strictly hides buying prices and cost totals when showBuyingPrices is false.
 */
export function exportStockPdf({
  products,
  sortLabel,
  filterSummary,
  showBuyingPrices,
  shop,
  user,
}: {
  products: Product[];
  sortLabel: string;
  filterSummary: string;
  showBuyingPrices: boolean;
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
  doc.rect(0, 0, pageWidth, 25, 'F');

  doc.setTextColor(245, 158, 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('VectOS ERP', margin, 11);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Stock Inventory & Warehouse Count Sheet', margin + 35, 11);

  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  const stockTin = (shop?.tin_number || '').trim();
  const stockMetaParts = [
    `STORE: ${shop?.name || 'Main Store'}`,
    `Location: ${shop?.location || 'Kigali, Rwanda'}`,
    ...(stockTin ? [`TIN: ${stockTin}`] : []),
    ...(shop?.phone ? [`Phone: ${shop.phone}`] : [])
  ];
  doc.text(stockMetaParts.join(' | '), margin, 18.5);

  // Sort badge
  const badgeText = `SORT: ${sortLabel.toUpperCase()}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setFillColor(245, 158, 11);
  doc.setTextColor(15, 23, 42);
  const badgeWidth = Math.min(doc.getTextWidth(badgeText) + 8, 95);
  doc.roundedRect(pageWidth - margin - badgeWidth, 7.5, badgeWidth, 8, 2, 2, 'F');
  doc.text(badgeText, pageWidth - margin - badgeWidth + 4, 12.8, { maxWidth: badgeWidth - 6 });

  currentY = 31;

  // Stock Summary KPIs
  const totalItems = products.length;
  const totalUnits = products.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
  const totalSold = products.reduce((sum, p) => sum + Number(p.total_units_sold || 0), 0);
  const lowOrOutCount = products.filter((p) => Number(p.quantity || 0) <= Number(p.low_stock_threshold || 0)).length;
  const totalRetailValue = products.reduce((sum, p) => {
    const sellPrice = Number(p.selling_price || 0) > 0 ? Number(p.selling_price) : Number(p.buying_price || 0);
    return sum + Number(p.quantity || 0) * sellPrice;
  }, 0);
  const totalCostValue = products.reduce(
    (sum, p) => sum + Number(p.quantity || 0) * Number(p.buying_price || 0),
    0
  );

  const cards = [
    { label: 'Products Listed', val: totalItems.toLocaleString() },
    { label: 'Total Units in Stock', val: totalUnits.toLocaleString() },
    { label: 'Total Units Sold', val: totalSold.toLocaleString() },
    { label: 'Low / Out of Stock', val: `${lowOrOutCount} items` },
    {
      label: showBuyingPrices ? 'Stock Cost / Retail' : 'Total Retail Value',
      val: showBuyingPrices
        ? `${formatCurrency(totalCostValue)} / ${formatCurrency(totalRetailValue)}`
        : formatCurrency(totalRetailValue),
    },
  ];

  const cardW = (pageWidth - margin * 2 - 12) / cards.length;
  const cardH = 14;

  cards.forEach((stat, i) => {
    const x = margin + i * (cardW + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, currentY, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(stat.label, x + 3.5, currentY + 5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(stat.val, x + 3.5, currentY + 11, { maxWidth: cardW - 6 });
  });

  currentY += cardH + 5.5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Filter: ${filterSummary} | Printed on ${formatDate(new Date().toISOString())} by ${user?.name || 'Staff'}`,
    margin,
    currentY
  );
  currentY += 3;

  const headRow = showBuyingPrices
    ? [['#', 'Code', 'Product Name', 'Category', 'Location', 'Unit', 'Buying Cost', 'Selling Price', 'In Stock', 'Sold', 'Status', 'Date Added']]
    : [['#', 'Code', 'Product Name', 'Category', 'Location', 'Unit', 'Selling Price', 'In Stock', 'Sold', 'Status', 'Date Added']];

  const bodyRows = products.map((p, idx) => {
    const qty = Number(p.quantity || 0);
    const threshold = Number(p.low_stock_threshold || 0);
    const sellPrice = Number(p.selling_price || 0) > 0 ? Number(p.selling_price) : Number(p.buying_price || 0);
    const statusLabel = qty <= 0 ? 'OUT OF STOCK' : qty <= threshold ? 'LOW STOCK' : 'HEALTHY';
    const dateVal = p.last_stocked_at || p.created_at;
    const shortDate = dateVal
      ? new Date(dateVal).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' })
      : '-';

    if (showBuyingPrices) {
      return [
        idx + 1,
        p.sku || '-',
        p.name,
        p.category,
        p.stock_name || 'Main',
        p.unit || 'pcs',
        formatCurrency(Number(p.buying_price || 0)),
        formatCurrency(sellPrice),
        qty.toLocaleString(),
        Number(p.total_units_sold || 0).toLocaleString(),
        statusLabel,
        shortDate,
      ];
    }

    return [
      idx + 1,
      p.sku || '-',
      p.name,
      p.category,
      p.stock_name || 'Main',
      p.unit || 'pcs',
      formatCurrency(sellPrice),
      qty.toLocaleString(),
      Number(p.total_units_sold || 0).toLocaleString(),
      statusLabel,
      shortDate,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin, bottom: 26 },
    head: headRow,
    body: bodyRows,
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    bodyStyles: {
      fontSize: 7.2,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: showBuyingPrices
      ? {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 22 },
          2: { cellWidth: 48 },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right', fontStyle: 'bold' },
          9: { halign: 'right' },
          10: { halign: 'center' },
        }
      : {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 24 },
          2: { cellWidth: 56 },
          6: { halign: 'right' },
          7: { halign: 'right', fontStyle: 'bold' },
          8: { halign: 'right' },
          9: { halign: 'center' },
        },
  });

  let finalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : pageHeight - 30;
  if (finalY > pageHeight - 26) {
    doc.addPage();
    finalY = 20;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, finalY + 8, margin + 65, finalY + 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Storekeeper Stock Count Signature', margin, finalY + 13);

  const rightSignX = pageWidth - margin - 65;
  doc.line(rightSignX, finalY + 8, rightSignX + 65, finalY + 8);
  doc.text('Store Manager Verification', rightSignX, finalY + 13);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `VectOS Stock Inventory Sheet — ${shop?.name || 'Shop'} | Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  doc.save(`VectOS_Stock_List_${Date.now()}.pdf`);
}

/**
 * Generates an A4 Delivery Notice (Bon de Livraison) PDF without commercial prices.
 */
export function exportDeliveryNoticePdf({
  order,
  items,
  shop,
}: {
  order: Order;
  items: any[];
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

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setTextColor(245, 158, 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(shop?.name || order.shop_name || 'Hardware Store', margin, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Delivery Notice / Bon de Livraison (Quantities Only)', margin, 19);

  currentY = 32;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('SENDER / DEPOT DETAILS', margin, currentY);
  doc.text('DELIVERY / CLIENT DETAILS', pageWidth / 2 + 5, currentY);

  currentY += 5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  const tin = (shop?.tin_number || order?.tin_number || '').trim();
  let sellerY = currentY;
  doc.text(shop?.name || order?.shop_name || 'Hardware Store', margin, sellerY);
  sellerY += 4;
  if (shop?.location) {
    doc.text(`Location: ${shop.location}`, margin, sellerY);
    sellerY += 4;
  }
  doc.text(`Phone: ${shop?.phone || order?.shop_phone || 'N/A'}`, margin, sellerY);
  sellerY += 4;
  if (tin) {
    doc.text(`TIN: ${tin}`, margin, sellerY);
    sellerY += 4;
  }

  const custX = pageWidth / 2 + 5;
  doc.text(`BL Ref: BL-${order.order_number.replace('ORD-', '')}`, custX, currentY);
  doc.text(`Order Ref: ${order.order_number}`, custX, currentY + 4);
  doc.text(`Client: ${order.customer_name || 'Walk-in Client'}`, custX, currentY + 8);
  doc.text(`Depot: ${order.stock_name || 'Main Warehouse'} | Date: ${formatDate(order.created_at)}`, custX, currentY + 12);

  currentY = Math.max(sellerY + 4, currentY + 20);

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['#', 'Product / Item Description', 'Unit', 'Quantity Dispatched', 'Check']],
    body: items.map((item, idx) => [
      idx + 1,
      item.product_name || item.name || 'Hardware Material',
      item.product_unit || item.unit || 'pcs',
      Number(item.quantity).toLocaleString(),
      '[   ]',
    ]),
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 20, halign: 'center' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 14;
  if (currentY > pageHeight - 35) {
    doc.addPage();
    currentY = 24;
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(margin, currentY + 10, margin + 70, currentY + 10);
  doc.line(pageWidth - margin - 70, currentY + 10, pageWidth - margin, currentY + 10);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Released by (Storekeeper)', margin, currentY + 15);
  doc.text('Received by (Customer / Driver)', pageWidth - margin - 70, currentY + 15);

  doc.save(`Delivery_Notice_${order.order_number}_${Date.now()}.pdf`);
}

/**
 * Generates an A4 Finance-Ready Customer Account Statement PDF
 * showing orders, itemized products, payments received, outstanding debt,
 * and store credit owed to the client over a selected timeframe.
 */
export function exportCustomerStatementPdf({
  statement,
  shop,
  user,
}: {
  statement: CustomerStatement;
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

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(245, 158, 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(shop?.name || statement.shop?.name || 'VectOS Store', margin, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('CUSTOMER ACCOUNT STATEMENT & TRANSACTION HISTORY', margin, 20);

  const badgeText = `PERIOD: ${statement.periodLabel.toUpperCase()}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setFillColor(245, 158, 11);
  doc.setTextColor(15, 23, 42);
  const badgeW = doc.getTextWidth(badgeText) + 8;
  doc.roundedRect(pageWidth - margin - badgeW, 13, badgeW, 8, 2, 2, 'F');
  doc.text(badgeText, pageWidth - margin - badgeW + 4, 18.5);

  currentY = 35;

  // Two-column Store & Customer Info
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('ISSUED BY (SUPPLIER)', margin, currentY);
  doc.text('ACCOUNT / CLIENT DETAILS', pageWidth / 2 + 4, currentY);

  currentY += 5;
  doc.setFontSize(8.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  const tin = (shop?.tin_number || statement.shop?.tin_number || '').trim();
  const leftLines = [
    shop?.name || statement.shop?.name || 'Store',
    ...(shop?.location || statement.shop?.location ? [`Location: ${shop?.location || statement.shop?.location}`] : []),
    ...(shop?.phone || statement.shop?.phone ? [`Tel: ${shop?.phone || statement.shop?.phone}`] : []),
    ...(tin ? [`TIN: ${tin}`] : []),
    `Prepared By: ${user?.name || 'Accountant / Manager'}`,
    `Printed: ${formatDate(new Date().toISOString())}`
  ];

  const c = statement.customer;
  const rightLines = [
    c.name,
    ...(c.phone ? [`Tel: ${c.phone}`] : []),
    ...(c.id_number ? [`ID / TIN: ${c.id_number}`] : []),
    ...(c.address ? [`Address: ${c.address}`] : []),
    ...(c.email ? [`Email: ${c.email}`] : []),
    `Lifetime Orders: ${statement.summary.lifetimeOrders} (${formatCurrency(statement.summary.lifetimeSpent)})`
  ];

  leftLines.forEach((line, i) => doc.text(line, margin, currentY + i * 4.2));
  rightLines.forEach((line, i) => doc.text(line, pageWidth / 2 + 4, currentY + i * 4.2));

  currentY += Math.max(leftLines.length, rightLines.length) * 4.2 + 5;

  // Account KPI Summary Cards
  const cardW = (pageWidth - margin * 2 - 9) / 4;
  const cardH = 17;
  const kpis = [
    { label: 'Period Orders Total', val: formatCurrency(statement.summary.totalOrdered), color: [59, 130, 246] },
    { label: 'Period Paid', val: formatCurrency(statement.summary.totalPaidOnOrders), color: [16, 185, 129] },
    { label: 'Current Debt Balance', val: formatCurrency(statement.summary.currentDebtBalance), color: [244, 63, 94] },
    { label: 'We Owe Client Credit', val: formatCurrency(statement.summary.currentStoreCredit), color: [168, 85, 247] },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (cardW + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'FD');
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(x, currentY, 2, cardH, 'F');
    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 4.5, currentY + 5.5);
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.val, x + 4.5, currentY + 12.5);
  });

  currentY += cardH + 7;

  // Section 1: Orders & Items Table
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`1. Client's Orders (${statement.orders.length} order${statement.orders.length === 1 ? '' : 's'} in selected timeframe)`, margin, currentY);
  currentY += 3;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['Date', 'Order Ref', 'Items Purchased', 'Order Total', 'Paid', 'Debt Due', 'Status']],
    body: statement.orders.length > 0
      ? statement.orders.map((o) => {
          const itemsSummary = (o.statement_items && o.statement_items.length > 0)
            ? o.statement_items.map((it) => `${it.product_name} × ${it.quantity} (@ ${Math.round(it.selling_price).toLocaleString()})`).join('; ')
            : 'Order items';
          return [
            formatDate(o.created_at),
            o.order_number,
            itemsSummary,
            formatCurrency(Number(o.total_amount || 0)),
            formatCurrency(Number(o.paid_amount || 0)),
            formatCurrency(Number(o.debt_amount || 0)),
            (o.payment_status || 'pending').toUpperCase(),
          ];
        })
      : [['—', '—', 'No orders found in this selected timeframe.', '—', '—', '—', '—']],
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    bodyStyles: {
      fontSize: 7.2,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 27 },
      1: { cellWidth: 21, fontStyle: 'bold' },
      2: { cellWidth: 56 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'center', cellWidth: 16 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Section 2: Payments & Store Credit Ledger
  if (statement.payments.length > 0 || statement.creditLedger.length > 0) {
    if (currentY > pageHeight - 55) {
      doc.addPage();
      currentY = 18;
    }

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('2. Payment Receipts & Store Credit Activity', margin, currentY);
    currentY += 3;

    const activityRows: any[] = [
      ...statement.payments.map((p) => [
        formatDate(p.created_at),
        p.order_number || `Order #${p.order_id}`,
        `Payment (${(p.payment_method || 'cash').replace('_', ' ').toUpperCase()})`,
        formatCurrency(Number(p.amount || 0)),
        p.reference_no || p.recorded_by_name || 'Confirmed',
      ]),
      ...statement.creditLedger.map((l) => [
        formatDate(l.created_at),
        l.order_number || l.reference_no || 'Account Ledger',
        l.entry_type === 'credit_added'
          ? 'Store Credit Added (We Owe Client)'
          : l.entry_type === 'credit_used'
          ? 'Store Credit Deducted'
          : l.entry_type === 'credit_payout'
          ? 'Store Credit Refund Paid Out'
          : 'Bulk Debt Settlement Summary',
        formatCurrency(Number(l.amount || 0)),
        l.notes || 'Recorded',
      ]),
    ];

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Date & Time', 'Order / Ref', 'Activity Type', 'Amount (RWF)', 'Notes / Reference']],
      body: activityRows,
      headStyles: {
        fillColor: [245, 158, 11],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      bodyStyles: {
        fontSize: 7.2,
        textColor: [30, 41, 59],
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 26 },
        2: { cellWidth: 42 },
        3: { halign: 'right', fontStyle: 'bold', cellWidth: 26 },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // Signature Footer
  if (currentY > pageHeight - 34) {
    doc.addPage();
    currentY = 22;
  }
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, currentY + 10, margin + 65, currentY + 10);
  doc.line(pageWidth - margin - 65, currentY + 10, pageWidth - margin, currentY + 10);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Prepared / Verified by Store Finance', margin, currentY + 15);
  doc.text('Acknowledged by Client Finance Dept', pageWidth - margin - 65, currentY + 15);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Customer Account Statement — ${c.name} | Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  const safeName = (c.name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Customer_Statement_${safeName}_${statement.period}_${Date.now()}.pdf`);
}


