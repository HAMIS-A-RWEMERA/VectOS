import React, { useState } from 'react';
import { api } from '../services/api';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Trash2, 
  Download,
  Boxes
} from 'lucide-react';
import { StockLocation } from '../types';

interface BulkImportModalProps {
  stocks: StockLocation[];
  onClose: () => void;
  onSuccess: () => void;
}

interface StagedProduct {
  name: string;
  sku: string;
  category: string;
  unit: string;
  buying_price: number;
  quantity: number;
  low_stock_threshold: number;
  description?: string;
  isValid: boolean;
  error?: string;
}

const SAMPLE_CSV = `name,sku,category,unit,buying_price,quantity,low_stock_threshold,description
Ciment Cimerwa 32.5R 50kg,SKU-CIM-001,Cement & Mortar,Bag,9800,200,30,Standard Portland Cement
Amabati Rugabano 28G Blue 3m,SKU-IRN-001,Roofing & Metal,Pcs,11500,150,20,Corrugated Galvanized Iron Sheets
Imisumari 3 Inch Nails 1kg,SKU-NAL-001,Fasteners,Kg,1800,100,15,Carbon Steel Construction Nails
Peinture Ruliba White 20L,SKU-PNT-001,Paints & Solvents,Bucket,32000,40,8,Interior Vinyl Emulsion Paint
Tuyau PVC Pression 1/2" 6m,SKU-PVC-001,Plumbing,Pcs,4500,80,10,High Pressure Clean Water Pipe
Robinet Chromé Brass 1/2",SKU-ROB-001,Plumbing,Pcs,7500,50,10,Chrome Finish Water Tap
Disque Meuleuse 115mm Metal,SKU-DSK-001,Tools & Hardware,Pcs,1200,120,25,Abrasive Cutting Disc
Cadenas Viro 50mm Brass,SKU-PAD-001,Security & Locks,Pcs,6500,45,10,Heavy Duty Brass Padlock
Carreaux Sol 60x60cm Grey (1.44m²),SKU-TIL-001,Tiles & Ceramics,Box,14000,75,15,Porcelain Polished Floor Tiles
Fer à Béton 12mm High Yield,SKU-REB-001,Building Materials,Bar,13500,180,25,Reinforcement Deformed Rebar`;

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  stocks,
  onClose,
  onSuccess
}) => {
  const [selectedStockId, setSelectedStockId] = useState<number>(stocks[0]?.id || 1);
  const [rawText, setRawText] = useState('');
  const [stagedProducts, setStagedProducts] = useState<StagedProduct[]>([]);
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const parseCsvData = (text: string) => {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      setStagedProducts([]);
      return;
    }

    // Check if first row is header
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('name') || firstLine.includes('sku') || firstLine.includes('price');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const parsed: StagedProduct[] = dataLines.map((line, idx) => {
      // Split by comma or tab or semicolon
      let parts: string[] = [];
      if (line.includes('\t')) {
        parts = line.split('\t');
      } else if (line.includes(';')) {
        parts = line.split(';');
      } else {
        parts = line.split(',');
      }

      const cleanParts = parts.map(p => p.trim().replace(/^["']|["']$/g, ''));
      const name = cleanParts[0] || '';
      const sku = cleanParts[1] || `SKU-${Date.now().toString().slice(-4)}${idx.toString().padStart(2, '0')}`;
      const category = cleanParts[2] || 'Hardware';
      const unit = cleanParts[3] || 'Pcs';
      const buying_price = parseFloat(cleanParts[4]) || 0;
      const quantity = parseFloat(cleanParts[5]) || 0;
      const low_stock_threshold = parseFloat(cleanParts[6]) || 10;
      const description = cleanParts[7] || '';

      let isValid = true;
      let error = '';

      if (!name) {
        isValid = false;
        error = 'Product name missing';
      } else if (isNaN(buying_price) || buying_price < 0) {
        isValid = false;
        error = 'Invalid buying price';
      }

      return {
        name,
        sku,
        category,
        unit,
        buying_price,
        quantity,
        low_stock_threshold,
        description,
        isValid,
        error
      };
    });

    setStagedProducts(parsed);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const txt = e.target.value;
    setRawText(txt);
    parseCsvData(txt);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        parseCsvData(content);
      }
    };
    reader.readAsText(file);
  };

  const loadSampleTemplate = () => {
    setRawText(SAMPLE_CSV);
    parseCsvData(SAMPLE_CSV);
  };

  const handleCommitImport = async () => {
    const validRows = stagedProducts.filter(p => p.isValid);
    if (validRows.length === 0) {
      setErrorMessage('No valid product rows ready for import.');
      return;
    }

    try {
      setImporting(true);
      setErrorMessage('');
      const res = await api.bulkImportProducts(validRows, selectedStockId);
      setResultMsg(res.message || `Successfully imported ${validRows.length} products!`);
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to import bulk stock data.');
    } finally {
      setImporting(false);
    }
  };

  const validCount = stagedProducts.filter(p => p.isValid).length;
  const totalUnits = stagedProducts.reduce((sum, p) => sum + (p.isValid ? p.quantity : 0), 0);
  const totalValue = stagedProducts.reduce((sum, p) => sum + (p.isValid ? p.quantity * p.buying_price : 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 lg:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl bg-[#131722] border border-slate-700 shadow-2xl p-5 lg:p-6 space-y-5 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base lg:text-lg font-bold text-white">Bulk Stock & Inventory Importer</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Excel / CSV Fast-Ingest
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Quickly populate initial store catalog or receive bulk shipments with 500+ items at once.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-300 shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {resultMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-300 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{resultMsg}</span>
          </div>
        )}

        {/* Action Controls & Warehouse Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Target Warehouse / Depot *</label>
            <select
              value={selectedStockId}
              onChange={(e) => setSelectedStockId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {stocks.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer transition">
              <UploadCloud className="w-4 h-4 text-amber-400" />
              <span>Choose CSV / TSV File</span>
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={loadSampleTemplate}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-bold text-amber-300 transition"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Load 10 Kigali Hardware Demo Items</span>
            </button>
          </div>
        </div>

        {/* Input Text Area & Live Preview Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
          {/* Raw Text Box */}
          <div className="lg:col-span-4 flex flex-col space-y-1.5 min-h-[160px]">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Paste CSV or Excel Table</span>
              <button
                type="button"
                onClick={() => { setRawText(''); setStagedProducts([]); }}
                className="text-[11px] text-slate-400 hover:text-rose-400"
              >
                Clear
              </button>
            </div>
            <textarea
              value={rawText}
              onChange={handleTextChange}
              placeholder="Paste comma-separated rows: Name, SKU, Category, Unit, Buying Price, Qty, Low Alert, Notes"
              className="w-full flex-1 p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
            />
            <p className="text-[10px] text-slate-400">
              Format: Name, SKU, Category, Unit, BuyingPrice, Quantity, LowStockThreshold, Description
            </p>
          </div>

          {/* Staged Data Table */}
          <div className="lg:col-span-8 flex flex-col rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden min-h-[220px]">
            <div className="p-3 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">Staging Table ({stagedProducts.length} items parsed)</span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-400 font-semibold">{validCount} Valid</span>
                {stagedProducts.length - validCount > 0 && (
                  <span className="text-rose-400 font-semibold">{stagedProducts.length - validCount} Errors</span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto max-h-[300px]">
              {stagedProducts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                  <UploadCloud className="w-8 h-8 mx-auto text-slate-600 animate-bounce" />
                  <p>No products staged yet. Paste CSV rows or click "Load Kigali Hardware Demo Items".</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="sticky top-0 bg-[#161B24] text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Item Name</th>
                      <th className="p-2.5">SKU</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5 text-right">Cost (RWF)</th>
                      <th className="p-2.5 text-right">Init Qty</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stagedProducts.map((p, idx) => (
                      <tr key={idx} className={p.isValid ? 'hover:bg-slate-800/40' : 'bg-rose-500/10'}>
                        <td className="p-2.5 font-medium text-white max-w-[180px] truncate">{p.name}</td>
                        <td className="p-2.5 font-mono text-[11px] text-amber-300/90">{p.sku}</td>
                        <td className="p-2.5 text-slate-400">{p.category}</td>
                        <td className="p-2.5 text-right font-mono">{p.buying_price.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-amber-400">{p.quantity} {p.unit}</td>
                        <td className="p-2.5 text-center">
                          {p.isValid ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                              Ready
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold" title={p.error}>
                              Error
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Calculated summary stats bar */}
            {validCount > 0 && (
              <div className="p-3 bg-[#11151F] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-slate-400 text-[11px]">Total Units: </span>
                    <span className="font-bold text-white font-mono">{totalUnits.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">Stock Value: </span>
                    <span className="font-bold text-amber-400 font-mono">RWF {totalValue.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCommitImport}
            disabled={importing || validCount === 0 || Boolean(resultMsg)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition ${
              importing || validCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>{importing ? 'Ingesting Bulk Stock...' : `Commit & Import ${validCount} Products`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
