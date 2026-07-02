import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseProductRow, parseLogisticsRow } from "../lib/data.ts";
import { PACKAGING_RULES } from "../lib/constants.ts";
import { ErgoventLogisticsOptimizer } from "../lib/packing/ergovent-engine.ts";
import { computePlacements, createTransportContext } from "../lib/calculations.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csv = readFileSync(join(root, "data/products.csv"), "utf8");
const products = csv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line, i) => {
    const c = line.split(",");
    return parseProductRow(
      {
        id: `p${i}`,
        category: c[0],
        code: c[1],
        ean_code: c[2],
        hs_code: c[3],
        name: c[4],
        gross_weight_kg: +c[5],
        net_weight_kg: +c[6],
        height_cm: +c[7],
        width_cm: +c[8],
        length_cm: +c[9],
        transport_box_qty: +c[10],
        transport_box_height_cm: +c[11],
        transport_box_width_cm: +c[12],
        transport_box_length_cm: +c[13],
        max_units_fin_pallet: c[14] ? +c[14] : null,
        layer_units_fin: c[15] ? +c[15] : null,
        max_layers_fin: c[16] ? +c[16] : null,
        sort_order: i,
      },
      i,
    );
  })
  .filter(Boolean);

const logCsv = readFileSync(join(root, "data/logistics.csv"), "utf8");
const transport = logCsv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line, i) => {
    const c = line.split(",");
    return parseLogisticsRow(
      {
        id: `l${i}`,
        name: c[0],
        weight_kg: +c[1],
        height_cm: c[2] ? +c[2] : null,
        width_cm: c[3] ? +c[3] : null,
        length_cm: c[4] ? +c[4] : null,
        internal_height_mm: null,
        internal_width_mm: null,
        internal_length_mm: null,
        max_height_cm: c[8] ? +c[8] : null,
        sort_order: i,
      },
      PACKAGING_RULES,
    );
  })
  .find((t) => t.name.includes("FIN pallet high"));

function summarize(layout, transport) {
  const base = transport.palletHeight || 15;
  const byLayer = {};
  const colStacks = {};
  const xs = new Set();
  for (const p of layout.placements) {
    const y = Math.round((p.y - base - p.h / 2) * 10) / 10;
    byLayer[y] = (byLayer[y] || 0) + 1;
    const k = `${Math.round(p.x)},${Math.round(p.z)}`;
    colStacks[k] = (colStacks[k] || 0) + 1;
    xs.add(Math.round(p.x));
  }
  return {
    placed: layout.placements.length,
    unpacked: layout.unpacked.length,
    byLayer,
    maxCol: Math.max(0, ...Object.values(colStacks)),
    cols: xs.size,
    firstW: layout.placements[0]?.w,
  };
}

function pack(product, pcs, oh = 10) {
  const packs = Array.from({ length: pcs }, () => ({
    product,
    pcs: 1,
    gross: product.gw,
    net: product.nw,
    volume: 1,
  }));
  const state = {
    productData: products,
    quantities: { [product.id]: { pcs, packs: pcs } },
    currentTransport: transport,
    partitionedUnits: [],
    activeViewIndex: 0,
  };
  const engine = new ErgoventLogisticsOptimizer(
    createTransportContext(state, { packagingRules: PACKAGING_RULES, maxCapacities: {} }, () => oh),
    { packagingRules: PACKAGING_RULES, maxCapacities: {} },
  );
  return summarize(computePlacements(packs, engine), transport);
}

const ln500 = products.find((p) => p.name.includes("LINEO-500"));
const ln600 = products.find((p) => p.code === "LN75.120.201");
const lp75 = products.find((p) => p.code === "LP75.120.101");

for (const [label, fn] of [
  ["LN500 5", () => pack(ln500, 5)],
  ["LN500 6", () => pack(ln500, 6)],
  ["LN600 5", () => pack(ln600, 5)],
  ["LN600 6", () => pack(ln600, 6)],
  ["LP75 6", () => pack(lp75, 6)],
  ["LP75 7 oh10", () => pack(lp75, 7, 10)],
  ["LP75 7 oh44", () => pack(lp75, 7, 44)],
]) {
  console.log(label, fn());
}

const skus = ["LP75.120.101", "LP90.120.101", "LP75.120.201", "LP75.120.301"];
const qtys = [9, 6, 3, 5];
const packs = [];
for (let i = 0; i < skus.length; i++) {
  const p = products.find((x) => x.code === skus[i]);
  for (let j = 0; j < qtys[i]; j++) {
    packs.push({ product: p, pcs: 1, gross: p.gw, net: p.nw, volume: 1 });
  }
}
const state = {
  productData: products,
  quantities: {},
  currentTransport: transport,
  partitionedUnits: [],
  activeViewIndex: 0,
};
const engine = new ErgoventLogisticsOptimizer(
  createTransportContext(state, { packagingRules: PACKAGING_RULES, maxCapacities: {} }, () => 44),
  { packagingRules: PACKAGING_RULES, maxCapacities: {} },
);
console.log("Mixed PRO 23", summarize(computePlacements(packs, engine), transport));
