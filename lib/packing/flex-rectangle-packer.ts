import type { CandidatePlacement, ExpandedItem, Obstacle, PlacedItem } from "../types";
import {
  buildLineoGridLayer,
  lineoPlanarOrientation,
  lineoPlacementScore,
  maxLineoUnitsPerLayer,
} from "./lineo-grid";

export interface FlexPackerContext {
  packWidth: number;
  packLength: number;
  packHeight: number;
  getFlatRotations(w: number, l: number, h: number, sku: string): [number, number, number][];
  isValidPlacement(
    candidate: CandidatePlacement,
    packWidth: number,
    packLength: number,
    packHeight: number,
    packedItems: PlacedItem[],
    obstacles: Obstacle[],
  ): boolean;
}

export interface FlexPackerOptions {
  alternateLayers?: boolean;
  maxItemsPerLayer?: number;
  /** LINEO: short side along pallet width, centered grid layers. */
  lineoWidthAligned?: boolean;
  lineoLayerUnitsFin?: number;
}

function sortByFootprintDesc(items: ExpandedItem[]): ExpandedItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const areaA = a.w * a.l;
    const areaB = b.w * b.l;
    if (areaB !== areaA) return areaB - areaA;
    return b.h - a.h;
  });
}

function lineoRotations(
  w: number,
  l: number,
  h: number,
  layerIndex: number,
  alternateLayers: boolean,
): [number, number, number][] {
  const oriented = lineoPlanarOrientation(w, l, h, layerIndex, alternateLayers);
  const swapped = lineoPlanarOrientation(w, l, h, layerIndex, true);
  const primary: [number, number, number] = [oriented.w, oriented.l, oriented.h];
  const alt: [number, number, number] = [swapped.w, swapped.l, swapped.h];
  if (primary.join() === alt.join()) return [primary];
  return [primary, alt];
}

function layerPositions(
  layerY: number,
  layerPlaced: PlacedItem[],
  supportBelow: PlacedItem[],
  packWidth: number,
  packLength: number,
): Array<{ x: number; z: number }> {
  const positions: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }];
  const atLayer = layerPlaced.filter((placed) => Math.abs(placed.y - layerY) < 0.1);
  for (const box of atLayer) {
    positions.push({ x: box.x + box.w, z: box.z });
    positions.push({ x: box.x, z: box.z + box.l });
  }
  if (layerY > 0.1 && !atLayer.length) {
    for (const box of supportBelow) {
      if (Math.abs(box.y + box.h - layerY) < 0.15) {
        positions.push({ x: box.x, z: box.z });
      }
    }
  }
  const seen = new Set<string>();
  return positions
    .filter((pos) => {
      const key = `${pos.x.toFixed(2)},${pos.z.toFixed(2)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return pos.x >= -0.001 && pos.z >= -0.001 && pos.x <= packWidth + 0.001 && pos.z <= packLength + 0.001;
    })
    .sort((a, b) => a.z - b.z || a.x - b.x);
}

function findPlacementInLayer(
  item: ExpandedItem,
  layerY: number,
  layerPlaced: PlacedItem[],
  existingPacked: PlacedItem[],
  obstacles: Obstacle[],
  ctx: FlexPackerContext,
  layerIndex: number,
  alternateLayers: boolean,
  lineoWidthAligned: boolean,
): CandidatePlacement | null {
  const rotations = lineoWidthAligned
    ? lineoRotations(item.w, item.l, item.h, layerIndex, alternateLayers)
    : ctx.getFlatRotations(item.w, item.l, item.h, item.sku);

  const combined = [...existingPacked, ...layerPlaced];
  const positions = layerPositions(layerY, layerPlaced, combined, ctx.packWidth, ctx.packLength);
  let best: { score: number; candidate: CandidatePlacement } | null = null;

  for (const pos of positions) {
    for (const [rw, rl, rh] of rotations) {
      const candidate: CandidatePlacement = {
        x: pos.x,
        z: pos.z,
        y: layerY,
        w: rw,
        l: rl,
        h: rh,
        priority: item.priority,
        sku: item.sku,
      };
      if (!ctx.isValidPlacement(candidate, ctx.packWidth, ctx.packLength, ctx.packHeight, combined, obstacles)) {
        continue;
      }
      const centerScore =
        Math.abs(candidate.x + candidate.w / 2 - ctx.packWidth / 2) +
        Math.abs(candidate.z + candidate.l / 2 - ctx.packLength / 2);
      const score = lineoWidthAligned
        ? lineoPlacementScore(candidate, ctx.packWidth, ctx.packLength)
        : candidate.z * 10_000 + candidate.x * 100 + centerScore;
      if (!best || score < best.score) best = { score, candidate };
    }
  }
  return best?.candidate ?? null;
}

function packOneLayer(
  remaining: ExpandedItem[],
  layerY: number,
  existingPacked: PlacedItem[],
  obstacles: Obstacle[],
  ctx: FlexPackerContext,
  layerIndex: number,
  options: FlexPackerOptions,
): { placed: PlacedItem[]; remaining: ExpandedItem[] } {
  const { alternateLayers = false, maxItemsPerLayer, lineoWidthAligned, lineoLayerUnitsFin } = options;

    if (lineoWidthAligned && lineoLayerUnitsFin && remaining.length) {
    const cap = maxItemsPerLayer ?? lineoLayerUnitsFin;
    const tryLimit = Math.min(cap, remaining.length);
    for (let tryCap = tryLimit; tryCap >= 1; tryCap--) {
      const slice = remaining.slice(0, tryCap);
      const gridLayer = buildLineoGridLayer(
        slice,
        layerY,
        ctx.packWidth,
        ctx.packLength,
        layerIndex,
        alternateLayers,
        lineoLayerUnitsFin,
        existingPacked,
      );
      if (!gridLayer?.length) continue;
      const invalid = gridLayer.some(
        (candidate) =>
          !ctx.isValidPlacement(
            candidate,
            ctx.packWidth,
            ctx.packLength,
            ctx.packHeight,
            [...existingPacked, ...gridLayer.filter((p) => p.id !== candidate.id)],
            obstacles,
          ),
      );
      if (invalid) continue;
      const placedIds = new Set(gridLayer.map((item) => item.id));
      return {
        placed: gridLayer,
        remaining: remaining.filter((item) => !placedIds.has(item.id)),
      };
    }
    return { placed: [], remaining };
  }

  const layerPlaced: PlacedItem[] = [];
  const pool = [...remaining];
  let progress = true;

  while (progress) {
    if (maxItemsPerLayer && layerPlaced.length >= maxItemsPerLayer) break;
    progress = false;
    for (let index = 0; index < pool.length; index++) {
      const item = pool[index];
      const candidate = findPlacementInLayer(
        item,
        layerY,
        layerPlaced,
        existingPacked,
        obstacles,
        ctx,
        layerIndex,
        alternateLayers,
        !!lineoWidthAligned,
      );
      if (!candidate) continue;
      layerPlaced.push({ ...item, ...candidate, ruleLayer: true });
      pool.splice(index, 1);
      progress = true;
      break;
    }
  }

  return { placed: layerPlaced, remaining: pool };
}

/** Fill horizontal layers first (mixed sizes, flat rotations), then stack upward. */
export function packFlexRectangleLayers(
  items: ExpandedItem[],
  startY: number,
  existingPacked: PlacedItem[],
  obstacles: Obstacle[],
  ctx: FlexPackerContext,
  options: FlexPackerOptions = {},
): { placed: PlacedItem[]; remaining: ExpandedItem[]; endY: number } {
  const allPlaced: PlacedItem[] = [];
  let remaining = sortByFootprintDesc(items);
  let cursorY = startY;
  let layerIndex = 0;

  let effectiveMax = options.maxItemsPerLayer;
  if (options.lineoWidthAligned && options.lineoLayerUnitsFin && remaining.length) {
    const sample = remaining[0];
    const oriented = lineoPlanarOrientation(sample.w, sample.l, sample.h, layerIndex, options.alternateLayers ?? false);
    const physicalMax = maxLineoUnitsPerLayer(
      24,
      oriented.w,
      oriented.l,
      ctx.packWidth,
      ctx.packLength,
    );
    effectiveMax = physicalMax > 0 ? physicalMax : options.lineoLayerUnitsFin;
  }

  const layerOptions = { ...options, maxItemsPerLayer: effectiveMax };

  while (remaining.length > 0) {
    const { placed, remaining: left } = packOneLayer(
      remaining,
      cursorY,
      [...existingPacked, ...allPlaced],
      obstacles,
      ctx,
      layerIndex,
      layerOptions,
    );
    if (!placed.length) break;

    const layerHeight = Math.max(...placed.map((item) => item.h));
    if (cursorY + layerHeight > ctx.packHeight + 0.001) {
      const fitting = placed.filter((item) => cursorY + item.h <= ctx.packHeight + 0.001);
      if (!fitting.length) break;
      allPlaced.push(...fitting);
      const fittingIds = new Set(fitting.map((item) => item.id));
      remaining = [
        ...remaining.filter((item) => !fittingIds.has(item.id)),
        ...left,
        ...placed.filter((item) => !fittingIds.has(item.id)),
      ];
      break;
    }

    allPlaced.push(...placed);
    remaining = left;
    cursorY += layerHeight;
    layerIndex += 1;
  }

  return { placed: allPlaced, remaining, endY: cursorY };
}
