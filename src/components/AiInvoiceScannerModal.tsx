import React, { useState, useRef } from 'react';
import { 
  Sparkles, 
  UploadCloud, 
  Camera, 
  FileText, 
  CheckCircle2, 
  Trash2, 
  Plus, 
  X, 
  AlertCircle, 
  ArrowRight, 
  Loader2, 
  Warehouse, 
  DollarSign, 
  Package, 
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { StockLocation } from '../types';
import { api } from '../services/api';

interface ExtractedItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  buying_price: number;
  selling_price: number;
  quantity: number;
  low_stock_threshold: number;
  description: string;
}

interface AiInvoiceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  stocks: StockLocation[];
}

const CATEGORY_OPTIONS = [
  'Construction / Cement',
  'Steel & Metals',
  'Roofing & Sheets',
  'Plumbing / Pipes',
  'Paints & Finishes',
  'Tools & Hardware',
  'Electrical & Lighting',
  'General Supplies'
];

const UNIT_OPTIONS = [
  'pcs',
  'bags',
  'bars',
  'sheets',
  'meters',
  'cartons',
  'rolls',
  'liters',
  'boxes',
  'kg'
];

export const AiInvoiceScannerModal: React.FC<AiInvoiceScannerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  stocks
}) => {
  const [selectedStockId, setSelectedStockId] = useState<number>(() => {
    const main = stocks.find((s) => s.is_main);
    return main ? main.id : (stocks[0]?.id || 1);
  });

  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState<string>('');

  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Staging / Double-check review screen
  const [stagedItems, setStagedItems] = useState<ExtractedItem[]>([]);
  const [isConfirmedStep, setIsConfirmedStep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleStartScan = async () => {
    if (inputMode === 'upload' && !selectedFile) {
      setError('Please select an invoice image, photo, or document to scan.');
      return;
    }
    if (inputMode === 'paste' && !pastedText.trim()) {
      setError('Please paste the invoice text, receipt items, or delivery note.');
      return;
    }

    try {
      setIsScanning(true);
      setError(null);
      setScanStep('Sending document to Gemini AI...');

      const formData = new FormData();
      if (inputMode === 'upload' && selectedFile) {
        formData.append('document', selectedFile);
      }
      if (inputMode === 'paste' && pastedText.trim()) {
        formData.append('text_content', pastedText.trim());
      }
      formData.append('stock_id', String(selectedStockId));

      setScanStep('Gemini reading item names, quantities, and prices...');
      const res = await api.aiExtractInvoice(formData);

      if (!res.success || !res.items || res.items.length === 0) {
        throw new Error(res.message || 'No inventory items could be found in this document. Please try a clearer photo or file.');
      }

      const formatted: ExtractedItem[] = res.items.map((it: any, idx: number) => {
        const buy = Number(it.buying_price || 0);
        return {
          id: `item-${Date.now()}-${idx}`,
          name: String(it.name || '').trim(),
          sku: String(it.sku || `SKU-${Date.now().toString().slice(-4)}-${idx + 1}`),
          category: String(it.category || 'General Supplies'),
          unit: String(it.unit || 'pcs').toLowerCase(),
          buying_price: buy,
          // Strict policy: Suggested selling equals buying price
          selling_price: buy,
          quantity: Math.max(1, Number(it.quantity || 1)),
          low_stock_threshold: Number(it.low_stock_threshold || 10),
          description: String(it.description || '')
        };
      });

      setStagedItems(formatted);
      setIsConfirmedStep(true);
    } catch (err: any) {
      console.error('AI Scan error:', err);
      setError(err.message || 'Failed to analyze document with AI. Please ensure the document is clear.');
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  const handleUpdateItem = (id: string, field: keyof ExtractedItem, value: any) => {
    setStagedItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };
        // If user edits buying_price in the double-check table, maintain selling_price parity
        if (field === 'buying_price') {
          updated.selling_price = Number(value);
        }
        return updated;
      })
    );
  };

  const handleDeleteItem = (id: string) => {
    setStagedItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleAddBlankRow = () => {
    const newItem: ExtractedItem = {
      id: `manual-${Date.now()}`,
      name: 'New Hardware Item',
      sku: `SKU-${Date.now().toString().slice(-4)}`,
      category: 'General Supplies',
      unit: 'pcs',
      buying_price: 1000,
      selling_price: 1000,
      quantity: 10,
      low_stock_threshold: 5,
      description: ''
    };
    setStagedItems((prev) => [...prev, newItem]);
  };

  const handleReset = () => {
    setIsConfirmedStep(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setPastedText('');
    setStagedItems([]);
    setError(null);
  };

  const handleCommitInventory = async () => {
    if (stagedItems.length === 0) {
      setError('Please keep at least one product in the list to import.');
      return;
    }

    // Validate that every product has a name and non-negative quantity
    for (const item of stagedItems) {
      if (!item.name.trim()) {
        setError('Every item must have a product name.');
        return;
      }
      if (item.quantity < 0 || isNaN(item.quantity)) {
        setError(`Invalid quantity for item "${item.name}".`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const payload = stagedItems.map((item) => ({
        name: item.name.trim(),
        sku: item.sku.trim(),
        category: item.category.trim(),
        unit: item.unit.trim() || 'pcs',
        buying_price: Number(item.buying_price),
        selling_price: Number(item.buying_price), // strict 1:1 parity rule
        quantity: Number(item.quantity),
        low_stock_threshold: Number(item.low_stock_threshold || 10),
        description: item.description ? item.description.trim() : null
      }));

      const res = await api.bulkImportProducts(payload, selectedStockId);
      if (res.success) {
        onSuccess(stagedItems.length);
        handleReset();
        onClose();
      } else {
        throw new Error(res.message || 'Failed to save products to inventory.');
      }
    } catch (err: any) {
      console.error('Commit error:', err);
      setError(err.message || 'Failed to save products.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalQty = stagedItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const totalValuation = stagedItems.reduce((acc, it) => acc + ((Number(it.buying_price) || 0) * (Number(it.quantity) || 0)), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-[#0f1422] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between bg-gradient-to-r from-indigo-950/30 via-slate-900/50 to-slate-900/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white font-display">
                  AI Invoice & Receipt Scanner
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Option 3
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Snap or upload any paper invoice, delivery receipt, or PDF. AI formats and lists items for your double-check.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* STEP 1: UPLOAD / SCAN SCREEN */}
          {!isConfirmedStep && (
            <div className="space-y-5">
              {/* Warehouse Destination */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Warehouse className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-200">Destination Warehouse / Depot</p>
                    <p className="text-[11px] text-slate-400">Select which stock location will receive these scanned products</p>
                  </div>
                </div>

                <select
                  value={selectedStockId}
                  onChange={(e) => setSelectedStockId(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {stocks.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.is_main ? '(Main)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode Switcher */}
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
                <button
                  type="button"
                  onClick={() => setInputMode('upload')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    inputMode === 'upload'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-850'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Photo / Document Upload</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('paste')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    inputMode === 'paste'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-850'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Paste Invoice Text</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              {inputMode === 'upload' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition ${
                    selectedFile
                      ? 'border-indigo-500/50 bg-indigo-950/10'
                      : 'border-slate-700/80 hover:border-indigo-500/50 hover:bg-slate-900/40 bg-slate-900/20'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf,.csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  {previewUrl ? (
                    <div className="space-y-3">
                      <div className="max-h-48 max-w-xs mx-auto rounded-xl overflow-hidden border border-slate-700 shadow-md">
                        <img src={previewUrl} alt="Invoice preview" className="w-full h-full object-cover" />
                      </div>
                      <p className="text-xs font-bold text-indigo-300">{selectedFile?.name}</p>
                      <p className="text-[11px] text-slate-400">Click to change photo or document</p>
                    </div>
                  ) : selectedFile ? (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
                        <FileText className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-white">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB • Click to change</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
                        <UploadCloud className="w-7 h-7" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-200">
                          Take a photo or upload supplier invoice / delivery slip
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Supports phone camera photos (JPEG, PNG), PDFs from suppliers, or spreadsheets
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-2 pt-2 text-[11px] text-indigo-400 font-semibold">
                        <Camera className="w-3.5 h-3.5" />
                        <span>Tap to snap photo with camera or browse file</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Paste supplier invoice lines, WhatsApp message, or delivery list:
                  </label>
                  <textarea
                    rows={6}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="e.g.&#10;50 sacs Ciment Twiga 32.5R - 11,500 RWF&#10;20 barres Fer a Beton 12mm - 14,200 RWF&#10;15 toles bac 28g bleu - 9,500 RWF&#10;5 bidons peinture blanche Plascon 20L - 39,500 RWF"
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500">
                    You can paste raw unformatted text in French, Kinyarwanda, or English. The AI will extract and structure it properly.
                  </p>
                </div>
              )}

              {/* Guidance card */}
              <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-400 space-y-1">
                  <p className="text-slate-200 font-bold">How the verification works:</p>
                  <p>
                    1. The AI extracts items and initial prices from your document.
                  </p>
                  <p>
                    2. <strong className="text-amber-300">Nothing is saved immediately</strong>: you will be shown a full review table to double-check quantities, units, and prices yourself before confirming!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: STAGING & DOUBLE-CHECK REVIEW SCREEN */}
          {isConfirmedStep && (
            <div className="space-y-4">
              {/* Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-indigo-300 uppercase tracking-wider font-semibold">Extracted Items</span>
                  <p className="text-base sm:text-lg font-black text-white">{stagedItems.length} Products</p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[10px] text-indigo-300 uppercase tracking-wider font-semibold">Total Stock Units</span>
                  <p className="text-base sm:text-lg font-black text-white font-mono">{totalQty.toLocaleString()}</p>
                </div>

                <div className="col-span-2 space-y-0.5">
                  <span className="text-[10px] text-indigo-300 uppercase tracking-wider font-semibold">Total Invoice Valuation</span>
                  <p className="text-base sm:text-lg font-black text-amber-400 font-mono">RWF {Math.round(totalValuation).toLocaleString()}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs text-amber-300">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Double-Check Rule:</strong> Suggested selling price equals the invoice price by default. You can edit any field in the table below.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddBlankRow}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-bold transition shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line</span>
                </button>
              </div>

              {/* Editable Staging Table */}
              <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-900/30">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/80 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">#</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[200px]">Product Name</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[130px]">Category</th>
                      <th className="py-2.5 px-3 font-semibold w-24">Unit</th>
                      <th className="py-2.5 px-3 font-semibold w-20">Quantity</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[120px]">Invoice / Buy (RWF)</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[120px]">Suggested Selling</th>
                      <th className="py-2.5 px-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {stagedItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2 px-3 text-slate-500 text-[11px]">{idx + 1}</td>

                        {/* Product Name */}
                        <td className="py-2 px-3 font-sans">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                            className="w-full px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold font-sans"
                          />
                        </td>

                        {/* Category */}
                        <td className="py-2 px-3 font-sans">
                          <select
                            value={item.category}
                            onChange={(e) => handleUpdateItem(item.id, 'category', e.target.value)}
                            className="w-full px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-sans"
                          >
                            {CATEGORY_OPTIONS.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>

                        {/* Unit */}
                        <td className="py-2 px-3 font-sans">
                          <select
                            value={item.unit}
                            onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                            className="w-full px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-sans"
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>

                        {/* Quantity */}
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(item.id, 'quantity', Number(e.target.value))}
                            className="w-full px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-xs text-white font-bold focus:outline-none focus:border-indigo-500"
                          />
                        </td>

                        {/* Buying Price */}
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="0"
                            value={item.buying_price}
                            onChange={(e) => handleUpdateItem(item.id, 'buying_price', Number(e.target.value))}
                            className="w-full px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                          />
                        </td>

                        {/* Suggested Selling */}
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="0"
                            value={item.selling_price}
                            onChange={(e) => handleUpdateItem(item.id, 'selling_price', Number(e.target.value))}
                            className="w-full px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                          />
                        </td>

                        {/* Delete Row */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                            title="Remove row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {isConfirmedStep ? (
              <span>Target: <strong>{stocks.find(s => s.id === selectedStockId)?.name || 'Main Warehouse'}</strong></span>
            ) : (
              <span>Powered by Gemini 3.8 Flash • Free-tier processing</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!isConfirmedStep ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    handleReset();
                    onClose();
                  }}
                  className="w-1/2 sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isScanning}
                  onClick={handleStartScan}
                  className="w-1/2 sm:w-auto flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{scanStep || 'Scanning with AI...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Scan & Extract Items</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-1/2 sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Scan Another</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting || stagedItems.length === 0}
                  onClick={handleCommitInventory}
                  className="w-1/2 sm:w-auto flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Adding to Inventory...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirm & Add {stagedItems.length} Products</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
