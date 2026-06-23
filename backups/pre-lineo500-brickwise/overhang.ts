import type { Product, TransportRecord } from "./types";
import { lineoPlanarOrientation, pickLineoLayerGrid } from "./packing/lineo-grid";

const MAX_OVERHANG_CM = 50;

type LayerGrid = { cols: number; rows: number };

/** LINEO-500: 2 rows width-wise × 4 pcs length-wise on pallet (long side across width). */
function lineo500PalletOrientation(boxW: number, boxL: number, boxH: number): { w: number; l: number; h: number } {
  const dims = [boxW, boxL, boxH].sort((a, b) => a - b);
  return { w: dims[2], l: dims[1], h: dims[0] };
}

function layerGridForProduct(
  product: Product,
  palletWidth: number,
  palletLength: number,
): LayerGrid | null {
  if (["RN150", "RN160"].includes(product.code)) return { cols: 3, rows: 3 };
  if (product.cat === "LINEO (75mm)" && product.name.includes("LINEO-500")) {
    return { cols: 2, rows: 4 };
  }
  if (product.cat === "LINEO (75mm)") {
    const units = product.layerUnitsFin || 6;
    const oriented = lineoPlanarOrientation(product.boxW, product.boxL, product.boxH, 0, false);
    return pickLineoLayerGrid(units, oriented.w, oriented.l, palletWidth, palletLength);
  }
  if (
    product.cat === "LINEO PRO ventilation diffusers" ||
    product.cat === "LINEO PRO CONDI diffusers for A/C & ventilation"
  ) {
    if (!product.layerUnitsFin) return null;
    const oriented = lineoPlanarOrientation(product.boxW, product.boxL, product.boxH, 0, false);
    return (
      pickLineoLayerGrid(product.layerUnitsFin, oriented.w, oriented.l, palletWidth, palletLength) ?? {
        cols: product.layerUnitsFin,
        rows: 1,
      }
    );
  }
  return null;
}

function requiredForGrid(
  grid: LayerGrid,
  boxW: number,
  boxL: number,
  boxH: number,
  palletWidth: number,
  palletLength: number,
  product?: Product,
): number {
  const oriented =
    product?.cat === "LINEO (75mm)" && product.name.includes("LINEO-500")
      ? lineo500PalletOrientation(boxW, boxL, boxH)
      : lineoPlanarOrientation(boxW, boxL, boxH, 0, false);
  const needWidth = grid.cols * oriented.w - palletWidth;
  const needLength = grid.rows * oriented.l - palletLength;
  return Math.max(0, needWidth, needLength);
}

/** Minimum total overhang (cm) so one full catalog layer fits on the pallet footprint. */
export function requiredOverhangForProduct(
  product: Product,
  palletWidth: number,
  palletLength: number,
): number {
  const grid = layerGridForProduct(product, palletWidth, palletLength);
  if (!grid) return 0;
  return requiredForGrid(grid, product.boxW, product.boxL, product.boxH, palletWidth, palletLength, product);
}

/** Default header overhang: max needed across catalog for the given pallet to hit per-layer limits. */
export function computeDefaultPalletOverhang(
  products: Product[],
  transport: Pick<TransportRecord, "type" | "w" | "l">,
  maxCm = MAX_OVERHANG_CM,
): number {
  if (transport.type !== "pallet") return 0;
  let required = 0;
  for (const product of products) {
    required = Math.max(required, requiredOverhangForProduct(product, transport.w, transport.l));
  }
  return Math.min(maxCm, Math.ceil(required));
}

export function findFinPalletHighTransport(transports: TransportRecord[]): TransportRecord | undefined {
  return transports.find((transport) => transport.name.toLowerCase().includes("fin pallet high"));
}
