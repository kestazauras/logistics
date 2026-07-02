import type { PlacedItem } from "../types";

export interface PlacementOverlap {
  aId: string;
  bId: string;
  aSku: string;
  bSku: string;
}

export function boxesOverlap(
  a: Pick<PlacedItem, "x" | "y" | "z" | "w" | "l" | "h">,
  b: Pick<PlacedItem, "x" | "y" | "z" | "w" | "l" | "h">,
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.z < b.z + b.l &&
    a.z + a.l > b.z &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function xzFootprintOverlap(
  a: Pick<PlacedItem, "x" | "z" | "w" | "l">,
  b: Pick<PlacedItem, "x" | "z" | "w" | "l">,
): boolean {
  return (
    a.x < b.x + b.w - 0.001 &&
    b.x < a.x + a.w - 0.001 &&
    a.z < b.z + b.l - 0.001 &&
    b.z < a.z + a.l - 0.001
  );
}

/** Count existing boxes whose X/Z footprint overlaps a candidate footprint. */
export function columnStackDepth(
  x: number,
  z: number,
  w: number,
  l: number,
  packed: PlacedItem[],
): number {
  const probe = { x, z, w, l };
  return packed.filter((item) => xzFootprintOverlap(item, probe)).length;
}

export function layerWithinColumnStackLimit(
  layer: PlacedItem[],
  packed: PlacedItem[],
  maxDepth: number,
): boolean {
  return layer.every(
    (item) => columnStackDepth(item.x, item.z, item.w, item.l, packed) < maxDepth,
  );
}

export function findPlacementOverlaps(items: PlacedItem[]): PlacementOverlap[] {
  const overlaps: PlacementOverlap[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!boxesOverlap(a, b)) continue;
      overlaps.push({ aId: a.id, bId: b.id, aSku: a.sku, bSku: b.sku });
    }
  }
  return overlaps;
}

/** Throws in dev if any packed boxes share 3D volume (would merge in Scene3D). */
export function assertNoPlacementOverlaps(items: PlacedItem[], context = "pack"): void {
  const overlaps = findPlacementOverlaps(items);
  if (!overlaps.length) return;
  const detail = overlaps
    .slice(0, 5)
    .map((o) => `${o.aSku}↔${o.bSku}`)
    .join(", ");
  const message = `[${context}] ${overlaps.length} overlapping placement(s): ${detail}`;
  if (process.env.NODE_ENV === "production") {
    console.error(message);
    return;
  }
  throw new Error(message);
}
