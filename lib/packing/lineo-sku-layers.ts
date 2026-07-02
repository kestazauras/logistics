import type { ExpandedItem } from "../types";
import { lineoPlanarOrientation, maxLineoUnitsPerLayer } from "./lineo-grid";

export interface LineoSkuBatch {
  items: ExpandedItem[];
  sku: string;
  layerCapacity: number;
  fullLayers: number;
  remainder: number;
  footprintArea: number;
  maxHeight: number;
}

export function buildLineoSkuBatches(
  items: ExpandedItem[],
  packWidth: number,
  packLength: number,
): LineoSkuBatch[] {
  const bySku = new Map<string, ExpandedItem[]>();
  for (const item of items) {
    const key = item.product.id || `${item.sku}::${item.product.name}`;
    if (!bySku.has(key)) bySku.set(key, []);
    bySku.get(key)!.push(item);
  }

  const batches: LineoSkuBatch[] = [];
  for (const [, skuItems] of bySku) {
    const first = skuItems[0];
    const sku = first.sku || first.product.code;
    const oriented = lineoPlanarOrientation(first.w, first.l, first.h, 0, false);
    const layerCapacity = maxLineoUnitsPerLayer(
      24,
      oriented.w,
      oriented.l,
      packWidth,
      packLength,
    );
    const count = skuItems.length;
    batches.push({
      items: skuItems,
      sku,
      layerCapacity,
      fullLayers: layerCapacity > 0 ? Math.floor(count / layerCapacity) : 0,
      remainder: layerCapacity > 0 ? count % layerCapacity : count,
      footprintArea: oriented.w * oriented.l,
      maxHeight: Math.max(...skuItems.map((item) => item.h)),
    });
  }

  batches.sort((a, b) => {
    if (b.fullLayers !== a.fullLayers) return b.fullLayers - a.fullLayers;
    if (b.footprintArea !== a.footprintArea) return b.footprintArea - a.footprintArea;
    if (b.maxHeight !== a.maxHeight) return b.maxHeight - a.maxHeight;
    return b.items.length - a.items.length;
  });

  return batches;
}
