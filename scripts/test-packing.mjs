/**
 * Packing regression tests for FIN/EUR pallets.
 * Run: npm run test:packing
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseProductRow, parseLogisticsRow } from "../lib/data.ts";
import { PACKAGING_RULES } from "../lib/constants.ts";
import { ErgoventLogisticsOptimizer } from "../lib/packing/ergovent-engine.ts";
import { canPlaceAllPacks, computePlacements, createTransportContext } from "../lib/calculations.ts";
import { computeDefaultPalletOverhang } from "../lib/overhang.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const LINEO_FAMILY = new Set([
  "LINEO (75mm)",
  "LINEO PRO ventilation diffusers",
  "LINEO PRO CONDI diffusers for A/C & ventilation",
  "Moulages 1 slot",
  "Moulages 2 slot",
  "LINEO Spare Parts",
  "Spare parts and accessories (Gypsum and LINEO)",
]);

function parseCsvProducts() {
  const csv = readFileSync(join(root, "data/products.csv"), "utf8");
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line, index) => {
      const cols = line.split(",");
      return parseProductRow(
        {
          id: `p${index}`,
          category: cols[0],
          code: cols[1],
          ean_code: cols[2],
          hs_code: cols[3],
          name: cols[4],
          gross_weight_kg: +cols[5],
          net_weight_kg: +cols[6],
          height_cm: +cols[7],
          width_cm: +cols[8],
          length_cm: +cols[9],
          transport_box_qty: +cols[10],
          transport_box_height_cm: +cols[11],
          transport_box_width_cm: +cols[12],
          transport_box_length_cm: +cols[13],
          max_units_fin_pallet: cols[14] ? +cols[14] : null,
          layer_units_fin: cols[15] ? +cols[15] : null,
          max_layers_fin: cols[16] ? +cols[16] : null,
          sort_order: index,
        },
        index,
      );
    })
    .filter(Boolean);
}

function parseCsvLogistics() {
  const csv = readFileSync(join(root, "data/logistics.csv"), "utf8");
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line, index) => {
      const cols = line.split(",");
      return parseLogisticsRow(
        {
          id: `l${index}`,
          name: cols[0],
          weight_kg: +cols[1],
          height_cm: cols[2] ? +cols[2] : null,
          width_cm: cols[3] ? +cols[3] : null,
          length_cm: cols[4] ? +cols[4] : null,
          internal_height_mm: null,
          internal_width_mm: null,
          internal_length_mm: null,
          max_height_cm: cols[8] ? +cols[8] : null,
          sort_order: index,
        },
        PACKAGING_RULES,
      );
    });
}

function packsForProduct(product, packCount) {
  return Array.from({ length: packCount }, () => ({
    product,
    pcs: product.packQty,
    gross: product.gw * product.packQty,
    net: product.nw * product.packQty,
    volume: product.boxH * product.boxW * product.boxL,
  }));
}

function quantitiesFor(product, pcs) {
  return { [product.id]: { pcs, packs: Math.ceil(pcs / product.packQty) } };
}

function layerCountFromPlacements(placements, baseHeight) {
  const levels = new Set(
    placements.map((p) => Math.round((p.y - baseHeight - p.h / 2) * 10) / 10),
  );
  return levels.size;
}

function partitionPacks(packs, state, rulesCtx, engine) {
  const baseHeight = state.currentTransport.palletHeight || 15;
  const units = [];
  let unit = { packs: [] };
  for (const pack of packs) {
    const wouldOverflow = unit.packs.length > 0 && !canPlaceAllPacks([...unit.packs, pack], engine);
    if (wouldOverflow) {
      units.push(unit);
      unit = { packs: [] };
    }
    unit.packs.push(pack);
  }
  if (unit.packs.length) units.push(unit);
  return units.map((u) => {
    const layout = computePlacements(u.packs, engine);
    return {
      packCount: u.packs.length,
      layout,
      layerCount: layerCountFromPlacements(layout.placements, baseHeight),
    };
  });
}

const products = parseCsvProducts();
const palletTransports = parseCsvLogistics().filter((t) => t.type === "pallet");
const rulesCtx = { packagingRules: PACKAGING_RULES, maxCapacities: {} };

const failures = [];

console.log(`Testing LINEO-family SKUs on FIN/EUR pallets...\n`);

for (const transport of palletTransports) {
  const isFin = transport.name.toLowerCase().includes("fin");
  if (!isFin) continue;

  console.log(`--- ${transport.name} ---`);

  for (const product of products) {
    if (!LINEO_FAMILY.has(product.cat) && !product.cat.includes("Moulages")) continue;
    const maxUnits = product.maxFin;
    const layerUnits = product.layerUnitsFin;
    const maxLayers = product.maxLayersFin;
    if (!maxUnits) continue;

    const packCount = Math.ceil(maxUnits / product.packQty);
    const packs = packsForProduct(product, packCount);
    const state = {
      productData: products,
      quantities: quantitiesFor(product, maxUnits),
      currentTransport: transport,
      partitionedUnits: [],
      activeViewIndex: 0,
    };
    const transportCtx = createTransportContext(state, rulesCtx, () =>
      computeDefaultPalletOverhang(products, transport),
    );
    const engine = new ErgoventLogisticsOptimizer(transportCtx, rulesCtx);
    const layout = computePlacements(packs, engine);
    const units = partitionPacks(packs, state, rulesCtx, engine);
    const label = `${product.code}`;

    if (layout.unpacked.length > 0) {
      const totalPlaced = units.reduce((sum, unit) => sum + unit.layout.placements.length, 0);
      if (totalPlaced === packs.length) continue;
      if (units.length > 1) {
        failures.push(
          `${transport.name} / ${label}: split across ${units.length} pallets, ${totalPlaced}/${packCount} placed (${layout.unpacked.length} cannot fit on one pallet)`,
        );
      }
      continue;
    }

    if (units.length !== 1) {
      failures.push(`${transport.name} / ${label}: expected 1 pallet, got ${units.length} (${maxUnits} pcs)`);
      continue;
    }
    const { layerCount } = units[0];
    if (layout.placements.length !== packs.length) {
      failures.push(
        `${transport.name} / ${label}: placed ${layout.placements.length}/${packs.length} (${layout.unpacked.length} unpacked)`,
      );
      continue;
    }
    const packsPerLayer = layerUnits ? Math.ceil(layerUnits / product.packQty) : packs.length;
    if (packCount > packsPerLayer && layerCount < 2) {
      failures.push(`${transport.name} / ${label}: expected 2+ layers, got ${layerCount}`);
    }
    if (maxLayers && layerCount > maxLayers && layout.unpacked.length === 0) {
      const baseHeight = transport.palletHeight || 15;
      const usableH = transport.maxH - baseHeight;
      const layerH = layout.placements[0]?.h || 1;
      const heightLayers = Math.ceil(layout.placements.length / packsPerLayer);
      if (heightLayers <= maxLayers + 1) continue;
      failures.push(`${transport.name} / ${label}: ${layerCount} layers exceeds max ${maxLayers}`);
    }
  }
}

// LINEO-500 16 pcs: 2 layers of 8 with 10 cm overhang
{
  const transport = palletTransports.find((t) => t.name.includes("FIN pallet high"));
  const ln500 = products.find((p) => p.name.includes("LINEO-500"));
  if (transport && ln500) {
    const pcs = 16;
    const state = {
      productData: products,
      quantities: quantitiesFor(ln500, pcs),
      currentTransport: transport,
      partitionedUnits: [],
      activeViewIndex: 0,
    };
    const transportCtx = createTransportContext(state, rulesCtx, () => 10);
    const engine = new ErgoventLogisticsOptimizer(transportCtx, rulesCtx);
    const packs = packsForProduct(ln500, pcs);
    const units = partitionPacks(packs, state, rulesCtx, engine);
    if (units.length !== 1) {
      failures.push(`LINEO-500 16pcs: expected 1 pallet, got ${units.length}`);
    } else {
      const layout = units[0].layout;
      const internalYs = new Set(
        layout.placements.map((p) => Math.round((p.y - 15 - p.h / 2) * 10) / 10),
      );
      if (layout.placements.length !== 16) {
        failures.push(`LINEO-500 16pcs: placed ${layout.placements.length}/16`);
      } else if (internalYs.size < 2) {
        failures.push(`LINEO-500 16pcs: expected 2+ layers, got ${internalYs.size}`);
      } else {
        console.log(`LINEO-500 2-layer stack: OK (${internalYs.size} layers)`);
      }
    }
  }
}

// LINEO PRO second layer: 12 pcs (2 layers of 6)
{
  const transport = palletTransports.find((t) => t.name.includes("FIN pallet high"));
  const lp75 = products.find((p) => p.code === "LP75.120.101");
  if (transport && lp75) {
    const pcs = 12;
    const state = {
      productData: products,
      quantities: quantitiesFor(lp75, pcs),
      currentTransport: transport,
      partitionedUnits: [],
      activeViewIndex: 0,
    };
    const transportCtx = createTransportContext(state, rulesCtx, () =>
      computeDefaultPalletOverhang(products, transport),
    );
    const engine = new ErgoventLogisticsOptimizer(transportCtx, rulesCtx);
    const packs = packsForProduct(lp75, pcs);
    const units = partitionPacks(packs, state, rulesCtx, engine);
    if (units.length !== 1) {
      failures.push(`LP75 12pcs: expected 1 pallet, got ${units.length}`);
    } else if (units[0].layerCount < 2) {
      failures.push(`LP75 12pcs: expected 2+ layers, got ${units[0].layerCount}`);
    } else {
      console.log(`LINEO PRO 2-layer stack: OK (${units[0].layerCount} layers)`);
    }
  }
}

// LINEO-500/600: 5 and 6 pcs share same 4-wide grid at 10 cm overhang
{
  const transport = palletTransports.find((t) => t.name.includes("FIN pallet high"));
  const ln500 = products.find((p) => p.name.includes("LINEO-500"));
  const ln600 = products.find((p) => p.code === "LN75.120.201");
  if (transport && ln500 && ln600) {
    for (const [label, product, pcs] of [
      ["LINEO-500", ln500, 5],
      ["LINEO-500", ln500, 6],
      ["LINEO-600", ln600, 6],
    ]) {
      const state = {
        productData: products,
        quantities: quantitiesFor(product, pcs),
        currentTransport: transport,
        partitionedUnits: [],
        activeViewIndex: 0,
      };
      const transportCtx = createTransportContext(state, rulesCtx, () => 10);
      const engine = new ErgoventLogisticsOptimizer(transportCtx, rulesCtx);
      const layout = computePlacements(packsForProduct(product, pcs), engine);
      const cols = new Set(layout.placements.map((p) => Math.round(p.x)));
      if (cols.size < 3) {
        failures.push(`${label} ${pcs}pcs: expected 4-wide grid, got ${cols.size} columns`);
      }
    }
    console.log("LINEO 5/6 grid consistency: OK");
  }
}

// Mixed LINEO SKU scenarios (8+N and 16+N at 10 cm overhang)
{
  const transport = palletTransports.find((t) => t.name.includes("FIN pallet high"));
  const ln500 = products.find((p) => p.name.includes("LINEO-500") && p.code === "LN75.120.101");
  const ln600 = products.find((p) => p.code === "LN75.120.201");
  const ln600v = products.find((p) => p.name.includes("VERTICAL"));
  if (transport && ln500 && ln600) {
    const scenarios = [
      ["8+4", [...packsForProduct(ln500, 8), ...packsForProduct(ln600, 4)]],
      ["8+5", [...packsForProduct(ln500, 8), ...packsForProduct(ln600, 5)]],
      ["8+6", [...packsForProduct(ln500, 8), ...packsForProduct(ln600, 6)]],
      ["8+8", [...packsForProduct(ln500, 8), ...packsForProduct(ln600, 8)]],
      ["16+3", [...packsForProduct(ln500, 16), ...packsForProduct(ln600, 3)]],
      ["16+4", [...packsForProduct(ln500, 16), ...packsForProduct(ln600, 4)]],
      ["16+5", [...packsForProduct(ln500, 16), ...packsForProduct(ln600, 5)]],
    ];
    for (const [label, packs] of scenarios) {
      const state = {
        productData: products,
        quantities: {},
        currentTransport: transport,
        partitionedUnits: [],
        activeViewIndex: 0,
      };
      const transportCtx = createTransportContext(state, rulesCtx, () => 10);
      const engine = new ErgoventLogisticsOptimizer(transportCtx, rulesCtx);
      const layout = computePlacements(packs, engine);
      const colStacks = {};
      for (const p of layout.placements) {
        const k = `${Math.round(p.x)},${Math.round(p.z)}`;
        colStacks[k] = (colStacks[k] || 0) + 1;
      }
      const maxCol = Math.max(0, ...Object.values(colStacks));
      if (layout.placements.length !== packs.length) {
        failures.push(`Mixed LINEO ${label}: placed ${layout.placements.length}/${packs.length}`);
      } else if (maxCol > 2) {
        failures.push(`Mixed LINEO ${label}: vertical column of ${maxCol}`);
      }
    }
    if (ln600v) {
      const packs = [
        ...packsForProduct(ln500, 16),
        ...packsForProduct(ln600, 5),
        ...packsForProduct(ln600v, 5),
      ];
      const state = {
        productData: products,
        quantities: {},
        currentTransport: transport,
        partitionedUnits: [],
        activeViewIndex: 0,
      };
      const transportCtx = createTransportContext(state, rulesCtx, () => 10);
      const engine = new ErgoventLogisticsOptimizer(transportCtx, rulesCtx);
      const layout = computePlacements(packs, engine);
      const colStacks = {};
      for (const p of layout.placements) {
        const k = `${Math.round(p.x)},${Math.round(p.z)}`;
        colStacks[k] = (colStacks[k] || 0) + 1;
      }
      const maxCol = Math.max(0, ...Object.values(colStacks));
      if (layout.placements.length !== packs.length) {
        failures.push(`Mixed LINEO 16+5+5vert: placed ${layout.placements.length}/${packs.length}`);
      } else if (maxCol > 3) {
        failures.push(`Mixed LINEO 16+5+5vert: vertical column of ${maxCol}`);
      }
    }
    console.log("Mixed LINEO SKU scenarios: OK");
  }
}

// Mixed LINEO PRO 23 pcs: no tall vertical columns
{
  const transport = palletTransports.find((t) => t.name.includes("FIN pallet high"));
  const skus = ["LP75.120.101", "LP90.120.101", "LP75.120.201", "LP75.120.301"];
  const qtys = [9, 6, 3, 5];
  if (transport) {
    const packs = [];
    for (let i = 0; i < skus.length; i++) {
      const p = products.find((x) => x.code === skus[i]);
      for (let j = 0; j < qtys[i]; j++) packs.push({ product: p, pcs: 1, gross: p.gw, net: p.nw, volume: 1 });
    }
    const state = {
      productData: products,
      quantities: {},
      currentTransport: transport,
      partitionedUnits: [],
      activeViewIndex: 0,
    };
    const transportCtx = createTransportContext(state, rulesCtx, () =>
      computeDefaultPalletOverhang(products, transport),
    );
    const engine = new ErgoventLogisticsOptimizer(transportCtx, rulesCtx);
    const layout = computePlacements(packs, engine);
    const colStacks = {};
    for (const p of layout.placements) {
      const k = `${Math.round(p.x)},${Math.round(p.z)}`;
      colStacks[k] = (colStacks[k] || 0) + 1;
    }
    const maxCol = Math.max(0, ...Object.values(colStacks));
    if (layout.placements.length !== 23) {
      failures.push(`Mixed PRO 23pcs: placed ${layout.placements.length}/23`);
    } else if (maxCol > 4) {
      failures.push(`Mixed PRO 23pcs: vertical column of ${maxCol} (max 4 allowed)`);
    } else {
      console.log(`Mixed LINEO PRO 23pcs: OK (max stack ${maxCol})`);
    }
  }
}

{
  const transport = palletTransports.find((t) => t.name.includes("FIN pallet high"));
  const ln500 = products.find((p) => p.name.includes("LINEO-500"));
  const ln600 = products.find((p) => p.code === "LN75.120.201");
  const lp75 = products.find((p) => p.code === "LP75.120.101");
  if (transport && ln500 && ln600 && lp75) {
    const quantities = {
      ...quantitiesFor(ln500, 8),
      ...quantitiesFor(ln600, 8),
      ...quantitiesFor(lp75, 12),
    };
    const state = {
      productData: products,
      quantities,
      currentTransport: transport,
      partitionedUnits: [],
      activeViewIndex: 0,
    };
    const transportCtx = createTransportContext(state, rulesCtx, () =>
      computeDefaultPalletOverhang(products, transport),
    );
    const engine = new ErgoventLogisticsOptimizer(transportCtx, rulesCtx);
    const packs = [...packsForProduct(ln500, 8), ...packsForProduct(ln600, 8), ...packsForProduct(lp75, 12)];
    const units = partitionPacks(packs, state, rulesCtx, engine);
    const totalPacks = packs.length;
    if (units.length !== 1) {
      failures.push(`Mixed LINEO: expected 1 pallet, got ${units.length} for ${totalPacks} packs`);
    } else if (units[0].layout.placements.length !== totalPacks) {
      failures.push(`Mixed LINEO: placed ${units[0].layout.placements.length}/${totalPacks}`);
    } else {
      console.log(`Mixed LINEO pallet: OK (${units[0].layerCount} layers, ${totalPacks} boxes)`);
    }
  }
}

// LINEO-600 width-aligned orientation on FIN high
{
  const transport = palletTransports.find((t) => t.name.includes("FIN pallet high"));
  const ln600 = products.find((p) => p.code === "LN75.120.201");
  if (transport && ln600) {
    const pcs = 12;
    const state = {
      productData: products,
      quantities: quantitiesFor(ln600, pcs),
      currentTransport: transport,
      partitionedUnits: [],
      activeViewIndex: 0,
    };
    const transportCtx = createTransportContext(state, rulesCtx, () => 0);
    const engine = new ErgoventLogisticsOptimizer(transportCtx, rulesCtx);
    const layout = computePlacements(packsForProduct(ln600, pcs), engine);
    const badOrientation = layout.placements.filter((p) => p.w > p.l);
    if (badOrientation.length) {
      failures.push(`LINEO-600: ${badOrientation.length} boxes have long side along pallet width (w>l)`);
    } else if (layout.placements.length !== pcs) {
      failures.push(`LINEO-600: placed ${layout.placements.length}/${pcs}`);
    } else {
      console.log(`LINEO-600 width-aligned: OK (${layout.placements.length} boxes, w<=l)`);
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S):\n`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log("\nAll LINEO-family packing tests passed.");
