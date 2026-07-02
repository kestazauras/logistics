"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EfficiencyChart from "@/components/EfficiencyChart";
import Scene3D from "@/components/Scene3D";
import {
  calculateROI,
  createTransportContext,
  createTransportHelpers,
  generateOrder,
  switchActiveView,
  type EngineDom,
  type EngineState,
} from "@/lib/calculations";
import type { AppData } from "@/lib/load-app-data";
import { parseInteger } from "@/lib/parsers";
import { computeDefaultPalletOverhang } from "@/lib/overhang";
import { ErgoventLogisticsOptimizer } from "@/lib/packing/ergovent-engine";
import type { Footprint, Placement, Product, QuantityEntry } from "@/lib/types";

interface OptimizerAppProps {
  initialData: AppData;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stepValue(current: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, current + delta));
}

function formatDim(value: number | undefined): string {
  return Number.isFinite(value) ? value!.toFixed(1) : "-";
}

function setTooltipElement(
  el: HTMLDivElement | null,
  html: string | null,
  left?: number,
  top?: number,
): void {
  if (!el) return;
  if (!html) {
    el.classList.add("hidden");
    return;
  }
  el.innerHTML = html;
  el.classList.remove("hidden");
  if (left != null) el.style.left = `${left}px`;
  if (top != null) el.style.top = `${top}px`;
}

export default function OptimizerApp({ initialData }: OptimizerAppProps) {
  const { products, logistics, packagingRules, packingConfig, groupOrder } = initialData;

  const [isDark, setIsDark] = useState(false);
  const [shippingPrice, setShippingPrice] = useState(0);
  const [overhang, setOverhang] = useState(12);
  const [currentTransportId, setCurrentTransportId] = useState(logistics[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, QuantityEntry>>(() =>
    Object.fromEntries(products.map((product) => [product.id, { pcs: 0, packs: 0 }])),
  );

  const [kpiUnits, setKpiUnits] = useState('0 <span class="text-xs font-normal text-gray-400">pcs</span>');
  const [kpiGrossWeight, setKpiGrossWeight] = useState(
    '0.0 <span class="text-[10px] font-normal text-gray-400 uppercase">kg G</span>',
  );
  const [kpiNetWeight, setKpiNetWeight] = useState(
    '0.0 <span class="text-[10px] font-normal uppercase">kg N</span>',
  );
  const [kpiPallets, setKpiPallets] = useState("0");
  const [kpiEfficiency, setKpiEfficiency] = useState("0%");
  const [chartEfficiency, setChartEfficiency] = useState(0);
  const [categoryCountersHtml, setCategoryCountersHtml] = useState("");
  const [groupTotals, setGroupTotals] = useState<Record<number, string>>({});
  const [shippingCells, setShippingCells] = useState<Record<string, { ship: string; weight: string }>>({});
  const [dimFootprint, setDimFootprint] = useState("-");
  const [dimMaxHeight, setDimMaxHeight] = useState("-");
  const [dimCurrHeight, setDimCurrHeight] = useState("-");
  const [warningVisible, setWarningVisible] = useState(false);
  const [warningText, setWarningText] = useState("-");
  const [scenePlacements, setScenePlacements] = useState<Placement[]>([]);
  const [sceneFootprint, setSceneFootprint] = useState<Footprint>({ w: 0, l: 0 });
  const [sceneBaseHeight, setSceneBaseHeight] = useState(0);
  const [partitionedUnits, setPartitionedUnits] = useState<EngineState["partitionedUnits"]>([]);
  const [activeViewIndex, setActiveViewIndex] = useState(0);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const productListRef = useRef<HTMLDivElement>(null);

  const engineStateRef = useRef<EngineState>({
    productData: products,
    quantities,
    currentTransport: logistics[0],
    partitionedUnits: [],
    activeViewIndex: 0,
  });

  const currentTransport = useMemo(
    () => logistics.find((t) => t.id === currentTransportId) ?? logistics[0],
    [logistics, currentTransportId],
  );

  const palletTypeLabel = currentTransport?.type === "container" ? "Containers" : "Pallets";

  const transportHelpers = useMemo(() => {
    const state = {
      currentTransport,
      productData: products,
      quantities,
    };
    return createTransportHelpers(state, { packagingRules }, () => overhang);
  }, [currentTransport, products, quantities, packagingRules, overhang]);

  const transportContext = useMemo(
    () =>
      createTransportContext(
        { currentTransport, productData: products, quantities },
        { packagingRules },
        () => overhang,
      ),
    [currentTransport, products, quantities, packagingRules, overhang],
  );

  const packingEngine = useMemo(
    () =>
      new ErgoventLogisticsOptimizer(
        transportContext,
        { packagingRules },
        packingConfig.max_capacities,
      ),
    [transportContext, packagingRules, packingConfig.max_capacities],
  );

  const runCalculateROI = useCallback(() => {
    const state = engineStateRef.current;
    state.quantities = quantities;
    state.currentTransport = currentTransport;
    state.productData = products;

    const dom: EngineDom = {
      getOverhangInput: () => overhang,
      getShippingPrice: () => shippingPrice,
      setKpiUnits: setKpiUnits,
      setKpiGrossWeight: setKpiGrossWeight,
      setKpiNetWeight: setKpiNetWeight,
      setKpiPallets: setKpiPallets,
      setKpiEfficiency: (text) => {
        setKpiEfficiency(text);
        setChartEfficiency(parseFloat(text) || 0);
      },
      setDimFootprint: setDimFootprint,
      setDimMaxHeight: setDimMaxHeight,
      setDimCurrHeight: setDimCurrHeight,
      updateShippingCell: (productId, shipText, weightText) => {
        setShippingCells((prev) => ({
          ...prev,
          [productId]: { ship: shipText, weight: weightText },
        }));
      },
      setGroupTotalBadge: (index, text) => {
        setGroupTotals((prev) => ({ ...prev, [index]: text }));
      },
      setDynamicCategoryCounters: setCategoryCountersHtml,
      setPalletWeightsContainer: () => {},
      setWarningPanel: (visible, text) => {
        setWarningVisible(visible);
        setWarningText(text);
      },
      updateChart: setChartEfficiency,
      renderStack3D: (placements) => {
        setScenePlacements(placements);
        const footprint = transportHelpers.getAllowedFootprint();
        setSceneFootprint(footprint);
        setSceneBaseHeight(transportHelpers.getBaseHeight());
      },
    };

    calculateROI({
      state,
      dom,
      rulesCtx: { packagingRules },
      packingEngine,
    });

    setPartitionedUnits([...state.partitionedUnits]);
    setActiveViewIndex(state.activeViewIndex);
  }, [
    quantities,
    currentTransport,
    products,
    overhang,
    shippingPrice,
    packagingRules,
    packingEngine,
    transportHelpers,
  ]);

  useEffect(() => {
    runCalculateROI();
  }, [runCalculateROI]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const updateQuantity = (productId: string, pcs: number) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setQuantities((prev) => ({
      ...prev,
      [productId]: { pcs, packs: Math.ceil(pcs / product.packQty) },
    }));
  };

  const handleQtyInput = (product: Product, rawValue: string) => {
    updateQuantity(product.id, Math.max(0, parseInteger(rawValue, 0)));
  };

  const commitQtyInput = (product: Product, rawValue: string) => {
    let value = Math.max(0, parseInteger(rawValue, 0));
    if (value % product.packQty !== 0) {
      value = Math.ceil(value / product.packQty) * product.packQty;
    }
    updateQuantity(product.id, value);
  };

  const handleQtyChange = (product: Product, rawValue: string) => {
    commitQtyInput(product, rawValue);
  };

  const resetQuantities = () => {
    setQuantities(Object.fromEntries(products.map((product) => [product.id, { pcs: 0, packs: 0 }])));
    setShippingPrice(0);
  };

  const resetOverhang = () =>
    setOverhang(computeDefaultPalletOverhang(products, currentTransport));

  const handleSwitchActiveView = (index: number) => {
    const state = engineStateRef.current;
    const helpers = createTransportHelpers(
      { currentTransport, productData: products, quantities },
      { packagingRules },
      () => overhang,
    );
    const dom: EngineDom = {
      getOverhangInput: () => overhang,
      getShippingPrice: () => shippingPrice,
      setKpiUnits,
      setKpiGrossWeight,
      setKpiNetWeight,
      setKpiPallets,
      setKpiEfficiency: (text) => {
        setKpiEfficiency(text);
        setChartEfficiency(parseFloat(text) || 0);
      },
      setDimFootprint: setDimFootprint,
      setDimMaxHeight: setDimMaxHeight,
      setDimCurrHeight: setDimCurrHeight,
      updateShippingCell: () => {},
      setGroupTotalBadge: () => {},
      setDynamicCategoryCounters: () => {},
      setPalletWeightsContainer: () => {},
      setWarningPanel: () => {},
      updateChart: () => {},
      renderStack3D: (placements) => {
        setScenePlacements(placements);
        setSceneFootprint(helpers.getAllowedFootprint());
        setSceneBaseHeight(helpers.getBaseHeight());
      },
    };
    switchActiveView(index, { state, dom, rulesCtx: { packagingRules }, packingEngine }, helpers);
    setActiveViewIndex(state.activeViewIndex);
    setPartitionedUnits([...state.partitionedUnits]);
  };

  const handleGenerateOrder = async () => {
    const helpers = createTransportHelpers(
      { currentTransport, productData: products, quantities },
      { packagingRules },
      () => overhang,
    );
    const xlsx = await import("xlsx");
    generateOrder({
      state: engineStateRef.current,
      helpers,
      xlsx,
    });
  };

  const showProductTooltip = (event: React.MouseEvent, product: Product) => {
    setTooltipElement(
      tooltipRef.current,
      `
        <div class="h-20 bg-gray-100 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 mb-2 flex items-center justify-center text-[10px] text-gray-400 font-mono">${escapeHtml(product.code)}</div>
        <p class="font-bold text-brand-slate dark:text-white text-xs">${escapeHtml(product.name)}</p>
        <p class="text-[10px] text-gray-500 mt-1">Transport box: ${formatDim(product.boxL)} x ${formatDim(product.boxW)} x ${formatDim(product.boxH)} cm</p>
        <p class="text-[10px] text-gray-500">Pack quantity step: ${product.packQty} pcs</p>
      `,
      event.clientX + 15,
      Math.max(10, event.clientY - 60),
    );
  };

  const showBoxTooltip = useCallback(
    (
      data: { code: string; name: string; l: number; w: number; h: number; rotated: boolean } | null,
      x: number,
      y: number,
    ) => {
      if (!data) {
        setTooltipElement(tooltipRef.current, null);
        return;
      }
      setTooltipElement(
        tooltipRef.current,
        `
        <p class="font-bold text-xs text-brand-orange">${escapeHtml(data.code)}</p>
        <p class="font-bold text-[11px] text-gray-700 dark:text-gray-200">${escapeHtml(data.name)}</p>
        <p class="text-[10px] text-gray-500 mt-1">Dims: ${formatDim(data.l)} x ${formatDim(data.w)} x ${formatDim(data.h)} cm</p>
        <p class="text-[10px] text-gray-500">Rotation: ${data.rotated ? "90 degrees" : "0 degrees"}</p>
      `,
        x + 15,
        Math.max(10, y - 45),
      );
    },
    [],
  );

  const hideTooltip = useCallback(() => setTooltipElement(tooltipRef.current, null), []);

  const renderProductRows = (groupProducts: Product[]) => {
    let previousSubGroup: string | null = null;
    const rows: React.ReactNode[] = [];
    groupProducts.forEach((product) => {
      const showSeparator = product.subGroup && product.subGroup !== previousSubGroup;
      previousSubGroup = product.subGroup || previousSubGroup;
      const qtyValue = quantities[product.id]?.pcs ?? 0;
      const shipCell = shippingCells[product.id];
      if (showSeparator) {
        rows.push(
          <tr key={`sep-${product.id}`} className="bg-gray-50 dark:bg-gray-800/80">
            <td colSpan={8} className="px-3 py-2">
              <div className="flex items-center gap-3 text-[9px] uppercase tracking-[0.18em] font-black text-brand-orange">
                <span className="h-px flex-1 bg-brand-orange/50"></span>
                <span>{product.subGroup}</span>
                <span className="h-px flex-1 bg-brand-orange/50"></span>
              </div>
            </td>
          </tr>,
        );
      }
      rows.push(
        <tr key={product.id} className="hover:bg-orange-50/40 dark:hover:bg-gray-800/50 transition-colors">
          <td className="py-2 px-2 text-center">
            <button
              type="button"
              className="product-info w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 flex items-center justify-center text-[10px] font-bold cursor-help mx-auto hover:bg-brand-orange hover:text-white"
              onMouseEnter={(e) => showProductTooltip(e, product)}
              onMouseLeave={hideTooltip}
            >
              ?
            </button>
          </td>
          <td className="py-2 px-3 font-mono text-[10px]">
            <span className="font-bold text-gray-700 dark:text-gray-300">{product.code}</span>
            <br />
            <span className="text-gray-400">HS: {product.hs}</span>
          </td>
          <td className="py-2 px-3 font-bold text-brand-slate dark:text-gray-200 min-w-[320px] max-w-[520px] whitespace-normal leading-snug break-words">
            {product.name}
          </td>
          <td className="py-2 px-3 text-center font-mono">{product.packQty}</td>
          <td className="py-2 px-3 text-center font-mono text-[10px] text-gray-500">
            {product.nw.toFixed(2)} / {product.gw.toFixed(2)}
          </td>
          <td className="py-2 px-3 text-center font-mono text-[10px] text-gray-500">{shipCell?.weight ?? "-"}</td>
          <td className="py-2 px-3 text-center font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
            {shipCell?.ship ?? "-"}
          </td>
          <td className="py-2 px-3 text-right">
            <div className="inline-flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full px-1 py-0.5">
              <button
                type="button"
                className="stepper-btn !w-6 !h-6 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-300"
                onClick={() => handleQtyChange(product, String(qtyValue - product.packQty))}
              >
                -
              </button>
              <input
                id={`qty-${product.id}`}
                type="number"
                min={0}
                step={1}
                value={qtyValue}
                data-id={product.id}
                className="qty-input w-14 bg-transparent px-1 py-1 text-center font-mono font-bold text-brand-slate dark:text-white outline-none"
                onFocus={(e) => {
                  if (e.target.value === "0") e.target.value = "";
                }}
                onBlur={(e) => {
                  commitQtyInput(product, e.target.value === "" ? "0" : e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  commitQtyInput(product, e.currentTarget.value === "" ? "0" : e.currentTarget.value);
                  e.currentTarget.blur();
                }}
                onInput={(e) => handleQtyInput(product, e.currentTarget.value)}
              />
              <button
                type="button"
                className="stepper-btn !w-6 !h-6 bg-gray-50 dark:bg-gray-800 text-brand-orange"
                onClick={() => handleQtyChange(product, String(qtyValue + product.packQty))}
              >
                +
              </button>
            </div>
          </td>
        </tr>,
      );
    });
    return rows;
  };

  const toggleAllGroups = () => {
    const details = productListRef.current?.querySelectorAll("details");
    if (!details) return;
    const shouldOpen = Array.from(details).some((item) => !item.open);
    details.forEach((item) => {
      item.open = shouldOpen;
    });
  };

  const palletGrid = useMemo(
    () => (currentTransport.isPalletLoadedContainer ? transportHelpers.getPalletContainerGrid() : null),
    [currentTransport.isPalletLoadedContainer, transportHelpers],
  );

  const palletSlotCenters = useMemo(
    () => transportHelpers.getPalletSlotCenters(),
    [transportHelpers],
  );

  return (
    <div className="h-screen flex flex-col bg-brand-light dark:bg-gray-900 text-brand-slate dark:text-gray-200 transition-colors">
      <div
        ref={tooltipRef}
        id="global-tooltip"
        className="fixed z-[100] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-2xl p-3 rounded-xl pointer-events-none w-72 hidden"
      />

      <header className="bg-white dark:bg-gray-800 px-6 py-3 flex justify-between items-center shrink-0 shadow-md z-40 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-brand-orange rounded-xl flex items-center justify-center font-black text-white text-2xl shadow-sm">
            E
          </div>
          <div>
            <h1 className="font-bold text-xl leading-tight text-brand-slate dark:text-white tracking-tight">
              ERGOVENT - loading optimizer
            </h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Logistics & Packaging Core <span className="ml-2 text-emerald-500">v_15</span>
            </p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <button
            type="button"
            onClick={toggleTheme}
            className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-brand-orange transition-colors uppercase tracking-wider border border-gray-200 dark:border-gray-600 rounded-full px-4 py-2 bg-gray-50 dark:bg-gray-800"
          >
            Theme
          </button>
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-full px-4 py-1.5 border border-gray-200 dark:border-gray-600">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Shipping EUR
            </span>
            <button
              type="button"
              className="stepper-btn bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
              onClick={() => setShippingPrice((v) => stepValue(v, -1, 0, Infinity))}
            >
              -
            </button>
            <input
              type="number"
              id="shipping-price"
              value={shippingPrice}
              min={0}
              step={1}
              className="w-16 bg-transparent text-center outline-none text-base font-bold text-brand-slate dark:text-white"
              onFocus={(e) => {
                if (e.target.value === "0") e.target.value = "";
              }}
              onBlur={(e) => {
                if (e.target.value === "") setShippingPrice(0);
              }}
              onChange={(e) => setShippingPrice(Math.max(0, parseInteger(e.target.value, 0)))}
            />
            <button
              type="button"
              className="stepper-btn bg-white dark:bg-gray-800 text-brand-orange border border-gray-200 dark:border-gray-600"
              onClick={() => setShippingPrice((v) => stepValue(v, 1, 0, Infinity))}
            >
              +
            </button>
          </div>
          <select
            id="transport-type"
            value={currentTransportId}
            onChange={(e) => setCurrentTransportId(e.target.value)}
            className="bg-gray-100 dark:bg-gray-700 text-sm font-bold rounded-full px-4 py-2 outline-none border border-gray-200 dark:border-gray-600 dark:text-white"
          >
            {logistics.map((transport) => (
              <option key={transport.id} value={transport.id}>
                {transport.name} (Max H: {transport.maxH}cm)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleGenerateOrder}
            className="bg-brand-orange hover:opacity-90 px-6 py-2 rounded-full text-sm font-bold shadow-lg transition-all text-white uppercase tracking-wider"
          >
            Generate order
          </button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        <aside className="w-[70%] flex flex-col z-10 bg-white dark:bg-gray-800 shadow-2xl overflow-hidden shrink-0 border-r border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 shrink-0">
            <h2 className="font-extrabold text-brand-slate dark:text-white uppercase tracking-wider text-sm flex items-center">
              Product Database
              <span className="text-[11px] font-bold text-gray-500 ml-4 normal-case bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded flex items-center gap-1">
                <button
                  type="button"
                  className="stepper-btn !w-5 !h-5 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                  onClick={() => setOverhang((v) => stepValue(v, -1, 0, 50))}
                >
                  -
                </button>
                <input
                  type="number"
                  id="overhang-input"
                  value={overhang}
                  min={0}
                  max={50}
                  step={1}
                  className="w-8 bg-transparent text-center outline-none text-brand-orange border-b border-brand-orange font-bold"
                  onChange={(e) => setOverhang(Math.max(0, Math.min(50, parseInteger(e.target.value, 0))))}
                />
                cm
                <button
                  type="button"
                  className="stepper-btn !w-5 !h-5 bg-white dark:bg-gray-800 text-brand-orange border border-gray-200 dark:border-gray-600"
                  onClick={() => setOverhang((v) => stepValue(v, 1, 0, 50))}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={resetOverhang}
                  className="ml-1 text-[9px] uppercase tracking-wider font-black text-brand-orange bg-white dark:bg-gray-800 border border-brand-orange/30 rounded-full px-2 py-1"
                >
                  default
                </button>
                <span className="ml-1 text-[9px] uppercase tracking-wider opacity-60">Allowed overhang</span>
              </span>
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleAllGroups}
                className="text-[10px] uppercase tracking-wider text-gray-500 font-bold hover:text-brand-orange transition-colors bg-white dark:bg-gray-700 px-3 py-1 rounded shadow-sm border border-gray-200 dark:border-gray-600"
              >
                Expand/collapse
              </button>
              <button
                type="button"
                onClick={resetQuantities}
                className="text-[10px] uppercase tracking-wider text-gray-400 font-bold hover:text-red-500 transition-colors bg-white dark:bg-gray-700 px-3 py-1 rounded shadow-sm border border-gray-200 dark:border-gray-600"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4" id="product-list" ref={productListRef}>
            {groupOrder.map((group, index) => {
              const groupProducts = products.filter((product) => product.cat === group);
              if (!groupProducts.length) return null;
              return (
                <details
                  key={group}
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-visible mb-3"
                  open={index === 0}
                >
                  <summary className="px-5 py-3 font-bold text-brand-slate dark:text-gray-200 text-xs cursor-pointer flex justify-between items-center bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-t-2xl">
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-orange text-white flex items-center justify-center text-[10px] font-black">
                        {index + 1}
                      </span>
                      {group}
                      <span
                        id={`group-total-${index}`}
                        className="text-[9px] font-mono bg-white dark:bg-gray-700 text-brand-slate dark:text-gray-300 px-2 py-0.5 rounded-full shadow-sm ml-2 border border-gray-200 dark:border-gray-600"
                      >
                        {groupTotals[index] ?? "0 pcs"}
                      </span>
                    </span>
                    <span className="text-brand-orange">v</span>
                  </summary>
                  <div className="overflow-x-auto bg-white dark:bg-gray-900 rounded-b-2xl">
                    <table className="w-full text-left text-xs min-w-[1040px]">
                      <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase tracking-wider text-[9px]">
                        <tr>
                          <th className="py-2 px-3 w-8 text-center">Info</th>
                          <th className="py-2 px-3 w-32">Code/HS</th>
                          <th className="py-2 px-3">Name</th>
                          <th className="py-2 px-3 text-center">Pack qty</th>
                          <th className="py-2 px-3 text-center">Net/Gross (kg)</th>
                          <th className="py-2 px-3 text-center">Total Net/Gross (kg)</th>
                          <th className="py-2 px-3 text-center">Ship EUR</th>
                          <th className="py-2 px-3 text-right w-28">Order qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {renderProductRows(groupProducts)}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
        </aside>

        <section className="w-[30%] flex flex-col bg-brand-light dark:bg-gray-900 overflow-hidden relative">
          <div className="grid grid-cols-2 gap-4 p-4 shrink-0 z-10 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/50">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                Payload breakdown
              </p>
              <div className="flex justify-between items-end mt-2">
                <div>
                  <p
                    className="text-3xl font-black text-brand-slate dark:text-white leading-none"
                    id="kpi-units"
                    dangerouslySetInnerHTML={{ __html: kpiUnits }}
                  />
                  <div
                    id="dynamic-category-counters"
                    className="flex flex-wrap gap-1 mt-2 text-[8px] uppercase font-bold text-gray-500"
                    dangerouslySetInnerHTML={{ __html: categoryCountersHtml }}
                  />
                </div>
                <div className="text-right">
                  <p
                    className="text-xl font-bold text-brand-slate dark:text-white leading-none"
                    id="kpi-gross-weight"
                    dangerouslySetInnerHTML={{ __html: kpiGrossWeight }}
                  />
                  <p
                    className="text-xs font-bold text-brand-orange leading-none mt-1"
                    id="kpi-net-weight"
                    dangerouslySetInnerHTML={{ __html: kpiNetWeight }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div className="h-full flex flex-col justify-between">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                  Transport units
                </p>
                <div>
                  <p className="text-4xl font-black text-brand-orange leading-none mt-1" id="kpi-pallets">
                    {kpiPallets}
                  </p>
                  <p className="text-xs font-bold text-gray-400 uppercase mt-0.5" id="kpi-pallet-type">
                    {palletTypeLabel}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center">
                <div className="w-16 h-16 relative">
                  <EfficiencyChart efficiency={chartEfficiency} isDark={isDark} />
                </div>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider text-center mt-1">
                  Order efficiency:{" "}
                  <span className="text-xs font-black text-green-600 dark:text-green-400" id="kpi-efficiency">
                    {kpiEfficiency}
                  </span>
                </p>
              </div>
            </div>

            <div className="col-span-2 bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-2">
                Unit selection & weight profile (click to switch 3D view)
              </p>
              <div id="pallet-weights-container" className="flex flex-wrap gap-2 text-sm overflow-visible min-h-[7rem]">
                {!partitionedUnits.length ? (
                  <span className="text-gray-400 text-xs italic py-2">No active units</span>
                ) : (
                  partitionedUnits.map((unit, index) => {
                    const active = index === activeViewIndex;
                    const style = active
                      ? "bg-brand-slate text-white border-transparent shadow-lg transform -translate-y-1"
                      : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600";
                    const unitLabel =
                      currentTransport.type === "container" ? `CONT ${index + 1}` : `PAL ${index + 1}`;
                    const palletCountText = currentTransport.isPalletLoadedContainer
                      ? transportHelpers.getPalletContainerGrid().count
                      : 0;
                    return (
                      <div
                        key={index}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSwitchActiveView(index)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") handleSwitchActiveView(index);
                        }}
                        className={`unit-badge border px-4 py-2 rounded-xl flex flex-col cursor-pointer min-w-[120px] ${style}`}
                      >
                        <div
                          className={`flex justify-between items-center border-b ${active ? "border-gray-500" : "border-gray-200 dark:border-gray-600"} pb-1 mb-1`}
                        >
                          <span className="font-bold text-xs uppercase">{unitLabel}</span>
                          <span className="text-[10px] font-black text-brand-orange bg-black/10 px-1 py-0.5 rounded">
                            {unit.efficiency.toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono">
                          <span>G: {unit.gross.toFixed(0)}kg</span>
                          <span className={active ? "text-gray-300" : "text-gray-400"}>
                            N: {unit.net.toFixed(0)}kg
                          </span>
                        </div>
                        {palletCountText > 0 ? (
                          <div className="text-[10px] font-mono mt-1">
                            <span className={active ? "text-gray-300" : "text-gray-400"}>
                              Pals: {palletCountText}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 relative bg-gray-100 dark:bg-[#0f172a]">
            <Scene3D
              placements={scenePlacements}
              transport={currentTransport}
              footprint={sceneFootprint}
              baseHeight={sceneBaseHeight}
              maxH={currentTransport.maxH}
              packagingRules={packagingRules}
              palletGrid={palletGrid}
              palletSlotCenters={palletSlotCenters}
              isDark={isDark}
              onBoxHover={showBoxTooltip}
            />

            <div className="absolute top-4 left-4 bg-white/95 dark:bg-gray-800/95 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-xl z-20 text-xs pointer-events-none">
              <p className="font-bold text-[10px] uppercase text-brand-orange mb-1">Active space dimensions</p>
              <p className="text-gray-700 dark:text-gray-200">
                Total W x L: <span id="dim-footprint" className="font-mono font-bold">{dimFootprint}</span>
              </p>
              <p className="text-gray-700 dark:text-gray-200 mt-1">
                Max height cap: <span id="dim-maxheight" className="font-mono font-bold">{dimMaxHeight}</span>
              </p>
              <p className="text-gray-700 dark:text-gray-200 mt-1">
                TOTAL H x W x L: <span id="dim-currheight" className="font-mono font-bold">{dimCurrHeight}</span>
              </p>
            </div>

            <div
              id="overpack-warning"
              className={`${warningVisible ? "" : "hidden"} absolute top-4 right-4 bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-2 rounded-xl shadow-lg text-xs font-bold z-20 flex items-center gap-2`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
              <span id="warning-text">{warningText}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
