import type { ExpandedItem, PlacedItem } from "../types";

export interface Lineo500LayerPlan {
  cols: number;
  rows: number;
  cellW: number;
  cellL: number;
  cellH: number;
  unitsPerLayer: number;
  waste: number;
}

const LINEO500_MAX_UNITS_PER_LAYER = 10;

function flatOrientations(boxW: number, boxL: number, boxH: number): Array<{ w: number; l: number; h: number }> {
  const variants = [
    { w: boxW, l: boxL, h: boxH },
    { w: boxL, l: boxW, h: boxH },
  ];
  const seen = new Set<string>();
  return variants.filter((o) => {
    const key = `${o.w},${o.l},${o.h}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return o.h <= o.w && o.h <= o.l;
  });
}

/** Best cols×rows for up to maxUnits with minimum footprint waste (least overhang). */
export function pickLineo500LayerPlan(
  boxW: number,
  boxL: number,
  boxH: number,
  packWidth: number,
  packLength: number,
  maxUnits = LINEO500_MAX_UNITS_PER_LAYER,
): Lineo500LayerPlan | null {
  let best: Lineo500LayerPlan | null = null;

  for (const oriented of flatOrientations(boxW, boxL, boxH)) {
    for (let units = Math.min(maxUnits, LINEO500_MAX_UNITS_PER_LAYER); units >= 1; units--) {
      for (let cols = 1; cols <= units; cols++) {
        if (units % cols !== 0) continue;
        const rows = units / cols;
        const blockW = cols * oriented.w;
        const blockL = rows * oriented.l;
        if (blockW > packWidth + 0.001 || blockL > packLength + 0.001) continue;
        const waste = packWidth * packLength - blockW * blockL;
        const plan: Lineo500LayerPlan = {
          cols,
          rows,
          cellW: oriented.w,
          cellL: oriented.l,
          cellH: oriented.h,
          unitsPerLayer: units,
          waste,
        };
        if (
          !best ||
          plan.unitsPerLayer > best.unitsPerLayer ||
          (plan.unitsPerLayer === best.unitsPerLayer && plan.waste < best.waste)
        ) {
          best = plan;
        }
      }
    }
  }

  return best;
}

function layerSlotPositions(
  plan: Lineo500LayerPlan,
  packWidth: number,
  packLength: number,
  layerIndex: number,
  count: number,
): Array<{ x: number; z: number; w: number; l: number }> | null {
  const brickOffsetZ = layerIndex % 2 === 1 ? plan.cellL / 2 : 0;
  const slots: Array<{ x: number; z: number; w: number; l: number }> = [];

  for (let row = 0; row < plan.rows; row++) {
    for (let col = 0; col < plan.cols; col++) {
      slots.push({
        x: col * plan.cellW,
        z: row * plan.cellL + brickOffsetZ,
        w: plan.cellW,
        l: plan.cellL,
      });
    }
  }

  const inBounds = slots.filter(
    (slot) =>
      slot.x >= -0.001 &&
      slot.z >= -0.001 &&
      slot.x + slot.w <= packWidth + 0.001 &&
      slot.z + slot.l <= packLength + 0.001,
  );
  if (!inBounds.length) return null;

  const minX = Math.min(...inBounds.map((slot) => slot.x));
  const maxX = Math.max(...inBounds.map((slot) => slot.x + slot.w));
  const minZ = Math.min(...inBounds.map((slot) => slot.z));
  const maxZ = Math.max(...inBounds.map((slot) => slot.z + slot.l));
  const dx = packWidth / 2 - (minX + maxX) / 2;
  const dz = packLength / 2 - (minZ + maxZ) / 2;

  return inBounds.slice(0, count).map((slot) => ({
    x: slot.x + dx,
    z: slot.z + dz,
    w: slot.w,
    l: slot.l,
  }));
}

/** Pack LINEO-500 in flat layers (up to 10/layer); odd layers offset brickwise along length. */
export function generateLineo500Bricklaying(
  items: ExpandedItem[],
  maxLayers: number,
  packWidth: number,
  packLength: number,
  startY = 0,
): { packed: PlacedItem[]; remaining: ExpandedItem[] } {
  if (!items.length) return { packed: [], remaining: [] };
  const first = items[0];
  const plan = pickLineo500LayerPlan(first.w, first.l, first.h, packWidth, packLength);
  if (!plan) return { packed: [], remaining: [...items] };

  const packed: PlacedItem[] = [];
  const remaining = [...items];

  for (let layer = 0; layer < maxLayers && remaining.length; layer++) {
    const take = Math.min(plan.unitsPerLayer, remaining.length);
    const positions = layerSlotPositions(plan, packWidth, packLength, layer, take);
    if (!positions?.length) break;

    const y = startY + layer * plan.cellH;
    for (const position of positions) {
      if (!remaining.length) break;
      const item = remaining.shift()!;
      packed.push({
        ...item,
        x: position.x,
        z: position.z,
        y,
        w: position.w,
        l: position.l,
        h: plan.cellH,
        brick: true,
        ruleLayer: true,
      });
    }
  }

  return { packed, remaining };
}

export function isLineo500Item(item: Pick<ExpandedItem, "name">): boolean {
  return item.name.includes("LINEO-500");
}
