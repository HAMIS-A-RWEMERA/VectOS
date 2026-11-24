export interface StockTemplateResult {
  buffer: Buffer;
  filename: string;
  mode: 'standard' | 'stock_only';
}

/**
 * Generates a tenant-tailored Excel (.xlsx) bulk stock upload template.
 * - 'standard': includes Buying Price, Selling Price, optional pack prices, and valuation guidance.
 * - 'stock_only': omits all pricing columns and focuses purely on item identity, units, and quantities.
 */
export async function buildBulkStockExcelTemplate(params: {
  pricingMode?: string | null;
  shopCode?: string | null;
}): Promise<StockTemplateResult> {
  const isStockOnly = params.pricingMode === 'stock_only';
  const mode: 'standard' | 'stock_only' = isStockOnly ? 'stock_only' : 'standard';
  const safeCode = (params.shopCode || 'shop')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '') || 'shop';

  const XLSX = await import('xlsx');

  const productRows = isStockOnly
    ? [
        {
          'Product Name': 'CIMERWA Cement 32.5R (50kg)',
          'SKU': 'SKU-CIM-001',
          'Category': 'Cement & Mortar',
          'Unit': 'Bag',
          'Initial Quantity': 250,
          'Low Stock Alert': 40,
          'Units Per Pack (Optional)': 1,
          'Pack Unit (Optional)': '',
          'Description': 'Standard 50kg construction cement',
        },
        {
          'Product Name': 'Deformed Iron Bars 12mm x 12m',
          'SKU': 'SKU-REB-012',
          'Category': 'Steel & Rebar',
          'Unit': 'Bar',
          'Initial Quantity': 300,
          'Low Stock Alert': 35,
          'Units Per Pack (Optional)': 1,
          'Pack Unit (Optional)': '',
          'Description': 'High yield reinforcement steel bar',
        },
        {
          'Product Name': 'Amabati Rugabano 28G Blue (3m)',
          'SKU': 'SKU-IRN-028',
          'Category': 'Roofing & Metal',
          'Unit': 'Sheet',
          'Initial Quantity': 150,
          'Low Stock Alert': 20,
          'Units Per Pack (Optional)': 1,
          'Pack Unit (Optional)': '',
          'Description': 'Corrugated galvanized roofing sheet',
        },
        {
          'Product Name': 'Imisumari 3 Inch Nails (1kg Pack)',
          'SKU': 'SKU-NAL-003',
          'Category': 'Fasteners',
          'Unit': 'Kg',
          'Initial Quantity': 100,
          'Low Stock Alert': 15,
          'Units Per Pack (Optional)': 25,
          'Pack Unit (Optional)': 'Carton',
          'Description': '1 carton contains 25 kg packs',
        },
      ]
    : [
        {
          'Product Name': 'CIMERWA Cement 32.5R (50kg)',
          'SKU': 'SKU-CIM-001',
          'Category': 'Cement & Mortar',
          'Unit': 'Bag',
          'Buying Price (RWF)': 9800,
          'Selling Price (RWF)': 11500,
          'Initial Quantity': 250,
          'Low Stock Alert': 40,
          'Units Per Pack (Optional)': 1,
          'Pack Unit (Optional)': '',
          'Pack Buying Price (Optional)': '',
          'Pack Selling Price (Optional)': '',
          'Description': 'Standard 50kg construction cement',
        },
        {
          'Product Name': 'Deformed Iron Bars 12mm x 12m',
          'SKU': 'SKU-REB-012',
          'Category': 'Steel & Rebar',
          'Unit': 'Bar',
          'Buying Price (RWF)': 11000,
          'Selling Price (RWF)': 13000,
          'Initial Quantity': 300,
          'Low Stock Alert': 35,
          'Units Per Pack (Optional)': 1,
          'Pack Unit (Optional)': '',
          'Pack Buying Price (Optional)': '',
          'Pack Selling Price (Optional)': '',
          'Description': 'High yield reinforcement steel bar',
        },
        {
          'Product Name': 'Amabati Rugabano 28G Blue (3m)',
          'SKU': 'SKU-IRN-028',
          'Category': 'Roofing & Metal',
          'Unit': 'Sheet',
          'Buying Price (RWF)': 11500,
          'Selling Price (RWF)': 14000,
          'Initial Quantity': 150,
          'Low Stock Alert': 20,
          'Units Per Pack (Optional)': 1,
          'Pack Unit (Optional)': '',
          'Pack Buying Price (Optional)': '',
          'Pack Selling Price (Optional)': '',
          'Description': 'Corrugated galvanized roofing sheet',
        },
        {
          'Product Name': 'Imisumari 3 Inch Nails (1kg Pack)',
          'SKU': 'SKU-NAL-003',
          'Category': 'Fasteners',
          'Unit': 'Kg',
          'Buying Price (RWF)': 1800,
          'Selling Price (RWF)': 2500,
          'Initial Quantity': 100,
          'Low Stock Alert': 15,
          'Units Per Pack (Optional)': 25,
          'Pack Unit (Optional)': 'Carton',
          'Pack Buying Price (Optional)': 43000,
          'Pack Selling Price (Optional)': 55000,
          'Description': '1 carton contains 25 kg packs',
        },
      ];

  const instructionRows = isStockOnly
    ? [
        { Column: 'Product Name', Required: 'Yes', Notes: 'Clear product name including brand/size (if same name exists in store, stock quantity is added to it).' },
        { Column: 'SKU', Required: 'Recommended', Notes: 'Unique item code; leave blank to auto-generate.' },
        { Column: 'Category', Required: 'Yes', Notes: 'e.g. Cement & Mortar, Steel & Rebar, Plumbing, Paints, Electrical, Tools.' },
        { Column: 'Unit', Required: 'Yes', Notes: 'Base counting unit: Pcs, Bag, Bar, Sheet, Kg, Meter, Box, Liter.' },
        { Column: 'Initial Quantity', Required: 'Yes', Notes: 'Whole number of base units currently entering the selected warehouse.' },
        { Column: 'Low Stock Alert', Required: 'Optional', Notes: 'Minimum quantity warning threshold (defaults to 10).' },
        { Column: 'Units Per Pack (Optional)', Required: 'Optional', Notes: 'Leave as 1 for single items, or set pack size (e.g. 25 kg per carton).' },
        { Column: 'Pack Unit (Optional)', Required: 'Optional', Notes: 'Bulk unit name such as Carton, Box, Roll, Bundle when Units Per Pack > 1.' },
        { Column: 'Description', Required: 'Optional', Notes: 'Extra notes or specifications. Price columns are intentionally omitted for your Stock-Only store.' },
      ]
    : [
        { Column: 'Product Name', Required: 'Yes', Notes: 'Clear product name including brand/size (if same name exists in store, stock quantity is added to it).' },
        { Column: 'SKU', Required: 'Recommended', Notes: 'Unique item code; leave blank to auto-generate.' },
        { Column: 'Category', Required: 'Yes', Notes: 'e.g. Cement & Mortar, Steel & Rebar, Plumbing, Paints, Electrical, Tools.' },
        { Column: 'Unit', Required: 'Yes', Notes: 'Base selling unit: Pcs, Bag, Bar, Sheet, Kg, Meter, Box, Liter.' },
        { Column: 'Buying Price (RWF)', Required: 'Yes', Notes: 'Unit purchase/cost price in RWF (whole number, no commas/currency symbol needed).' },
        { Column: 'Selling Price (RWF)', Required: 'Recommended', Notes: 'Unit retail selling price in RWF (if left blank/0, defaults to Buying Price).' },
        { Column: 'Initial Quantity', Required: 'Yes', Notes: 'Whole number of base units currently entering the selected warehouse.' },
        { Column: 'Low Stock Alert', Required: 'Optional', Notes: 'Minimum quantity warning threshold (defaults to 10).' },
        { Column: 'Units Per Pack (Optional)', Required: 'Optional', Notes: 'Leave as 1 for single items, or set pack size (e.g. 25 units per carton).' },
        { Column: 'Pack Unit (Optional)', Required: 'Optional', Notes: 'Wholesale pack unit (Carton, Box, Roll) when Units Per Pack > 1.' },
        { Column: 'Pack Buying / Selling Price', Required: 'Optional', Notes: 'Optional wholesale carton cost and selling price in RWF.' },
        { Column: 'Description', Required: 'Optional', Notes: 'Extra notes or specifications.' },
      ];

  const wsProducts = XLSX.utils.json_to_sheet(productRows);
  wsProducts['!cols'] = isStockOnly
    ? [
        { wch: 34 },
        { wch: 15 },
        { wch: 20 },
        { wch: 10 },
        { wch: 16 },
        { wch: 16 },
        { wch: 24 },
        { wch: 20 },
        { wch: 36 },
      ]
    : [
        { wch: 34 },
        { wch: 15 },
        { wch: 20 },
        { wch: 10 },
        { wch: 18 },
        { wch: 18 },
        { wch: 16 },
        { wch: 16 },
        { wch: 24 },
        { wch: 20 },
        { wch: 24 },
        { wch: 24 },
        { wch: 36 },
      ];

  const wsGuide = XLSX.utils.json_to_sheet(instructionRows);
  wsGuide['!cols'] = [{ wch: 28 }, { wch: 15 }, { wch: 78 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Products');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Instructions');

  const rawBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const buffer = Buffer.isBuffer(rawBuf) ? rawBuf : Buffer.from(rawBuf);
  const filename = isStockOnly
    ? `VectOS_${safeCode}_Stock_Only_Template.xlsx`
    : `VectOS_${safeCode}_Stock_With_Prices_Template.xlsx`;

  return { buffer, filename, mode };
}
