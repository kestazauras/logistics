import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseProductRow, parseLogisticsRow } from "../lib/data.ts";
import { PACKAGING_RULES } from "../lib/constants.ts";
import { computeDefaultPalletOverhang, requiredOverhangForProduct } from "../lib/overhang.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csv = readFileSync(join(root, "data/products.csv"), "utf8");
const products = csv
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

const logLine = readFileSync(join(root, "data/logistics.csv"), "utf8").trim().split(/\r?\n/)[1];
const fin = parseLogisticsRow(
  {
    id: "l0",
    name: logLine.split(",")[0],
    weight_kg: 20,
    height_cm: 15,
    width_cm: 100,
    length_cm: 120,
    max_height_cm: 250,
    sort_order: 0,
    internal_height_mm: null,
    internal_width_mm: null,
    internal_length_mm: null,
  },
  PACKAGING_RULES,
);

console.log("FIN high default overhang:", computeDefaultPalletOverhang(products, fin), "cm");
const top = products
  .map((p) => ({ code: p.code, oh: requiredOverhangForProduct(p, 100, 120) }))
  .filter((x) => x.oh > 0)
  .sort((a, b) => b.oh - a.oh)
  .slice(0, 8);
console.log("Top drivers:", top);
