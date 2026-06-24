import { GROUP_ORDER, ORDER_EXPORT_COLUMNS, PACKAGING_RULES } from "./constants";
import { ErgoventLogisticsOptimizer } from "./packing/ergovent-engine";
import type {
  Footprint,
  Pack,
  PackLayoutResult,
  PalletContainerGrid,
  PalletSlotCenter,
  PartitionedUnit,
  Product,
  QuantityEntry,
  Placement,
  RulesContext,
  TransportContext,
  TransportRecord,
  PackagingRules,
} from "./types";
import { requiredOverhangForProduct } from "./overhang";

/** Mutable app state used by calculation and ROI functions. */
export interface EngineState {
  productData: Product[];
  quantities: Record<string, QuantityEntry>;
  currentTransport: TransportRecord;
  partitionedUnits: PartitionedUnit[];
  activeViewIndex: number;
}

/** DOM accessors matching index.html element IDs. */
export interface EngineDom {
  getOverhangInput(): number;
  getShippingPrice(): number;
  setKpiUnits(html: string): void;
  setKpiGrossWeight(html: string): void;
  setKpiNetWeight(html: string): void;
  setKpiPallets(text: string): void;
  setKpiEfficiency(text: string): void;
  setDimFootprint(text: string): void;
  setDimMaxHeight(text: string): void;
  setDimCurrHeight(text: string): void;
  updateShippingCell(productId: string, shipText: string, weightText: string): void;
  setGroupTotalBadge(index: number, text: string): void;
  setDynamicCategoryCounters(html: string): void;
  setPalletWeightsContainer(html: string): void;
  setWarningPanel(visible: boolean, text: string): void;
  updateChart(efficiency: number): void;
  renderStack3D(placements: Placement[]): void;
}

export interface CalculateROIHooks {
  state: EngineState;
  dom: EngineDom;
  rulesCtx: RulesContext;
  packingEngine: ErgoventLogisticsOptimizer;
}

export function createTransportContext(
  state: Pick<EngineState, "currentTransport" | "productData" | "quantities">,
  rulesCtx: RulesContext,
  getOverhangInput: () => number,
): TransportContext {
  const helpers = createTransportHelpers(state, rulesCtx, getOverhangInput);
  return {
    transport: state.currentTransport,
    getAllowedFootprint: helpers.getAllowedFootprint,
    getBaseHeight: helpers.getBaseHeight,
    getPalletContainerGrid: helpers.getPalletContainerGrid,
    getPalletSlotCenters: helpers.getPalletSlotCenters,
  };
}

export function createTransportHelpers(
  state: Pick<EngineState, "currentTransport" | "productData" | "quantities">,
  rulesCtx: RulesContext,
  getOverhangInput: () => number,
) {
  const { currentTransport, productData, quantities } = state;
  const { packagingRules } = rulesCtx;

  function getOverhang(): number {
    return Math.max(0, getOverhangInput());
  }

  function getAutoOverhang(): number {
    if (currentTransport.type !== "pallet") return 0;
    let required = 0;
    productData.forEach((product) => {
      const qty = quantities[product.id]?.pcs || 0;
      if (qty <= 0) return;
      required = Math.max(
        required,
        requiredOverhangForProduct(product, currentTransport.w, currentTransport.l),
      );
    });
    return Math.min(50, Math.ceil(required));
  }

  function getEffectiveOverhang(): number {
    const requested = Math.max(0, getOverhangInput());
    const auto = getAutoOverhang();
    if (currentTransport.type === "pallet") {
      return Math.max(12, requested, auto);
    }
    return Math.max(requested, auto);
  }

  function getOverhangPerSide(): number {
    return packagingRules.overhang.splitAcrossSides ? getEffectiveOverhang() / 2 : getEffectiveOverhang();
  }

  function isFinPalletTransport(): boolean {
    return currentTransport.type === "pallet" && currentTransport.name.toLowerCase().includes("fin pallet");
  }

  function getPalletContainerGrid(): PalletContainerGrid {
    const pallet = packagingRules.palletLoadedContainer.palletFootprintCm;
    const overhang = getOverhang();
    const normalSlot = { width: pallet.width + overhang, length: pallet.length + overhang, rotated: false };
    const rotatedSlot = { width: pallet.length + overhang, length: pallet.width + overhang, rotated: true };
    const normal = {
      ...normalSlot,
      columns: Math.max(1, Math.floor(currentTransport.w / normalSlot.width)),
      rows: Math.max(1, Math.floor(currentTransport.l / normalSlot.length)),
      count: 0,
    };
    const rotated = {
      ...rotatedSlot,
      columns: Math.max(1, Math.floor(currentTransport.w / rotatedSlot.width)),
      rows: Math.max(1, Math.floor(currentTransport.l / rotatedSlot.length)),
      count: 0,
    };
    normal.count = normal.columns * normal.rows;
    rotated.count = rotated.columns * rotated.rows;
    const selected = rotated.count > normal.count ? rotated : normal;
    return { ...selected, pallet };
  }

  function getPalletSlotCenters(): PalletSlotCenter[] {
    const grid = getPalletContainerGrid();
    const startX = -((grid.columns - 1) * grid.width) / 2;
    const startZ = -((grid.rows - 1) * grid.length) / 2;
    const centers: PalletSlotCenter[] = [];
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < grid.columns; column++) {
        centers.push({
          index: centers.length,
          x: startX + column * grid.width,
          z: startZ + row * grid.length,
        });
      }
    }
    return centers;
  }

  function getAllowedFootprint(): Footprint {
    const overhang = getEffectiveOverhang();
    const canOverhang = currentTransport.type === "pallet";
    return {
      w: currentTransport.w + (canOverhang ? overhang : 0),
      l: currentTransport.l + (canOverhang ? overhang : 0),
    };
  }

  function getBaseHeight(): number {
    if (currentTransport.isFloorLoaded) return 0;
    if (currentTransport.isPalletLoadedContainer) return currentTransport.palletHeight;
    return currentTransport.type === "pallet" ? currentTransport.palletHeight : 0;
  }

  function getUsableProductHeight(): number {
    return Math.max(1, currentTransport.maxH - getBaseHeight());
  }

  return {
    getOverhang,
    getAutoOverhang,
    getEffectiveOverhang,
    getOverhangPerSide,
    isFinPalletTransport,
    getPalletContainerGrid,
    getPalletSlotCenters,
    getAllowedFootprint,
    getBaseHeight,
    getUsableProductHeight,
  };
}

export function bestBoxesPerLayer(
  product: Product,
  state: Pick<EngineState, "currentTransport">,
  helpers: ReturnType<typeof createTransportHelpers>,
): number {
  const { currentTransport } = state;
  if (["RN150", "RN160"].includes(product.code)) return 9;
  if (["LP75.120.101", "LP90.120.101"].includes(product.code)) return 6;
  if (
    product.cat === "LINEO PRO ventilation diffusers" ||
    product.cat === "LINEO PRO CONDI diffusers for A/C & ventilation"
  ) {
    return Math.max(3, product.layerUnitsFin || 3);
  }
  if (product.cat === "LINEO (75mm)") return product.code === "LN75.120.201" ? 8 : 8;
  const footprint = currentTransport.isPalletLoadedContainer
    ? { w: helpers.getPalletContainerGrid().width, l: helpers.getPalletContainerGrid().length }
    : helpers.getAllowedFootprint();
  const normal = Math.floor(footprint.w / product.boxW) * Math.floor(footprint.l / product.boxL);
  const rotated = Math.floor(footprint.w / product.boxL) * Math.floor(footprint.l / product.boxW);
  return Math.max(0, normal, rotated);
}

export function productCapacityUnits(
  product: Product,
  state: Pick<EngineState, "currentTransport">,
  helpers: ReturnType<typeof createTransportHelpers>,
  packingEngine: ErgoventLogisticsOptimizer,
): number {
  const { currentTransport } = state;
  const skuCapacity = packingEngine.MAX_CAPACITIES?.[product.code];
  if (skuCapacity) {
    if (currentTransport.isFloorLoaded && currentTransport.name.includes("20HQ") && skuCapacity["20HQ_FLOOR"]) {
      return skuCapacity["20HQ_FLOOR"];
    }
    if (helpers.isFinPalletTransport() && skuCapacity.FIN) return skuCapacity.FIN;
  }
  const boxesByFootprint = bestBoxesPerLayer(product, state, helpers);
  const calculatedLayerUnits = boxesByFootprint * product.packQty;
  const useFinCapacityRules = helpers.isFinPalletTransport();
  const layerUnits =
    useFinCapacityRules && product.layerUnitsFin > 0
      ? Math.min(product.layerUnitsFin, calculatedLayerUnits || product.layerUnitsFin)
      : calculatedLayerUnits;
  const layersByHeight = Math.max(1, Math.floor(helpers.getUsableProductHeight() / product.boxH));
  const layers =
    useFinCapacityRules && product.maxLayersFin > 0
      ? Math.min(product.maxLayersFin, layersByHeight)
      : layersByHeight;
  const palletMultiplier = currentTransport.isPalletLoadedContainer ? helpers.getPalletContainerGrid().count : 1;
  const capacity = layerUnits * layers * palletMultiplier;
  if (capacity > 0) return capacity;
  const footprint = helpers.getAllowedFootprint();
  const allowedVolume = footprint.w * footprint.l * helpers.getUsableProductHeight();
  const boxVolume = Math.max(1, product.boxW * product.boxL * product.boxH);
  return Math.max(product.packQty, Math.floor(allowedVolume / boxVolume) * product.packQty);
}

export function buildActivePacks(state: Pick<EngineState, "productData" | "quantities">): Pack[] {
  const packs: Pack[] = [];
  state.productData.forEach((product) => {
    const quantity = state.quantities[product.id];
    if (!quantity || quantity.pcs <= 0) return;
    for (let i = 0; i < quantity.packs; i++) {
      packs.push({
        product,
        pcs: product.packQty,
        gross: product.gw * product.packQty,
        net: product.nw * product.packQty,
        volume: product.boxH * product.boxW * product.boxL,
      });
    }
  });
  return packs.sort((a, b) => {
    if (a.product.priority !== b.product.priority) return a.product.priority - b.product.priority;
    return b.product.boxW * b.product.boxL - a.product.boxW * a.product.boxL;
  });
}

export function createUnit(currentTransport: TransportRecord): PartitionedUnit {
  return {
    packs: [],
    gross: currentTransport.weight,
    net: 0,
    volume: 0,
    fraction: 0,
    efficiency: 0,
    currHeight: 0,
    placements: [],
  };
}

export function computePlacements(packs: Pack[], packingEngine: ErgoventLogisticsOptimizer): PackLayoutResult {
  return packingEngine.packForCurrentTransport(packs);
}

export function canPlaceAllPacks(
  packs: Pack[],
  packingEngine: ErgoventLogisticsOptimizer,
): boolean {
  const layout = computePlacements(packs, packingEngine);
  return layout.unpacked.length === 0;
}

export function finalizeUnit(
  unit: PartitionedUnit,
  state: Pick<EngineState, "currentTransport">,
  helpers: ReturnType<typeof createTransportHelpers>,
  packingEngine: ErgoventLogisticsOptimizer,
): void {
  const layout = computePlacements(unit.packs, packingEngine);
  unit.currHeight = layout.productHeight;
  unit.placements = layout.placements;
  const footprint = helpers.getAllowedFootprint();
  const allowedVolume = footprint.w * footprint.l * helpers.getUsableProductHeight();
  const fractionEfficiency = Math.min(100, unit.fraction * 100);
  const volumeEfficiency = allowedVolume > 0 ? Math.min(100, (unit.volume / allowedVolume) * 100) : 0;
  unit.efficiency = state.currentTransport.type === "pallet" ? fractionEfficiency : volumeEfficiency;
}

export function getGypsumFullLayerWarning(
  state: Pick<EngineState, "currentTransport" | "productData" | "quantities">,
  rulesCtx: RulesContext = { packagingRules: PACKAGING_RULES as unknown as PackagingRules },
): string {
  if (!(state.currentTransport.type === "pallet" || state.currentTransport.isPalletLoadedContainer)) return "";
  const rules = rulesCtx.packagingRules.rondoKvadroFullLayer;
  const smallTotal = state.productData
    .filter((product) => rules.smallModelCodes.includes(product.code))
    .reduce((sum, product) => sum + (state.quantities[product.id]?.pcs || 0), 0);
  const largeTotal = state.productData
    .filter((product) => rules.largeModelCodes.includes(product.code))
    .reduce((sum, product) => sum + (state.quantities[product.id]?.pcs || 0), 0);
  const messages: string[] = [];
  const smallRemainder = smallTotal % rules.smallLayerUnits;
  if (smallRemainder > 0) {
    messages.push(
      `Add ${rules.smallLayerUnits - smallRemainder} pcs of RONDO/KVADRO/COANDA 100/125 to complete a stable ${rules.smallLayerUnits} pcs layer.`,
    );
  }
  const largeRemainder = largeTotal % rules.largeLayerUnits;
  if (largeRemainder > 0) {
    messages.push(
      `Add ${rules.largeLayerUnits - largeRemainder} pcs of RONDO 150/160 to complete a stable ${rules.largeLayerUnits} pcs layer.`,
    );
  }
  return messages.join(" ");
}

export function updateWarnings(
  state: EngineState,
  helpers: ReturnType<typeof createTransportHelpers>,
  rulesCtx: RulesContext,
  dom: Pick<EngineDom, "setWarningPanel">,
): void {
  const warnings: string[] = [];
  const inefficientUnit = state.partitionedUnits.find((unit, index) => index > 0 && unit.efficiency < 20);
  if (inefficientUnit) {
    warnings.push(`Inefficient space: one unit is only ${inefficientUnit.efficiency.toFixed(1)}% loaded.`);
  }
  const fullLayerWarning = getGypsumFullLayerWarning(state, rulesCtx);
  if (fullLayerWarning) warnings.push(fullLayerWarning);
  const autoOverhang = helpers.getAutoOverhang();
  if (autoOverhang > helpers.getOverhang()) {
    warnings.push(`! Auto overhang increased to ${autoOverhang} cm for LINEO PRO layer fit.`);
  }
  dom.setWarningPanel(warnings.length > 0, warnings.join(" "));
}

export function updateShippingCells(
  state: Pick<EngineState, "productData" | "quantities">,
  totalPcs: number,
  shipPerItem: number,
  dom: Pick<EngineDom, "updateShippingCell">,
): void {
  state.productData.forEach((product) => {
    const pcs = state.quantities[product.id]?.pcs || 0;
    const weightText = pcs > 0 ? `${(product.nw * pcs).toFixed(2)} / ${(product.gw * pcs).toFixed(2)}` : "-";
    const shipText = pcs > 0 && totalPcs > 0 ? `EUR ${shipPerItem.toFixed(2)}/pc` : "-";
    dom.updateShippingCell(product.id, shipText, weightText);
  });
}

export function updateGroupTotals(
  state: Pick<EngineState, "productData" | "quantities">,
  dom: Pick<EngineDom, "setGroupTotalBadge" | "setDynamicCategoryCounters">,
): void {
  const counterItems: string[] = [];
  GROUP_ORDER.forEach((group, index) => {
    const total = state.productData
      .filter((product) => product.cat === group)
      .reduce((sum, product) => sum + (state.quantities[product.id]?.pcs || 0), 0);
    dom.setGroupTotalBadge(index, `${total} pcs`);
    if (total > 0) {
      counterItems.push(
        `<span class="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded truncate max-w-[160px] border border-gray-200 dark:border-gray-600 font-mono">${group.slice(0, 12)}: ${total}</span>`,
      );
    }
  });
  dom.setDynamicCategoryCounters(counterItems.join(""));
}

export function renderUnitBadges(
  state: EngineState,
  helpers: ReturnType<typeof createTransportHelpers>,
  dom: Pick<EngineDom, "setPalletWeightsContainer">,
): void {
  if (!state.partitionedUnits.length) {
    dom.setPalletWeightsContainer(`<span class="text-gray-400 text-xs italic py-2">No active units</span>`);
    return;
  }
  dom.setPalletWeightsContainer(
    state.partitionedUnits
      .map((unit, index) => {
        const active = index === state.activeViewIndex;
        const style = active
          ? "bg-brand-slate text-white border-transparent shadow-lg transform -translate-y-1"
          : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600";
        const unitLabel = state.currentTransport.type === "container" ? `CONT ${index + 1}` : `PAL ${index + 1}`;
        const palletCountText = state.currentTransport.isPalletLoadedContainer
          ? `<span class="${active ? "text-gray-300" : "text-gray-400"}">Pals: ${helpers.getPalletContainerGrid().count}</span>`
          : "";
        return `
                    <div onclick="switchActiveView(${index})" class="unit-badge border px-4 py-2 rounded-xl flex flex-col cursor-pointer min-w-[120px] ${style}">
                        <div class="flex justify-between items-center border-b ${active ? "border-gray-500" : "border-gray-200 dark:border-gray-600"} pb-1 mb-1">
                            <span class="font-bold text-xs uppercase">${unitLabel}</span>
                            <span class="text-[10px] font-black text-brand-orange bg-black/10 px-1 py-0.5 rounded">${unit.efficiency.toFixed(0)}%</span>
                        </div>
                        <div class="flex justify-between text-[10px] font-mono">
                            <span>G: ${unit.gross.toFixed(0)}kg</span>
                            <span class="${active ? "text-gray-300" : "text-gray-400"}">N: ${unit.net.toFixed(0)}kg</span>
                        </div>
                        ${palletCountText ? `<div class="text-[10px] font-mono mt-1">${palletCountText}</div>` : ""}
                    </div>
                `;
      })
      .join(""),
  );
}

export function switchActiveView(
  index: number,
  hooks: CalculateROIHooks,
  helpers: ReturnType<typeof createTransportHelpers>,
): void {
  const { state, dom } = hooks;
  if (!state.partitionedUnits[index]) return;
  state.activeViewIndex = index;
  renderUnitBadges(state, helpers, dom);
  dom.renderStack3D(state.partitionedUnits[index].placements);
  const footprint = helpers.getAllowedFootprint();
  const loadHeight = helpers.getBaseHeight() + state.partitionedUnits[index].currHeight;
  dom.setDimFootprint(`${footprint.w.toFixed(0)} x ${footprint.l.toFixed(0)} cm`);
  dom.setDimMaxHeight(`${state.currentTransport.maxH.toFixed(0)} cm`);
  dom.setDimCurrHeight(`${loadHeight.toFixed(1)} x ${footprint.w.toFixed(0)} x ${footprint.l.toFixed(0)} cm`);
}

/** Main ROI/partitioning calculation — mirrors index.html calculateROI() maxH */
export function calculateROI(hooks: CalculateROIHooks): void {
  const { state, dom, rulesCtx, packingEngine } = hooks;
  const helpers = createTransportHelpers(state, rulesCtx, dom.getOverhangInput);

  const activePacks = buildActivePacks(state);
  const totalPcs = state.productData.reduce((sum, product) => sum + (state.quantities[product.id]?.pcs || 0), 0);
  const productGross = state.productData.reduce(
    (sum, product) => sum + product.gw * (state.quantities[product.id]?.pcs || 0),
    0,
  );
  const productNet = state.productData.reduce(
    (sum, product) => sum + product.nw * (state.quantities[product.id]?.pcs || 0),
    0,
  );
  const shippingTotal = dom.getShippingPrice();
  const shipPerItem = totalPcs > 0 ? shippingTotal / totalPcs : 0;

  updateShippingCells(state, totalPcs, shipPerItem, dom);
  updateGroupTotals(state, dom);

  state.partitionedUnits = [];
  if (activePacks.length) {
    let unit = createUnit(state.currentTransport);
    state.partitionedUnits.push(unit);

    activePacks.forEach((pack) => {
      const wouldOverflow = unit.packs.length > 0 && !canPlaceAllPacks([...unit.packs, pack], packingEngine);
      if (wouldOverflow) {
        finalizeUnit(unit, state, helpers, packingEngine);
        unit = createUnit(state.currentTransport);
        state.partitionedUnits.push(unit);
      }
      unit.packs.push(pack);
      unit.gross += pack.gross;
      unit.net += pack.net;
      unit.volume += pack.volume;
      unit.fraction += pack.pcs / productCapacityUnits(pack.product, state, helpers, packingEngine);
    });
    state.partitionedUnits.forEach((u) => finalizeUnit(u, state, helpers, packingEngine));
  }

  if (state.activeViewIndex >= state.partitionedUnits.length) {
    state.activeViewIndex = Math.max(0, state.partitionedUnits.length - 1);
  }

  const transportGross = state.partitionedUnits.length * state.currentTransport.weight;
  const totalGross = productGross + transportGross;
  const overallEfficiency = state.partitionedUnits.length
    ? state.partitionedUnits.reduce((sum, unit) => sum + unit.efficiency, 0) / state.partitionedUnits.length
    : 0;

  dom.setKpiUnits(`${totalPcs} <span class="text-xs font-normal text-gray-400">pcs</span>`);
  dom.setKpiGrossWeight(`${totalGross.toFixed(1)} <span class="text-[10px] font-normal text-gray-400 uppercase">kg G</span>`);
  dom.setKpiNetWeight(`${productNet.toFixed(1)} <span class="text-[10px] font-normal uppercase">kg N</span>`);
  dom.setKpiPallets(String(state.partitionedUnits.length));
  dom.setKpiEfficiency(`${overallEfficiency.toFixed(1)}%`);

  dom.updateChart(overallEfficiency);
  renderUnitBadges(state, helpers, dom);
  updateWarnings(state, helpers, rulesCtx, dom);

  if (state.partitionedUnits.length) {
    switchActiveView(state.activeViewIndex, hooks, helpers);
  } else {
    dom.setDimFootprint("-");
    dom.setDimMaxHeight("-");
    dom.setDimCurrHeight("-");
    dom.renderStack3D([]);
  }
}

export interface GenerateOrderOptions {
  state: EngineState;
  helpers: ReturnType<typeof createTransportHelpers>;
  xlsx?: {
    utils: {
      book_new(): unknown;
      json_to_sheet<T>(data: T[], opts?: { header?: readonly string[] }): unknown;
      book_append_sheet(workbook: unknown, sheet: unknown, name: string): void;
    };
    writeFile(workbook: unknown, filename: string): void;
  };
}

/** Mirrors index.html generateOrder(). */
export function generateOrder(options: GenerateOrderOptions): void {
  const { state, helpers, xlsx } = options;
  const selectedRows = state.productData
    .filter((product) => (state.quantities[product.id]?.pcs || 0) > 0)
    .map((product) => {
      const pcs = state.quantities[product.id].pcs;
      return {
        "Product code": product.code,
        "Product name": product.name,
        Quantity: pcs,
        "Gross weight": Number((product.gw * pcs).toFixed(2)),
        "Net weight": Number((product.nw * pcs).toFixed(2)),
        Total: Number((product.gw * pcs).toFixed(2)),
      };
    });

  if (!selectedRows.length) {
    alert("Cannot generate an order without added products.");
    return;
  }

  const totalRow = {
    "Product code": "TOTAL",
    "Product name": "",
    Quantity: selectedRows.reduce((sum, row) => sum + row.Quantity, 0),
    "Gross weight": Number(selectedRows.reduce((sum, row) => sum + row["Gross weight"], 0).toFixed(2)),
    "Net weight": Number(selectedRows.reduce((sum, row) => sum + row["Net weight"], 0).toFixed(2)),
    Total: Number(selectedRows.reduce((sum, row) => sum + row.Total, 0).toFixed(2)),
  };

  const unitRows = state.partitionedUnits.map((unit, index) => ({
    Unit: index + 1,
    "Transport model": state.currentTransport.name,
    "Footprint cm": `${helpers.getAllowedFootprint().w.toFixed(0)} x ${helpers.getAllowedFootprint().l.toFixed(0)}`,
    "Load height cm": Number((helpers.getBaseHeight() + unit.currHeight).toFixed(1)),
    "Gross kg": Number(unit.gross.toFixed(2)),
    "Net kg": Number(unit.net.toFixed(2)),
    "Efficiency %": Number(unit.efficiency.toFixed(1)),
  }));

  if (xlsx) {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.json_to_sheet([...selectedRows, totalRow], { header: ORDER_EXPORT_COLUMNS }),
      "Order",
    );
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(unitRows), "Transport units");
    xlsx.writeFile(workbook, `ERGOVENT_Order_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } else {
    const lines = [ORDER_EXPORT_COLUMNS.join(",")].concat(
      [...selectedRows, totalRow].map((row) =>
        ORDER_EXPORT_COLUMNS.map((column) => `"${String(row[column as keyof typeof row] ?? "").replaceAll('"', '""')}"`).join(","),
      ),
    );
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ERGOVENT_Order_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

export type TransportHelperBundle = ReturnType<typeof createTransportHelpers>;
