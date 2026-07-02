import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseProductRow, parseLogisticsRow } from "../lib/data.ts";
import { PACKAGING_RULES } from "../lib/constants.ts";
import { ErgoventLogisticsOptimizer } from "../lib/packing/ergovent-engine.ts";
import { computePlacements, createTransportContext } from "../lib/calculations.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadProducts() {
  const csv = readFileSync(join(root, "data/products.csv"), "utf8");
  return csv
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
}

function loadTransport() {
  const csv = readFileSync(join(root, "data/logistics.csv"), "utf8");
  return csv
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
}

function analyze(label, packs, overhang = 10) {
  const products = loadProducts();
  const transport = loadTransport();
  const state = {
    productData: products,
    quantities: {},
    currentTransport: transport,
    partitionedUnits: [],
    activeViewIndex: 0,
  };
  const engine = new ErgoventLogisticsOptimizer(
    createTransportContext(state, { packagingRules: PACKAGING_RULES, maxCapacities: {} }, () => overhang),
    { packagingRules: PACKAGING_RULES, maxCapacities: {} },
  );
  const layout = computePlacements(packs, engine);
  const base = transport.palletHeight || 15;
  const byLayer = {};
  const colStacks = {};
  const bySku = {};
  for (const p of layout.placements) {
    const y = Math.round((p.y - base - p.h / 2) * 10) / 10;
    byLayer[y] = (byLayer[y] || 0) + 1;
    const k = `${Math.round(p.x)},${Math.round(p.z)}`;
    colStacks[k] = (colStacks[k] || 0) + 1;
    bySku[p.sku] = (bySku[p.sku] || 0) + 1;
  }
  const maxCol = Math.max(0, ...Object.values(colStacks));
  const layerCounts = Object.values(byLayer);
  const minPerLayer = layerCounts.length ? Math.min(...layerCounts) : 0;
  console.log(`\n=== ${label} ===`);
  console.log({
    placed: layout.placements.length,
    unpacked: layout.unpacked.length,
    layers: byLayer,
    maxCol,
    minPerLayer,
    bySku,
    bad: maxCol > 2 || layout.unpacked.length > 0,
  });
  return { maxCol, unpacked: layout.unpacked.length, byLayer };
}

const products = loadProducts();
const ln500 = products.find((p) => p.name.includes("LINEO-500") && p.code === "LN75.120.101");
const ln600 = products.find((p) => p.code === "LN75.120.201");
const ln600v = products.find((p) => p.name.includes("VERTICAL"));
const lp75 = products.find((p) => p.code === "LP75.120.101");
const lp90 = products.find((p) => p.code === "LP90.120.101");

function packsFor(product, n) {
  return Array.from({ length: n }, () => ({
    product,
    pcs: 1,
    gross: product.gw,
    net: product.nw,
    volume: 1,
  }));
}

const scenarios = [
  ["16 LN500 + 3 LN600", [...packsFor(ln500, 16), ...packsFor(ln600, 3)]],
  ["16 LN500 + 4 LN600", [...packsFor(ln500, 16), ...packsFor(ln600, 4)]],
  ["16 LN500 + 5 LN600", [...packsFor(ln500, 16), ...packsFor(ln600, 5)]],
  ["16 LN500 + 5 LN600 + 5 VERT", [...packsFor(ln500, 16), ...packsFor(ln600, 5), ...packsFor(ln600v, 5)]],
  [
    "16 LN500 + 5 LN600 + 5 VERT + 6 LP75 + 4 LP90",
    [
      ...packsFor(ln500, 16),
      ...packsFor(ln600, 5),
      ...packsFor(ln600v, 5),
      ...packsFor(lp75, 6),
      ...packsFor(lp90, 4),
    ],
  ],
];

let failures = 0;
for (const [label, packs] of scenarios) {
  const r = analyze(label, packs, 10);
  if (r.maxCol > 2 || r.unpacked > 0) failures++;
}
console.log(`\n${failures} failing scenario(s)`);
process.exit(failures > 0 ? 1 : 0);
