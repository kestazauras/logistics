-- Logistics optimizer tables (applied as logistics_initial_schema on Supabase)
-- Seed data: run `npm run seed:sql` then execute scripts/seed-generated.sql

CREATE TABLE IF NOT EXISTS public.logistics_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  code text,
  ean_code text,
  hs_code text,
  name text NOT NULL,
  gross_weight_kg numeric NOT NULL DEFAULT 0,
  net_weight_kg numeric NOT NULL DEFAULT 0,
  height_cm numeric,
  width_cm numeric,
  length_cm numeric,
  transport_box_qty integer NOT NULL DEFAULT 1,
  transport_box_height_cm numeric,
  transport_box_length_cm numeric,
  transport_box_width_cm numeric,
  max_units_fin_pallet integer,
  layer_units_fin integer,
  max_layers_fin integer,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.logistics_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  weight_kg numeric NOT NULL DEFAULT 0,
  height_cm numeric,
  width_cm numeric,
  length_cm numeric,
  internal_height_mm integer,
  internal_width_mm integer,
  internal_length_mm integer,
  max_height_cm numeric,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.logistics_packaging_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.logistics_packing_config (
  config_key text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.logistics_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_packaging_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_packing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS logistics_products_anon_read ON public.logistics_products
  FOR SELECT TO anon USING (is_active = true);

CREATE POLICY IF NOT EXISTS logistics_options_anon_read ON public.logistics_options
  FOR SELECT TO anon USING (is_active = true);

CREATE POLICY IF NOT EXISTS logistics_packaging_rules_anon_read ON public.logistics_packaging_rules
  FOR SELECT TO anon USING (is_active = true);

CREATE POLICY IF NOT EXISTS logistics_packing_config_anon_read ON public.logistics_packing_config
  FOR SELECT TO anon USING (true);
