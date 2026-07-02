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

type OrientedFootprint = { w: number; l: number; h: number };

function packTightRows(
  footprints: OrientedFootprint[],
  packWidth: number,
  packLength: number,
): Array<{ x: number; z: number; w: number; l: number; h: number }> | null {
  const rows: OrientedFootprint[][] = [];
  let row: OrientedFootprint[] = [];
  let rowW = 0;

  for (const footprint of footprints) {
    if (row.length && rowW + footprint.w > packWidth + 0.001) {
      rows.push(row);
      row = [];
      rowW = 0;
    }
    row.push(footprint);
    rowW += footprint.w;
  }
  if (row.length) rows.push(row);

  let z = 0;
  const placed: Array<{ x: number; z: number; w: number; l: number; h: number }> = [];
  for (const currentRow of rows) {
    const rowL = Math.max(...currentRow.map((footprint) => footprint.l));
    if (z + rowL > packLength + 0.001) return null;
    let x = 0;
    for (const footprint of currentRow) {
      placed.push({ x, z, w: footprint.w, l: footprint.l, h: footprint.h });
      x += footprint.w;
    }
    z += rowL;
  }
  return placed;
}

function centerLayerBlock(
  positions: Array<{ x: number; z: number; w: number; l: number; h: number }>,
  packWidth: number,
  packLength: number,
): void {
  if (!positions.length) return;
  const minX = Math.min(...positions.map((pos) => pos.x));
  const maxX = Math.max(...positions.map((pos) => pos.x + pos.w));
  const minZ = Math.min(...positions.map((pos) => pos.z));
  const maxZ = Math.max(...positions.map((pos) => pos.z + pos.l));
  const blockW = maxX - minX;
  const blockL = maxZ - minZ;
  const dx = (packWidth - blockW) / 2 - minX;
  const dz = (packLength - blockL) / 2 - minZ;
  for (const pos of positions) {
    pos.x += dx;
    pos.z += dz;
  }
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
  _cellW?: number,
  _cellL?: number,
): PlacedItem[] | null {
  if (!items.length) return [];
  const maxItems = Math.min(items.length, layerUnitsFin);

  for (let count = maxItems; count >= 1; count--) {
    const slice = items.slice(0, count);
    const footprints = slice.map((item) =>
      lineoPlanarOrientation(item.w, item.l, item.h, layerIndex, alternateLayers),
    );
    const positions = packTightRows(footprints, packWidth, packLength);
    if (!positions) continue;
    centerLayerBlock(positions, packWidth, packLength);

    return slice.map((item, index) => ({
      ...item,
      ...positions[index],
      y: layerY,
      ruleLayer: true,
    }));
  }
  return null;
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
