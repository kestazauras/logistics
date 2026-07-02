import {
  generateLineo500Bricklaying,
  isLineo500Item,
  pickLineo500LayerPlan,
} from "./lineo500-bricklaying";
import {
  buildLineoGridLayer,
  lineoFamilyCellSize,
} from "./lineo-grid";
import { buildLineoSkuBatches, type LineoSkuBatch } from "./lineo-sku-layers";
import { layerWithinColumnStackLimit } from "./placement-validation";
import type { ExpandedItem, LayerRule, Obstacle, PalletizedConfig, PlacedItem } from "../types";

export const LAYER_FIRST_KEYS = new Set(["LINEO", "LINEO_500", "LINEO_PRO", "MOUL_AERO", "SPARE_PARTS"]);

export interface LayerFirstAssemblyContext {
  layerRuleKey(item: ExpandedItem): string;
  layerRuleForKey(key: string, item: ExpandedItem, packWidth: number, packLength: number): LayerRule;
  buildCenteredLayer(
    items: ExpandedItem[],
    rule: LayerRule,
    width: number,
    length: number,
    y: number,
  ): PlacedItem[] | null;
  isValidRuleLayerPlacement(
    candidate: PlacedItem,
    rule: LayerRule,
    packWidth: number,
    packLength: number,
    packHeight: number,
    packedItems: PlacedItem[],
    obstacles: Obstacle[],
  ): boolean;
  familyLayerUnits(key: string, item: ExpandedItem): number;
  getBottomSupportRatio(candidate: PlacedItem, packedItems: PlacedItem[]): number;
}

function perLayerForBatch(
  batch: LineoSkuBatch,
  ctx: LayerFirstAssemblyContext,
  packWidth: number,
  packLength: number,
): number {
  const sample = batch.items[0];
  if (isLineo500Item(sample)) {
    const plan = pickLineo500LayerPlan(sample.w, sample.l, sample.h, packWidth, packLength);
    if (plan) return plan.unitsPerLayer;
  }
  const key = ctx.layerRuleKey(sample);
  if (key === "LINEO_PRO") return ctx.familyLayerUnits(key, sample);
  return Math.max(1, batch.layerCapacity);
}

function validateLayer(
  layer: PlacedItem[] | null | undefined,
  expected: number,
  rule: LayerRule,
  ctx: LayerFirstAssemblyContext,
  packWidth: number,
  packLength: number,
  packHeight: number,
  packedItems: PlacedItem[],
  obstacles: Obstacle[],
): layer is PlacedItem[] {
  return (
    !!layer &&
    layer.length === expected &&
    !layer.some(
      (candidate) =>
        !ctx.isValidRuleLayerPlacement(
          candidate,
          rule,
          packWidth,
          packLength,
          packHeight,
          packedItems,
          obstacles,
        ),
    )
  );
}

const stackRule: LayerRule = {
  perLayer: 1,
  columns: 1,
  rows: 1,
  flatOnly: true,
  allowRuleStack: true,
};

function layerHasSupport(layer: PlacedItem[], packedItems: PlacedItem[], ctx: LayerFirstAssemblyContext): boolean {
  if (layer[0].y <= 0.001) return true;
  return layer.every((item) => ctx.getBottomSupportRatio(item, packedItems) >= 0.5);
}

/** Full horizontal layers first (any SKU), then co-packed partial remainders on top. */
export function packLayerFirstAssembly(
  items: ExpandedItem[],
  packedItems: PlacedItem[],
  obstacles: Obstacle[],
  config: PalletizedConfig,
  ctx: LayerFirstAssemblyContext,
): { remaining: ExpandedItem[]; cursorY: number } {
  const remaining: ExpandedItem[] = [];
  let cursorY = packedItems.reduce((height, item) => Math.max(height, item.y + item.h), 0);
  const packHeight = config.maxY - config.baseHeight;

  const batches = buildLineoSkuBatches(items, config.width, config.length);
  const fullChunks: Array<{ items: ExpandedItem[]; perLayer: number }> = [];
  const partialItems: ExpandedItem[] = [];

  for (const batch of batches) {
    const sample = batch.items[0];
    const key = ctx.layerRuleKey(sample);
    let perLayer = perLayerForBatch(batch, ctx, config.width, config.length);
    if (!isLineo500Item(sample)) {
      const rule = ctx.layerRuleForKey(key, sample, config.width, config.length);
      perLayer = Math.min(perLayer, rule.perLayer);
    }
    let index = 0;
    while (index + perLayer <= batch.items.length) {
      fullChunks.push({ items: batch.items.slice(index, index + perLayer), perLayer });
      index += perLayer;
    }
    partialItems.push(...batch.items.slice(index));
  }

  fullChunks.sort(
    (a, b) =>
      b.items.length - a.items.length ||
      b.items[0].w * b.items[0].l - a.items[0].w * a.items[0].l,
  );

  for (const chunk of fullChunks) {
    const sample = chunk.items[0];
    const plan =
      isLineo500Item(sample) &&
      pickLineo500LayerPlan(sample.w, sample.l, sample.h, config.width, config.length);

    if (plan && chunk.items.length >= plan.unitsPerLayer) {
      const brick = generateLineo500Bricklaying(
        chunk.items,
        1,
        config.width,
        config.length,
        cursorY,
      );
      if (brick.packed.length !== chunk.items.length) {
        remaining.push(...chunk.items, ...partialItems);
        return { remaining, cursorY };
      }
      if (
        brick.packed.some(
          (candidate) =>
            !ctx.isValidRuleLayerPlacement(
              candidate,
              stackRule,
              config.width,
              config.length,
              packHeight,
              packedItems,
              obstacles,
            ),
        )
      ) {
        remaining.push(...chunk.items, ...partialItems);
        return { remaining, cursorY };
      }
      packedItems.push(...brick.packed);
      cursorY += Math.max(...brick.packed.map((item) => item.h));
      continue;
    }

    const key = ctx.layerRuleKey(sample);
    const rule = ctx.layerRuleForKey(key, sample, config.width, config.length);
    const layer = ctx.buildCenteredLayer(chunk.items, rule, config.width, config.length, cursorY);
    if (!validateLayer(layer, chunk.items.length, rule, ctx, config.width, config.length, packHeight, packedItems, obstacles)) {
      remaining.push(...chunk.items, ...partialItems);
      return { remaining, cursorY };
    }
    packedItems.push(...layer);
    cursorY += Math.max(...layer.map((item) => item.h));
  }

  if (partialItems.length) {
    const { cellW, cellL } = lineoFamilyCellSize(partialItems);
    let pool = [...partialItems];
    while (pool.length) {
      const gridLayer = buildLineoGridLayer(
        pool,
        cursorY,
        config.width,
        config.length,
        0,
        false,
        pool.length,
        packedItems,
        cellW,
        cellL,
      );
      if (
        gridLayer?.length &&
        validateLayer(
          gridLayer,
          gridLayer.length,
          stackRule,
          ctx,
          config.width,
          config.length,
          packHeight,
          packedItems,
          obstacles,
        ) &&
        layerHasSupport(gridLayer, packedItems, ctx) &&
        layerWithinColumnStackLimit(gridLayer, packedItems, 2)
      ) {
        packedItems.push(...gridLayer);
        cursorY += Math.max(...gridLayer.map((item) => item.h));
        pool = pool.slice(gridLayer.length);
        continue;
      }

      const sample = pool[0];
      const key = ctx.layerRuleKey(sample);
      const rule = {
        ...ctx.layerRuleForKey(key, sample, config.width, config.length),
        perLayer: 1,
        columns: 1,
        rows: 1,
      };
      const layer = ctx.buildCenteredLayer([sample], rule, config.width, config.length, cursorY);
      if (
        !validateLayer(layer, 1, stackRule, ctx, config.width, config.length, packHeight, packedItems, obstacles) ||
        !layerHasSupport(layer!, packedItems, ctx) ||
        !layerWithinColumnStackLimit(layer!, packedItems, 2)
      ) {
        remaining.push(...pool);
        break;
      }
      packedItems.push(...layer!);
      cursorY += layer![0].h;
      pool = pool.slice(1);
    }
  }

  return { remaining, cursorY };
}
