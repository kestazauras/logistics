export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function parseNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseInteger(value: unknown, fallback = 0): number {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseDelimited(text: string): string[][] {
  const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

export function normalizeDimensions(h: unknown, w: unknown, l: unknown): { h: number; w: number; l: number } {
  let dims = [parseNumber(h, 0), parseNumber(w, 0), parseNumber(l, 0)];
  if (Math.max(...dims) > 300) dims = dims.map((value) => value / 10);
  return { h: dims[0], w: dims[1], l: dims[2] };
}

export function normalizeGroup(rawCategory: string | undefined | null): string {
  const raw = (rawCategory || "").trim();
  if (raw.includes("Accessories") || raw.includes("LINEO Spare Parts")) {
    return "Spare parts and accessories (Gypsum and LINEO)";
  }
  if (raw.includes("Gypsum diffusers")) return "Gypsum diffusers";
  if (raw.includes("LINEO 500")) return "LINEO (75mm)";
  if (raw.includes("LINEO PRO AC")) return "LINEO PRO CONDI diffusers for A/C & ventilation";
  if (raw.includes("LINEO PRO ventilation")) return "LINEO PRO ventilation diffusers";
  if (raw.includes("Moulages")) return "Moulages";
  if (raw.includes("AERO-PRO")) return "AERO PRO";
  if (raw.includes("Marketing")) return "Marketing displays";
  return raw || "Spare parts and accessories (Gypsum and LINEO)";
}

export function productSubGroup(rawCategory: string | undefined | null): string {
  const raw = (rawCategory || "").trim();
  if (raw.includes("Accessories")) return "Gypsum models";
  if (raw.includes("LINEO Spare Parts")) return "LINEO models";
  if (raw.includes("LINEO PRO ventilation - 1 slot")) return "1 slot";
  if (raw.includes("LINEO PRO ventilation - 2 slot")) return "2 slots";
  if (raw.includes("Moulages 1 slot")) return "1 slot";
  if (raw.includes("Moulages 2 slot")) return "2 slots";
  return "";
}
