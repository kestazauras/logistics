import { createClient } from "@supabase/supabase-js";
import { GROUP_ORDER } from "./constants";
import {
  buildPackagingRules,
  parseLogisticsRow,
  parseProductRow,
  sortProducts,
  type DbLogisticsRow,
  type DbProductRow,
} from "./data";
import type { PackagingRules, Product, TransportRecord } from "./types";

export interface PackingConfig {
  max_capacities: Record<string, Record<string, number>>;
  group_order: string[];
  order_export_columns: string[];
}

export interface AppData {
  products: Product[];
  logistics: TransportRecord[];
  packagingRules: PackagingRules;
  packingConfig: PackingConfig;
  groupOrder: readonly string[];
}

function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(url, key);
}

export async function loadAppData(): Promise<AppData> {
  const supabase = createSupabaseServerClient();

  const [productsRes, optionsRes, rulesRes, configRes] = await Promise.all([
    supabase.from("logistics_products").select("*").order("sort_order"),
    supabase.from("logistics_options").select("*").order("sort_order"),
    supabase.from("logistics_packaging_rules").select("rule_key, payload"),
    supabase.from("logistics_packing_config").select("config_key, payload"),
  ]);

  if (productsRes.error) throw productsRes.error;
  if (optionsRes.error) throw optionsRes.error;
  if (rulesRes.error) throw rulesRes.error;
  if (configRes.error) throw configRes.error;

  const packagingRules = buildPackagingRules(rulesRes.data ?? []);

  const products = sortProducts(
    (productsRes.data as DbProductRow[])
      .map((row, index) => parseProductRow(row, index))
      .filter((product): product is Product => product !== null),
  );

  const logistics = (optionsRes.data as DbLogisticsRow[]).map((row) =>
    parseLogisticsRow(row, packagingRules),
  );

  const configMap = Object.fromEntries(
    (configRes.data ?? []).map((row: { config_key: string; payload: unknown }) => [
      row.config_key,
      row.payload,
    ]),
  );

  const packingConfig: PackingConfig = {
    max_capacities: (configMap.max_capacities as PackingConfig["max_capacities"]) ?? {},
    group_order: (configMap.group_order as string[]) ?? [...GROUP_ORDER],
    order_export_columns: (configMap.order_export_columns as string[]) ?? [],
  };

  return {
    products,
    logistics,
    packagingRules,
    packingConfig,
    groupOrder: packingConfig.group_order.length ? packingConfig.group_order : GROUP_ORDER,
  };
}
