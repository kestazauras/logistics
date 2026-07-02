import { GROUP_COLORS, GROUP_ORDER } from "./constants";
import { normalizeDimensions, normalizeGroup, parseInteger, parseNumber, productSubGroup } from "./parsers";
import { productPlacementPriority, productSortRank, productVisualColor } from "./products";
import type { PackagingRules, Product, TransportRecord } from "./types";

export interface DbProductRow {
  id: string;
  category: string;
  code: string | null;
  ean_code: string | null;
  hs_code: string | null;
  name: string;
  gross_weight_kg: number;
  net_weight_kg: number;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  transport_box_qty: number;
  transport_box_height_cm: number | null;
  transport_box_length_cm: number | null;
  transport_box_width_cm: number | null;
  max_units_fin_pallet: number | null;
  layer_units_fin: number | null;
  max_layers_fin: number | null;
  sort_order: number;
}

export interface DbLogisticsRow {
  id: string;
  name: string;
  weight_kg: number;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  internal_height_mm: number | null;
  internal_width_mm: number | null;
  internal_length_mm: number | null;
  max_height_cm: number | null;
  sort_order: number;
}

export function parseLogisticsRow(row: DbLogisticsRow, packagingRules: PackagingRules): TransportRecord {
  const name = row.name;
  const lower = name.toLowerCase();
  const isFloorLoaded = lower.includes("floor");
  const isPalletLoadedContainer = lower.includes("ppl") || (lower.includes("container") && lower.includes("pallet"));
  const isContainer = lower.includes("container") || lower.includes("hq") || isFloorLoaded || lower.includes("ppl");
  const internalHeight = parseNumber(row.internal_height_mm, 0) / 10;
  const palletFootprint = packagingRules.palletLoadedContainer.palletFootprintCm;

  return {
    id: name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
    name,
    weight: parseNumber(row.weight_kg, 0),
    palletHeight: parseNumber(
      row.height_cm,
      isPalletLoadedContainer ? palletFootprint.height : isContainer ? 0 : 15,
    ),
    w: parseNumber(row.width_cm, isContainer ? parseNumber(row.internal_width_mm, 0) / 10 : 100),
    l: parseNumber(row.length_cm, isContainer ? parseNumber(row.internal_length_mm, 0) / 10 : 120),
    maxH: parseNumber(row.max_height_cm, isContainer ? internalHeight - 10 : 250),
    type: isContainer ? "container" : "pallet",
    isFloorLoaded,
    isPalletLoadedContainer,
    internalHeight,
  };
}

export function parseProductRow(row: DbProductRow, index: number): Product | null {
  if (!row.code && !row.name) return null;
  const group = normalizeGroup(row.category);
  const productDims = normalizeDimensions(row.height_cm, row.width_cm, row.length_cm);
  const transportDims = normalizeDimensions(
    (row.transport_box_height_cm ?? productDims.h) || 10,
    (row.transport_box_width_cm ?? productDims.w) || 10,
    (row.transport_box_length_cm ?? productDims.l) || 10,
  );
  const code = (row.code || `MKTG-${index + 1}`).trim();
  const packQty = Math.max(1, parseInteger(row.transport_box_qty, 1));
  const product: Product = {
    id: `${code}-${index}`,
    code,
    ean: row.ean_code || "",
    hs: row.hs_code || "841490",
    name: row.name || code,
    cat: group,
    subGroup: productSubGroup(row.category),
    gw: parseNumber(row.gross_weight_kg, 0),
    nw: parseNumber(row.net_weight_kg, 0),
    packQty,
    boxH: transportDims.h || productDims.h || 10,
    boxW: transportDims.w || productDims.w || 10,
    boxL: transportDims.l || productDims.l || 10,
    maxFin: parseInteger(row.max_units_fin_pallet, 0),
    layerUnitsFin: parseInteger(row.layer_units_fin, 0),
    maxLayersFin: parseInteger(row.max_layers_fin, 0),
    priority: 999,
    color: GROUP_COLORS[group] || 0xff671f,
  };
  product.priority = productPlacementPriority(product);
  product.color = productVisualColor(product);
  return product;
}

export function sortProducts(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const groupDiff =
      (GROUP_ORDER as readonly string[]).indexOf(a.cat) -
      (GROUP_ORDER as readonly string[]).indexOf(b.cat);
    if (groupDiff !== 0) return groupDiff;
    const rankDiff = productSortRank(a) - productSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
  });
}

export function buildPackagingRules(
  rows: { rule_key: string; payload: unknown }[],
): PackagingRules {
  const map = Object.fromEntries(rows.map((r) => [r.rule_key, r.payload]));
  return {
    overhang: map.overhang as PackagingRules["overhang"],
    palletLoadedContainer: map.palletLoadedContainer as PackagingRules["palletLoadedContainer"],
    rondoKvadro100125: map.rondoKvadro100125 as PackagingRules["rondoKvadro100125"],
    floorLoadedContainer: map.floorLoadedContainer as PackagingRules["floorLoadedContainer"],
    lineoLayering: map.lineoLayering as PackagingRules["lineoLayering"],
    rondoKvadroFullLayer: map.rondoKvadroFullLayer as PackagingRules["rondoKvadroFullLayer"],
    centering: map.centering as PackagingRules["centering"],
    placementPriority: map.placementPriority as PackagingRules["placementPriority"],
  };
}
