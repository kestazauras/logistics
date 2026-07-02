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
const transport = readFileSync(join(root, "data/logistics.csv"), "utf8")
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
const ln500 = products.find((p) => p.name.includes("LINEO-500") && p.code === "LN75.120.101");
const ln600 = products.find((p) => p.code === "LN75.120.201");
const base = transport.palletHeight || 15;

function test(n600, oh = 10) {
  const packs = [
    ...Array.from({ length: 8 }, () => ({ product: ln500, pcs: 1, gross: 1, net: 1, volume: 1 })),
    ...Array.from({ length: n600 }, () => ({ product: ln600, pcs: 1, gross: 1, net: 1, volume: 1 })),
  ];
  const state = {
    productData: products,
    quantities: {},
    currentTransport: transport,
    partitionedUnits: [],
    activeViewIndex: 0,
  };
  const e = new ErgoventLogisticsOptimizer(
    createTransportContext(state, { packagingRules: PACKAGING_RULES, maxCapacities: {} }, () => oh),
    { packagingRules: PACKAGING_RULES, maxCapacities: {} },
  );
  const l = computePlacements(packs, e);
  const byY = {};
  const cols = {};
  for (const p of l.placements) {
    const y = Math.round((p.y - base - p.h / 2) * 10) / 10;
    byY[y] = (byY[y] || 0) + 1;
    const k = `${Math.round(p.x)},${Math.round(p.z)}`;
    cols[k] = (cols[k] || 0) + 1;
  }
  const maxCol = Math.max(0, ...Object.values(cols));
  const minLayer = Math.min(...Object.values(byY));
  console.log(`8+${n600} oh${oh}`, {
    placed: l.placements.length,
    unpacked: l.unpacked.length,
    byY,
    maxCol,
    minLayer,
  });
}

for (const n of [4, 5, 6, 7, 8]) {
  test(n, 10);
  test(n, 0);
}
