import { readFileSync } from "fs";
import { parseProductRow } from "../lib/data.ts";
import { buildLineoGridLayer, lineoFamilyCellSize } from "../lib/packing/lineo-grid.ts";
import { ErgoventLogisticsOptimizer } from "../lib/packing/ergovent-engine.ts";

const csv = readFileSync("data/products.csv", "utf8");
const products = csv.trim().split(/\n/).slice(1).map((line, i) => {
  const c = line.split(",");
  return parseProductRow({ id: `p${i}`, category: c[0], code: c[1], ean_code: c[2], hs_code: c[3], name: c[4], gross_weight_kg: +c[5], net_weight_kg: +c[6], height_cm: +c[7], width_cm: +c[8], length_cm: +c[9], transport_box_qty: +c[10], transport_box_height_cm: +c[11], transport_box_width_cm: +c[12], transport_box_length_cm: +c[13], max_units_fin_pallet: c[14] ? +c[14] : null, layer_units_fin: c[15] ? +c[15] : null, max_layers_fin: c[16] ? +c[16] : null, sort_order: i }, i);
}).filter(Boolean);
const ln500 = products.find((p) => p.name.includes("LINEO-500") && p.code === "LN75.120.101");
const ln600 = products.find((p) => p.code === "LN75.120.201");
const packs500 = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, sku: ln500.code, name: ln500.name, w: ln500.boxW, l: ln500.boxL, h: ln500.boxH, weight: 1, priority: 4, color: 1, product: ln500, pack: {} }));
const packs600 = Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, sku: ln600.code, name: ln600.name, w: ln600.boxW, l: ln600.boxL, h: ln600.boxH, weight: 1, priority: 4, color: 1, product: ln600, pack: {} }));
const { cellW, cellL } = lineoFamilyCellSize([...packs500, ...packs600]);
const layer1 = buildLineoGridLayer(packs500, 0, 110, 130, 0, false, 6, [], cellW, cellL);
console.log("layer1", layer1?.length, layer1?.map((p) => [p.x, p.z, p.w, p.h]));
const layer2 = buildLineoGridLayer(packs600, 18, 110, 130, 1, false, 6, layer1 || [], cellW, cellL);
console.log("layer2", layer2?.length, layer2?.map((p) => [p.x, p.z, p.w, p.h]));
const engine = new ErgoventLogisticsOptimizer(
  { transport: { maxH: 250 }, getAllowedFootprint: () => ({ w: 110, l: 130 }), getBaseHeight: () => 15 },
  {},
);
if (layer2) {
  for (const c of layer2) {
    const ok = engine.isValidPlacement(c, 110, 130, 235, layer1 || [], []);
    console.log("valid", c.id, ok, "support", engine.getBottomSupportRatio(c, layer1 || []));
  }
}
