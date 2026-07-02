/** Shared domain types extracted from index.html engine-core and packing engine. */

export interface TransportRecord {
  id: string;
  name: string;
  weight: number;
  palletHeight: number;
  w: number;
  l: number;
  maxH: number;
  type: "container" | "pallet";
  isFloorLoaded: boolean;
  isPalletLoadedContainer: boolean;
  internalHeight: number;
}

export interface Product {
  id: string;
  code: string;
  ean: string;
  hs: string;
  name: string;
  cat: string;
  subGroup: string;
  gw: number;
  nw: number;
  packQty: number;
  boxH: number;
  boxW: number;
  boxL: number;
  maxFin: number;
  layerUnitsFin: number;
  maxLayersFin: number;
  priority: number;
  color: number;
}

export interface QuantityEntry {
  pcs: number;
  packs: number;
}

export interface Pack {
  product: Product;
  pcs: number;
  gross: number;
  net: number;
  volume: number;
}

export interface Placement {
  pack: Pack;
  product: Product;
  itemId: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  l: number;
  rotated: boolean;
  brick?: boolean;
  standReserved?: boolean;
  palletSlotIndex?: number;
}

export interface PackLayoutResult {
  placements: Placement[];
  productHeight: number;
  unpacked: ExpandedItem[];
}

export interface PartitionedUnit {
  packs: Pack[];
  gross: number;
  net: number;
  volume: number;
  fraction: number;
  efficiency: number;
  currHeight: number;
  placements: Placement[];
}

export interface PalletFootprintCm {
  width: number;
  length: number;
  height: number;
}

export interface PalletContainerGrid {
  width: number;
  length: number;
  rotated: boolean;
  columns: number;
  rows: number;
  count: number;
  pallet: PalletFootprintCm;
}

export interface PalletSlotCenter {
  index: number;
  x: number;
  z: number;
}

export interface Footprint {
  w: number;
  l: number;
}

export interface OverhangRules {
  rule: string;
  example: string;
  splitAcrossSides: boolean;
  floorLoadedContainerOverhangAllowed: boolean;
}

export interface PalletLoadedContainerRules {
  rule: string;
  palletFootprintCm: PalletFootprintCm;
  showPalletsInsideContainer: boolean;
  loadingSequence: string;
}

export interface RondoKvadroFullLayerRules {
  rule: string;
  smallModelCodes: string[];
  smallLayerUnits: number;
  largeModelCodes: string[];
  largeLayerUnits: number;
  appliesToPalletOrdersOnly: boolean;
}

export interface PackagingRules {
  overhang: OverhangRules;
  palletLoadedContainer: PalletLoadedContainerRules;
  rondoKvadro100125: Record<string, unknown>;
  floorLoadedContainer: Record<string, unknown>;
  lineoLayering: Record<string, unknown>;
  rondoKvadroFullLayer: RondoKvadroFullLayerRules;
  centering: Record<string, unknown>;
  placementPriority: Array<{ rank: number; label: string; rule?: string }>;
}

/** Transport helpers injected into the packing engine instead of globals. */
export interface TransportContext {
  transport: TransportRecord;
  getAllowedFootprint(): Footprint;
  getBaseHeight(): number;
  getPalletContainerGrid(): PalletContainerGrid;
  getPalletSlotCenters(): PalletSlotCenter[];
}

/** Packaging rules injected where needed instead of global PACKAGING_RULES. */
export interface RulesContext {
  packagingRules: PackagingRules;
}

/** Internal expanded item used by oracle. */
export interface ExpandedItem {
  id: string;
  sku: string;
  name: string;
  w: number;
  l: number;
  h: number;
  weight: number;
  priority: number;
  color: number;
  product: Product;
  pack: Pack;
}

export interface PackOrigin {
  x: number;
  z: number;
}

export interface PalletizedConfig {
  origin: PackOrigin;
  width: number;
  length: number;
  baseHeight: number;
  maxY: number;
  allowBricklaying: boolean;
  palletSlotIndex?: number;
}

export interface FloorLoadedConfig {
  width: number;
  length: number;
  height: number;
}

export interface PlacedItem extends ExpandedItem {
  x: number;
  y: number;
  z: number;
  w: number;
  l: number;
  h: number;
  brick?: boolean;
  standReserved?: boolean;
  standIndex?: number;
  ruleLayer?: boolean;
}

export interface Obstacle {
  x: number;
  z: number;
  y: number;
  w: number;
  l: number;
  h: number;
}

export interface ExtremePoint {
  x: number;
  z: number;
  y: number;
}

export interface LayerRule {
  perLayer: number;
  columns: number;
  rows: number;
  flatOnly: boolean;
  allowRuleStack?: boolean;
}

export interface CandidatePlacement {
  x: number;
  z: number;
  y: number;
  w: number;
  l: number;
  h: number;
  priority?: number;
  sku?: string;
}

export interface OrderExportRow {
  "Product code": string;
  "Product name": string;
  Quantity: number;
  "Gross weight": number;
  "Net weight": number;
  Total: number;
}

export interface TransportUnitExportRow {
  Unit: number;
  "Transport model": string;
  "Footprint cm": string;
  "Load height cm": number;
  "Gross kg": number;
  "Net kg": number;
  "Efficiency %": number;
}
