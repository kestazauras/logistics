import type { PackagingRules, Product } from "./types";

export const ENGINE_PRIORITY = {
  STANDS: 0,
  RONDO_KV100_125: 1,
  LINEO_PRO: 2,
  RONDO_150_160: 3,
  LINEO: 4,
  MOUL_AERO: 5,
  DEMO_BOX: 6,
  SPARE_PARTS: 7,
} as const;

export type MaxCapacities = Record<string, Record<string, number>>;

export function resolveMaxCapacities(
  maxCapacities: MaxCapacities | undefined,
  fallback: MaxCapacities,
): MaxCapacities {
  if (!maxCapacities || !Object.keys(maxCapacities).length) return fallback;
  return maxCapacities;
}

/** SKU-level packing priority — preserves index.html engine ordering. */
export function resolveEnginePriority(product: Pick<Product, "code" | "name">): number {
  const sku = (product.code || "").toUpperCase();
  const name = (product.name || "").toUpperCase();

  if (sku.includes("STAND") || name.includes("METAL STAND") || name.includes("TRAFFIC LIGHT")) {
    return ENGINE_PRIORITY.STANDS;
  }
  if (
    ["RN100", "RN125", "KV100", "KV125", "RN100.CO", "RN125.CO"].includes(sku) ||
    name.includes("RONDO-100") ||
    name.includes("RONDO-125") ||
    name.includes("KVADRO-100") ||
    name.includes("KVADRO-125") ||
    name.includes("COANDA-100") ||
    name.includes("COANDA-125")
  ) {
    return ENGINE_PRIORITY.RONDO_KV100_125;
  }
  if (
    sku.startsWith("LP") &&
    !sku.startsWith("LPM") &&
    !sku.startsWith("LND") &&
    !sku.startsWith("LP.P") &&
    !sku.startsWith("LPB")
  ) {
    return ENGINE_PRIORITY.LINEO_PRO;
  }
  if (["RN150", "RN160"].includes(sku) || name.includes("RONDO-150") || name.includes("RONDO-160")) {
    return ENGINE_PRIORITY.RONDO_150_160;
  }
  if (sku.startsWith("LN")) return ENGINE_PRIORITY.LINEO;
  if (sku.startsWith("LPM") || sku.startsWith("AE75") || sku.includes("D75-C")) {
    return ENGINE_PRIORITY.MOUL_AERO;
  }
  if (name.includes("DEMO BOX") || sku.includes("DEMO")) return ENGINE_PRIORITY.DEMO_BOX;
  return ENGINE_PRIORITY.SPARE_PARTS;
}

export function placementPriorityRanks(rules: PackagingRules): Array<{ rank: number; label: string; rule?: string }> {
  return rules.placementPriority ?? [];
}
