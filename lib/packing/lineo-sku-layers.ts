import type { ExpandedItem, Obstacle, PlacedItem } from "../types";
import {
  buildLineoGridLayer,
  lineoFamilyCellSize,
  lineoPlanarOrientation,
  maxLineoUnitsPerLayer,
} from "./lineo-grid";
import type { FlexPackerContext } from "./flex-rectangle-packer";

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

/** Full layers of one SKU, then partial; larger footprints before smaller. */
export function lineoSkuOrderedSubgroups(
  items: ExpandedItem[],
  packWidth: number,
  packLength: number,
): ExpandedItem[][] {
  return buildLineoSkuBatches(items, packWidth, packLength).map((batch) => batch.items);
}

function poolSortScore(remaining: number, layerCapacity: number, footprintArea: number): number {
  const fullLayers = layerCapacity > 0 ? Math.floor(remaining / layerCapacity) : 0;
  return fullLayers * 1_000_000 + footprintArea * 100 + remaining;
}

/** Pack one horizontal layer at a time; full SKU layers before partial remainders. */
export function packLineoHorizontalLayers(
  items: ExpandedItem[],
  startY: number,
  existingPacked: PlacedItem[],
  obstacles: Obstacle[],
  ctx: FlexPackerContext,
  lineoLayerUnitsFin: number,
): { placed: PlacedItem[]; remaining: ExpandedItem[]; endY: number } {
  const batches = buildLineoSkuBatches(items, ctx.packWidth, ctx.packLength);
  const pools = batches.map((batch) => ({ ...batch, remaining: [...batch.items] }));
  const { cellW, cellL } = lineoFamilyCellSize(items);
  const familyCapacity = maxLineoUnitsPerLayer(24, cellW, cellL, ctx.packWidth, ctx.packLength);
  for (const pool of pools) {
    pool.layerCapacity = familyCapacity > 0 ? familyCapacity : pool.layerCapacity;
  }
  const allPlaced: PlacedItem[] = [];
  let cursorY = startY;
  let layerIndex = 0;

  while (pools.some((pool) => pool.remaining.length > 0)) {
    const active = pools.filter((pool) => pool.remaining.length > 0);
    active.sort(
      (a, b) =>
        poolSortScore(b.remaining.length, b.layerCapacity, b.footprintArea) -
        poolSortScore(a.remaining.length, a.layerCapacity, a.footprintArea),
    );
    const pool = active[0];
    const combined = [...existingPacked, ...allPlaced];
    const take = Math.min(pool.layerCapacity, pool.remaining.length);
    const layerItems = pool.remaining.splice(0, take);

    const gridLayer = buildLineoGridLayer(
      layerItems,
      cursorY,
      ctx.packWidth,
      ctx.packLength,
      layerIndex,
      false,
      lineoLayerUnitsFin,
      combined,
      cellW,
      cellL,
    );
    if (!gridLayer?.length) {
      pool.remaining.unshift(...layerItems);
      break;
    }
    const invalid = gridLayer.some(
      (candidate) =>
        !ctx.isValidPlacement(
          candidate,
          ctx.packWidth,
          ctx.packLength,
          ctx.packHeight,
          [...combined, ...gridLayer.filter((p) => p.id !== candidate.id)],
          obstacles,
        ),
    );
    if (invalid) {
      pool.remaining.unshift(...layerItems);
      break;
    }

    const layerHeight = Math.max(...gridLayer.map((item) => item.h));
    if (cursorY + layerHeight > ctx.packHeight + 0.001) {
      pool.remaining.unshift(...layerItems);
      break;
    }

    allPlaced.push(...gridLayer);
    cursorY += layerHeight;
    layerIndex += 1;
  }

  const remaining = pools.flatMap((pool) => pool.remaining);
  return { placed: allPlaced, remaining, endY: cursorY };
}
