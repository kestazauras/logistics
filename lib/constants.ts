export const GROUP_ORDER = [
  "Gypsum diffusers",
  "LINEO (75mm)",
  "LINEO PRO ventilation diffusers",
  "LINEO PRO CONDI diffusers for A/C & ventilation",
  "Moulages",
  "AERO PRO",
  "Spare parts and accessories (Gypsum and LINEO)",
  "Marketing displays",
] as const;

export type ProductGroup = (typeof GROUP_ORDER)[number];

export const GROUP_COLORS: Record<string, number> = {
  "Gypsum diffusers": 0xf1f5f9,
  "LINEO (75mm)": 0x64748b,
  "LINEO PRO ventilation diffusers": 0x0f172a,
  "LINEO PRO CONDI diffusers for A/C & ventilation": 0x334155,
  Moulages: 0x10b981,
  "AERO PRO": 0x8b5cf6,
  "Spare parts and accessories (Gypsum and LINEO)": 0xff671f,
  "Marketing displays": 0xf59e0b,
};

export const PRODUCT_PALETTES: Record<string, number[]> = {
  gypsum: [0x1e40af, 0xea580c, 0x0d9488, 0xbe185d, 0x059669, 0x7c3aed, 0x475569, 0xca8a04],
  lineo: [0x10b981, 0x34d399, 0x059669],
  lineoPro: [0x06b6d4, 0x0891b2, 0x0e7490, 0x155e75, 0x67e8f9, 0x22d3ee, 0x0284c7, 0x0369a1],
  condi: [0xdbeafe, 0x93c5fd, 0x3b82f6, 0x1d4ed8],
  moulages: [0xbbf7d0, 0x86efac, 0x4ade80, 0x22c55e, 0x16a34a],
  aero: [0xddd6fe, 0xc4b5fd],
  spare: [0xfce7f3, 0xfbcfe8, 0xf9a8d4, 0xf472b6],
  display: [0x111827, 0xf59e0b],
  stand: [0x78350f],
};

export const ORDER_EXPORT_COLUMNS = [
  "Product code",
  "Product name",
  "Quantity",
  "Gross weight",
  "Net weight",
  "Total",
] as const;

export const PACKAGING_RULES = {
  overhang: {
    rule: "Loads are centered on the pallet. Allowed overhang is total extra footprint, split equally on every side.",
    example: "10 cm overhang means +5 cm left, +5 cm right, +5 cm front, +5 cm back.",
    splitAcrossSides: true,
    floorLoadedContainerOverhangAllowed: false,
  },
  palletLoadedContainer: {
    rule: "Pallets inside a pallet-loaded container must fit within the container internal length and width. Pallet plus cargo height must not exceed internal height minus 10 cm.",
    palletFootprintCm: { width: 100, length: 120, height: 15 },
    showPalletsInsideContainer: true,
    loadingSequence: "Fill one pallet position from bottom to top before loading the next pallet position.",
  },
  rondoKvadro100125: {
    appliesToCodes: ["RN100", "RN125", "KV100", "KV125", "RN100.CO", "RN125.CO"],
    layerPattern: [
      "Layer A: 4 boxes along the left pallet length using 32+32+32+32 cm and 2 boxes along the right pallet length using 62+62 cm.",
      "Layer B: mirrored for stability, 4 boxes on the right and 2 boxes on the left.",
    ],
    alternatingLayers: true,
  },
  floorLoadedContainer: {
    rule: "No pallet and no overhang. Products are stacked from the container floor up. Container internal length, width and height are the hard limits.",
    example: "40HQ floor-loaded container should be evaluated by internal dimensions only for RONDO/KVADRO 100/125 capacity.",
  },
  lineoLayering: {
    rule: "If LINEO models fit by pallet length and width, alternate layers by 90 degrees.",
    alternatingLayers: true,
  },
  rondoKvadroFullLayer: {
    rule: "Pallet orders for RONDO/KVADRO/COANDA gypsum diffusers should complete stable full layers.",
    smallModelCodes: ["RN100", "RN125", "KV100", "KV125", "RN100.CO", "RN125.CO"],
    smallLayerUnits: 24,
    largeModelCodes: ["RN150", "RN160"],
    largeLayerUnits: 18,
    appliesToPalletOrdersOnly: true,
  },
  centering: {
    palletRule: "Products placed on pallets are centered so opposite-side overhang is identical. Partial layers are placed in the middle, not from one side.",
    floorLoadedContainerRule: "Floor-loaded containers are filled from the centered bottom position at the farthest wall. One vertical column is filled before moving to the next column.",
  },
  placementPriority: [
    { rank: 1, label: "Metal stand and traffic light stand", rule: "Always centered on the pallet bottom. Other items can be placed around them if they fit, but never below or on top of them." },
    { rank: 2, label: "Gypsum diffusers" },
    { rank: 3, label: "LINEO PRO diffusers and LINEO diffusers" },
    { rank: 4, label: "AERO PRO products" },
    { rank: 5, label: "Moulages" },
    { rank: 6, label: "Display boxes" },
    { rank: 7, label: "Spare parts and accessories" },
  ],
} as const;
