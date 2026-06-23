import type { CandidatePlacement, ExpandedItem, PlacedItem } from "../types";

/** Flat orientation: short side along pallet width (x), long side along pallet length (z). */
export function lineoPlanarFootprintKey(w: number, l: number, h: number): string {
  const oriented = lineoPlanarOrientation(w, l, h, 0, false);
  return `${oriented.w.toFixed(1)}x${oriented.l.toFixed(1)}`;
}

export function lineoPlanarOrientation(
  boxW: number,
  boxL: number,
  boxH: number,
  layerIndex: number,
  alternateLayers: boolean,
): { w: number; l: number; h: number } {
  const dims = [boxW, boxL, boxH].sort((a, b) => a - b);
  const h = dims[0];
  const short = dims[1];
  const long = dims[2];
  const swap = false;
  if (!swap) return { w: short, l: long, h };
  return { w: long, l: short, h };
}

export function pickLineoLayerGrid(
  layerUnits: number,
  sideW: number,
  sideL: number,
  packWidth: number,
  packLength: number,
  maxRows = Infinity,
): { cols: number; rows: number } | null {
  let best: { cols: number; rows: number; waste: number } | null = null;
  for (let cols = 1; cols <= layerUnits; cols++) {
    if (layerUnits % cols !== 0) continue;
    const rows = layerUnits / cols;
    if (rows > maxRows) continue;
    const blockW = cols * sideW;
    const blockL = rows * sideL;
    if (blockW > packWidth + 0.001 || blockL > packLength + 0.001) continue;
    const waste = packWidth * packLength - blockW * blockL;
    if (!best || waste < best.waste) best = { cols, rows, waste };
  }
  return best ? { cols: best.cols, rows: best.rows } : null;
}

export function maxLineoUnitsPerLayer(
  layerUnitsFin: number,
  sideW: number,
  sideL: number,
  packWidth: number,
  packLength: number,
): number {
  for (let units = Math.min(layerUnitsFin, 24); units >= 1; units--) {
    if (pickLineoLayerGrid(units, sideW, sideL, packWidth, packLength)) return units;
  }
  return 0;
}

export function supportBoundsAtY(
  layerY: number,
  packed: PlacedItem[],
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const below = packed.filter((box) => Math.abs(box.y + box.h - layerY) < 0.15);
  if (!below.length) return null;
  return {
    minX: Math.min(...below.map((box) => box.x)),
    maxX: Math.max(...below.map((box) => box.x + box.w)),
    minZ: Math.min(...below.map((box) => box.z)),
    maxZ: Math.max(...below.map((box) => box.z + box.l)),
  };
}

export function lineoFamilyCellSize(items: ExpandedItem[]): { cellW: number; cellL: number } {
  let cellW = 0;
  let cellL = 0;
  for (const item of items) {
    const oriented = lineoPlanarOrientation(item.w, item.l, item.h, 0, false);
    cellW = Math.max(cellW, oriented.w);
    cellL = Math.max(cellL, oriented.l);
  }
  return { cellW, cellL };
}

export function buildLineoGridLayer(
  items: ExpandedItem[],
  layerY: number,
  packWidth: number,
  packLength: number,
  layerIndex: number,
  alternateLayers: boolean,
  layerUnitsFin: number,
  existingPacked: PlacedItem[] = [],
  cellW?: number,
  cellL?: number,
): PlacedItem[] | null {
  if (!items.length) return [];
  const first = items[0];
  const orientation = lineoPlanarOrientation(first.w, first.l, first.h, layerIndex, alternateLayers);
  const spacingW = cellW ?? orientation.w;
  const spacingL = cellL ?? orientation.l;
  const support = layerY > 0.1 ? supportBoundsAtY(layerY, existingPacked) : null;
  const regionW = packWidth;
  const regionL = packLength;
  const supportCoverage = support ? ((support.maxX - support.minX) * (support.maxZ - support.minZ)) / (packWidth * packLength) : 1;
  const maxRows = support && supportCoverage < 0.7 ? 1 : Infinity;
  const physicalMax = maxLineoUnitsPerLayer(24, spacingW, spacingL, regionW, regionL);
  if (physicalMax <= 0) return null;
  const grid = pickLineoLayerGrid(physicalMax, spacingW, spacingL, regionW, regionL, maxRows);
  if (!grid) return null;

  const toPlace = Math.min(items.length, grid.cols * grid.rows);
  const startX = 0;
  const startZ = 0;

  const placed: PlacedItem[] = [];
  for (let index = 0; index < toPlace; index++) {
    const item = items[index];
    const itemOrientation = lineoPlanarOrientation(item.w, item.l, item.h, layerIndex, alternateLayers);
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    placed.push({
      ...item,
      x: startX + col * spacingW + (spacingW - itemOrientation.w) / 2,
      z: startZ + row * spacingL,
      y: layerY,
      w: itemOrientation.w,
      l: itemOrientation.l,
      h: itemOrientation.h,
      ruleLayer: true,
    });
  }
  return placed;
}

export function lineoPlacementScore(
  candidate: CandidatePlacement,
  packWidth: number,
  packLength: number,
): number {
  const widthAligned = candidate.w <= candidate.l ? 0 : 1_000_000;
  const centerScore =
    Math.abs(candidate.x + candidate.w / 2 - packWidth / 2) +
    Math.abs(candidate.z + candidate.l / 2 - packLength / 2);
  return widthAligned + candidate.z * 10_000 + candidate.x * 100 + centerScore;
}
