import { readFileSync } from "fs";
import { parseProductRow, parseLogisticsRow } from "../lib/data.ts";
import { PACKAGING_RULES } from "../lib/constants.ts";
import { ErgoventLogisticsOptimizer } from "../lib/packing/ergovent-engine.ts";
import { packLineoHorizontalLayers } from "../lib/packing/lineo-sku-layers.ts";

const csv = readFileSync("data/products.csv", "utf8");
const products = csv.trim().split(/\n/).slice(1).map((line, i) => {
  const c = line.split(",");
  return parseProductRow({ id: `p${i}`, category: c[0], code: c[1], ean_code: c[2], hs_code: c[3], name: c[4], gross_weight_kg: +c[5], net_weight_kg: +c[6], height_cm: +c[7], width_cm: +c[8], length_cm: +c[9], transport_box_qty: +c[10], transport_box_height_cm: +c[11], transport_box_width_cm: +c[12], transport_box_length_cm: +c[13], max_units_fin_pallet: c[14] ? +c[14] : null, layer_units_fin: c[15] ? +c[15] : null, max_layers_fin: c[16] ? +c[16] : null, sort_order: i }, i);
}).filter(Boolean);
const ln500 = products.find((p) => p.name.includes("LINEO-500") && p.code === "LN75.120.101");
const ln600 = products.find((p) => p.code === "LN75.120.201");
const packs = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, sku: ln500.code, name: ln500.name, w: ln500.boxW, l: ln500.boxL, h: ln500.boxH, weight: 1, priority: 4, color: 1, product: ln500, pack: {} })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, sku: ln600.code, name: ln600.name, w: ln600.boxW, l: ln600.boxL, h: ln600.boxH, weight: 1, priority: 4, color: 1, product: ln600, pack: {} })),
];
const engine = new ErgoventLogisticsOptimizer({ transport: { maxH: 250 }, getAllowedFootprint: () => ({ w: 110, l: 130 }), getBaseHeight: () => 15 }, {});
const ctx = {
  packWidth: 110,
  packLength: 130,
  packHeight: 235,
  getFlatRotations: () => [],
  isValidPlacement: (c, w, l, h, packed, obs) => engine.isValidPlacement(c, w, l, h, packed, obs),
};
const r1 = packLineoHorizontalLayers(packs.slice(0, 8), 0, [], [], ctx, 6);
console.log("r1", r1.placed.length, r1.endY);
const r2 = packLineoHorizontalLayers(packs.slice(8), r1.endY, r1.placed, [], ctx, 6);
console.log("r2", r2.placed.length, r2.remaining.length, r2.endY);
console.log("total", r1.placed.length + r2.placed.length);
