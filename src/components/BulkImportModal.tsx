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
import { useLanguage } from '../i18n/LanguageContext';

interface BulkImportModalProps {
  stocks: StockLocation[];
  isStockOnly?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface StagedProduct {
  name: string;
  sku: string;
  category: string;
  unit: string;
  units_per_pack?: number;
  pack_unit?: string;
  pack_buying_price?: number;
  pack_selling_price?: number;
  buying_price: number;
  selling_price: number;
  quantity: number;
  low_stock_threshold: number;
  description?: string;
  isValid: boolean;
  error?: string;
}

const SAMPLE_CSV_WITH_PRICES = `Product Name,SKU,Category,Unit,Buying Price (RWF),Selling Price (RWF),Initial Quantity,Low Stock Alert,Description
Ciment Cimerwa 32.5R 50kg,SKU-CIM-001,Cement & Mortar,Bag,9800,12000,200,30,Standard Portland Cement
Amabati Rugabano 28G Blue 3m,SKU-IRN-001,Roofing & Metal,Pcs,11500,14000,150,20,Corrugated Galvanized Iron Sheets
Imisumari 3 Inch Nails 1kg,SKU-NAL-001,Fasteners,Kg,1800,2500,100,15,Carbon Steel Construction Nails
Peinture Ruliba White 20L,SKU-PNT-001,Paints & Solvents,Bucket,32000,38000,40,8,Interior Vinyl Emulsion Paint
Tuyau PVC Pression 1/2" 6m,SKU-PVC-001,Plumbing,Pcs,4500,5500,80,10,High Pressure Clean Water Pipe
Robinet Chromé Brass 1/2",SKU-ROB-001,Plumbing,Pcs,7500,9500,50,10,Chrome Finish Water Tap
Disque Meuleuse 115mm Metal,SKU-DSK-001,Tools & Hardware,Pcs,1200,1600,120,25,Abrasive Cutting Disc
Cadenas Viro 50mm Brass,SKU-PAD-001,Security & Locks,Pcs,6500,8000,45,10,Heavy Duty Brass Padlock
Carreaux Sol 60x60cm Grey (1.44m²),SKU-TIL-001,Tiles & Ceramics,Box,14000,17500,75,15,Porcelain Polished Floor Tiles
Fer à Béton 12mm High Yield,SKU-REB-001,Building Materials,Bar,13500,16500,180,25,Reinforcement Deformed Rebar`;

const SAMPLE_CSV_STOCK_ONLY = `Product Name,SKU,Category,Unit,Initial Quantity,Low Stock Alert,Description
Ciment Cimerwa 32.5R 50kg,SKU-CIM-001,Cement & Mortar,Bag,200,30,Standard Portland Cement
Amabati Rugabano 28G Blue 3m,SKU-IRN-001,Roofing & Metal,Sheet,150,20,Corrugated Galvanized Iron Sheets
Imisumari 3 Inch Nails 1kg,SKU-NAL-001,Fasteners,Kg,100,15,Carbon Steel Construction Nails
Peinture Ruliba White 20L,SKU-PNT-001,Paints & Solvents,Bucket,40,8,Interior Vinyl Emulsion Paint
Tuyau PVC Pression 1/2" 6m,SKU-PVC-001,Plumbing,Pcs,80,10,High Pressure Clean Water Pipe
Robinet Chromé Brass 1/2",SKU-ROB-001,Plumbing,Pcs,50,10,Chrome Finish Water Tap
Disque Meuleuse 115mm Metal,SKU-DSK-001,Tools & Hardware,Pcs,120,25,Abrasive Cutting Disc
Cadenas Viro 50mm Brass,SKU-PAD-001,Security & Locks,Pcs,45,10,Heavy Duty Brass Padlock
Carreaux Sol 60x60cm Grey (1.44m²),SKU-TIL-001,Tiles & Ceramics,Box,75,15,Porcelain Polished Floor Tiles
Fer à Béton 12mm High Yield,SKU-REB-001,Building Materials,Bar,180,25,Reinforcement Deformed Rebar`;

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  stocks,
  isStockOnly = false,
  onClose,
  onSuccess
}) => {
  const { tf } = useLanguage();
  const [selectedStockId, setSelectedStockId] = useState<number>(stocks[0]?.id || 1);
  const [rawText, setRawText] = useState('');
  const [stagedProducts, setStagedProducts] = useState<StagedProduct[]>([]);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const splitCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    const delimiter = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (!inQuotes) {
          inQuotes = true;
        } else if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped double quote
        } else {
          inQuotes = false;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  };

  const parseCsvData = (text: string) => {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      setStagedProducts([]);
      return;
    }

    // Check if first row is header
    const firstLine = lines[0].toLowerCase();
    const hasHeader =
      firstLine.includes('name') ||
      firstLine.includes('sku') ||
      firstLine.includes('price') ||
      firstLine.includes('cost') ||
      firstLine.includes('qty') ||
      firstLine.includes('quantity') ||
      firstLine.includes('category');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    let nameIdx = hasHeader ? -1 : 0;
    let skuIdx = hasHeader ? -1 : 1;
    let catIdx = hasHeader ? -1 : 2;
    let unitIdx = hasHeader ? -1 : 3;
    let buyIdx = hasHeader ? -1 : (isStockOnly ? -1 : 4);
    let sellIdx = hasHeader ? -1 : (isStockOnly ? -1 : 5);
    let qtyIdx = hasHeader ? -1 : (isStockOnly ? 4 : 6);
    let lowIdx = hasHeader ? -1 : (isStockOnly ? 5 : 7);
    let descIdx = hasHeader ? -1 : (isStockOnly ? 6 : 8);
    let packUnitIdx = -1;
    let unitsPerPackIdx = -1;
    let packBuyIdx = -1;
    let packSellIdx = -1;

    if (hasHeader) {
      const splitHeader = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
      splitHeader.forEach((h, idx) => {
        if (h.includes('pack_unit') || h.includes('pack unit') || h.includes('carton_unit') || h === 'wholesale_unit') packUnitIdx = idx;
        else if (h.includes('units_per_pack') || h.includes('units per pack') || h.includes('per_pack') || h.includes('pack_size') || h.includes('pack_qty')) unitsPerPackIdx = idx;
        else if (h.includes('pack_buy') || h.includes('pack buying') || h.includes('pack_cost') || h.includes('carton_cost') || h.includes('wholesale_buy')) packBuyIdx = idx;
        else if (h.includes('pack_sell') || h.includes('pack selling') || h.includes('pack_price') || h.includes('carton_price') || h.includes('wholesale_price')) packSellIdx = idx;
        else if (h.includes('name') || h.includes('product') || h.includes('item') || h.includes('article') || h.includes('designation')) nameIdx = idx;
        else if (h.includes('sku') || h.includes('code') || h.includes('ref')) skuIdx = idx;
        else if (h.includes('cat') || h.includes('type')) catIdx = idx;
        else if (h.includes('unit') || h.includes('unite') || h.includes('mesure')) unitIdx = idx;
        else if (h.includes('buy') || h.includes('cost') || h.includes('achat') || h.includes('biranguza')) buyIdx = idx;
        else if (h.includes('sell') || h.includes('retail') || h.includes('vente') || h.includes('kugurisha')) sellIdx = idx;
        else if (h.includes('price') && buyIdx !== idx) {
          if (sellIdx === -1) sellIdx = idx;
        }
        else if (h.includes('low') || h.includes('min') || h.includes('alert') || h.includes('threshold') || h.includes('seuil')) lowIdx = idx;
        else if (h.includes('qty') || h.includes('stock') || h.includes('quantity') || h.includes('quantite') || h.includes('ingano')) qtyIdx = idx;
        else if (h.includes('desc') || h.includes('note') || h.includes('detail') || h.includes('remarque')) descIdx = idx;
      });
    }

    const seenSkus = new Map<string, string>();

    const parsed: StagedProduct[] = dataLines.map((line, idx) => {
      const cleanParts = splitCsvLine(line);
      const name = (nameIdx >= 0 ? cleanParts[nameIdx] : cleanParts[0]) || '';
      let rawSku = (skuIdx >= 0 ? (cleanParts[skuIdx] || '') : '').trim();

      // Disambiguate placeholder or duplicate SKUs (e.g. repeated '111111', '0', 'N/A')
      const isPlaceholder = !rawSku || /^(1+|0+|n\/?a|none|-|null|tbd|sample|test)$/i.test(rawSku);
      let sku = rawSku;
      if (isPlaceholder) {
        const base = rawSku && /^[A-Za-z0-9_-]+$/.test(rawSku) ? rawSku : 'SKU';
        sku = `${base}-${String(idx + 1).padStart(2, '0')}`;
      } else if (seenSkus.has(rawSku.toLowerCase()) && seenSkus.get(rawSku.toLowerCase()) !== name.toLowerCase()) {
        sku = `${rawSku}-${String(idx + 1).padStart(2, '0')}`;
      }
      if (sku) {
        seenSkus.set(rawSku.toLowerCase(), name.toLowerCase());
      }

      let category = (catIdx >= 0 ? cleanParts[catIdx] : '') || 'General Hardware';
      if (!category || /^(n\/?a|none|-|null)$/i.test(category)) {
        category = 'General Hardware';
      }

      let unit = (unitIdx >= 0 ? cleanParts[unitIdx] : '') || 'Pcs';
      if (!unit || unit === '1' || /^(n\/?a|none|-|null)$/i.test(unit)) {
        unit = 'Pcs';
      }

      const buying_price = isStockOnly || buyIdx < 0
        ? 0
        : (parseFloat(cleanParts[buyIdx] || '0') || 0);

      let selling_price = 0;
      if (!isStockOnly) {
        if (sellIdx >= 0 && cleanParts[sellIdx] !== undefined && !isNaN(parseFloat(cleanParts[sellIdx])) && parseFloat(cleanParts[sellIdx]) > 0) {
          selling_price = parseFloat(cleanParts[sellIdx]);
        } else {
          selling_price = buying_price > 0 ? buying_price : 0;
        }
      }

      const rawQty = qtyIdx >= 0 ? cleanParts[qtyIdx] : undefined;
      const quantity = Math.max(0, Math.round(parseFloat(rawQty || '0') || 0));
      const rawLow = lowIdx >= 0 ? cleanParts[lowIdx] : undefined;
      const low_stock_threshold = Math.max(0, Math.round(parseFloat(rawLow || '10') || 10));
      const description = (descIdx >= 0 ? cleanParts[descIdx] : '') || '';

      const units_per_pack = unitsPerPackIdx >= 0
        ? Math.max(1, Math.round(parseFloat(cleanParts[unitsPerPackIdx]) || 1))
        : 1;
      const pack_unit = units_per_pack > 1 && packUnitIdx >= 0 && cleanParts[packUnitIdx]
        ? cleanParts[packUnitIdx].trim()
        : undefined;
      const pack_buying_price = !isStockOnly && units_per_pack > 1 && packBuyIdx >= 0 && parseFloat(cleanParts[packBuyIdx]) > 0
        ? parseFloat(cleanParts[packBuyIdx])
        : undefined;
      const pack_selling_price = !isStockOnly && units_per_pack > 1 && packSellIdx >= 0 && parseFloat(cleanParts[packSellIdx]) > 0
        ? parseFloat(cleanParts[packSellIdx])
        : undefined;

      let isValid = true;
      let error = '';

      if (!name) {
        isValid = false;
        error = tf('Product name missing', 'Izina ry’igicuruzwa rirabura');
      } else if (!isStockOnly && (isNaN(buying_price) || buying_price < 0)) {
        isValid = false;
        error = tf('Invalid buying price', 'Igiciro kiranguza ntikemewe');
      }

      return {
        name,
        sku,
        category,
        unit,
        ...(units_per_pack > 1 ? { units_per_pack, pack_unit, pack_buying_price, pack_selling_price } : {}),
        buying_price,
        selling_price,
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

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      import('xlsx').then(XLSX => {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const csvContent = XLSX.utils.sheet_to_csv(worksheet);
            setRawText(csvContent);
            parseCsvData(csvContent);
          } catch (err: any) {
            setErrorMessage(tf('Could not parse Excel spreadsheet: ', 'Ntibyashobotse gusoma dosiye ya Excel: ') + err.message);
          }
        };
        reader.readAsArrayBuffer(file);
      }).catch(err => {
        setErrorMessage(tf('Failed to load Excel reader: ', 'Ntibyashobotse gufungura igisoma Excel: ') + err.message);
      });
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          setRawText(content);
          parseCsvData(content);
        }
      };
      reader.readAsText(file);
    }
  };

  const loadSampleTemplate = () => {
    const sample = isStockOnly ? SAMPLE_CSV_STOCK_ONLY : SAMPLE_CSV_WITH_PRICES;
    setRawText(sample);
    parseCsvData(sample);
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      setErrorMessage('');
      await api.downloadBulkTemplate(isStockOnly ? 'stock_only' : 'standard');
    } catch (err: any) {
      setErrorMessage(err.message || tf('Could not download Excel template.', 'Ntibyashobotse gukuramo urupapuro rwa Excel.'));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleCommitImport = async () => {
    const validRows = stagedProducts.filter(p => p.isValid);
    if (validRows.length === 0) {
      setErrorMessage(tf('No valid product rows ready for import.', 'Nta gicuruzwa cyujuje ibisabwa cyabonetse cyo kwinjizwa.'));
      return;
    }

    try {
      setImporting(true);
      setErrorMessage('');
      const res = await api.bulkImportProducts(validRows, selectedStockId);
      setResultMsg(res.message || tf(`Successfully imported ${validRows.length} products!`, `Ibicuruzwa ${validRows.length} byinjijwe neza!`));
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch (err: any) {
      setErrorMessage(err.message || tf('Failed to import bulk stock data.', 'Kwinjiza ibicuruzwa byinshi byanze.'));
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
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base lg:text-lg font-bold text-white">{tf('Bulk Stock & Inventory Importer', 'Kwinjiza Ibicuruzwa Byinshi mu Bubiko')}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {tf('Excel / CSV Fast-Ingest', 'Kwinjiza vuba na Excel / CSV')}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isStockOnly
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}>
                  {isStockOnly ? tf('Stock-Only Template (No Prices)', 'Sitoki Gusa (Nta Biciro)') : tf('Standard Template (With Prices)', 'Biriho Ibiciro')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isStockOnly
                  ? tf('Tailored for your Stock-Only store: upload item names, units, and quantities without pricing columns.', 'Byateguwe ku buryo bwa Sitoki Gusa: shyiramo amazina, ingero n’imibare nta biciro.')
                  : tf('Quickly populate initial store catalog or receive bulk shipments with buying & selling prices.', 'Uzuza vuba urutonde rw’ibicuruzwa cyangwa wakire ibicuruzwa byinshi biriho ibiciro.')}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 shrink-0">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">{tf('Target Warehouse / Depot *', 'Ububiko / Depo bigiyemo *')}</label>
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

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-bold text-emerald-300 transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {downloadingTemplate
                  ? tf('Preparing Excel...', 'Gutegura Excel...')
                  : isStockOnly
                  ? tf('Download Stock-Only Excel (.xlsx)', 'Kuramo Excel (Nta Biciro)')
                  : tf('Download Excel Template (.xlsx)', 'Kuramo Urupapuro rwa Excel')}
              </span>
            </button>
          </div>

          <div className="flex items-end">
            <label className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer transition">
              <UploadCloud className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{tf('Upload Filled Excel / CSV', 'Shyiramo Dosiye CSV / Excel')}</span>
              <input
                type="file"
                accept=".csv,.txt,.tsv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={loadSampleTemplate}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-bold text-amber-300 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{tf('Load 10 Hardware Demo Items', 'Shyiramo Ingero 10')}</span>
            </button>
          </div>
        </div>

        {/* Input Text Area & Live Preview Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
          {/* Raw Text Box */}
          <div className="lg:col-span-4 flex flex-col space-y-1.5 min-h-[160px]">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">{tf('Paste CSV or Excel Table', 'Shyiramo Imbonerahamwe ya CSV cyangwa Excel')}</span>
              <button
                type="button"
                onClick={() => { setRawText(''); setStagedProducts([]); }}
                className="text-[11px] text-slate-400 hover:text-rose-400"
              >
                {tf('Clear', 'Siba')}
              </button>
            </div>
            <textarea
              value={rawText}
              onChange={handleTextChange}
              placeholder={
                isStockOnly
                  ? tf('Paste rows: Name, SKU, Category, Unit, Quantity, Low Alert, Notes', 'Shyiramo imirongo: Izina, SKU, Icyiciro, Ingero, Ingano, Umuburo, Ibisobanuro')
                  : tf('Paste rows: Name, SKU, Category, Unit, Buying Price, Selling Price, Qty, Low Alert, Notes', 'Shyiramo imirongo: Izina, SKU, Icyiciro, Ingero, Ikiranguzo, Igiciro, Ingano, Umuburo')
              }
              className="w-full flex-1 p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
            />
            <p className="text-[10px] text-slate-400">
              {isStockOnly
                ? tf('Stock-Only columns: Name, SKU, Category, Unit, Quantity, LowStockAlert, Description', 'Inkingi za Sitoki Gusa: Izina, SKU, Icyiciro, Ingero, Ingano, Umuburo, Ibisobanuro')
                : tf('Columns: Name, SKU, Category, Unit, BuyingPrice, SellingPrice, Quantity, LowStockAlert, Description', 'Inkingi: Izina, SKU, Icyiciro, Ingero, Ikiranguzo, Igiciro, Ingano, Umuburo, Ibisobanuro')}
            </p>
          </div>

          {/* Staged Data Table */}
          <div className="lg:col-span-8 flex flex-col rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden min-h-[220px]">
            <div className="p-3 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">{tf(`Staging Table (${stagedProducts.length} items parsed)`, `Ibigiye Kwinjizwa (ibicuruzwa ${stagedProducts.length})`)}</span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-400 font-semibold">{tf(`${validCount} Valid`, `${validCount} Byemewe`)}</span>
                {stagedProducts.length - validCount > 0 && (
                  <span className="text-rose-400 font-semibold">{tf(`${stagedProducts.length - validCount} Errors`, `Amakosa ${stagedProducts.length - validCount}`)}</span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto max-h-[300px]">
              {stagedProducts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                  <UploadCloud className="w-8 h-8 mx-auto text-slate-600 animate-bounce" />
                  <p>{tf('Download your Excel template, fill in products, then upload it here—or click "Load 10 Hardware Demo Items".', 'Kuramo urupapuro rwa Excel rwagenewe iduka ryawe, urwuzuze hanyuma urushyire hano.')}</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="sticky top-0 bg-[#161B24] text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">{tf('Item Name', 'Izina')}</th>
                      <th className="p-2.5">{tf('SKU', 'Kode / SKU')}</th>
                      <th className="p-2.5">{tf('Category', 'Icyiciro')}</th>
                      {!isStockOnly && <th className="p-2.5 text-right">{tf('Cost (RWF)', 'Ikiranguzo (RWF)')}</th>}
                      {!isStockOnly && <th className="p-2.5 text-right">{tf('Selling (RWF)', 'Igiciro (RWF)')}</th>}
                      <th className="p-2.5 text-right">{tf('Init Qty', 'Ingano')}</th>
                      <th className="p-2.5 text-right">{tf('Low Alert', 'Umuburo')}</th>
                      <th className="p-2.5 text-center">{tf('Status', 'Imimerere')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stagedProducts.map((p, idx) => (
                      <tr key={idx} className={p.isValid ? 'hover:bg-slate-800/40' : 'bg-rose-500/10'}>
                        <td className="p-2.5 font-medium text-white max-w-[180px] truncate">{p.name}</td>
                        <td className="p-2.5 font-mono text-[11px] text-amber-300/90">{p.sku}</td>
                        <td className="p-2.5 text-slate-400">{p.category}</td>
                        {!isStockOnly && <td className="p-2.5 text-right font-mono">{p.buying_price.toLocaleString()}</td>}
                        {!isStockOnly && <td className="p-2.5 text-right font-mono font-bold text-slate-200">{p.selling_price.toLocaleString()}</td>}
                        <td className="p-2.5 text-right font-mono font-bold text-amber-400">{p.quantity} {p.unit}</td>
                        <td className="p-2.5 text-right font-mono text-slate-400">{p.low_stock_threshold}</td>
                        <td className="p-2.5 text-center">
                          {p.isValid ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                              {tf('Ready', 'Biteguye')}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold" title={p.error}>
                              {tf('Error', 'Ikosa')}
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
                    <span className="text-slate-400 text-[11px]">{tf('Total Units: ', 'Ingano Yose: ')}</span>
                    <span className="font-bold text-white font-mono">{totalUnits.toLocaleString()}</span>
                  </div>
                  {!isStockOnly && (
                    <div>
                      <span className="text-slate-400 text-[11px]">{tf('Stock Value: ', 'Agaciro k’Ububiko: ')}</span>
                      <span className="font-bold text-amber-400 font-mono">RWF {totalValue.toLocaleString()}</span>
                    </div>
                  )}
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
            {tf('Cancel', 'Hagarika')}
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
            <span>{importing ? tf('Ingesting Bulk Stock...', 'Kwinjiza Ibicuruzwa...') : tf(`Commit & Import ${validCount} Products`, `Emeza Winjize Ibicuruzwa ${validCount}`)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
