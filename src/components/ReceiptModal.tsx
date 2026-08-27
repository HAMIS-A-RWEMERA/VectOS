import React, { useRef } from 'react';
import { Order, Shop } from '../types';
import { Printer, X, CheckCircle2 } from 'lucide-react';

interface ReceiptModalProps {
  order: Order | null;
  shop: Shop | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ order, shop, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!order) return null;

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  const handlePrint = () => {
    window.print();
  };

  const taxAmount = (order.total_amount * 0.18) / 1.18;
  const taxableNet = order.total_amount - taxAmount;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        {/* Top Modal Controls (Hidden in Print) */}
        <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-slate-700" />
            <span className="text-xs font-bold text-slate-800">Printable Official Receipt</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow transition flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Content */}
        <div ref={receiptRef} className="p-6 overflow-y-auto space-y-4 font-mono text-xs text-slate-800">
          {/* Header */}
          <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-4">
            <h2 className="text-base font-black uppercase tracking-wider text-slate-950 font-sans">
              {shop?.name || order.shop_name || 'VectOS Hardware Store'}
            </h2>
            <p className="text-[11px] text-slate-600">{shop?.location || 'Kigali, Rwanda'}</p>
            <p className="text-[11px] text-slate-600">TEL: {shop?.phone || '+250 788 000 000'}</p>
            <p className="text-[11px] font-bold text-slate-800">TIN: {shop?.tin_number || order.tin_number || '100028472'}</p>
            <div className="pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              OFFICIAL CASH SALE RECEIPT
            </div>
          </div>

          {/* Meta Info */}
          <div className="space-y-1 text-[11px] border-b border-dashed border-slate-300 pb-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Receipt No:</span>
              <span className="font-bold">{order.order_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date:</span>
              <span>{new Date(order.created_at).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cashier:</span>
              <span>{order.salesperson_name || 'Counter Operator'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Client:</span>
              <span className="font-bold">{order.customer_name || 'Walk-in Client'}</span>
            </div>
          </div>

          {/* Item Table */}
          <div className="space-y-2 border-b border-dashed border-slate-300 pb-3">
            <div className="flex justify-between font-bold text-[11px] uppercase border-b border-slate-200 pb-1">
              <span>Item & Qty</span>
              <span className="text-right">Total (RWF)</span>
            </div>

            {order.items && order.items.length > 0 ? (
              order.items.map((it, idx) => (
                <div key={idx} className="flex justify-between items-start text-[11px]">
                  <div>
                    <p className="font-semibold">{it.product_name || `Product #${it.product_id}`}</p>
                    <p className="text-[10px] text-slate-500">
                      {it.quantity} x {formatRwf(it.selling_price)}
                    </p>
                  </div>
                  <span className="font-bold">{formatRwf(it.subtotal)}</span>
                </div>
              ))
            ) : (
              <div className="flex justify-between text-[11px]">
                <span>Hardware items summary</span>
                <span className="font-bold">{formatRwf(order.total_amount)}</span>
              </div>
            )}
          </div>

          {/* Totals Calculation */}
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Taxable Subtotal:</span>
              <span>{formatRwf(taxableNet)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>VAT (18% Included):</span>
              <span>{formatRwf(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-950 pt-1 border-t border-slate-800">
              <span>TOTAL DUE:</span>
              <span>{formatRwf(order.total_amount)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-bold">
              <span>PAID AMOUNT:</span>
              <span>{formatRwf(order.paid_amount)}</span>
            </div>
            {order.debt_amount > 0 && (
              <div className="flex justify-between text-rose-600 font-bold">
                <span>CREDIT / BALANCE DUE:</span>
                <span>{formatRwf(order.debt_amount)}</span>
              </div>
            )}
          </div>

          {/* Payment Method Badge */}
          <div className="p-2 rounded bg-slate-100 border border-slate-200 text-center text-[10px] uppercase font-bold text-slate-700">
            Payment Mode: {order.payment_status === 'paid' ? 'SETTLED' : order.payment_status}
          </div>

          {/* Footer Note */}
          <div className="text-center pt-2 text-[10px] text-slate-500 space-y-1">
            <p className="font-bold">{shop?.receipt_footer_text || 'Murakoze cyane! / Thank you for your business!'}</p>
            <p>Goods once sold in good condition are not returnable.</p>
            <p className="text-[9px] font-sans text-slate-400">Powered by VectOS Kigali</p>
          </div>
        </div>
      </div>
    </div>
  );
};
