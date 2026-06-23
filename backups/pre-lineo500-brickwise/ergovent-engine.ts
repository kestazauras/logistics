import {
  ENGINE_PRIORITY,
  resolveEnginePriority,
  resolveMaxCapacities,
  type MaxCapacities,
} from "../rules-engine";
import type {
  CandidatePlacement,
  ExpandedItem,
  ExtremePoint,
  FloorLoadedConfig,
  LayerRule,
  Obstacle,
  Pack,
  PackLayoutResult,
  PalletizedConfig,
  Placement,
  PlacedItem,
  RulesContext,
  TransportContext,
} from "../types";

const DEFAULT_MAX_CAPACITIES: MaxCapacities = {
  RN100: { FIN: 168, "20HQ_FLOOR": 1764 },
  RN125: { FIN: 168, "20HQ_FLOOR": 1764 },
  KV100: { FIN: 168, "20HQ_FLOOR": 1764 },
  KV125: { FIN: 168, "20HQ_FLOOR": 1764 },
  "RN100.CO": { FIN: 168, "20HQ_FLOOR": 1764 },
  "RN125.CO": { FIN: 168, "20HQ_FLOOR": 1764 },
  RN150: { FIN: 126 },
  RN160: { FIN: 126 },
};

export class ErgoventLogisticsOptimizer {
  readonly PRIORITY = ENGINE_PRIORITY;

  readonly MAX_CAPACITIES: MaxCapacities;

  constructor(
    private readonly transportCtx: TransportContext,
    private readonly _rulesCtx?: RulesContext,
    maxCapacities?: MaxCapacities,
  ) {
    this.MAX_CAPACITIES = resolveMaxCapacities(maxCapacities, DEFAULT_MAX_CAPACITIES);
  }

  packForCurrentTransport(packs: Pack[]): PackLayoutResult {
    const items = this.expandPacks(packs);
    if (!items.length) return { placements: [], productHeight: 0, unpacked: [] };

    const { transport } = this.transportCtx;
    const footprint = this.transportCtx.getAllowedFootprint();

    if (transport.isFloorLoaded) {
      return this.packFloorLoaded(items, {
        width: footprint.w,
        length: footprint.l,
        height: transport.maxH,
      });
    }
    if (transport.isPalletLoadedContainer) {
      return this.packPalletContainer(items);
    }
    return this.packPalletized(items, {
      origin: { x: 0, z: 0 },
      width: footprint.w,
      length: footprint.l,
      baseHeight: this.transportCtx.getBaseHeight(),
      maxY: transport.maxH,
      allowBricklaying: true,
      palletSlotIndex: undefined,
    });
  }

  expandPacks(packs: Pack[]): ExpandedItem[] {
    return packs.map((pack, index) => ({
      id: `${pack.product.id || pack.product.code}_${index}`,
      sku: pack.product.code,
      name: pack.product.name,
      w: pack.product.boxW,
      l: pack.product.boxL,
      h: pack.product.boxH,
      weight: pack.gross || pack.product.gw * pack.product.packQty,
      priority: resolveEnginePriority(pack.product),
      color: pack.product.color,
      product: pack.product,
      pack,
    }));
  }

  packPalletContainer(items: ExpandedItem[]): PackLayoutResult {
    const grid = this.transportCtx.getPalletContainerGrid();
    const slots = this.transportCtx.getPalletSlotCenters();
    let remaining = [...items];
    const placements: Placement[] = [];
    let productHeight = 0;

    for (const slot of slots) {
      if (!remaining.length) break;
      const packedSlot = this.packPalletized(remaining, {
        origin: slot,
        width: grid.width,
        length: grid.length,
        baseHeight: this.transportCtx.getBaseHeight(),
        maxY: this.transportCtx.transport.maxH,
        allowBricklaying: true,
        palletSlotIndex: slot.index,
      });
      placements.push(...packedSlot.placements);
      productHeight = Math.max(productHeight, packedSlot.productHeight);
      const packedIds = new Set(packedSlot.placements.map((placement) => placement.itemId));
      remaining = remaining.filter((item) => !packedIds.has(item.id));
    }
    return { placements, productHeight, unpacked: remaining };
  }

  packPalletized(items: ExpandedItem[], config: PalletizedConfig): PackLayoutResult {
    const packedItems: PlacedItem[] = [];
    let remainingItems = [...items];
    const obstacles: Obstacle[] = [];
    const stands = remainingItems.filter((item) => item.priority === this.PRIORITY.STANDS);
    remainingItems = remainingItems.filter((item) => item.priority !== this.PRIORITY.STANDS);

    const standDims = stands.map((stand) => {
      const isMetalStand = stand.name.toUpperCase().includes("METAL STAND");
      return {
        stand,
        w: Math.min(isMetalStand ? Math.min(stand.w, stand.l) : stand.w, config.width),
        l: Math.min(isMetalStand ? Math.max(stand.w, stand.l) : stand.l, config.length),
      };
    });
    const fittingStandDims: typeof standDims = [];
    let fittingStandWidth = 0;
    for (const standDim of standDims) {
      if (fittingStandWidth + standDim.w <= config.width + 0.001) {
        fittingStandDims.push(standDim);
        fittingStandWidth += standDim.w;
      }
    }
    let standCursorX = (config.width - fittingStandWidth) / 2;
    fittingStandDims.forEach(({ stand, w, l }, index) => {
      if (config.baseHeight + stand.h > config.maxY + 0.001) return;
      const placed: PlacedItem = {
        ...stand,
        x: standCursorX,
        z: (config.length - l) / 2,
        y: 0,
        w,
        l,
        h: stand.h,
        standReserved: true,
        standIndex: index,
      };
      standCursorX += w;
      packedItems.push(placed);
      obstacles.push({
        x: placed.x,
        z: placed.z,
        y: 0,
        w,
        l,
        h: Math.max(0, config.maxY - config.baseHeight),
      });
    });

    const brickItems = remainingItems.filter(
      (item) =>
        item.priority === this.PRIORITY.RONDO_KV100_125 &&
        Math.round(item.w) === 32 &&
        Math.round(item.l) === 64 &&
        Math.round(item.h) === 32,
    );
    if (config.allowBricklaying && brickItems.length && !obstacles.length && config.width >= 96 && config.length >= 128) {
      const brickIds = new Set(brickItems.map((item) => item.id));
      remainingItems = remainingItems.filter((item) => !brickIds.has(item.id));
      const bricklaid = this.generateBricklaying(
        brickItems,
        Math.floor((config.maxY - config.baseHeight) / 32),
        config.width,
        config.length,
      );
      packedItems.push(...bricklaid.packed);
      remainingItems.push(...bricklaid.remaining);
    }

    const layerPacked = this.packRuleBasedLayers(remainingItems, packedItems, obstacles, config);
    remainingItems = layerPacked.remaining;

    remainingItems.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.w * b.l * b.h - a.w * a.l * a.h;
    });

    let extremePoints = this.seedExtremePoints(packedItems, config.width, config.length, config.maxY - config.baseHeight);
    for (const item of remainingItems) {
      let best: { score: number; candidate: CandidatePlacement; item: ExpandedItem } | null = null;
      const rotations =
        item.priority === this.PRIORITY.DEMO_BOX || item.priority === this.PRIORITY.STANDS
          ? [[item.w, item.l, item.h] as [number, number, number]]
          : this.getRotations(item.w, item.l, item.h, item.sku);
      for (const point of extremePoints) {
        for (const rotation of rotations) {
          const candidate: CandidatePlacement = {
            x: point.x,
            z: point.z,
            y: point.y,
            w: rotation[0],
            l: rotation[1],
            h: rotation[2],
            priority: item.priority,
            sku: item.sku,
          };
          if (
            !this.isValidPlacement(
              candidate,
              config.width,
              config.length,
              config.maxY - config.baseHeight,
              packedItems,
              obstacles,
            )
          ) {
            continue;
          }
          const centerScore =
            Math.abs(candidate.x + candidate.w / 2 - config.width / 2) +
            Math.abs(candidate.z + candidate.l / 2 - config.length / 2);
          const score =
            item.priority === this.PRIORITY.SPARE_PARTS
              ? -candidate.y * 100000 + centerScore
              : candidate.y * 100000 + centerScore;
          if (!best || score < best.score) best = { score, candidate, item };
        }
      }
      if (!best) continue;
      const placed: PlacedItem = { ...best.item, ...best.candidate };
      packedItems.push(placed);
      extremePoints.push({ x: placed.x + placed.w, z: placed.z, y: placed.y });
      extremePoints.push({ x: placed.x, z: placed.z + placed.l, y: placed.y });
      extremePoints.push({ x: placed.x, z: placed.z, y: placed.y + placed.h });
      extremePoints = this.filterPoints(extremePoints, config.width, config.length, config.maxY - config.baseHeight);
    }
    this.centerLayers(packedItems, config.width, config.length, obstacles);
    const placements = packedItems.map((item) => this.toPlacement(item, config));
    const productHeight = packedItems.reduce((height, item) => Math.max(height, item.y + item.h), 0);
    const packedIds = new Set(packedItems.map((item) => item.id));
    return { placements, productHeight, unpacked: items.filter((item) => !packedIds.has(item.id)) };
  }

  packRuleBasedLayers(
    items: ExpandedItem[],
    packedItems: PlacedItem[],
    obstacles: Obstacle[],
    config: PalletizedConfig,
  ): { remaining: ExpandedItem[] } {
    const remaining: ExpandedItem[] = [];
    const groups = new Map<string, ExpandedItem[]>();
    items.forEach((item) => {
      const key = this.layerRuleKey(item);
      if (!key) {
        remaining.push(item);
        return;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });

    let cursorY = packedItems.reduce((height, item) => Math.max(height, item.y + item.h), 0);
    const packHeight = config.maxY - config.baseHeight;

    for (const [key, groupItems] of groups.entries()) {
      const rule = this.layerRuleForKey(key, groupItems[0]);
      let index = 0;
      while (index < groupItems.length) {
        const layerItems = groupItems.slice(index, index + rule.perLayer);
        const layer = this.buildCenteredLayer(layerItems, rule, config.width, config.length, cursorY);
        if (
          !layer ||
          layer.some((candidate) =>
            !this.isValidRuleLayerPlacement(
              candidate,
              rule,
              config.width,
              config.length,
              packHeight,
              packedItems,
              obstacles,
            ),
          )
        ) {
          remaining.push(...groupItems.slice(index));
          break;
        }
        packedItems.push(...layer);
        cursorY += Math.max(...layer.map((item) => item.h));
        index += layerItems.length;
      }
    }
    return { remaining };
  }

  layerRuleKey(item: ExpandedItem): string {
    const s = item.sku;
    if (["RN150", "RN160"].includes(s)) return "RN150_160";
    if (s.startsWith("LP") && !s.startsWith("LPM") && !s.startsWith("LND") && !s.startsWith("LP.P") && !s.startsWith("LPB")) {
      return "LINEO_PRO";
    }
    if (s.startsWith("LN")) {
      if (item.name.includes("LINEO-500")) return "LINEO_500";
      return "LINEO";
    }
    if (s.startsWith("LPM") || s.startsWith("AE75") || s.includes("D75-C")) return `MOUL_AERO_${s || item.name}`;
    if (item.priority === this.PRIORITY.DEMO_BOX) return `DEMO_${s || item.name}`;
    if (item.priority === this.PRIORITY.SPARE_PARTS) return `SPARE_${s || item.name}`;
    return "";
  }

  layerRuleForKey(key: string, item: ExpandedItem): LayerRule {
    if (key === "RN150_160") return { perLayer: 9, columns: 3, rows: 3, flatOnly: true };
    if (key === "LINEO_PRO") {
      const single = ["LP75.120.101", "LP90.120.101"].includes(item.sku);
      return {
        perLayer: single ? 6 : Math.max(3, item.product.layerUnitsFin || 3),
        columns: single ? 6 : Math.max(3, item.product.layerUnitsFin || 3),
        rows: 1,
        flatOnly: true,
        allowRuleStack: true,
      };
    }
    if (key === "LINEO_500") {
      // 2 rows width-wise (2×54 cm) × 4 pcs length-wise (4×23 cm) = 8 per layer
      return { perLayer: 8, columns: 2, rows: 4, flatOnly: true, allowRuleStack: true };
    }
    if (key === "LINEO") return { perLayer: 8, columns: 4, rows: 2, flatOnly: true, allowRuleStack: true };
    if (key.startsWith("DEMO_")) return this.aeroStyleRule(item, 8, true);
    return this.aeroStyleRule(item, 8, true);
  }

  aeroStyleRule(item: ExpandedItem, maxPerLayer = 8, flatOnly = true): LayerRule {
    const shortest = Math.max(1, Math.min(item.w, item.l));
    const columns = Math.max(1, Math.min(maxPerLayer, Math.floor(110 / shortest)));
    const rows = Math.max(1, Math.ceil(Math.min(maxPerLayer, columns * 2) / columns));
    return { perLayer: columns * rows, columns, rows, flatOnly, allowRuleStack: true };
  }

  buildCenteredLayer(
    items: ExpandedItem[],
    rule: LayerRule,
    width: number,
    length: number,
    y: number,
  ): PlacedItem[] | null {
    if (!items.length) return [];
    const first = items[0];
    const orientation = this.bestLayerOrientation(first, rule, width, length);
    if (!orientation) return null;
    const positions: Array<{ column: number; row: number }> = [];
    for (let row = 0; row < rule.rows && positions.length < items.length; row++) {
      for (let column = 0; column < rule.columns && positions.length < items.length; column++) {
        positions.push({ column, row });
      }
    }
    const usedColumns = Math.min(rule.columns, Math.max(...positions.map((p) => p.column)) + 1);
    const usedRows = Math.min(rule.rows, Math.max(...positions.map((p) => p.row)) + 1);
    const blockW = usedColumns * orientation.w;
    const blockL = usedRows * orientation.l;
    const startX = (width - blockW) / 2;
    const startZ = (length - blockL) / 2;
    if (blockW > width + 0.001 || blockL > length + 0.001) return null;
    return items.map((item, index) => {
      const pos = positions[index];
      return {
        ...item,
        x: startX + pos.column * orientation.w,
        z: startZ + pos.row * orientation.l,
        y,
        w: orientation.w,
        l: orientation.l,
        h: orientation.h,
        ruleLayer: true,
      };
    });
  }

  isValidRuleLayerPlacement(
    candidate: CandidatePlacement,
    rule: LayerRule,
    packWidth: number,
    packLength: number,
    packHeight: number,
    packedItems: PlacedItem[],
    obstacles: Obstacle[],
  ): boolean {
    if (candidate.x < 0 || candidate.x + candidate.w > packWidth) return false;
    if (candidate.z < 0 || candidate.z + candidate.l > packLength) return false;
    if (candidate.y < 0 || candidate.y + candidate.h > packHeight) return false;
    for (const item of packedItems) {
      if (this.intersects(candidate, item)) return false;
    }
    for (const obstacle of obstacles) {
      const xOverlap =
        Math.max(0, Math.min(candidate.x + candidate.w, obstacle.x + obstacle.w) - Math.max(candidate.x, obstacle.x));
      const zOverlap =
        Math.max(0, Math.min(candidate.z + candidate.l, obstacle.z + obstacle.l) - Math.max(candidate.z, obstacle.z));
      if (xOverlap > 0 && zOverlap > 0 && candidate.y + candidate.h > obstacle.y) return false;
    }
    if (!rule.allowRuleStack && candidate.y > 0 && this.getBottomSupportRatio(candidate, packedItems) < 0.5) {
      return false;
    }
    return true;
  }

  bestLayerOrientation(
    item: ExpandedItem,
    rule: LayerRule,
    width: number,
    length: number,
  ): { w: number; l: number; h: number } | null {
    const rotations = rule.flatOnly
      ? this.getFlatRotations(item.w, item.l, item.h, item.sku)
      : this.getRotations(item.w, item.l, item.h, item.sku);
    const candidates = rotations
      .map((rotation) => ({ w: rotation[0], l: rotation[1], h: rotation[2] }))
      .filter((o) => o.w * rule.columns <= width + 0.001 && o.l * rule.rows <= length + 0.001);
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.h - b.h || a.w * a.l - b.w * b.l);
    return candidates[0];
  }

  packFloorLoaded(items: ExpandedItem[], config: FloorLoadedConfig): PackLayoutResult {
    const sorted = [...items].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.w * b.l * b.h - a.w * a.l * a.h;
    });
    const packedItems: PlacedItem[] = [];
    let extremePoints: ExtremePoint[] = [{ x: 0, z: 0, y: 0 }];
    for (const item of sorted) {
      let best: { score: number; candidate: CandidatePlacement; item: ExpandedItem } | null = null;
      const rotations =
        item.priority === this.PRIORITY.DEMO_BOX
          ? [[item.w, item.l, item.h] as [number, number, number]]
          : this.getFlatRotations(item.w, item.l, item.h, item.sku);
      for (const rotation of rotations) {
        const centered = { x: (config.width - rotation[0]) / 2, z: 0, y: 0 };
        const candidates = [centered, ...extremePoints];
        for (const point of candidates) {
          const candidate: CandidatePlacement = {
            x: point.x,
            z: point.z,
            y: point.y,
            w: rotation[0],
            l: rotation[1],
            h: rotation[2],
            priority: item.priority,
            sku: item.sku,
          };
          if (!this.isValidPlacement(candidate, config.width, config.length, config.height, packedItems, [])) {
            continue;
          }
          const centerDist = Math.abs(candidate.x + candidate.w / 2 - config.width / 2);
          const score = candidate.z * 10000000 + candidate.y * 100000 + centerDist;
          if (!best || score < best.score) best = { score, candidate, item };
        }
      }
      if (!best) continue;
      const placed: PlacedItem = { ...best.item, ...best.candidate };
      packedItems.push(placed);
      extremePoints.push({ x: placed.x + placed.w, z: placed.z, y: placed.y });
      extremePoints.push({ x: placed.x, z: placed.z + placed.l, y: placed.y });
      extremePoints.push({ x: placed.x, z: placed.z, y: placed.y + placed.h });
      extremePoints = this.filterPoints(extremePoints, config.width, config.length, config.height);
    }

    const placements: Placement[] = packedItems.map((item) => ({
      pack: item.pack,
      product: item.product,
      itemId: item.id,
      x: item.x + item.w / 2 - config.width / 2,
      y: item.y + item.h / 2,
      z: item.z + item.l / 2 - config.length / 2,
      w: item.w,
      h: item.h,
      l: item.l,
      rotated: item.w !== item.product.boxW || item.l !== item.product.boxL,
    }));
    const productHeight = packedItems.reduce((height, item) => Math.max(height, item.y + item.h), 0);
    return {
      placements,
      productHeight,
      unpacked: sorted.filter((item) => !packedItems.some((packed) => packed.id === item.id)),
    };
  }

  seedExtremePoints(packedItems: PlacedItem[], maxWidth: number, maxLength: number, maxHeight: number): ExtremePoint[] {
    const points: ExtremePoint[] = [{ x: 0, z: 0, y: 0 }];
    packedItems.forEach((item) => {
      points.push({ x: item.x + item.w, z: item.z, y: item.y });
      points.push({ x: item.x, z: item.z + item.l, y: item.y });
      points.push({ x: item.x, z: item.z, y: item.y + item.h });
    });
    return this.filterPoints(points, maxWidth, maxLength, maxHeight);
  }

  toPlacement(item: PlacedItem, config: PalletizedConfig): Placement {
    return {
      pack: item.pack,
      product: item.product,
      itemId: item.id,
      x: config.origin.x + item.x + item.w / 2 - config.width / 2,
      y: config.baseHeight + item.y + item.h / 2,
      z: config.origin.z + item.z + item.l / 2 - config.length / 2,
      w: item.w,
      h: item.h,
      l: item.l,
      rotated: item.w !== item.product.boxW || item.l !== item.product.boxL,
      brick: !!item.brick,
      standReserved: !!item.standReserved,
      palletSlotIndex: config.palletSlotIndex,
    };
  }

  generateBricklaying(
    items: ExpandedItem[],
    maxLayers: number,
    packWidth: number,
    packLength: number,
  ): { packed: PlacedItem[]; remaining: ExpandedItem[] } {
    const packed: PlacedItem[] = [];
    const remaining = [...items];
    const xOffset = (packWidth - 96) / 2;
    const zOffset = (packLength - 128) / 2;
    for (let layer = 0; layer < maxLayers && remaining.length; layer++) {
      const y = layer * 32;
      const positions =
        layer % 2 === 0
          ? [
              { x: 0, z: 0, w: 32, l: 64 },
              { x: 0, z: 64, w: 32, l: 64 },
              { x: 32, z: 0, w: 64, l: 32 },
              { x: 32, z: 32, w: 64, l: 32 },
              { x: 32, z: 64, w: 64, l: 32 },
              { x: 32, z: 96, w: 64, l: 32 },
            ]
          : [
              { x: 0, z: 0, w: 64, l: 32 },
              { x: 0, z: 32, w: 64, l: 32 },
              { x: 0, z: 64, w: 64, l: 32 },
              { x: 0, z: 96, w: 64, l: 32 },
              { x: 64, z: 0, w: 32, l: 64 },
              { x: 64, z: 64, w: 32, l: 64 },
            ];
      for (const position of positions) {
        if (!remaining.length) break;
        const item = remaining.shift()!;
        packed.push({
          ...item,
          x: position.x + xOffset,
          z: position.z + zOffset,
          y,
          w: position.w,
          l: position.l,
          h: 32,
          brick: true,
        });
      }
    }
    return { packed, remaining };
  }

  isValidPlacement(
    candidate: CandidatePlacement,
    packWidth: number,
    packLength: number,
    packHeight: number,
    packedItems: PlacedItem[],
    obstacles: Obstacle[],
  ): boolean {
    if (candidate.x < 0 || candidate.x + candidate.w > packWidth) return false;
    if (candidate.z < 0 || candidate.z + candidate.l > packLength) return false;
    if (candidate.y < 0 || candidate.y + candidate.h > packHeight) return false;
    if ((candidate.sku || "").startsWith("LN") || (candidate.sku || "").startsWith("LP")) {
      for (const item of packedItems) {
        if (item.sku === candidate.sku && Math.abs(item.x - candidate.x) < 5 && Math.abs(item.z - candidate.z) < 5) {
          return false;
        }
      }
    }
    for (const item of packedItems) if (this.intersects(candidate, item)) return false;
    for (const obstacle of obstacles) {
      const xOverlap =
        Math.max(0, Math.min(candidate.x + candidate.w, obstacle.x + obstacle.w) - Math.max(candidate.x, obstacle.x));
      const zOverlap =
        Math.max(0, Math.min(candidate.z + candidate.l, obstacle.z + obstacle.l) - Math.max(candidate.z, obstacle.z));
      if (xOverlap > 0 && zOverlap > 0 && candidate.y + candidate.h > obstacle.y) return false;
    }
    if (candidate.y > 0) {
      const longFlat =
        (candidate.sku || "").startsWith("LN") ||
        (candidate.sku || "").startsWith("LP") ||
        candidate.priority === this.PRIORITY.DEMO_BOX;
      const requiredSupport = longFlat ? 0.5 : 2 / 3;
      if (this.getBottomSupportRatio(candidate, packedItems) < requiredSupport) return false;
    }
    return true;
  }

  getBottomSupportRatio(box: CandidatePlacement, packedItems: PlacedItem[]): number {
    const bottomArea = box.w * box.l;
    let supportedArea = 0;
    for (const item of packedItems) {
      if (Math.abs(item.y + item.h - box.y) < 0.1) {
        const ix = Math.max(0, Math.min(box.x + box.w, item.x + item.w) - Math.max(box.x, item.x));
        const iz = Math.max(0, Math.min(box.z + box.l, item.z + item.l) - Math.max(box.z, item.z));
        supportedArea += ix * iz;
      }
    }
    return supportedArea / bottomArea;
  }

  centerLayers(packedItems: PlacedItem[], totalWidth: number, totalLength: number, obstacles: Obstacle[] = []): void {
    const groups: Record<number, PlacedItem[]> = {};
    for (const item of packedItems) {
      if (item.priority === this.PRIORITY.STANDS) continue;
      const key = Math.round(item.y * 100) / 100;
      groups[key] = groups[key] || [];
      groups[key].push(item);
    }
    Object.values(groups).forEach((layerItems) => {
      if (!layerItems.length) return;
      const minX = Math.min(...layerItems.map((item) => item.x));
      const maxX = Math.max(...layerItems.map((item) => item.x + item.w));
      const minZ = Math.min(...layerItems.map((item) => item.z));
      const maxZ = Math.max(...layerItems.map((item) => item.z + item.l));
      let dx = totalWidth / 2 - (minX + maxX) / 2;
      let dz = totalLength / 2 - (minZ + maxZ) / 2;
      if (minX + dx < 0) dx = -minX;
      if (maxX + dx > totalWidth) dx = totalWidth - maxX;
      if (minZ + dz < 0) dz = -minZ;
      if (maxZ + dz > totalLength) dz = totalLength - maxZ;
      layerItems.forEach((item) => {
        item.x += dx;
        item.z += dz;
      });
      const unsafe = layerItems.some((item) => {
        const collidesItem = packedItems.some((other) => !layerItems.includes(other) && this.intersects(item, other));
        const collidesObstacle = obstacles.some((obstacle) => {
          const xOverlap =
            Math.max(0, Math.min(item.x + item.w, obstacle.x + obstacle.w) - Math.max(item.x, obstacle.x));
          const zOverlap =
            Math.max(0, Math.min(item.z + item.l, obstacle.z + obstacle.l) - Math.max(item.z, obstacle.z));
          return xOverlap > 0 && zOverlap > 0 && item.y + item.h > obstacle.y;
        });
        return collidesItem || collidesObstacle;
      });
      if (unsafe) {
        layerItems.forEach((item) => {
          item.x -= dx;
          item.z -= dz;
        });
      }
    });
  }

  intersects(a: CandidatePlacement | PlacedItem, b: CandidatePlacement | PlacedItem): boolean {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.z < b.z + b.l &&
      a.z + a.l > b.z &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  getFlatRotations(w: number, l: number, h: number, _sku = ""): [number, number, number][] {
    const variants: [number, number, number][] = [
      [w, l, h],
      [l, w, h],
    ];
    const seen = new Set<string>();
    return variants.filter((rotation) => {
      const key = rotation.join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  getRotations(w: number, l: number, h: number, sku = ""): [number, number, number][] {
    const variants: [number, number, number][] = [
      [w, l, h],
      [l, w, h],
      [w, h, l],
      [l, h, w],
      [h, w, l],
      [h, l, w],
    ];
    const seen = new Set<string>();
    let filtered = variants;
    const s = (sku || "").toUpperCase();
    if (s.startsWith("LN") || (s.startsWith("LP") && !s.startsWith("LPM") && !s.startsWith("LP.P") && !s.startsWith("LPB"))) {
      filtered = variants.filter((rotation) => rotation[2] <= rotation[0] && rotation[2] <= rotation[1]);
    }
    filtered.sort((a, b) => a[2] - b[2] || b[0] * b[1] - a[0] * a[1]);
    return filtered.filter((rotation) => {
      const key = rotation.join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  centeredColumnPositions(containerWidth: number, itemWidth: number): number[] {
    const positions = [0];
    for (let offset = 1; offset * itemWidth + itemWidth / 2 <= containerWidth / 2 + 0.001; offset++) {
      positions.push(offset * itemWidth, -offset * itemWidth);
    }
    return positions;
  }

  filterPoints(points: ExtremePoint[], maxWidth: number, maxLength: number, maxHeight: number): ExtremePoint[] {
    const seen = new Set<string>();
    return points
      .filter((point) => {
        if (point.x >= maxWidth || point.z >= maxLength || point.y >= maxHeight) return false;
        const key = `${Math.round(point.x * 100) / 100},${Math.round(point.z * 100) / 100},${Math.round(point.y * 100) / 100}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          a.y - b.y ||
          Math.abs(a.x - maxWidth / 2) + Math.abs(a.z - maxLength / 2) -
            (Math.abs(b.x - maxWidth / 2) + Math.abs(b.z - maxLength / 2)),
      );
  }
}
