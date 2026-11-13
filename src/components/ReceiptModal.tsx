import React, { useState, useEffect } from 'react';
import { Order, Shop, User } from '../types';
import {
  Printer,
  X,
  Copy,
  Check,
  Receipt,
  ShieldAlert,
  Package,
  Truck,
  FileText,
  Edit3
} from 'lucide-react';
import { EditOrderModal } from './EditOrderModal';
import { hasPermission } from '../utils/permissions';
import { exportSingleOrderPdf, exportDeliveryNoticePdf } from '../services/pdfExport';

interface ReceiptModalProps {
  order: Order | null;
  shop: Shop | null;
  onClose: () => void;
  currentUser?: User | null;
  initialMode?: 'receipt' | 'delivery_notice';
  onOrderUpdated?: (updatedOrder: Order) => void;
}

type PrintSize = '58mm' | '80mm' | 'A4';

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  order: initialOrder,
  shop,
  onClose,
  currentUser,
  initialMode = 'receipt',
  onOrderUpdated
}) => {
  const [activeOrder, setActiveOrder] = useState<Order | null>(initialOrder);
  const [orderPayments, setOrderPayments] = useState<any[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  useEffect(() => {
    setActiveOrder(initialOrder);
    setPrintNotice(null);
    if (initialOrder) {
      import('../services/api').then(({ api }) => {
        api.getOrderDetail(initialOrder.id).then(res => {
          if (res && res.order) {
            const merged = {
              ...res.order,
              items: res.items || []
            };
            setActiveOrder(merged);
            setOrderPayments(res.payments || []);
          }
        }).catch(err => {
          console.error('Failed to load items for receipt modal:', err);
        });
      });
    }
  }, [initialOrder]);

  const order = activeOrder || initialOrder;
  const canPrintReceipt = !currentUser || hasPermission(currentUser, 'can_print_full_receipt');
  const canEditOrder = !currentUser || (
    (hasPermission(currentUser, 'can_create_orders') || hasPermission(currentUser, 'can_process_payments')) &&
    order?.fulfillment_status !== 'cancelled'
  );

  const [docType, setDocType] = useState<'receipt' | 'delivery_notice'>(() => {
    if (!canPrintReceipt) return 'delivery_notice';
    return initialMode;
  });

  const [rollSize, setRollSize] = useState<PrintSize>(() => {
    const saved = localStorage.getItem('vectos_receipt_roll_size');
    if (saved === '58mm' || saved === '80mm' || saved === 'A4') return saved;
    return '58mm';
  });
  const [copied, setCopied] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPrinterTip, setShowPrinterTip] = useState(true);

  if (!order) return null;

  const shopName = (shop?.name || order.shop_name || 'Hardware Store').trim();
  const shopLocation = (shop?.location || '').trim();
  const shopPhone = (shop?.phone || order.shop_phone || '').trim();
  const shopEmail = (shop?.email || '').trim();
  const shopTin = (shop?.tin_number || order.tin_number || '').trim();
  const footerMessage = (shop?.receipt_footer_text || order.receipt_footer_text || 'Murakoze cyane! / Thank you!').trim();

  const handleRollChange = (size: PrintSize) => {
    setRollSize(size);
    localStorage.setItem('vectos_receipt_roll_size', size);
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  const totalDispatchedQty = order.items?.reduce((acc, it) => acc + (it.quantity || 0), 0) || 0;

  // Plain text generator for thermal Bluetooth, raw printers or clipboard sharing
  const generatePlainText = (type: 'receipt' | 'delivery_notice' = docType) => {
    const divider = rollSize === '58mm'
      ? '--------------------------------'
      : '------------------------------------------------';

    if (type === 'delivery_notice') {
      const lines = [
        shopName.toUpperCase(),
        shopLocation || '',
        shopPhone ? `TEL: ${shopPhone}` : '',
        shopTin ? `TIN: ${shopTin}` : '',
        divider,
        'DELIVERY NOTICE / BON DE LIVRAISON',
        'STOCK RELEASE & TRANSIT WAYBILL',
        divider,
        `BL NO:     BL-${order.order_number.replace('ORD-', '')}`,
        `ORDER REF: ${order.order_number}`,
        `DATE:      ${new Date(order.created_at).toLocaleString()}`,
        `CLIENT:    ${order.customer_name || 'Walk-in Client'}`,
        order.customer_phone ? `CONTACT:   ${order.customer_phone}` : '',
        `DEPOT:     ${order.stock_name || 'Main Warehouse'}`,
        divider,
        'ITEM DESCRIPTION              QTY    UNIT',
        divider,
        ...(order.items && order.items.length > 0
          ? order.items.map((it, idx) =>
              `${idx + 1}. ${(it.product_name || `Product #${it.product_id}`).slice(0, rollSize === '58mm' ? 18 : 26).padEnd(rollSize === '58mm' ? 18 : 26)} ${String(it.quantity).padStart(4)} ${it.product_unit || it.unit || 'pcs'}`
            )
          : [`General Items Ordered                ${order.items?.length || 1} units`]
        ),
        divider,
        `TOTAL QUANTITY DISPATCHED: ${totalDispatchedQty} UNITS`,
        divider,
        'PURPOSE: WAREHOUSE STOCK RELEASE',
        'PRICES OMITTED FOR STOCK DISPATCH',
        '',
        'Dispatched by (Storekeeper):',
        'Signature: ______________________',
        '',
        'Received by (Customer / Driver):',
        'Signature: ______________________',
        divider,
        'OFFICIAL TRANSIT CLEARANCE DOCUMENT'
      ].filter(Boolean);
      return lines.join('\n');
    }

    const lines = [
      shopName.toUpperCase(),
      shopLocation || '',
      shopPhone ? `TEL: ${shopPhone}` : '',
      shopTin ? `TIN: ${shopTin}` : '',
      divider,
      "*** Client's Order ***",
      divider,
      `ORDER NO: ${order.order_number}`,
      `DATE:     ${new Date(order.created_at).toLocaleString()}`,
      `CASHIER:  ${order.salesperson_name || 'Counter Operator'}`,
      `CLIENT:   ${order.customer_name || 'Walk-in Client'}`,
      order.customer_phone ? `PHONE:    ${order.customer_phone}` : '',
      divider,
      'ITEM                       QTY    TOTAL (RWF)',
      divider,
      ...(order.items && order.items.length > 0
        ? order.items.map(it =>
            `${(it.product_name || `Item #${it.product_id}`).slice(0, rollSize === '58mm' ? 16 : 24).padEnd(rollSize === '58mm' ? 16 : 24)} ${String(it.quantity).padStart(3)}  ${formatRwf(it.subtotal).padStart(11)}`
          )
        : [`Hardware Sale Items                   ${formatRwf(order.total_amount)}`]
      ),
      divider,
      `TOTAL DUE:                 ${formatRwf(order.total_amount)}`,
      `PAID AMOUNT:               ${formatRwf(order.paid_amount)}`,
      order.debt_amount > 0 ? `BALANCE DUE:               ${formatRwf(order.debt_amount)}` : '',
      `PAYMENT STATUS:            ${(order.payment_status || 'PAID').toUpperCase()}`,
      divider,
      footerMessage,
      'Goods sold in good condition not returnable.'
    ].filter(Boolean);

    return lines.join('\n');
  };

  const handleCopyText = (type: 'receipt' | 'delivery_notice' = docType) => {
    navigator.clipboard.writeText(generatePlainText(type));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  function escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Isolated iframe print for instant 58mm, 80mm thermal POS, or A4 office printing
  const executePrint = (targetType: 'receipt' | 'delivery_notice') => {
    if (targetType === 'receipt' && !canPrintReceipt) {
      setPrintNotice('Access Restricted: Your staff account does not have permission to print financial receipts. Please use the Delivery Notice option.');
      return;
    }
    setPrintNotice(null);
    setIsPrinting(true);

    try {
      let iframe = document.getElementById('vectos-thermal-print-frame') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'vectos-thermal-print-frame';
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

      let printHtml = '';

      if (rollSize === 'A4') {
        const itemsRowsHtml = targetType === 'delivery_notice'
          ? (order.items && order.items.length > 0
              ? order.items.map((it, idx) => `
                  <tr>
                    <td class="center">${idx + 1}</td>
                    <td><strong>${escapeHtml(it.product_name || `Product #${it.product_id}`)}</strong></td>
                    <td class="center">${escapeHtml(it.product_unit || it.unit || 'pcs')}</td>
                    <td class="right bold">${Number(it.quantity).toLocaleString()}</td>
                    <td class="center">[ &nbsp; ]</td>
                  </tr>
                `).join('')
              : `<tr><td class="center">1</td><td>General Inventory Dispatched</td><td class="center">pcs</td><td class="right bold">1</td><td class="center">[ &nbsp; ]</td></tr>`)
          : (order.items && order.items.length > 0
              ? order.items.map((it, idx) => `
                  <tr>
                    <td class="center">${idx + 1}</td>
                    <td><strong>${escapeHtml(it.product_name || `Product #${it.product_id}`)}</strong></td>
                    <td class="center">${escapeHtml(it.product_unit || it.unit || 'pcs')}</td>
                    <td class="right">${Number(it.quantity).toLocaleString()}</td>
                    <td class="right mono">${formatRwf(it.selling_price)}</td>
                    <td class="right mono bold">${formatRwf(it.subtotal)}</td>
                  </tr>
                `).join('')
              : `<tr><td class="center">1</td><td>General Sale Items</td><td class="center">pcs</td><td class="right">1</td><td class="right mono">${formatRwf(order.total_amount)}</td><td class="right mono bold">${formatRwf(order.total_amount)}</td></tr>`);

        printHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>${targetType === 'delivery_notice' ? 'Delivery-Notice-A4' : 'Clients-Order-A4'}-${escapeHtml(order.order_number)}</title>
            <style>
              @page { size: A4 portrait; margin: 14mm; }
              @media print {
                html, body { background: #fff !important; color: #0f172a !important; margin: 0 !important; padding: 0 !important; }
              }
              body {
                font-family: Arial, Helvetica, sans-serif;
                color: #0f172a;
                font-size: 12px;
                line-height: 1.45;
                margin: 0;
                padding: 0;
              }
              .top-bar {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-bottom: 2px solid #0f172a;
                padding-bottom: 12px;
                margin-bottom: 16px;
              }
              .shop-name { font-size: 20px; font-weight: 800; text-transform: uppercase; margin: 0 0 4px 0; }
              .shop-line { font-size: 11.5px; color: #334155; margin: 1px 0; }
              .doc-box { text-align: right; }
              .doc-title { display: inline-block; font-size: 18px; font-weight: 900; border: 2px solid #0f172a; padding: 3px 10px; letter-spacing: 0.3px; margin: 0 0 6px 0; }
              .doc-sub { font-size: 11px; color: #475569; margin: 1px 0; }
              .info-grid {
                display: flex;
                justify-content: space-between;
                gap: 20px;
                margin-bottom: 16px;
              }
              .card {
                flex: 1;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                padding: 10px 12px;
                background: #f8fafc;
              }
              .card-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569; margin-bottom: 6px; letter-spacing: 0.4px; }
              .card-row { font-size: 11.5px; margin: 2px 0; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
              th, td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left; }
              th { background: #0f172a; color: #ffffff; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; }
              tr:nth-child(even) td { background: #f8fafc; }
              .right { text-align: right; }
              .center { text-align: center; }
              .bold { font-weight: 700; }
              .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
              .summary-wrap { display: flex; justify-content: flex-end; margin-bottom: 20px; }
              .summary-box { width: 290px; border: 1px solid #94a3b8; border-radius: 6px; overflow: hidden; }
              .sum-row { display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; }
              .sum-row.total { background: #0f172a; color: #fff; font-size: 13px; font-weight: 800; border-bottom: none; }
              .sum-row:last-child { border-bottom: none; }
              .sigs { display: flex; justify-content: space-between; gap: 40px; margin-top: 28px; }
              .sig-box { flex: 1; border-top: 1px solid #475569; padding-top: 6px; font-size: 11px; font-weight: 700; color: #334155; }
              .footer { margin-top: 26px; padding-top: 10px; border-top: 1px dashed #cbd5e1; text-align: center; font-size: 11px; color: #475569; }
            </style>
          </head>
          <body>
            <div class="top-bar">
              <div>
                <h1 class="shop-name">${escapeHtml(shopName)}</h1>
                ${shopLocation ? `<p class="shop-line">${escapeHtml(shopLocation)}</p>` : ''}
                ${shopPhone ? `<p class="shop-line">TEL: ${escapeHtml(shopPhone)}</p>` : ''}
                ${shopEmail ? `<p class="shop-line">Email: ${escapeHtml(shopEmail)}</p>` : ''}
                ${shopTin ? `<p class="shop-line"><strong>TIN: ${escapeHtml(shopTin)}</strong></p>` : ''}
              </div>
              <div class="doc-box">
                <p class="doc-title">${targetType === 'delivery_notice' ? 'DELIVERY NOTICE (BON DE LIVRAISON)' : "Client's Order"}</p>
                <p class="doc-sub"><strong>${targetType === 'delivery_notice' ? 'BL No' : 'Order No'}:</strong> ${targetType === 'delivery_notice' ? `BL-${escapeHtml(order.order_number.replace('ORD-', ''))}` : escapeHtml(order.order_number)}</p>
                ${targetType === 'delivery_notice' ? `<p class="doc-sub"><strong>Order Ref:</strong> ${escapeHtml(order.order_number)}</p>` : ''}
                <p class="doc-sub"><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
                <p class="doc-sub"><strong>Status:</strong> ${(order.payment_status || 'PAID').toUpperCase()}</p>
              </div>
            </div>

            <div class="info-grid">
              <div class="card">
                <div class="card-title">Customer / Client</div>
                <div class="card-row"><strong>${escapeHtml(order.customer_name || 'Walk-in Client')}</strong></div>
                ${order.customer_phone ? `<div class="card-row">Phone: ${escapeHtml(order.customer_phone)}</div>` : ''}
              </div>
              <div class="card">
                <div class="card-title">${targetType === 'delivery_notice' ? 'Warehouse & Dispatch' : 'Handled By'}</div>
                <div class="card-row">${targetType === 'delivery_notice' ? `Depot: <strong>${escapeHtml(order.stock_name || 'Main Warehouse')}</strong>` : `Staff: <strong>${escapeHtml(order.salesperson_name || 'Counter Operator')}</strong>`}</div>
                <div class="card-row">${targetType === 'delivery_notice' ? `Total Dispatched: <strong>${totalDispatchedQty} units (${order.items?.length || 0} items)</strong>` : `Format: A4 Standard Print`}</div>
              </div>
            </div>

            <table>
              <thead>
                ${targetType === 'delivery_notice'
                  ? `<tr><th class="center" style="width:40px;">#</th><th>Product / Description</th><th class="center" style="width:80px;">Unit</th><th class="right" style="width:110px;">Qty To Release</th><th class="center" style="width:70px;">Checked</th></tr>`
                  : `<tr><th class="center" style="width:40px;">#</th><th>Item Description</th><th class="center" style="width:70px;">Unit</th><th class="right" style="width:65px;">Qty</th><th class="right" style="width:120px;">Unit Price</th><th class="right" style="width:130px;">Total (RWF)</th></tr>`
                }
              </thead>
              <tbody>
                ${itemsRowsHtml}
              </tbody>
            </table>

            ${targetType === 'delivery_notice'
              ? `
                <div class="card" style="margin-bottom: 16px;">
                  <div class="card-row"><strong>TOTAL PHYSICAL DISPATCH:</strong> ${totalDispatchedQty} UNITS (${order.items?.length || 0} ITEMS) &nbsp;|&nbsp; Commercial prices omitted for warehouse release &amp; road transit.</div>
                </div>
                <div class="sigs">
                  <div class="sig-box">Released by (Storekeeper Signature &amp; Date)</div>
                  <div class="sig-box">Driver / Vehicle Plate</div>
                  <div class="sig-box">Received in Good Order by Client</div>
                </div>
              `
              : `
                <div class="summary-wrap">
                  <div class="summary-box">
                    <div class="sum-row total"><span>TOTAL DUE:</span><span class="mono">${formatRwf(order.total_amount)}</span></div>
                    <div class="sum-row bold"><span>PAID AMOUNT:</span><span class="mono">${formatRwf(order.paid_amount)}</span></div>
                    ${order.debt_amount > 0 ? `<div class="sum-row bold"><span>BALANCE DUE:</span><span class="mono">${formatRwf(order.debt_amount)}</span></div>` : ''}
                  </div>
                </div>
              `
            }

            <div class="footer">
              <div><strong>${escapeHtml(footerMessage)}</strong></div>
              <div>${targetType === 'delivery_notice' ? 'Valid stock release & transit clearance document.' : 'Goods sold in good condition are not returnable.'}</div>
            </div>
          </body>
          </html>
        `;
      } else {
        const rollWidthMm = rollSize === '58mm' ? 58 : 80;
        const fontSizePx = rollSize === '58mm' ? 10.5 : 12;
        let bodyContentHtml = '';

        if (targetType === 'delivery_notice') {
          const deliveryLinesHtml = order.items && order.items.length > 0
            ? order.items.map((it, idx) => `
                <div style="margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1px dotted #ccc;">
                  <div style="font-weight: 700; word-break: break-word;">${idx + 1}. ${escapeHtml(it.product_name || `Product #${it.product_id}`)}</div>
                  <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-top: 1px;">
                    <span>Unit: ${escapeHtml(it.product_unit || it.unit || 'pcs')}</span>
                    <span style="font-weight: 800; font-size: 1.05em;">QTY: ${it.quantity}</span>
                  </div>
                </div>
              `).join('')
            : `
                <div style="display: flex; justify-content: space-between; font-weight: bold;">
                  <span>General Inventory Dispatched</span>
                  <span>QTY: 1</span>
                </div>
              `;

          bodyContentHtml = `
            <div class="center" style="margin-bottom: 4px;">
              <div class="bold" style="font-size: 1.15em; text-transform: uppercase;">${escapeHtml(shopName)}</div>
              ${shopLocation ? `<div style="font-size: 0.85em;">${escapeHtml(shopLocation)}</div>` : ''}
              ${shopPhone ? `<div style="font-size: 0.85em;">TEL: ${escapeHtml(shopPhone)}</div>` : ''}
              ${shopTin ? `<div style="font-size: 0.85em; font-weight: bold;">TIN: ${escapeHtml(shopTin)}</div>` : ''}
              <div class="divider"></div>
              <div class="bold" style="font-size: 1.05em; margin: 2px 0; letter-spacing: 0.5px;">DELIVERY NOTICE / BON DE LIVRAISON</div>
              <div style="font-size: 0.8em; font-weight: 600;">STOCK RELEASE & TRANSIT WAYBILL</div>
            </div>

            <div class="divider"></div>

            <div class="meta" style="font-size: 0.9em;">
              <div class="row"><span>BL NO:</span><span class="bold">BL-${escapeHtml(order.order_number.replace('ORD-', ''))}</span></div>
              <div class="row"><span>Order Ref:</span><span>${escapeHtml(order.order_number)}</span></div>
              <div class="row"><span>Date:</span><span>${new Date(order.created_at).toLocaleString()}</span></div>
              <div class="row"><span>Client:</span><span class="bold">${escapeHtml(order.customer_name || 'Walk-in Client')}</span></div>
              ${order.customer_phone ? `<div class="row"><span>Contact:</span><span>${escapeHtml(order.customer_phone)}</span></div>` : ''}
              <div class="row"><span>Depot / Stock:</span><span class="bold">${escapeHtml(order.stock_name || 'Main Warehouse')}</span></div>
            </div>

            <div class="divider"></div>

            <div style="font-size: 0.85em; font-weight: bold; margin-bottom: 3px; display: flex; justify-content: space-between;">
              <span>PRODUCT / DESCRIPTION</span>
              <span>DISPATCH QTY</span>
            </div>

            ${deliveryLinesHtml}

            <div class="divider"></div>

            <div class="row bold" style="font-size: 1em; padding: 2px 0;">
              <span>TOTAL QUANTITY:</span>
              <span>${totalDispatchedQty} UNITS (${order.items?.length || 0} ITEMS)</span>
            </div>

            <div class="divider"></div>

            <div style="margin-top: 8px; font-size: 0.82em; border: 1px solid #000; padding: 4px; border-radius: 2px;">
              <div style="font-weight: bold; text-decoration: underline; margin-bottom: 4px;">WAREHOUSE STOCK RELEASE SIGN-OFF:</div>
              <div style="margin-bottom: 6px;">Released by (Storekeeper): ________________________</div>
              <div style="margin-bottom: 6px;">Transporter / Driver Plate: ________________________</div>
              <div>Received in Good Order by: _______________________</div>
            </div>

            <div class="footer" style="margin-top: 8px; font-size: 0.78em; text-align: center;">
              <div style="font-weight: bold;">DOCUMENT OFFICIEL DE TRANSPORT & SORTIE DE STOCK</div>
              <div>Valid stock release clearance for road transit.</div>
              <div>Commercial prices omitted for warehouse dispatch control.</div>
            </div>
          `;
        } else {
          const itemsHtml = order.items && order.items.length > 0
            ? order.items.map(it => `
                <div style="margin-bottom: 3px;">
                  <div style="font-weight: 700; word-break: break-word;">${escapeHtml(it.product_name || `Product #${it.product_id}`)}</div>
                  <div style="display: flex; justify-content: space-between; font-size: 0.9em;">
                    <span>${it.quantity} x ${formatRwf(it.selling_price)}</span>
                    <span style="font-weight: 700;">${formatRwf(it.subtotal)}</span>
                  </div>
                </div>
              `).join('')
            : `
                <div style="display: flex; justify-content: space-between;">
                  <span>General Store Items</span>
                  <span style="font-weight: 700;">${formatRwf(order.total_amount)}</span>
                </div>
              `;

          bodyContentHtml = `
            <div class="center">
              <div class="bold" style="font-size: 1.15em; text-transform: uppercase;">${escapeHtml(shopName)}</div>
              ${shopLocation ? `<div style="font-size: 0.85em;">${escapeHtml(shopLocation)}</div>` : ''}
              ${shopPhone ? `<div style="font-size: 0.85em;">TEL: ${escapeHtml(shopPhone)}</div>` : ''}
              ${shopTin ? `<div style="font-size: 0.85em; font-weight: bold;">TIN: ${escapeHtml(shopTin)}</div>` : ''}
              <div class="divider"></div>
              <div style="margin: 4px 0;">
                <span style="display: inline-block; border: 2px solid #000; padding: 2px 8px; font-size: 1.25em; font-weight: 900; letter-spacing: 0.3px;">Client's Order</span>
              </div>
            </div>

            <div class="divider"></div>

            <div class="meta" style="font-size: 0.9em;">
              <div class="row"><span>Order No:</span><span class="bold">${escapeHtml(order.order_number)}</span></div>
              <div class="row"><span>Date:</span><span>${new Date(order.created_at).toLocaleString()}</span></div>
              <div class="row"><span>Cashier:</span><span>${escapeHtml(order.salesperson_name || 'Counter Operator')}</span></div>
              <div class="row"><span>Client:</span><span class="bold">${escapeHtml(order.customer_name || 'Walk-in Client')}</span></div>
              ${order.customer_phone ? `<div class="row"><span>Phone:</span><span>${escapeHtml(order.customer_phone)}</span></div>` : ''}
            </div>

            <div class="divider"></div>

            <div style="font-size: 0.85em; font-weight: bold; margin-bottom: 3px; display: flex; justify-content: space-between;">
              <span>ITEM & QTY</span>
              <span>TOTAL (RWF)</span>
            </div>

            ${itemsHtml}

            <div class="divider"></div>

            <div class="row bold" style="font-size: 1.1em; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2px 0; margin: 2px 0;">
              <span>TOTAL DUE:</span>
              <span>${formatRwf(order.total_amount)}</span>
            </div>

            <div class="row bold" style="font-size: 0.95em;">
              <span>PAID AMOUNT:</span>
              <span>${formatRwf(order.paid_amount)}</span>
            </div>

            ${order.debt_amount > 0 ? `
              <div class="row bold" style="color: #000; font-size: 0.95em;">
                <span>BALANCE DUE:</span>
                <span>${formatRwf(order.debt_amount)}</span>
              </div>
            ` : ''}

            <div class="center" style="margin-top: 4px; font-size: 0.85em; font-weight: bold;">
              PAYMENT: ${(order.payment_status || 'PAID').toUpperCase()}
            </div>

            <div class="divider"></div>

            <div class="footer">
              <div class="bold">${escapeHtml(footerMessage)}</div>
              <div>Goods sold in good condition not returnable.</div>
            </div>
          `;
        }

        printHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>${targetType === 'delivery_notice' ? 'Delivery-Notice' : 'Clients-Order'}-${escapeHtml(order.order_number)}</title>
            <style>
              @page {
                size: ${rollWidthMm}mm auto;
                margin: 0mm;
              }
              @media print {
                html, body {
                  width: ${rollWidthMm}mm;
                  margin: 0 !important;
                  padding: 3mm 2mm !important;
                  color: #000 !important;
                  background: #fff !important;
                }
              }
              body {
                font-family: 'Courier New', Courier, monospace, sans-serif;
                font-size: ${fontSizePx}px;
                line-height: 1.25;
                color: #000;
                margin: 0;
                padding: 4mm 3mm;
                width: ${rollWidthMm}mm;
                box-sizing: border-box;
              }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .row { display: flex; justify-content: space-between; align-items: baseline; }
              .divider {
                border-top: 1px dashed #000;
                margin: 4px 0;
              }
              .footer {
                text-align: center;
                font-size: 0.8em;
                margin-top: 6px;
              }
            </style>
          </head>
          <body>
            ${bodyContentHtml}
            <div style="height: 6mm;"></div>
          </body>
          </html>
        `;
      }

      const frameDoc = iframe.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(printHtml);
        frameDoc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.error('Iframe print error, falling back to window.print', e);
            window.print();
          } finally {
            setIsPrinting(false);
          }
        }, 50);
      } else {
        window.print();
        setIsPrinting(false);
      }
    } catch (err) {
      console.error('Print execution error:', err);
      window.print();
      setIsPrinting(false);
    }
  };

  const handleDownloadA4Pdf = () => {
    if (docType === 'delivery_notice') {
      exportDeliveryNoticePdf({
        order,
        items: order.items || [],
        shop
      });
      return;
    }
    if (!canPrintReceipt) {
      setPrintNotice('Access Restricted: Financial receipt PDFs require Receipt permission.');
      return;
    }
    exportSingleOrderPdf({
      order,
      items: order.items || [],
      payments: orderPayments,
      shop
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className={`w-full ${rollSize === 'A4' ? 'max-w-4xl' : 'max-w-xl'} bg-[#141923] text-slate-100 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[96vh] animate-in fade-in zoom-in-95 my-auto transition-all duration-200`}>

        {/* Top Header & Print Format Switcher (58mm / 80mm / A4) */}
        <div className="p-3.5 sm:p-4 bg-[#0F131A] border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              {docType === 'receipt' ? <Receipt className="w-5 h-5" /> : <Package className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-black text-white">
                  {docType === 'receipt' ? "Client's Order" : 'Delivery Notice (Bon de Livraison)'}
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {rollSize}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                Order #{order.order_number} • {docType === 'receipt' ? 'Itemized prices & totals (Non-EBM)' : 'Warehouse stock release (Quantities only, no prices)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* 3 Print Size Options: 58mm | 80mm | A4 */}
            <div className="flex p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => handleRollChange('58mm')}
                className={`px-2.5 py-1 rounded-md transition ${
                  rollSize === '58mm'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Mini POS Roll (58mm / 2 inch thermal)"
              >
                58mm
              </button>
              <button
                type="button"
                onClick={() => handleRollChange('80mm')}
                className={`px-2.5 py-1 rounded-md transition ${
                  rollSize === '80mm'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Standard Counter Roll (80mm / 3 inch thermal)"
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => handleRollChange('A4')}
                className={`px-2.5 py-1 rounded-md transition ${
                  rollSize === 'A4'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Full A4 Office Sheet"
              >
                A4
              </button>
            </div>

            {canEditOrder && (
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs font-bold transition active:scale-95"
                title="Edit items, quantities, or replace out-of-stock items"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit Receipt</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Primary Dual View Toggle: Full Receipt vs Delivery Notice */}
        <div className="p-2 sm:p-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDocType('receipt')}
            disabled={!canPrintReceipt}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border ${
              docType === 'receipt'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800 disabled:opacity-40'
            }`}
          >
            <Receipt className="w-4 h-4 shrink-0" />
            <span className="truncate">{shopTin ? "Client's Order (Prices & TIN)" : "Client's Order (Prices)"}</span>
          </button>

          <button
            type="button"
            onClick={() => setDocType('delivery_notice')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border ${
              docType === 'delivery_notice'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <Truck className="w-4 h-4 shrink-0" />
            <span className="truncate">Delivery Notice (Stock Release)</span>
          </button>
        </div>

        {/* Permission Advisory if receipt restricted */}
        {(!canPrintReceipt || printNotice) && (
          <div className="p-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {printNotice || (
                <>
                  <strong>Storekeeper View:</strong> Showing Delivery Notice (quantities only). Financial receipts require Manager or Cashier permission.
                </>
              )}
            </span>
          </div>
        )}

        {/* Helpful Printer Setup Hint */}
        {showPrinterTip && (
          <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">💡</span>
              <p>
                {docType === 'delivery_notice'
                  ? `Hand this Delivery Notice (${rollSize}) to the storekeeper or driver to release products without revealing commercial prices.`
                  : `Client's Order (${rollSize}) with itemized prices and totals (taxes excluded).${shopTin ? ` Shop TIN: ${shopTin}.` : ''}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPrinterTip(false)}
              className="text-slate-500 hover:text-slate-300 text-xs px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Printable Preview Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950 flex flex-col items-center">

          {rollSize === 'A4' ? (
            /* ============================================================ */
            /* A4 FULL-SHEET PREVIEW                                        */
            /* ============================================================ */
            <div className="w-full max-w-[740px] bg-white text-slate-900 font-sans p-6 sm:p-8 shadow-2xl rounded-sm border border-slate-300 select-text space-y-5">
              {/* Top A4 Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
                <div className="space-y-0.5">
                  <h2 className="font-black text-xl uppercase tracking-tight text-slate-950">
                    {shopName}
                  </h2>
                  {shopLocation && <p className="text-xs text-slate-700">{shopLocation}</p>}
                  {shopPhone && <p className="text-xs text-slate-800">TEL: {shopPhone}</p>}
                  {shopEmail && <p className="text-xs text-slate-700">Email: {shopEmail}</p>}
                  {shopTin && <p className="text-xs font-bold text-slate-950">TIN: {shopTin}</p>}
                </div>

                <div className="sm:text-right space-y-1">
                  <h3 className={docType === 'delivery_notice'
                    ? 'text-sm font-black uppercase tracking-wide text-slate-950'
                    : 'inline-block text-base sm:text-lg font-black text-slate-950 border-2 border-slate-950 px-3 py-0.5 rounded-sm tracking-tight'
                  }>
                    {docType === 'delivery_notice' ? 'DELIVERY NOTICE / BON DE LIVRAISON' : "Client's Order"}
                  </h3>
                  <p className="text-xs text-slate-700">
                    <strong>{docType === 'delivery_notice' ? 'BL No:' : 'Order No:'}</strong>{' '}
                    {docType === 'delivery_notice' ? `BL-${order.order_number.replace('ORD-', '')}` : order.order_number}
                  </p>
                  {docType === 'delivery_notice' && (
                    <p className="text-xs text-slate-700"><strong>Order Ref:</strong> {order.order_number}</p>
                  )}
                  <p className="text-xs text-slate-700"><strong>Date:</strong> {new Date(order.created_at).toLocaleString()}</p>
                  <p className="text-xs text-slate-700"><strong>Status:</strong> {(order.payment_status || 'PAID').toUpperCase()}</p>
                </div>
              </div>

              {/* Client & Dispatch Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-xs space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer / Client</p>
                  <p className="font-bold text-slate-900">{order.customer_name || 'Walk-in Client'}</p>
                  {order.customer_phone && <p className="text-slate-700">Phone: {order.customer_phone}</p>}
                </div>
                <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-xs space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {docType === 'delivery_notice' ? 'Warehouse & Dispatch' : 'Handled By'}
                  </p>
                  <p className="text-slate-800">
                    {docType === 'delivery_notice'
                      ? <>Depot: <strong>{order.stock_name || 'Main Warehouse'}</strong></>
                      : <>Staff: <strong>{order.salesperson_name || 'Counter Operator'}</strong></>
                    }
                  </p>
                  <p className="text-slate-700">
                    {docType === 'delivery_notice'
                      ? <>Total Dispatched: <strong>{totalDispatchedQty} units ({order.items?.length || 0} items)</strong></>
                      : 'Print Size: A4 Standard Sheet'
                    }
                  </p>
                </div>
              </div>

              {/* A4 Bordered Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[10px]">
                      <th className="py-2 px-2.5 border border-slate-700 text-center w-10">#</th>
                      <th className="py-2 px-2.5 border border-slate-700 text-left">Item Description</th>
                      <th className="py-2 px-2.5 border border-slate-700 text-center w-16">Unit</th>
                      <th className="py-2 px-2.5 border border-slate-700 text-right w-20">Qty</th>
                      {docType === 'delivery_notice' ? (
                        <th className="py-2 px-2.5 border border-slate-700 text-center w-20">Check</th>
                      ) : (
                        <>
                          <th className="py-2 px-2.5 border border-slate-700 text-right w-28">Unit Price</th>
                          <th className="py-2 px-2.5 border border-slate-700 text-right w-32">Total (RWF)</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {order.items && order.items.length > 0 ? (
                      order.items.map((it, idx) => (
                        <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                          <td className="py-2 px-2.5 border border-slate-300 text-center">{idx + 1}</td>
                          <td className="py-2 px-2.5 border border-slate-300 font-semibold text-slate-900">
                            {it.product_name || `Product #${it.product_id}`}
                          </td>
                          <td className="py-2 px-2.5 border border-slate-300 text-center">{it.product_unit || it.unit || 'pcs'}</td>
                          <td className="py-2 px-2.5 border border-slate-300 text-right font-bold">{Number(it.quantity).toLocaleString()}</td>
                          {docType === 'delivery_notice' ? (
                            <td className="py-2 px-2.5 border border-slate-300 text-center font-mono">[ &nbsp; ]</td>
                          ) : (
                            <>
                              <td className="py-2 px-2.5 border border-slate-300 text-right font-mono">{formatRwf(it.selling_price)}</td>
                              <td className="py-2 px-2.5 border border-slate-300 text-right font-mono font-bold">{formatRwf(it.subtotal)}</td>
                            </>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-2 px-2.5 border border-slate-300 text-center">1</td>
                        <td className="py-2 px-2.5 border border-slate-300">General Sale Items</td>
                        <td className="py-2 px-2.5 border border-slate-300 text-center">pcs</td>
                        <td className="py-2 px-2.5 border border-slate-300 text-right">1</td>
                        {docType === 'delivery_notice' ? (
                          <td className="py-2 px-2.5 border border-slate-300 text-center">[ &nbsp; ]</td>
                        ) : (
                          <>
                            <td className="py-2 px-2.5 border border-slate-300 text-right font-mono">{formatRwf(order.total_amount)}</td>
                            <td className="py-2 px-2.5 border border-slate-300 text-right font-mono font-bold">{formatRwf(order.total_amount)}</td>
                          </>
                        )}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {docType === 'delivery_notice' ? (
                <div className="space-y-6 pt-2">
                  <div className="p-3 rounded-md bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-900">
                    TOTAL PHYSICAL DISPATCH: {totalDispatchedQty} UNITS ({order.items?.length || 0} ITEMS) — Commercial prices omitted for warehouse release &amp; transit.
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 text-[11px] font-bold text-slate-700">
                    <div className="border-t border-slate-500 pt-1.5">Released by (Storekeeper)</div>
                    <div className="border-t border-slate-500 pt-1.5">Driver / Vehicle Plate</div>
                    <div className="border-t border-slate-500 pt-1.5">Received by Client</div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <div className="w-full sm:w-72 border border-slate-400 rounded-md overflow-hidden text-xs">
                    <div className="flex justify-between px-3 py-2 bg-slate-900 text-white font-black text-sm">
                      <span>TOTAL DUE:</span>
                      <span className="font-mono">{formatRwf(order.total_amount)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 border-b border-slate-200 font-bold">
                      <span>PAID AMOUNT:</span>
                      <span className="font-mono">{formatRwf(order.paid_amount)}</span>
                    </div>
                    {order.debt_amount > 0 && (
                      <div className="flex justify-between px-3 py-1.5 font-bold text-rose-700">
                        <span>BALANCE DUE:</span>
                        <span className="font-mono">{formatRwf(order.debt_amount)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[11px] text-slate-600 space-y-0.5">
                <p className="font-bold text-slate-900">{footerMessage}</p>
                <p>{docType === 'delivery_notice' ? 'Valid stock release & transit clearance document.' : 'Goods sold in good condition are not returnable.'}</p>
              </div>
            </div>
          ) : (
            /* ============================================================ */
            /* 58MM & 80MM THERMAL ROLL PREVIEW                             */
            /* ============================================================ */
            <div
              className={`bg-white text-black font-mono transition-all duration-200 shadow-2xl rounded-sm border border-slate-300 relative select-text ${
                rollSize === '58mm'
                  ? 'w-[240px] max-w-[240px] p-3 text-[11px] leading-tight'
                  : 'w-[330px] max-w-[330px] p-4 text-xs leading-normal'
              }`}
              style={{
                boxShadow: '0 10px 35px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0,0,0,0.1)'
              }}
            >
              <div className="w-full border-t border-dashed border-slate-400 mb-2" />

              {docType === 'delivery_notice' ? (
                <div>
                  <div className="text-center space-y-0.5 pb-2">
                    <h2 className="font-black text-sm uppercase tracking-tight text-black font-sans">
                      {shopName}
                    </h2>
                    {shopLocation && <p className="text-[10px] text-black">{shopLocation}</p>}
                    {shopPhone && <p className="text-[10px] text-black">TEL: {shopPhone}</p>}
                    {shopTin && <p className="text-[10px] font-bold text-black">TIN: {shopTin}</p>}

                    <div className="pt-1.5 mt-1 border-t-2 border-black">
                      <p className="text-[11px] font-black uppercase tracking-wider text-black">
                        DELIVERY NOTICE / BON DE LIVRAISON
                      </p>
                      <p className="text-[9px] font-bold uppercase text-slate-700">
                        STOCK RELEASE &amp; TRANSIT WAYBILL
                      </p>
                    </div>
                  </div>

                  <div className="space-y-0.5 text-[10px] border-y border-dashed border-black py-1.5 my-1.5">
                    <div className="flex justify-between">
                      <span>BL Number:</span>
                      <span className="font-bold">BL-{order.order_number.replace('ORD-', '')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Order Ref:</span>
                      <span>{order.order_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span>{new Date(order.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Client Name:</span>
                      <span className="font-bold truncate max-w-[140px]">{order.customer_name || 'Walk-in Client'}</span>
                    </div>
                    {order.customer_phone && (
                      <div className="flex justify-between">
                        <span>Client Phone:</span>
                        <span>{order.customer_phone}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Warehouse Depot:</span>
                      <span className="font-bold">{order.stock_name || 'Main Warehouse'}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 my-2">
                    <div className="flex justify-between font-bold text-[10px] uppercase border-b border-black pb-0.5">
                      <span>Product / Item</span>
                      <span className="text-right">Qty To Release</span>
                    </div>

                    {order.items && order.items.length > 0 ? (
                      order.items.map((it, idx) => (
                        <div key={idx} className="space-y-0.5 text-[10px] border-b border-dotted border-slate-300 pb-1">
                          <p className="font-bold text-black break-words">
                            {idx + 1}. {it.product_name || `Product #${it.product_id}`}
                          </p>
                          <div className="flex justify-between text-black">
                            <span className="text-[9px] text-slate-700">Unit: {it.product_unit || it.unit || 'pcs'}</span>
                            <span className="font-black text-xs">{it.quantity} {it.product_unit || it.unit || 'units'}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-between text-[10px]">
                        <span>General Inventory Stock</span>
                        <span className="font-bold">1 Package</span>
                      </div>
                    )}
                  </div>

                  <div className="p-1.5 bg-slate-100 border-y-2 border-black my-2 text-center">
                    <p className="text-[10px] uppercase tracking-wider font-bold">TOTAL PHYSICAL DISPATCH</p>
                    <p className="text-sm font-black">{totalDispatchedQty} UNITS ({order.items?.length || 0} ITEMS)</p>
                  </div>

                  <div className="border border-black p-2 my-2 text-[9px] space-y-1.5 bg-slate-50">
                    <p className="font-bold uppercase tracking-wider border-b border-black pb-0.5">
                      Depot Stock Release Sign-Off
                    </p>
                    <p>Released By (Storekeeper): __________________</p>
                    <p>Transporter / Vehicle Plate: _________________</p>
                    <p>Received by (Client Signature): _______________</p>
                  </div>

                  <div className="text-center pt-1.5 border-t border-dashed border-black text-[8px] space-y-0.5 text-slate-800">
                    <p className="font-bold uppercase">DOCUMENT OFFICIEL DE TRANSPORT &amp; SORTIE DE STOCK</p>
                    <p>Valid stock transit clearance document.</p>
                    <p>Prices omitted for warehouse stock release and verification.</p>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-center space-y-0.5 pb-2">
                    <h2 className="font-black text-sm uppercase tracking-tight text-black font-sans">
                      {shopName}
                    </h2>
                    {shopLocation && <p className="text-[10px] text-black">{shopLocation}</p>}
                    {shopPhone && <p className="text-[10px] text-black">TEL: {shopPhone}</p>}
                    {shopTin && <p className="text-[10px] font-bold text-black">TIN: {shopTin}</p>}
                    <div className="pt-1.5 mt-1 border-t border-dotted border-black">
                      <span className="inline-block border-2 border-black px-2.5 py-0.5 text-sm font-black text-black tracking-tight">
                        Client&apos;s Order
                      </span>
                    </div>
                  </div>

                  <div className="space-y-0.5 text-[10px] border-y border-dashed border-black py-1.5 my-1.5">
                    <div className="flex justify-between">
                      <span>Order No:</span>
                      <span className="font-bold">{order.order_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span>{new Date(order.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cashier:</span>
                      <span>{order.salesperson_name || 'Counter Operator'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Client:</span>
                      <span className="font-bold truncate max-w-[140px]">{order.customer_name || 'Walk-in Client'}</span>
                    </div>
                    {order.customer_phone && (
                      <div className="flex justify-between">
                        <span>Phone:</span>
                        <span>{order.customer_phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 my-1.5">
                    <div className="flex justify-between font-bold text-[10px] uppercase border-b border-black pb-0.5">
                      <span>Item &amp; Qty</span>
                      <span className="text-right">Total (RWF)</span>
                    </div>

                    {order.items && order.items.length > 0 ? (
                      order.items.map((it, idx) => (
                        <div key={idx} className="space-y-0.5 text-[10px]">
                          <p className="font-bold text-black break-words">{it.product_name || `Product #${it.product_id}`}</p>
                          <div className="flex justify-between text-black">
                            <span>{it.quantity} x {formatRwf(it.selling_price)}</span>
                            <span className="font-bold">{formatRwf(it.subtotal)}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-between text-[10px]">
                        <span>General Sale Items</span>
                        <span className="font-bold">{formatRwf(order.total_amount)}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 text-[10px] border-t border-dashed border-black pt-1.5 mt-2">
                    <div className="flex justify-between text-xs font-black border-y border-black py-1 my-0.5 text-black">
                      <span>TOTAL DUE:</span>
                      <span>{formatRwf(order.total_amount)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>PAID:</span>
                      <span>{formatRwf(order.paid_amount)}</span>
                    </div>
                    {order.debt_amount > 0 && (
                      <div className="flex justify-between font-bold text-black">
                        <span>BALANCE DUE:</span>
                        <span>{formatRwf(order.debt_amount)}</span>
                      </div>
                    )}
                    <div className="text-center font-bold text-[9px] uppercase tracking-wider pt-0.5">
                      Mode: {order.payment_status === 'paid' ? 'SETTLED' : order.payment_status}
                    </div>
                  </div>

                  <div className="text-center pt-2 mt-2 border-t border-dashed border-black text-[9px] space-y-0.5">
                    <p className="font-bold">{footerMessage}</p>
                    <p>Goods sold in good condition are not returnable.</p>
                  </div>
                </div>
              )}

              <div className="w-full border-b border-dashed border-slate-400 mt-3" />
            </div>
          )}

          <p className="text-[11px] text-slate-400 mt-3 text-center">
            {docType === 'delivery_notice'
              ? `Delivery Notice (${rollSize}): Quantities and items only for warehouse release & transport.`
              : `Client's Order (${rollSize}): Itemized prices and payments (taxes excluded).`}
          </p>
        </div>

        {/* Action Buttons Footer with Direct Printing + A4 PDF */}
        <div className="p-3.5 sm:p-4 bg-[#0F131A] border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleCopyText(docType)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 transition active:scale-95"
              title="Copy text for WhatsApp / SMS sharing"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
              <span>{copied ? 'Copied Text!' : `Copy ${docType === 'delivery_notice' ? 'Delivery Note' : 'Receipt'}`}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadA4Pdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-rose-500/30 text-xs font-bold text-rose-300 transition active:scale-95"
              title={`Download A4 PDF (${docType === 'delivery_notice' ? 'Delivery Notice' : 'Full Receipt'})`}
            >
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              <span>Save A4 PDF</span>
            </button>

            {canEditOrder && (
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-xs font-bold text-amber-400 transition active:scale-95"
                title="Edit items, change quantities, or remove out of stock products"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Receipt</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
            >
              Close
            </button>

            <button
              type="button"
              onClick={() => executePrint('delivery_notice')}
              disabled={isPrinting}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40 font-bold text-xs transition active:scale-95"
              title={`Print Delivery Notice (${rollSize})`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Print Delivery ({rollSize})</span>
            </button>

            <button
              type="button"
              onClick={() => executePrint('receipt')}
              disabled={isPrinting || !canPrintReceipt}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95 cursor-pointer"
              title={`Print Full Receipt (${rollSize})`}
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Printing...' : `Print Receipt (${rollSize})`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Edit Order Modal */}
      {isEditModalOpen && (
        <EditOrderModal
          isOpen={isEditModalOpen}
          order={order}
          user={currentUser}
          onClose={() => setIsEditModalOpen(false)}
          onOrderUpdated={(updated) => {
            setActiveOrder(updated);
            if (onOrderUpdated) onOrderUpdated(updated);
          }}
        />
      )}
    </div>
  );
};
