import { GROUP_COLORS, PRODUCT_PALETTES } from "./constants";
import type { Product } from "./types";

export function priorityForGroup(group: string): number {
  if (group === "Gypsum diffusers") return 2;
  if (
    group === "LINEO (75mm)" ||
    group === "LINEO PRO ventilation diffusers" ||
    group === "LINEO PRO CONDI diffusers for A/C & ventilation"
  ) {
    return 3;
  }
  if (group === "AERO PRO") return 4;
  if (group === "Moulages") return 5;
  if (group === "Marketing displays") return 6;
  return 7;
}

export function isStandProduct(product: Pick<Product, "name">): boolean {
  const name = product.name.toUpperCase();
  return name.includes("METAL STAND") || name.includes("TRAFFIC LIGHT");
}

export function productPlacementPriority(product: Product): number {
  if (isStandProduct(product)) return 1;
  return priorityForGroup(product.cat);
}

export function paletteColor(paletteName: string, index: number): number {
  const palette = PRODUCT_PALETTES[paletteName] || [0xff671f];
  return palette[Math.max(0, Math.min(palette.length - 1, index))];
}

export function productSortRank(product: Product): number {
  const name = product.name.toUpperCase();
  const code = product.code.toUpperCase();
  if (product.cat === "Gypsum diffusers") {
    const order = ["RN100", "RN125", "RN150", "RN160", "RN100.CO", "RN125.CO", "KV100", "KV125"];
    return order.indexOf(code) >= 0 ? order.indexOf(code) : 999;
  }
  if (product.cat === "LINEO (75mm)") {
    if (name.includes("LINEO-500")) return 0;
    if (name.includes("LINEO-600") || name.includes("HORIZONTAL")) return 1;
    if (name.includes("LINEO 600 VERTICAL")) return 2;
    return 999;
  }
  if (product.cat === "LINEO PRO ventilation diffusers") {
    const subGroupOffset = product.subGroup.startsWith("2") ? 100 : 0;
    if (name.includes("SINGLE") && name.includes("75")) return 0;
    if (name.includes("SINGLE") && name.includes("90")) return 1;
    if (name.includes("PROFILE") && name.includes("75")) return 2;
    if (name.includes("PROFILE") && name.includes("90")) return 3;
    if (name.includes("PUZZLE") && name.includes("75")) return subGroupOffset + 4;
    if (name.includes("PUZZLE") && name.includes("90")) return subGroupOffset + 5;
    return 999;
  }
  if (product.cat === "LINEO PRO CONDI diffusers for A/C & ventilation") {
    if (name.includes("125") && !name.includes("2 SLOT")) return 0;
    if (name.includes("125") && name.includes("2 SLOT")) return 1;
    if (name.includes("150")) return 2;
    if (name.includes("160")) return 3;
    return 999;
  }
  if (product.cat === "Moulages") {
    const subGroupOffset = product.subGroup.startsWith("2") ? 100 : 0;
    if (name.includes("200 MM")) return subGroupOffset + 0;
    if (name.includes("500 MM")) return subGroupOffset + 1;
    if (name.includes("1050 MM") || name.includes("1000 MM")) return subGroupOffset + 2;
    if (name.includes("ROUNDED")) return subGroupOffset + 3;
    if (name.includes("RIGHT ANGLE")) return subGroupOffset + 4;
    return subGroupOffset + 999;
  }
  if (product.cat === "Spare parts and accessories (Gypsum and LINEO)") {
    if (code.startsWith("LN") || code.startsWith("LP")) return 100;
    return 0;
  }
  return 999;
}

export function productVisualColor(product: Product): number {
  if (isStandProduct(product)) return paletteColor("stand", 0);
  if (product.cat === "Gypsum diffusers") return paletteColor("gypsum", productSortRank(product));
  if (product.cat === "LINEO (75mm)") return paletteColor("lineo", productSortRank(product));
  if (product.cat === "LINEO PRO ventilation diffusers") {
    return paletteColor("lineoPro", productSortRank(product) % 100);
  }
  if (product.cat === "LINEO PRO CONDI diffusers for A/C & ventilation") {
    return paletteColor("condi", productSortRank(product));
  }
  if (product.cat === "Moulages") return paletteColor("moulages", productSortRank(product) % 100);
  if (product.cat === "AERO PRO") return paletteColor("aero", productSortRank(product));
  if (product.cat === "Spare parts and accessories (Gypsum and LINEO)") {
    return paletteColor("spare", productSortRank(product) % 4);
  }
  if (product.cat === "Marketing displays") {
    return paletteColor("display", product.name.toUpperCase().includes("DEMO") ? 1 : 0);
  }
  return GROUP_COLORS[product.cat] || 0xff671f;
}
