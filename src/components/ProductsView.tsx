import React, { useState, useEffect, useMemo } from 'react';
import { Product, User, StockLocation, Shop } from '../types';
import { api } from '../services/api';
import { BulkImportModal } from './BulkImportModal';
import { AiInvoiceScannerModal } from './AiInvoiceScannerModal';
import { exportStockPdf } from '../services/pdfExport';
import { hasPermission } from '../utils/permissions';
import { matchesSearch } from '../utils/searchMatch';
import {
  formatPackStock,
  getPackSize,
  getPackUnitLabel,
  getPackSellingPrice,
  getRetailUnitLabel,
  isPackProduct
} from '../utils/unitConversion';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  AlertTriangle, 
  Edit3, 
  SlidersHorizontal, 
  Boxes, 
  CheckCircle2, 
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  UploadCloud,
  FileSpreadsheet,
  Sparkles,
  Printer,
  FileText,
  Download,
  ChevronDown,
  Layers
} from 'lucide-react';

type StockSortOption =
  | 'qty_desc'
  | 'qty_asc'
  | 'sold_desc'
  | 'sold_asc'
  | 'date_desc'
  | 'date_asc'
  | 'name_asc'
  | 'name_desc'
  | 'price_desc'
  | 'price_asc';

const SORT_LABELS: Record<StockSortOption, string> = {
  qty_desc: 'In Stock: Most to Least',
  qty_asc: 'In Stock: Least / Zero First',
  sold_desc: 'Best Selling First',
  sold_asc: 'Slowest Selling First',
  date_desc: 'Date Entered / Restocked (Newest)',
  date_asc: 'Date Entered (Oldest First)',
  name_asc: 'Product Name (A to Z)',
  name_desc: 'Product Name (Z to A)',
  price_desc: 'Selling Price (High to Low)',
  price_asc: 'Selling Price (Low to High)'
};

interface ProductsViewProps {
  user: User | null;
  shop?: Shop | null;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ user, shop }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<StockLocation[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStockId, setSelectedStockId] = useState<string>('all');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'low' | 'out'>('all');
  const [sortBy, setSortBy] = useState<StockSortOption>('qty_desc');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isAiScanOpen, setIsAiScanOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);

  // Form states
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    sku: '',
    barcode: '',
    category: 'Building Materials',
    unit: 'pcs',
    units_per_pack: 1,
    pack_unit: 'Carton',
    buying_price: 0,
    selling_price: 0,
    pack_buying_price: 0,
    pack_selling_price: 0,
    quantity: 0,
    low_stock_threshold: 5,
    description: ''
  });
  const [sellInBothModes, setSellInBothModes] = useState(false);
  const [stockPacksInput, setStockPacksInput] = useState<number>(0);
  const [stockLooseInput, setStockLooseInput] = useState<number>(0);

  const [adjustQty, setAdjustQty] = useState<string>('10');
  const [adjustUnitMode, setAdjustUnitMode] = useState<'retail' | 'pack'>('retail');
  const [adjustType, setAdjustType] = useState<string>('purchase_restock');
  const [adjustNotes, setAdjustNotes] = useState<string>('');
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManageStock = hasPermission(user, 'can_manage_stock');
  const canBulkImport = hasPermission(user, 'can_import_export_stock');
  const canViewBuyingPrices = hasPermission(user, 'can_view_buying_prices');

  useEffect(() => {
    if (user) {
      fetchProducts();
      fetchStocks();
    }
  }, [user]);

  const fetchStocks = async () => {
    try {
      const res = await api.getStocks();
      setStocks(res.stocks || []);
    } catch (e) {
      console.error('Error fetching stock locations:', e);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await api.getProducts();
      setProducts(res.products || []);
      setCategories(['All', ...(res.categories || [])]);
    } catch (err: any) {
      if (err?.message?.includes('log in') || err?.message?.includes('Authentication Required')) {
        return;
      }
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  const sortProductList = (list: Product[], sortKey: StockSortOption): Product[] => {
    const getSellPrice = (p: Product) =>
      p.selling_price && Number(p.selling_price) > 0 ? Number(p.selling_price) : Number(p.buying_price || 0);
    const getTimestamp = (val?: string) => {
      if (!val) return 0;
      const normalized = val.includes('T') || val.includes('Z') ? val : val.replace(' ', 'T') + 'Z';
      const ms = new Date(normalized).getTime();
      return Number.isNaN(ms) ? 0 : ms;
    };

    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'qty_desc':
          return Number(b.quantity || 0) - Number(a.quantity || 0) || a.name.localeCompare(b.name);
        case 'qty_asc':
          return Number(a.quantity || 0) - Number(b.quantity || 0) || a.name.localeCompare(b.name);
        case 'sold_desc':
          return Number(b.total_units_sold || 0) - Number(a.total_units_sold || 0) || a.name.localeCompare(b.name);
        case 'sold_asc':
          return Number(a.total_units_sold || 0) - Number(b.total_units_sold || 0) || a.name.localeCompare(b.name);
        case 'date_desc': {
          const diff =
            getTimestamp(b.last_stocked_at || b.created_at) -
            getTimestamp(a.last_stocked_at || a.created_at);
          return diff !== 0 ? diff : b.id - a.id;
        }
        case 'date_asc': {
          const diff =
            getTimestamp(a.created_at || a.last_stocked_at) -
            getTimestamp(b.created_at || b.last_stocked_at);
          return diff !== 0 ? diff : a.id - b.id;
        }
        case 'price_desc':
          return getSellPrice(b) - getSellPrice(a) || a.name.localeCompare(b.name);
        case 'price_asc':
          return getSellPrice(a) - getSellPrice(b) || a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'name_asc':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  };

  const filteredProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
      const matchLoc = selectedStockId === 'all' || Number(p.stock_id || 1) === Number(selectedStockId);
      const matchQuery = matchesSearch(searchQuery, p.name, p.sku, p.barcode, p.category, p.stock_name);
      
      let matchStock = true;
      if (filterStockStatus === 'low') {
        matchStock = p.quantity > 0 && p.quantity <= p.low_stock_threshold;
      } else if (filterStockStatus === 'out') {
        matchStock = p.quantity <= 0;
      }

      return matchCat && matchLoc && matchQuery && matchStock;
    });

    return sortProductList(filtered, sortBy);
  }, [products, searchQuery, selectedCategory, selectedStockId, filterStockStatus, sortBy]);

  const toggleColumnSort = (descKey: StockSortOption, ascKey: StockSortOption) => {
    setSortBy((prev) => (prev === descKey ? ascKey : descKey));
  };

  const getFilterSummaryText = () => {
    const parts: string[] = [];
    if (selectedCategory !== 'All') parts.push(`Category: ${selectedCategory}`);
    if (selectedStockId !== 'all') {
      const st = stocks.find((s) => String(s.id) === selectedStockId);
      parts.push(`Location: ${st?.name || selectedStockId}`);
    }
    if (filterStockStatus === 'low') parts.push('Low Stock Only');
    if (filterStockStatus === 'out') parts.push('Out of Stock Only');
    if (searchQuery.trim()) parts.push(`Search: "${searchQuery.trim()}"`);
    return parts.length > 0 ? parts.join(' | ') : 'All Stock Items';
  };

  const formatShortDate = (val?: string) => {
    if (!val) return '-';
    try {
      const normalized = val.includes('T') || val.includes('Z') ? val : val.replace(' ', 'T') + 'Z';
      const d = new Date(normalized);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '-';
    }
  };

  const escapeHtml = (unsafe: string) =>
    String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const handleExportPdf = (mode: 'filtered' | 'all') => {
    setIsExportMenuOpen(false);
    const list = mode === 'all' ? sortProductList(products, sortBy) : filteredProducts;
    exportStockPdf({
      products: list,
      sortLabel: SORT_LABELS[sortBy],
      filterSummary: mode === 'all' ? 'All Shop Products' : getFilterSummaryText(),
      showBuyingPrices: canViewBuyingPrices,
      shop: shop || null,
      user,
    });
  };

  const handlePrintDirect = () => {
    setIsExportMenuOpen(false);
    const list = filteredProducts;
    const totalUnits = list.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
    const totalSold = list.reduce((sum, p) => sum + Number(p.total_units_sold || 0), 0);

    let iframe = document.getElementById('vectos-stock-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'vectos-stock-print-frame';
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

    const rowsHtml = list.map((p, idx) => {
      const sellPrice = p.selling_price && Number(p.selling_price) > 0 ? Number(p.selling_price) : Number(p.buying_price || 0);
      const qty = Number(p.quantity || 0);
      const breakdown = formatPackStock(qty, p.units_per_pack, p.unit, p.pack_unit);
      const status = qty <= 0 ? 'Out of Stock' : qty <= Number(p.low_stock_threshold || 0) ? 'Low Stock' : 'Healthy';
      const unitCell = breakdown.isMultiUnit
        ? `${escapeHtml(breakdown.retailUnit)}<br><span class="muted">1 ${escapeHtml(breakdown.packUnit)} = ${breakdown.packSize}</span>`
        : escapeHtml(p.unit || 'pcs');
      const priceCell = breakdown.isMultiUnit
        ? `${formatRwf(sellPrice)} / ${escapeHtml(breakdown.retailUnit)}<br><span class="muted">${formatRwf(getPackSellingPrice(p))} / ${escapeHtml(breakdown.packUnit)}</span>`
        : formatRwf(sellPrice);
      const stockCell = breakdown.isMultiUnit
        ? `${escapeHtml(breakdown.primary)}<br><span class="muted">(${breakdown.totalText})</span>`
        : qty.toLocaleString();
      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="mono">${escapeHtml(p.sku || '-')}</td>
          <td><strong>${escapeHtml(p.name)}</strong><br><span class="muted">${escapeHtml(p.category)}</span></td>
          <td>${escapeHtml(p.stock_name || 'Main')}</td>
          <td class="center">${unitCell}</td>
          ${canViewBuyingPrices ? `<td class="right mono">${formatRwf(p.buying_price)}</td>` : ''}
          <td class="right mono">${priceCell}</td>
          <td class="right mono bold">${stockCell}</td>
          <td class="right mono">${Number(p.total_units_sold || 0).toLocaleString()}</td>
          <td class="center">${escapeHtml(status)}</td>
          <td class="center">${escapeHtml(formatShortDate(p.last_stocked_at || p.created_at))}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Stock Inventory Sheet</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
          .title { font-size: 18px; font-weight: 800; margin: 0 0 2px 0; }
          .sub { font-size: 11px; color: #475569; margin: 0; }
          .meta { text-align: right; font-size: 10px; color: #334155; }
          .summary { display: flex; gap: 12px; margin-bottom: 10px; font-size: 11px; }
          .pill { background: #f8fafc; border: 1px solid #cbd5e1; padding: 5px 10px; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: top; }
          th { background: #0f172a; color: #ffffff; font-size: 10px; text-transform: uppercase; }
          tr:nth-child(even) td { background: #f8fafc; }
          .right { text-align: right; }
          .center { text-align: center; }
          .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
          .bold { font-weight: 700; }
          .muted { color: #64748b; font-size: 9.5px; }
          .sigs { display: flex; justify-content: space-between; margin-top: 24px; padding-top: 10px; }
          .sig-box { width: 220px; border-top: 1px solid #475569; padding-top: 4px; font-size: 10px; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${escapeHtml(shop?.name || 'Hardware Store')} — Stock Sheet</h1>
            <p class="sub">${[
              escapeHtml(shop?.location || 'Kigali, Rwanda'),
              ...(shop?.tin_number?.trim() ? [`TIN: ${escapeHtml(shop.tin_number.trim())}`] : []),
              ...(shop?.phone?.trim() ? [`Phone: ${escapeHtml(shop.phone.trim())}`] : [])
            ].join(' | ')}</p>
          </div>
          <div class="meta">
            <div><strong>Sorted by:</strong> ${escapeHtml(SORT_LABELS[sortBy])}</div>
            <div><strong>Filter:</strong> ${escapeHtml(getFilterSummaryText())}</div>
            <div><strong>Printed:</strong> ${escapeHtml(new Date().toLocaleString())} by ${escapeHtml(user?.name || 'Staff')}</div>
          </div>
        </div>
        <div class="summary">
          <div class="pill"><strong>Items Listed:</strong> ${list.length.toLocaleString()}</div>
          <div class="pill"><strong>Total Units in Stock:</strong> ${totalUnits.toLocaleString()}</div>
          <div class="pill"><strong>Total Units Sold:</strong> ${totalSold.toLocaleString()}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="center">#</th>
              <th>Code</th>
              <th>Product & Category</th>
              <th>Location</th>
              <th class="center">Unit</th>
              ${canViewBuyingPrices ? '<th class="right">Buying Cost</th>' : ''}
              <th class="right">Selling Price</th>
              <th class="right">In Stock</th>
              <th class="right">Sold</th>
              <th class="center">Status</th>
              <th class="center">Date Entered</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="11" class="center">No products match the selected filter.</td></tr>'}
          </tbody>
        </table>
        <div class="sigs">
          <div class="sig-box">Storekeeper Signature & Date</div>
          <div class="sig-box">Store Manager Approval & Date</div>
        </div>
      </body>
      </html>
    `;

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 200);
    }
  };

  const handleExportCsv = () => {
    setIsExportMenuOpen(false);
    const list = filteredProducts;
    const headers = canViewBuyingPrices
      ? ['Item Code', 'Product Name', 'Category', 'Location', 'Retail Unit', 'Pack Unit', 'Units Per Pack', 'Buying Cost (RWF)', 'Selling Price (RWF)', 'Pack Selling Price (RWF)', 'In Stock (Base)', 'Stock Breakdown', 'Units Sold', 'Status', 'Date Entered']
      : ['Item Code', 'Product Name', 'Category', 'Location', 'Retail Unit', 'Pack Unit', 'Units Per Pack', 'Selling Price (RWF)', 'Pack Selling Price (RWF)', 'In Stock (Base)', 'Stock Breakdown', 'Units Sold', 'Status', 'Date Entered'];

    const csvSafe = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = list.map((p) => {
      const sellPrice = p.selling_price && Number(p.selling_price) > 0 ? Number(p.selling_price) : Number(p.buying_price || 0);
      const packSellPrice = isPackProduct(p) ? getPackSellingPrice(p) : '';
      const qty = Number(p.quantity || 0);
      const breakdown = formatPackStock(qty, p.units_per_pack, p.unit, p.pack_unit);
      const status = qty <= 0 ? 'Out of Stock' : qty <= Number(p.low_stock_threshold || 0) ? 'Low Stock' : 'Healthy';
      const dateStr = formatShortDate(p.last_stocked_at || p.created_at);
      const cols = canViewBuyingPrices
        ? [p.sku, p.name, p.category, p.stock_name || 'Main', p.unit, breakdown.isMultiUnit ? breakdown.packUnit : '', breakdown.packSize, Number(p.buying_price || 0), sellPrice, packSellPrice, qty, breakdown.primary, Number(p.total_units_sold || 0), status, dateStr]
        : [p.sku, p.name, p.category, p.stock_name || 'Main', p.unit, breakdown.isMultiUnit ? breakdown.packUnit : '', breakdown.packSize, sellPrice, packSellPrice, qty, breakdown.primary, Number(p.total_units_sold || 0), status, dateStr];
      return cols.map(csvSafe).join(',');
    });

    const csvContent = [headers.map(csvSafe).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `VectOS_Stock_List_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenAdd = () => {
    setSellInBothModes(false);
    setStockPacksInput(0);
    setStockLooseInput(10);
    setFormData({
      name: '',
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      barcode: '',
      category: categories[1] || 'Building Materials',
      unit: 'pcs',
      units_per_pack: 1,
      pack_unit: 'Carton',
      buying_price: 1000,
      selling_price: 1000,
      pack_buying_price: 0,
      pack_selling_price: 0,
      quantity: 10,
      low_stock_threshold: 5,
      description: ''
    });
    setModalError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setCurrentProduct(p);
    const multi = isPackProduct(p);
    const packSize = getPackSize(p);
    const qty = Math.max(0, Math.round(Number(p.quantity || 0)));
    setSellInBothModes(multi);
    setStockPacksInput(multi ? Math.floor(qty / packSize) : 0);
    setStockLooseInput(multi ? qty % packSize : qty);

    const sellVal = p.selling_price && Number(p.selling_price) > 0
      ? Number(p.selling_price)
      : Number(p.buying_price || 0);
    const buyVal = Number(p.buying_price || 0);
    const packSellVal = Number(p.pack_selling_price || 0) > 0
      ? Number(p.pack_selling_price)
      : (multi ? sellVal * packSize : 0);
    const packBuyVal = Number(p.pack_buying_price || 0) > 0
      ? Number(p.pack_buying_price)
      : (multi ? buyVal * packSize : 0);

    setFormData({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || '',
      category: p.category,
      unit: p.unit || 'pcs',
      units_per_pack: packSize,
      pack_unit: p.pack_unit || 'Carton',
      ...(canViewBuyingPrices ? { buying_price: buyVal, pack_buying_price: packBuyVal } : {}),
      selling_price: sellVal,
      pack_selling_price: packSellVal,
      quantity: qty,
      low_stock_threshold: p.low_stock_threshold,
      description: p.description || ''
    });
    setModalError('');
    setIsEditModalOpen(true);
  };

  const handleOpenAdjust = (p: Product) => {
    setCurrentProduct(p);
    setAdjustQty(isPackProduct(p) ? '1' : '10');
    setAdjustUnitMode(isPackProduct(p) ? 'pack' : 'retail');
    setAdjustType('purchase_restock');
    setAdjustNotes('');
    setModalError('');
    setIsAdjustModalOpen(true);
  };

  const buildProductSubmitPayload = (): Partial<Product> => {
    if (!sellInBothModes) {
      return {
        ...formData,
        units_per_pack: 1,
        pack_unit: null,
        pack_buying_price: 0,
        pack_selling_price: 0,
        quantity: Math.max(0, Math.round(Number(formData.quantity || 0))),
        low_stock_threshold: Math.max(0, Math.round(Number(formData.low_stock_threshold || 0)))
      };
    }

    const packSize = Math.max(2, Math.round(Number(formData.units_per_pack || 100)));
    const totalBaseQty =
      Math.max(0, Math.round(Number(stockPacksInput || 0))) * packSize +
      Math.max(0, Math.round(Number(stockLooseInput || 0)));

    const packBuy = canViewBuyingPrices ? Math.max(0, Number(formData.pack_buying_price || 0)) : undefined;
    const retailBuy = canViewBuyingPrices
      ? (packBuy && packBuy > 0 ? Number((packBuy / packSize).toFixed(2)) : Math.max(0, Number(formData.buying_price || 0)))
      : undefined;

    return {
      ...formData,
      unit: (formData.unit || 'pcs').trim() || 'pcs',
      units_per_pack: packSize,
      pack_unit: (formData.pack_unit || 'Carton').trim() || 'Carton',
      ...(canViewBuyingPrices ? { buying_price: retailBuy, pack_buying_price: packBuy } : {}),
      selling_price: Math.max(0, Number(formData.selling_price || 0)),
      pack_selling_price: Math.max(0, Number(formData.pack_selling_price || 0)),
      quantity: totalBaseQty,
      low_stock_threshold: Math.max(0, Math.round(Number(formData.low_stock_threshold || 0)))
    };
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.sku) {
      setModalError('Product Name and Item Code are required.');
      return;
    }
    if (sellInBothModes && (!formData.units_per_pack || Number(formData.units_per_pack) < 2)) {
      setModalError('Items per Pack must be at least 2 when selling in both Wholesale Packs & Retail.');
      return;
    }
    try {
      setIsSubmitting(true);
      await api.createProduct(buildProductSubmitPayload());
      setIsAddModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProduct) return;
    if (sellInBothModes && (!formData.units_per_pack || Number(formData.units_per_pack) < 2)) {
      setModalError('Items per Pack must be at least 2 when selling in both Wholesale Packs & Retail.');
      return;
    }
    try {
      setIsSubmitting(true);
      await api.updateProduct(currentProduct.id, buildProductSubmitPayload());
      setIsEditModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setModalError(err.message || 'Failed to update product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProduct) return;
    try {
      setIsSubmitting(true);
      const rawQty = Math.round(Number(adjustQty) || 0);
      const packSize = isPackProduct(currentProduct) && adjustUnitMode === 'pack'
        ? getPackSize(currentProduct)
        : 1;
      const baseQtyDelta = rawQty * packSize;
      const unitDesc = adjustUnitMode === 'pack' && isPackProduct(currentProduct)
        ? `${rawQty > 0 ? '+' : ''}${rawQty} ${getPackUnitLabel(currentProduct)} (${baseQtyDelta > 0 ? '+' : ''}${baseQtyDelta} ${getRetailUnitLabel(currentProduct)})`
        : `${rawQty > 0 ? '+' : ''}${rawQty} ${getRetailUnitLabel(currentProduct)}`;
      const fullNotes = adjustNotes ? `${adjustNotes} [${unitDesc}]` : unitDesc;

      await api.adjustStock(currentProduct.id, baseQtyDelta, adjustType, fullNotes);
      setIsAdjustModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setModalError(err.message || 'Failed to adjust stock.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRwf = (val?: number | null) => `RWF ${Math.round(Number(val || 0)).toLocaleString()}`;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Products & Stock
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {products.length} Items Listed
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Add items you sell, set selling prices, update stock counts, and track low-stock warnings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Print & Export Stock Menu */}
          <div className="relative">
            <button
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-900/20 border border-rose-500/30 transition transform active:scale-95"
              title="Print stock sheet or export as PDF / CSV"
            >
              <Printer className="w-4 h-4 text-white" />
              <span>Print / Export Stock</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>

            {isExportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsExportMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#121620] border border-slate-700 shadow-2xl p-2 z-50 text-xs">
                  <button
                    onClick={handlePrintDirect}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200 transition font-medium flex flex-col gap-0.5"
                  >
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Printer className="w-3.5 h-3.5 text-emerald-400" />
                      Print Stock Sheet Now
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Opens printer layout for current view ({filteredProducts.length} items)
                    </span>
                  </button>
                  <div className="my-1 border-t border-slate-800" />
                  <button
                    onClick={() => handleExportPdf('filtered')}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200 transition font-medium flex flex-col gap-0.5"
                  >
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      Save Current Stock as PDF
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Keeps active sort & filter ({SORT_LABELS[sortBy]})
                    </span>
                  </button>
                  <button
                    onClick={() => handleExportPdf('all')}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200 transition font-medium flex flex-col gap-0.5"
                  >
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                      Save Complete Shop Stock PDF
                    </span>
                    <span className="text-[11px] text-slate-400">
                      All {products.length} items ordered by selected sort
                    </span>
                  </button>
                  <div className="my-1 border-t border-slate-800" />
                  <button
                    onClick={handleExportCsv}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200 transition font-medium flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-bold text-white">Download Stock List (CSV)</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {canManageStock && (
            <button
              onClick={() => setIsAiScanOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs shadow-md transition transform active:scale-95"
              title="Scan paper supplier invoices or receipts to add stock automatically"
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Scan Supplier Invoice</span>
              <span className="sm:hidden">Scan Invoice</span>
            </button>
          )}

          {canBulkImport && (
            <button
              onClick={() => setIsBulkImportOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold text-xs shadow-md transition transform active:scale-95"
              title="Upload products from an Excel or CSV file"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Upload Excel / CSV</span>
              <span className="sm:hidden">Upload List</span>
            </button>
          )}

          {canManageStock && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter, Sort and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search */}
          <div className="relative md:col-span-5">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by product name, item code, category, or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white transition"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="relative md:col-span-4">
            <ArrowUpDown className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              aria-label="Sort stock items"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as StockSortOption)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="qty_desc">Sort: Most in Stock First (High → Low)</option>
              <option value="qty_asc">Sort: Least / Zero Stock First (Low → High)</option>
              <option value="sold_desc">Sort: Best Selling First (Most Sold)</option>
              <option value="sold_asc">Sort: Slowest Moving First (Least Sold)</option>
              <option value="date_desc">Sort: Date Entered / Restocked (Newest)</option>
              <option value="date_asc">Sort: Date Entered (Oldest First)</option>
              <option value="name_asc">Sort: Product Name (A → Z)</option>
              <option value="name_desc">Sort: Product Name (Z → A)</option>
              <option value="price_desc">Sort: Selling Price (High → Low)</option>
              <option value="price_asc">Sort: Selling Price (Low → High)</option>
            </select>
          </div>

          {/* Stock Health Filter */}
          <div className="flex gap-2 md:col-span-3">
            {[
              { id: 'all', label: 'All Stock' },
              { id: 'low', label: 'Low Stock' },
              { id: 'out', label: 'Out of Stock' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setFilterStockStatus(st.id as any)}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition ${
                  filterStockStatus === st.id
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Categories & Optional Warehouse Filter */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {stocks.length > 1 && (
            <select
              aria-label="Filter by store location"
              value={selectedStockId}
              onChange={(e) => setSelectedStockId(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Store Locations</option>
              {stocks.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-2xl bg-[#121620] border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Item Code</th>
                <th className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleColumnSort('name_asc', 'name_desc')}
                    className="inline-flex items-center gap-1 hover:text-amber-300 transition uppercase"
                  >
                    <span>Product Name & Category</span>
                    {sortBy === 'name_asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : sortBy === 'name_desc' ? <ArrowDown className="w-3 h-3 text-amber-400" /> : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold">Unit</th>
                {canViewBuyingPrices && <th className="py-3 px-4 font-semibold">Buying Cost</th>}
                <th className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleColumnSort('price_desc', 'price_asc')}
                    className="inline-flex items-center gap-1 hover:text-amber-300 transition uppercase"
                  >
                    <span>Selling Price</span>
                    {sortBy === 'price_desc' ? <ArrowDown className="w-3 h-3 text-amber-400" /> : sortBy === 'price_asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleColumnSort('qty_desc', 'qty_asc')}
                    className="inline-flex items-center gap-1 hover:text-amber-300 transition uppercase"
                  >
                    <span>In Stock</span>
                    {sortBy === 'qty_desc' ? <ArrowDown className="w-3 h-3 text-amber-400" /> : sortBy === 'qty_asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleColumnSort('sold_desc', 'sold_asc')}
                    className="inline-flex items-center gap-1 hover:text-amber-300 transition uppercase"
                  >
                    <span>Sold</span>
                    {sortBy === 'sold_desc' ? <ArrowDown className="w-3 h-3 text-amber-400" /> : sortBy === 'sold_asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleColumnSort('date_desc', 'date_asc')}
                    className="inline-flex items-center gap-1 hover:text-amber-300 transition uppercase"
                  >
                    <span>Date Entered</span>
                    {sortBy === 'date_desc' ? <ArrowDown className="w-3 h-3 text-amber-400" /> : sortBy === 'date_asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold">Status</th>
                {canManageStock && <th className="py-3 px-4 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredProducts.map((p) => {
                const isOutOfStock = p.quantity <= 0;
                const isLowStock = p.quantity > 0 && p.quantity <= p.low_stock_threshold;
                const sellingPrice = p.selling_price && Number(p.selling_price) > 0
                  ? Number(p.selling_price)
                  : Number(p.buying_price || 0);
                const breakdown = formatPackStock(p.quantity, p.units_per_pack, p.unit, p.pack_unit);
                const packSellPrice = breakdown.isMultiUnit ? getPackSellingPrice(p) : 0;

                return (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-bold text-amber-400">{p.sku}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-slate-100">{p.name}</p>
                        {breakdown.isMultiUnit && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[9px] font-bold">
                            Wholesale + Retail
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {p.category}{p.stock_name ? ` • ${p.stock_name}` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-mono">
                      {breakdown.isMultiUnit ? (
                        <div>
                          <p className="text-slate-200 font-semibold">{breakdown.retailUnit}</p>
                          <p className="text-[10px] text-indigo-300">
                            1 {breakdown.packUnit} = {breakdown.packSize} {breakdown.retailUnit}
                          </p>
                        </div>
                      ) : (
                        p.unit
                      )}
                    </td>
                    {canViewBuyingPrices && (
                      <td className="py-3 px-4 text-slate-400 font-mono">
                        {breakdown.isMultiUnit ? (
                          <div>
                            <p>{formatRwf(p.buying_price)}/{breakdown.retailUnit}</p>
                            {Number(p.pack_buying_price || 0) > 0 && (
                              <p className="text-[10px] text-slate-400">
                                {formatRwf(p.pack_buying_price)}/{breakdown.packUnit}
                              </p>
                            )}
                          </div>
                        ) : (
                          formatRwf(p.buying_price)
                        )}
                      </td>
                    )}
                    <td className="py-3 px-4 font-bold text-slate-200 font-mono">
                      {breakdown.isMultiUnit ? (
                        <div>
                          <p className="text-sky-300">{formatRwf(sellingPrice)} <span className="text-[10px] font-normal text-slate-400">/{breakdown.retailUnit}</span></p>
                          <p className="text-[11px] text-amber-400">{formatRwf(packSellPrice)} <span className="text-[10px] font-normal text-slate-400">/{breakdown.packUnit}</span></p>
                        </div>
                      ) : (
                        formatRwf(sellingPrice)
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {breakdown.isMultiUnit ? (
                        <div>
                          <p className="font-black text-white">{breakdown.primary}</p>
                          <p className="text-[10px] text-slate-400">({breakdown.totalText} total)</p>
                        </div>
                      ) : (
                        <span className="font-black text-white">{p.quantity}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-sky-300">
                      {Number(p.total_units_sold || 0).toLocaleString()} {breakdown.isMultiUnit ? breakdown.retailUnit : ''}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {formatShortDate(p.last_stocked_at || p.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      {isOutOfStock ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Out of Stock
                        </span>
                      ) : isLowStock ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Low Stock ({p.quantity} &lt; {p.low_stock_threshold})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Healthy
                        </span>
                      )}
                    </td>
                    {canManageStock && (
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenAdjust(p)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 text-[11px] font-semibold border border-slate-700 transition"
                            title="Adjust inventory level"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-300">No products found matching criteria</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {isAddModalOpen ? 'Register New Product' : `Edit Product: ${currentProduct?.name}`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setIsEditModalOpen(false);
                }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={isAddModalOpen ? handleSaveAdd : handleSaveEdit} className="space-y-4">
              {/* Dual Wholesale + Retail Mode Toggle */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 cursor-pointer hover:bg-indigo-500/15 transition">
                <input
                  type="checkbox"
                  checked={sellInBothModes}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSellInBothModes(checked);
                    if (checked) {
                      const packSize = Math.max(2, Math.round(Number(formData.units_per_pack || 1) > 1 ? Number(formData.units_per_pack) : 100));
                      const currentQty = Math.max(0, Math.round(Number(formData.quantity || 0)));
                      setFormData((prev) => ({
                        ...prev,
                        unit: prev.unit === 'cartons' || prev.unit === 'boxes' ? 'pcs' : (prev.unit || 'pcs'),
                        units_per_pack: packSize,
                        pack_unit: prev.pack_unit || 'Carton',
                        pack_selling_price: prev.pack_selling_price && Number(prev.pack_selling_price) > 0
                          ? prev.pack_selling_price
                          : Number(prev.selling_price || 0) * packSize,
                        pack_buying_price: prev.pack_buying_price && Number(prev.pack_buying_price) > 0
                          ? prev.pack_buying_price
                          : Number(prev.buying_price || 0) * packSize
                      }));
                      setStockPacksInput(Math.floor(currentQty / packSize));
                      setStockLooseInput(currentQty % packSize);
                    } else {
                      const packSize = Math.max(1, Math.round(Number(formData.units_per_pack || 1)));
                      const total = stockPacksInput * packSize + stockLooseInput;
                      setFormData((prev) => ({
                        ...prev,
                        units_per_pack: 1,
                        quantity: total
                      }));
                    }
                  }}
                  className="mt-0.5 w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-indigo-200 block">
                    Sell in Both Wholesale Packs (Cartons/Boxes) &amp; Retail Pieces
                  </span>
                  <span className="text-[11px] text-slate-300 block mt-0.5">
                    Keep one unified stock pool. Selling full cartons or loose retail items will automatically break cartons when needed and keep exact inventory.
                  </span>
                </div>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Item Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Building Materials">Building Materials (Cement, Iron bars)</option>
                    <option value="Electrical Supplies">Electrical Supplies (Cables, Sockets)</option>
                    <option value="Plumbing & Pipes">Plumbing &amp; Pipes (PVC, Taps)</option>
                    <option value="Paints & Finishes">Paints &amp; Finishes (Exterior, Primer)</option>
                    <option value="Power Tools & Hardware">Power Tools &amp; Hardware</option>
                    <option value="Solar & Electronics">Solar &amp; Electronics</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">
                    {sellInBothModes ? 'Retail Unit (Base Unit)' : 'Unit of Measure'}
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="meters">Meters (m)</option>
                    <option value="liters">Liters (L)</option>
                    {!sellInBothModes && <option value="cartons">Cartons (ctn)</option>}
                    {!sellInBothModes && <option value="bags">Bags (50kg)</option>}
                    {!sellInBothModes && <option value="rolls">Rolls</option>}
                    {!sellInBothModes && <option value="boxes">Boxes</option>}
                  </select>
                </div>

                {sellInBothModes ? (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-indigo-300">Wholesale Pack Unit</label>
                      <select
                        value={formData.pack_unit || 'Carton'}
                        onChange={(e) => setFormData({ ...formData, pack_unit: e.target.value })}
                        className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-indigo-500/40 text-xs text-white focus:outline-none focus:border-indigo-400"
                      >
                        <option value="Carton">Carton</option>
                        <option value="Box">Box</option>
                        <option value="Sack">Sack</option>
                        <option value="Bag">Bag</option>
                        <option value="Roll">Roll</option>
                        <option value="Bundle">Bundle</option>
                        <option value="Packet">Packet</option>
                        <option value="Dozen">Dozen</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-indigo-300">
                        Retail {formData.unit || 'pcs'} Inside 1 {formData.pack_unit || 'Carton'} *
                      </label>
                      <input
                        type="number"
                        min="2"
                        step="1"
                        required
                        value={formData.units_per_pack || ''}
                        onChange={(e) => {
                          const newSize = Math.max(2, Math.round(Number(e.target.value) || 2));
                          setFormData((prev) => ({
                            ...prev,
                            units_per_pack: newSize,
                            buying_price: prev.pack_buying_price && Number(prev.pack_buying_price) > 0
                              ? Number((Number(prev.pack_buying_price) / newSize).toFixed(2))
                              : prev.buying_price
                          }));
                        }}
                        className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-indigo-500/40 text-xs text-white font-mono focus:outline-none focus:border-indigo-400"
                      />
                    </div>

                    {canViewBuyingPrices && (
                      <div>
                        <label className="text-xs font-semibold text-slate-300">
                          Wholesale Buying Cost / {formData.pack_unit || 'Carton'} (RWF)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formData.pack_buying_price ?? ''}
                          onChange={(e) => {
                            const pBuy = Math.max(0, Number(e.target.value) || 0);
                            const size = Math.max(2, Math.round(Number(formData.units_per_pack || 100)));
                            const rBuy = Number((pBuy / size).toFixed(2));
                            setFormData((prev) => ({
                              ...prev,
                              pack_buying_price: pBuy,
                              buying_price: rBuy
                            }));
                          }}
                          className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                        />
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          Derived cost per {formData.unit || 'pcs'}: {formatRwf(formData.buying_price)}
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-semibold text-amber-300">
                        Wholesale Selling Price / {formData.pack_unit || 'Carton'} (RWF) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={formData.pack_selling_price || ''}
                        placeholder="Price for 1 full carton/pack"
                        onChange={(e) => setFormData({ ...formData, pack_selling_price: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-amber-500/40 text-xs text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-sky-300">
                        Retail Selling Price / 1 {formData.unit || 'pcs'} (RWF) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={formData.selling_price || ''}
                        placeholder="Price for 1 loose piece"
                        onChange={(e) => setFormData({ ...formData, selling_price: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-sky-500/40 text-xs text-sky-300 font-mono font-bold focus:outline-none focus:border-sky-400"
                      />
                    </div>

                    <div className="sm:col-span-2 p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-white">
                          Stock on Hand (Whole Numbers)
                        </label>
                        <span className="text-[11px] font-mono font-bold text-emerald-400">
                          Total Stored: {(
                            Math.max(0, Math.round(stockPacksInput)) * Math.max(2, Math.round(Number(formData.units_per_pack || 100))) +
                            Math.max(0, Math.round(stockLooseInput))
                          ).toLocaleString()} {formData.unit || 'pcs'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-slate-400">Full {formData.pack_unit || 'Carton'}s</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={stockPacksInput}
                            onChange={(e) => setStockPacksInput(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-400">+ Loose {formData.unit || 'pcs'}</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={stockLooseInput}
                            onChange={(e) => setStockLooseInput(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {canViewBuyingPrices && (
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Buying Cost (RWF)</label>
                        <input
                          type="number"
                          value={formData.buying_price ?? ''}
                          onChange={(e) => {
                            const newBuy = Number(e.target.value);
                            setFormData((prev) => ({
                              ...prev,
                              buying_price: newBuy,
                              selling_price: prev.selling_price ? prev.selling_price : newBuy
                            }));
                          }}
                          className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-semibold text-slate-300">Selling Price (RWF)</label>
                      <input
                        type="number"
                        value={formData.selling_price || ''}
                        placeholder="Enter retail price"
                        onChange={(e) => setFormData({ ...formData, selling_price: Number(e.target.value) })}
                        className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300">Initial Quantity in Stock</label>
                      <input
                        type="number"
                        step="1"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                        className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-300">
                    Low Stock Warning Level {sellInBothModes ? `(${formData.unit || 'pcs'})` : ''}
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={formData.low_stock_threshold}
                    onChange={(e) => setFormData({ ...formData, low_stock_threshold: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Barcode / EAN (Optional)</label>
                  <input
                    type="text"
                    value={formData.barcode || ''}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {modalError && (
                <p className="text-xs text-rose-400 font-semibold">{modalError}</p>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setIsEditModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {isAdjustModalOpen && currentProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            {(() => {
              const adjBreakdown = formatPackStock(currentProduct.quantity, currentProduct.units_per_pack, currentProduct.unit, currentProduct.pack_unit);
              const multiplier = adjBreakdown.isMultiUnit && adjustUnitMode === 'pack' ? adjBreakdown.packSize : 1;
              const baseDelta = Math.round(Number(adjustQty) || 0) * multiplier;
              const projectedTotal = currentProduct.quantity + baseDelta;
              const projectedBreakdown = formatPackStock(projectedTotal, currentProduct.units_per_pack, currentProduct.unit, currentProduct.pack_unit);

              return (
                <>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-white">Stock Level Adjustment</h3>
                      <p className="text-xs text-slate-400">
                        {currentProduct.name} (Current: {adjBreakdown.primary}
                        {adjBreakdown.isMultiUnit ? ` / ${adjBreakdown.totalText}` : ''})
                      </p>
                    </div>
                    <button onClick={() => setIsAdjustModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                  </div>

                  <form onSubmit={handleSaveAdjust} className="space-y-3">
                    {adjBreakdown.isMultiUnit && (
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">Adjust By Unit</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setAdjustUnitMode('pack')}
                            className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                              adjustUnitMode === 'pack'
                                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                          >
                            {adjBreakdown.packUnit} (×{adjBreakdown.packSize})
                          </button>
                          <button
                            type="button"
                            onClick={() => setAdjustUnitMode('retail')}
                            className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                              adjustUnitMode === 'retail'
                                ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                          >
                            Loose {adjBreakdown.retailUnit}
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-semibold text-slate-300">
                        Adjustment Quantity in {adjustUnitMode === 'pack' && adjBreakdown.isMultiUnit ? adjBreakdown.packUnit : adjBreakdown.retailUnit} (+ to add, - to reduce)
                      </label>
                      <input
                        type="number"
                        step="1"
                        required
                        value={adjustQty}
                        onChange={(e) => setAdjustQty(e.target.value)}
                        className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        {adjBreakdown.isMultiUnit && adjustUnitMode === 'pack' && (
                          <span className="block text-slate-300">
                            Equivalent change: {baseDelta > 0 ? '+' : ''}{baseDelta} {adjBreakdown.retailUnit}
                          </span>
                        )}
                        New stock will be:{' '}
                        <strong className={projectedTotal < 0 ? 'text-rose-400' : 'text-amber-400'}>
                          {projectedTotal < 0
                            ? `Invalid (${projectedTotal})`
                            : adjBreakdown.isMultiUnit
                            ? `${projectedBreakdown.primary} (${projectedBreakdown.totalText})`
                            : `${projectedTotal} ${adjBreakdown.retailUnit}`}
                        </strong>
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300">Adjustment Reason</label>
                      <select
                        value={adjustType}
                        onChange={(e) => setAdjustType(e.target.value)}
                        className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="purchase_restock">New Supplier Delivery / Restock (+)</option>
                        <option value="customer_return">Customer Return (+)</option>
                        <option value="inventory_audit">Stock Count Fix (+/-)</option>
                        <option value="damaged_written_off">Damaged / Broken Items (-)</option>
                        <option value="theft_loss">Missing / Lost Items (-)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300">Notes (Optional)</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Received new cartons from supplier"
                        value={adjustNotes}
                        onChange={(e) => setAdjustNotes(e.target.value)}
                        className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {modalError && (
                      <p className="text-xs text-rose-400 font-semibold">{modalError}</p>
                    )}

                    <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setIsAdjustModalOpen(false)}
                        className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || projectedTotal < 0}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                      >
                        {isSubmitting ? 'Updating...' : 'Confirm Stock Adjustment'}
                      </button>
                    </div>
                  </form>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Bulk Stock Import Modal (Option 2) */}
      {isBulkImportOpen && (
        <BulkImportModal
          stocks={stocks}
          onClose={() => setIsBulkImportOpen(false)}
          onSuccess={() => {
            setIsBulkImportOpen(false);
            fetchProducts();
          }}
        />
      )}

      {/* AI Invoice & Document Scanner Modal (Option 3) */}
      {isAiScanOpen && (
        <AiInvoiceScannerModal
          isOpen={isAiScanOpen}
          stocks={stocks}
          onClose={() => setIsAiScanOpen(false)}
          onSuccess={() => {
            setIsAiScanOpen(false);
            fetchProducts();
          }}
        />
      )}
    </div>
  );
};
