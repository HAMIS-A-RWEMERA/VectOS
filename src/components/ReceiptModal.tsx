import React, { useState, useEffect } from 'react';
import { Order, Shop, User } from '../types';
import { 
  Printer, 
  X, 
  CheckCircle2, 
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

interface ReceiptModalProps {
  order: Order | null;
  shop: Shop | null;
  onClose: () => void;
  currentUser?: User | null;
  initialMode?: 'receipt' | 'delivery_notice';
  onOrderUpdated?: (updatedOrder: Order) => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ 
  order: initialOrder, 
  shop, 
  onClose,
  currentUser,
  initialMode = 'receipt',
  onOrderUpdated
}) => {
  const [activeOrder, setActiveOrder] = useState<Order | null>(initialOrder);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  useEffect(() => {
    setActiveOrder(initialOrder);
    setPrintNotice(null);
    if (initialOrder && (!initialOrder.items || initialOrder.items.length === 0)) {
      import('../services/api').then(({ api }) => {
        api.getOrderDetail(initialOrder.id).then(res => {
          if (res && res.order) {
            const merged = {
              ...res.order,
              items: res.items || []
            };
            setActiveOrder(merged);
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

  const [rollSize, setRollSize] = useState<'58mm' | '80mm'>(() => {
    return (localStorage.getItem('vectos_receipt_roll_size') as '58mm' | '80mm') || '58mm';
  });
  const [copied, setCopied] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPrinterTip, setShowPrinterTip] = useState(true);

  if (!order) return null;

  const handleRollChange = (size: '58mm' | '80mm') => {
    setRollSize(size);
    localStorage.setItem('vectos_receipt_roll_size', size);
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  const taxAmount = (order.total_amount * 0.18) / 1.18;
  const taxableNet = order.total_amount - taxAmount;

  // Plain text generator for thermal Bluetooth, raw printers or clipboard sharing
  const generatePlainText = (type: 'receipt' | 'delivery_notice' = docType) => {
    const divider = rollSize === '58mm' 
      ? '--------------------------------' 
      : '------------------------------------------------';

    if (type === 'delivery_notice') {
      const lines = [
        (shop?.name || order.shop_name || 'VECTOS HARDWARE DEPOT').toUpperCase(),
        shop?.location || 'Kigali, Rwanda',
        `TEL: ${shop?.phone || '+250 788 000 000'}`,
        `TIN: ${shop?.tin_number || order.tin_number || '100028472'}`,
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
        `TOTAL QUANTITY DISPATCHED: ${order.items?.reduce((sum, it) => sum + (it.quantity || 0), 0) || 0} UNITS`,
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
        'OFFICIAL TRANSIT CLEARANCE DOCUMENT',
        'Valid for RRA & Traffic Inspection',
        'Powered by VectOS IOMS Kigali'
      ].filter(Boolean);
      return lines.join('\n');
    }

    // Full Financial Receipt
    const lines = [
      (shop?.name || order.shop_name || 'VECTOS HARDWARE STORE').toUpperCase(),
      shop?.location || 'Kigali, Rwanda',
      `TEL: ${shop?.phone || '+250 788 000 000'}`,
      `TIN: ${shop?.tin_number || order.tin_number || '100028472'}`,
      divider,
      'OFFICIAL CASH SALE RECEIPT (EBM)',
      divider,
      `RECEIPT: ${order.order_number}`,
      `DATE:    ${new Date(order.created_at).toLocaleString()}`,
      `CASHIER: ${order.salesperson_name || 'Counter Operator'}`,
      `CLIENT:  ${order.customer_name || 'Walk-in Client'}`,
      order.customer_phone ? `PHONE:   ${order.customer_phone}` : '',
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
      `Taxable Subtotal:          ${formatRwf(taxableNet)}`,
      `VAT (18% Included):        ${formatRwf(taxAmount)}`,
      `TOTAL DUE:                 ${formatRwf(order.total_amount)}`,
      `PAID AMOUNT:               ${formatRwf(order.paid_amount)}`,
      order.debt_amount > 0 ? `BALANCE DUE:               ${formatRwf(order.debt_amount)}` : '',
      `PAYMENT STATUS:            ${(order.payment_status || 'PAID').toUpperCase()}`,
      divider,
      shop?.receipt_footer_text || 'Murakoze cyane! / Thank you!',
      'Goods sold in good condition not returnable',
      'Powered by VectOS Kigali'
    ].filter(Boolean);

    return lines.join('\n');
  };

  const handleCopyText = (type: 'receipt' | 'delivery_notice' = docType) => {
    navigator.clipboard.writeText(generatePlainText(type));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Isolated iframe print for instant thermal POS or office desktop printing
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

      const rollWidthMm = rollSize === '58mm' ? 58 : 80;
      const fontSizePx = rollSize === '58mm' ? 10.5 : 12;

      let bodyContentHtml = '';

      if (targetType === 'delivery_notice') {
        const totalUnits = order.items?.reduce((acc, it) => acc + (it.quantity || 0), 0) || 0;
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
            <div class="bold" style="font-size: 1.15em; text-transform: uppercase;">${escapeHtml(shop?.name || order.shop_name || 'VECTOS HARDWARE DEPOT')}</div>
            <div style="font-size: 0.85em;">${escapeHtml(shop?.location || 'Kigali, Rwanda')}</div>
            <div style="font-size: 0.85em;">TEL: ${escapeHtml(shop?.phone || '+250 788 000 000')}</div>
            <div style="font-size: 0.85em; font-weight: bold;">TIN: ${escapeHtml(shop?.tin_number || order.tin_number || '100028472')}</div>
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
            <span>${totalUnits} UNITS (${order.items?.length || 0} ITEMS)</span>
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
            <div>Valid stock release clearance for road transit (RRA / Traffic Police).</div>
            <div>Commercial prices omitted for warehouse dispatch control.</div>
            <div style="margin-top: 3px; font-size: 0.9em;">Powered by VectOS Kigali</div>
          </div>
        `;
      } else {
        // Full Financial Receipt
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
            <div class="bold" style="font-size: 1.15em; text-transform: uppercase;">${escapeHtml(shop?.name || order.shop_name || 'VECTOS HARDWARE STORE')}</div>
            <div style="font-size: 0.85em;">${escapeHtml(shop?.location || 'Kigali, Rwanda')}</div>
            <div style="font-size: 0.85em;">TEL: ${escapeHtml(shop?.phone || '+250 788 000 000')}</div>
            <div style="font-size: 0.85em; font-weight: bold;">TIN: ${escapeHtml(shop?.tin_number || order.tin_number || '100028472')}</div>
            <div class="divider"></div>
            <div class="bold" style="font-size: 0.95em; letter-spacing: 0.5px;">OFFICIAL CASH SALE RECEIPT</div>
            <div style="font-size: 0.8em; font-weight: 600;">EBM COMMERCIAL INVOICE</div>
          </div>

          <div class="divider"></div>

          <div class="meta" style="font-size: 0.9em;">
            <div class="row"><span>Receipt No:</span><span class="bold">${escapeHtml(order.order_number)}</span></div>
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

          <div class="row" style="font-size: 0.9em;">
            <span>Taxable Net:</span>
            <span>${formatRwf(taxableNet)}</span>
          </div>
          <div class="row" style="font-size: 0.9em;">
            <span>VAT (18% Included):</span>
            <span>${formatRwf(taxAmount)}</span>
          </div>

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
            <div class="bold">${escapeHtml(shop?.receipt_footer_text || 'Murakoze cyane! / Thank you!')}</div>
            <div>Goods sold in good condition not returnable.</div>
            <div style="font-size: 0.75em; margin-top: 3px;">Powered by VectOS Kigali</div>
          </div>
        `;
      }

      const receiptHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${targetType === 'delivery_notice' ? 'Delivery-Notice' : 'Receipt'}-${order.order_number}</title>
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

      const frameDoc = iframe.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(receiptHtml);
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
      console.error('Thermal print execution error:', err);
      window.print();
      setIsPrinting(false);
    }
  };

  const totalDispatchedQty = order.items?.reduce((acc, it) => acc + (it.quantity || 0), 0) || 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-[#141923] text-slate-100 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[96vh] animate-in fade-in zoom-in-95 my-auto">
        
        {/* Top Header & Roll Switcher */}
        <div className="p-3.5 sm:p-4 bg-[#0F131A] border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              {docType === 'receipt' ? <Receipt className="w-5 h-5" /> : <Package className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-black text-white">
                  {docType === 'receipt' ? 'Official Commercial Receipt' : 'Delivery Notice (Bon de Livraison)'}
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {rollSize}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                Order #{order.order_number} • {docType === 'receipt' ? 'Prices & VAT included' : 'Warehouse stock release (Quantities only, no prices)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Roll Size Selector (58mm vs 80mm) */}
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
            </div>

            {/* Edit Order / Receipt Button */}
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
            <span className="truncate">Full Receipt (Prices & TIN)</span>
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

        {/* Helpful Laptop / Printer Setup Hint */}
        {showPrinterTip && (
          <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">💡</span>
              <p>
                {docType === 'delivery_notice' 
                  ? 'Hand this Delivery Notice to the storekeeper or driver to release products without revealing commercial prices.'
                  : 'Full financial receipt with itemized prices, VAT (18%), and Rwanda Revenue Authority (RRA) TIN.'}
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
          
          {/* Authentic Paper Container */}
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
            {/* Top Paper Tear Indicator */}
            <div className="w-full border-t border-dashed border-slate-400 mb-2" />

            {docType === 'delivery_notice' ? (
              /* ============================================================ */
              /* DELIVERY NOTICE PREVIEW (QUANTITIES ONLY - NO PRICES)       */
              /* ============================================================ */
              <div>
                <div className="text-center space-y-0.5 pb-2">
                  <h2 className="font-black text-sm uppercase tracking-tight text-black font-sans">
                    {shop?.name || order.shop_name || 'VECTOS HARDWARE DEPOT'}
                  </h2>
                  <p className="text-[10px] text-black">{shop?.location || 'Kigali, Rwanda'}</p>
                  <p className="text-[10px] text-black">TEL: {shop?.phone || '+250 788 000 000'}</p>
                  <p className="text-[10px] font-bold text-black">TIN: {shop?.tin_number || order.tin_number || '100028472'}</p>
                  
                  <div className="pt-1.5 mt-1 border-t-2 border-black">
                    <p className="text-[11px] font-black uppercase tracking-wider text-black">
                      DELIVERY NOTICE / BON DE LIVRAISON
                    </p>
                    <p className="text-[9px] font-bold uppercase text-slate-700">
                      STOCK RELEASE & TRANSIT WAYBILL
                    </p>
                  </div>
                </div>

                {/* Metadata */}
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

                {/* Items Table - Quantities and Units ONLY */}
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

                {/* Total Quantity Dispatched Banner */}
                <div className="p-1.5 bg-slate-100 border-y-2 border-black my-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider font-bold">TOTAL PHYSICAL DISPATCH</p>
                  <p className="text-sm font-black">{totalDispatchedQty} UNITS ({order.items?.length || 0} ITEMS)</p>
                </div>

                {/* Warehouse Release Sign-off Box */}
                <div className="border border-black p-2 my-2 text-[9px] space-y-1.5 bg-slate-50">
                  <p className="font-bold uppercase tracking-wider border-b border-black pb-0.5">
                    Depot Stock Release Sign-Off
                  </p>
                  <p>Released By (Storekeeper): __________________</p>
                  <p>Transporter / Vehicle Plate: _________________</p>
                  <p>Received by (Client Signature): _______________</p>
                </div>

                {/* Regulatory Footnote */}
                <div className="text-center pt-1.5 border-t border-dashed border-black text-[8px] space-y-0.5 text-slate-800">
                  <p className="font-bold uppercase">DOCUMENT OFFICIEL DE TRANSPORT & SORTIE DE STOCK</p>
                  <p>Valid stock transit clearance document for RRA & Traffic Police.</p>
                  <p>Prices omitted for warehouse stock release and verification.</p>
                  <p className="pt-0.5 text-[7.5px]">Powered by VectOS Kigali Logistics Module</p>
                </div>
              </div>
            ) : (
              /* ============================================================ */
              /* FULL FINANCIAL RECEIPT (PRICES, VAT, TOTALS & TIN)          */
              /* ============================================================ */
              <div>
                <div className="text-center space-y-0.5 pb-2">
                  <h2 className="font-black text-sm uppercase tracking-tight text-black font-sans">
                    {shop?.name || order.shop_name || 'VECTOS STORE'}
                  </h2>
                  <p className="text-[10px] text-black">{shop?.location || 'Kigali, Rwanda'}</p>
                  <p className="text-[10px] text-black">TEL: {shop?.phone || '+250 788 000 000'}</p>
                  <p className="text-[10px] font-bold text-black">TIN: {shop?.tin_number || order.tin_number || '100028472'}</p>
                  <div className="pt-1 text-[9px] font-black uppercase tracking-widest text-black border-t border-dotted border-black mt-1">
                    OFFICIAL CASH SALE RECEIPT
                  </div>
                </div>

                {/* Order Meta */}
                <div className="space-y-0.5 text-[10px] border-y border-dashed border-black py-1.5 my-1.5">
                  <div className="flex justify-between">
                    <span>Receipt No:</span>
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

                {/* Line Items Table */}
                <div className="space-y-1.5 my-1.5">
                  <div className="flex justify-between font-bold text-[10px] uppercase border-b border-black pb-0.5">
                    <span>Item & Qty</span>
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

                {/* Financial Summary */}
                <div className="space-y-1 text-[10px] border-t border-dashed border-black pt-1.5 mt-2">
                  <div className="flex justify-between">
                    <span>Taxable Net:</span>
                    <span>{formatRwf(taxableNet)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT (18% Incl):</span>
                    <span>{formatRwf(taxAmount)}</span>
                  </div>
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

                {/* Footer */}
                <div className="text-center pt-2 mt-2 border-t border-dashed border-black text-[9px] space-y-0.5">
                  <p className="font-bold">{shop?.receipt_footer_text || 'Murakoze cyane! / Thank you!'}</p>
                  <p>Goods sold in good condition are not returnable.</p>
                  <p className="text-[8px] pt-1">VectOS Kigali POS • EBM Ready</p>
                </div>
              </div>
            )}

            {/* Bottom Paper Tear Indicator */}
            <div className="w-full border-b border-dashed border-slate-400 mt-3" />
          </div>

          <p className="text-[11px] text-slate-400 mt-3 text-center">
            {docType === 'delivery_notice' 
              ? '📦 Delivery Notice Mode: Quantities and items only for warehouse release & transport.'
              : '📄 Official Receipt Mode: Full commercial prices, VAT, and payments.'}
          </p>
        </div>

        {/* Action Buttons Footer with Dual Direct Printing */}
        <div className="p-3.5 sm:p-4 bg-[#0F131A] border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopyText(docType)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 transition active:scale-95"
              title="Copy text for WhatsApp / SMS sharing"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
              <span>{copied ? 'Copied Text!' : `Copy ${docType === 'delivery_notice' ? 'Delivery Note' : 'Receipt'}`}</span>
            </button>

            {/* Direct Edit Button */}
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

            {/* Direct Button: Print Delivery Notice */}
            <button
              type="button"
              onClick={() => executePrint('delivery_notice')}
              disabled={isPrinting}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40 font-bold text-xs transition active:scale-95"
              title="Print only Delivery Notice with products and quantities for storekeeper"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Print Delivery Notice</span>
            </button>

            {/* Direct Button: Print Full Receipt */}
            <button
              type="button"
              onClick={() => executePrint('receipt')}
              disabled={isPrinting || !canPrintReceipt}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95 cursor-pointer"
              title="Print full receipt with item prices and total amounts"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Printing...' : 'Print Full Receipt'}</span>
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
