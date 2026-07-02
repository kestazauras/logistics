import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseDelimited(text) {
  const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(value);
      if (row.some((c) => c !== "")) rows.push(row);
      row = []; value = "";
    } else value += char;
  }
  row.push(value);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

function sqlStr(v) {
  if (v === undefined || v === null || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlNum(v) {
  if (v === undefined || v === null || v === "") return "NULL";
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? String(n) : "NULL";
}

function sqlInt(v) {
  if (v === undefined || v === null || v === "") return "NULL";
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? String(n) : "NULL";
}

const productsCsv = fs.readFileSync(path.join(root, "data/products.csv"), "utf8");
const logisticsCsv = fs.readFileSync(path.join(root, "data/logistics.csv"), "utf8");
const productRows = parseDelimited(productsCsv.trim()).slice(1);
const logisticsRows = parseDelimited(logisticsCsv.trim()).slice(1);

let sql = "TRUNCATE public.logistics_products, public.logistics_options, public.logistics_packaging_rules, public.logistics_packing_config RESTART IDENTITY CASCADE;\n\n";

productRows.forEach((row, i) => {
  if (!row[1] && !row[4]) return;
  sql += `INSERT INTO public.logistics_products (category,code,ean_code,hs_code,name,gross_weight_kg,net_weight_kg,height_cm,width_cm,length_cm,transport_box_qty,transport_box_height_cm,transport_box_length_cm,transport_box_width_cm,max_units_fin_pallet,layer_units_fin,max_layers_fin,sort_order) VALUES (${sqlStr(row[0])},${sqlStr(row[1])},${sqlStr(row[2])},${sqlStr(row[3])},${sqlStr(row[4])},${sqlNum(row[5])},${sqlNum(row[6])},${sqlNum(row[7])},${sqlNum(row[8])},${sqlNum(row[9])},${sqlInt(row[10])},${sqlNum(row[11])},${sqlNum(row[12])},${sqlNum(row[13])},${sqlInt(row[14])},${sqlInt(row[15])},${sqlInt(row[16])},${i});\n`;
});

logisticsRows.forEach((row, i) => {
  if (!row[0]) return;
  sql += `INSERT INTO public.logistics_options (name,weight_kg,height_cm,width_cm,length_cm,internal_height_mm,internal_width_mm,internal_length_mm,max_height_cm,sort_order) VALUES (${sqlStr(row[0])},${sqlNum(row[1])},${sqlNum(row[2])},${sqlNum(row[3])},${sqlNum(row[4])},${sqlInt(row[5])},${sqlInt(row[6])},${sqlInt(row[7])},${sqlNum(row[8])},${i});\n`;
});

const rules = {
  overhang: { rule: "Loads are centered on the pallet. Allowed overhang is total extra footprint, split equally on every side.", example: "10 cm overhang means +5 cm left, +5 cm right, +5 cm front, +5 cm back.", splitAcrossSides: true, floorLoadedContainerOverhangAllowed: false },
  palletLoadedContainer: { rule: "Pallets inside a pallet-loaded container must fit within the container internal length and width. Pallet plus cargo height must not exceed internal height minus 10 cm.", palletFootprintCm: { width: 100, length: 120, height: 15 }, showPalletsInsideContainer: true, loadingSequence: "Fill one pallet position from bottom to top before loading the next pallet position." },
  rondoKvadro100125: { appliesToCodes: ["RN100", "RN125", "KV100", "KV125", "RN100.CO", "RN125.CO"], layerPattern: ["Layer A: 4 boxes along the left pallet length using 32+32+32+32 cm and 2 boxes along the right pallet length using 62+62 cm.", "Layer B: mirrored for stability, 4 boxes on the right and 2 boxes on the left."], alternatingLayers: true },
  floorLoadedContainer: { rule: "No pallet and no overhang. Products are stacked from the container floor up. Container internal length, width and height are the hard limits.", example: "40HQ floor-loaded container should be evaluated by internal dimensions only for RONDO/KVADRO 100/125 capacity." },
  lineoLayering: { rule: "If LINEO models fit by pallet length and width, alternate layers by 90 degrees.", alternatingLayers: true },
  rondoKvadroFullLayer: { rule: "Pallet orders for RONDO/KVADRO/COANDA gypsum diffusers should complete stable full layers.", smallModelCodes: ["RN100", "RN125", "KV100", "KV125", "RN100.CO", "RN125.CO"], smallLayerUnits: 24, largeModelCodes: ["RN150", "RN160"], largeLayerUnits: 18, appliesToPalletOrdersOnly: true },
  centering: { palletRule: "Products placed on pallets are centered so opposite-side overhang is identical. Partial layers are placed in the middle, not from one side.", floorLoadedContainerRule: "Floor-loaded containers are filled from the centered bottom position at the farthest wall. One vertical column is filled before moving to the next column." },
  placementPriority: [
    { rank: 1, label: "Metal stand and traffic light stand", rule: "Always centered on the pallet bottom. Other items can be placed around them if they fit, but never below or on top of them." },
    { rank: 2, label: "Gypsum diffusers" },
    { rank: 3, label: "LINEO PRO diffusers and LINEO diffusers" },
    { rank: 4, label: "AERO PRO products" },
    { rank: 5, label: "Moulages" },
    { rank: 6, label: "Display boxes" },
    { rank: 7, label: "Spare parts and accessories" }
  ]
};

for (const [key, payload] of Object.entries(rules)) {
  sql += `INSERT INTO public.logistics_packaging_rules (rule_key, payload) VALUES (${sqlStr(key)}, '${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb);\n`;
}

const packingConfig = {
  max_capacities: { RN100: { FIN: 168, "20HQ_FLOOR": 1764 }, RN125: { FIN: 168, "20HQ_FLOOR": 1764 }, KV100: { FIN: 168, "20HQ_FLOOR": 1764 }, KV125: { FIN: 168, "20HQ_FLOOR": 1764 }, "RN100.CO": { FIN: 168, "20HQ_FLOOR": 1764 }, "RN125.CO": { FIN: 168, "20HQ_FLOOR": 1764 }, RN150: { FIN: 126 }, RN160: { FIN: 126 } },
  group_order: ["Gypsum diffusers", "LINEO (75mm)", "LINEO PRO ventilation diffusers", "LINEO PRO CONDI diffusers for A/C & ventilation", "Moulages", "AERO PRO", "Spare parts and accessories (Gypsum and LINEO)", "Marketing displays"],
  order_export_columns: ["Product code", "Product name", "Quantity", "Gross weight", "Net weight", "Total"]
};

for (const [key, payload] of Object.entries(packingConfig)) {
  sql += `INSERT INTO public.logistics_packing_config (config_key, payload) VALUES (${sqlStr(key)}, '${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb);\n`;
}

const out = path.join(root, "scripts/seed-generated.sql");
fs.writeFileSync(out, sql);
console.log(`Wrote ${out} (${sql.length} bytes)`);
