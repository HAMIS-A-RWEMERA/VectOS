export interface PackBreakdown {
  isMultiUnit: boolean;
  packs: number;
  loose: number;
  total: number;
  packSize: number;
  packUnit: string;
  retailUnit: string;
  primary: string;
  short: string;
  totalText: string;
}

export function getPackSize(product: { units_per_pack?: number | null } | null | undefined): number {
  const n = Math.round(Number(product?.units_per_pack || 1));
  return Number.isFinite(n) && n > 1 ? n : 1;
}

export function isPackProduct(product: { units_per_pack?: number | null } | null | undefined): boolean {
  return getPackSize(product) > 1;
}

export function getPackUnitLabel(product: { pack_unit?: string | null } | null | undefined): string {
  return (product?.pack_unit || '').trim() || 'Carton';
}

export function getRetailUnitLabel(product: { unit?: string | null; product_unit?: string | null } | null | undefined): string {
  return (product?.unit || product?.product_unit || '').trim() || 'pcs';
}

export function getRetailSellingPrice(product: {
  selling_price?: number | null;
  buying_price?: number | null;
}): number {
  const sell = Number(product.selling_price || 0);
  if (sell > 0) return sell;
  return Math.max(0, Number(product.buying_price || 0));
}

export function getPackSellingPrice(product: {
  pack_selling_price?: number | null;
  selling_price?: number | null;
  buying_price?: number | null;
  units_per_pack?: number | null;
}): number {
  const packSell = Number(product.pack_selling_price || 0);
  if (packSell > 0) return packSell;
  return getRetailSellingPrice(product) * getPackSize(product);
}

export function formatPackStock(
  totalBaseQty: number | null | undefined,
  unitsPerPack?: number | null,
  retailUnit?: string | null,
  packUnit?: string | null
): PackBreakdown {
  const total = Math.max(0, Math.round(Number(totalBaseQty || 0)));
  const packSize = Math.max(1, Math.round(Number(unitsPerPack || 1)));
  const rUnit = (retailUnit || '').trim() || 'pcs';
  const pUnit = (packUnit || '').trim() || 'Carton';

  if (packSize <= 1) {
    return {
      isMultiUnit: false,
      packs: 0,
      loose: total,
      total,
      packSize: 1,
      packUnit: pUnit,
      retailUnit: rUnit,
      primary: `${total.toLocaleString()} ${rUnit}`,
      short: `${total.toLocaleString()} ${rUnit}`,
      totalText: `${total.toLocaleString()} ${rUnit}`,
    };
  }

  const packs = Math.floor(total / packSize);
  const loose = total % packSize;
  const shortPack = pUnit.length > 6 ? pUnit.slice(0, 3) : pUnit;

  let primary = '';
  let short = '';
  if (packs > 0 && loose > 0) {
    primary = `${packs.toLocaleString()} ${pUnit} + ${loose.toLocaleString()} ${rUnit}`;
    short = `${packs.toLocaleString()} ${shortPack} + ${loose.toLocaleString()} ${rUnit}`;
  } else if (packs > 0) {
    primary = `${packs.toLocaleString()} ${pUnit}`;
    short = `${packs.toLocaleString()} ${shortPack}`;
  } else {
    primary = `${loose.toLocaleString()} ${rUnit}`;
    short = `${loose.toLocaleString()} ${rUnit}`;
  }

  return {
    isMultiUnit: true,
    packs,
    loose,
    total,
    packSize,
    packUnit: pUnit,
    retailUnit: rUnit,
    primary,
    short,
    totalText: `${total.toLocaleString()} ${rUnit}`,
  };
}
