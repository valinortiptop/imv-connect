
-- ============ COTIZACIONES ============
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  status text NOT NULL DEFAULT 'draft',
  source text,
  contact_name text,
  contact_phone text,
  shipping_address text,
  notes text,
  delivery_date date,
  payment_method text,
  price_list_id uuid,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  converted_to_order_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotes_all ON public.quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_items_all ON public.quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ MANIOBRA ============
CREATE TABLE IF NOT EXISTS public.maniobra_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date date NOT NULL UNIQUE,
  trucks jsonb NOT NULL DEFAULT '[]'::jsonb,
  pickup_order_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maniobra_plans TO authenticated;
GRANT ALL ON public.maniobra_plans TO service_role;
ALTER TABLE public.maniobra_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY mp_all ON public.maniobra_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.maniobra_pins (
  role text PRIMARY KEY,
  display_name text,
  pin_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maniobra_pins TO authenticated;
GRANT ALL ON public.maniobra_pins TO service_role;
ALTER TABLE public.maniobra_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY mpi_all ON public.maniobra_pins FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.maniobra_count_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date date NOT NULL,
  line_key text,
  delta numeric(12,3) NOT NULL DEFAULT 0,
  action text,
  actor_label text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mce_plan_date ON public.maniobra_count_events(plan_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maniobra_count_events TO authenticated;
GRANT ALL ON public.maniobra_count_events TO service_role;
ALTER TABLE public.maniobra_count_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY mce_all ON public.maniobra_count_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ PARTNERS ============
CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY partners_all ON public.partners FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.partner_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  shipment_code text DEFAULT ('PS-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  shipment_date date NOT NULL DEFAULT CURRENT_DATE,
  adm_proof_path text,
  adm_total_cost numeric(14,2) DEFAULT 0,
  charged_to_partner numeric(14,2),
  partner_paid_at timestamptz,
  payment_proof_path text,
  payment_reference text,
  payment_method text,
  payment_bank text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_shipments TO authenticated;
GRANT ALL ON public.partner_shipments TO service_role;
ALTER TABLE public.partner_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ps_all ON public.partner_shipments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.partner_shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.partner_shipments(id) ON DELETE CASCADE,
  product_id uuid,
  clave text,
  description text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  kilos numeric(14,3),
  cost_without_iva numeric(14,4),
  cost_with_iva numeric(14,4),
  importe numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_shipment_items TO authenticated;
GRANT ALL ON public.partner_shipment_items TO service_role;
ALTER TABLE public.partner_shipment_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY psi_all ON public.partner_shipment_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.partner_monthly_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  reported_revenue numeric(14,2) DEFAULT 0,
  cost_basis numeric(14,2) DEFAULT 0,
  gross_profit numeric(14,2) DEFAULT 0,
  our_share numeric(14,2) DEFAULT 0,
  partner_share numeric(14,2) DEFAULT 0,
  settled_at timestamptz,
  proof_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_monthly_settlements TO authenticated;
GRANT ALL ON public.partner_monthly_settlements TO service_role;
ALTER TABLE public.partner_monthly_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_all ON public.partner_monthly_settlements FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.monthly_bonificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL UNIQUE,
  naucalpan_amount numeric(14,2) DEFAULT 0,
  tamemes_amount numeric(14,2) DEFAULT 0,
  gdl_amount numeric(14,2) DEFAULT 0,
  tamemes_settled_at timestamptz,
  gdl_settled_at timestamptz,
  notes text,
  proof_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_bonificaciones TO authenticated;
GRANT ALL ON public.monthly_bonificaciones TO service_role;
ALTER TABLE public.monthly_bonificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY mb_all ON public.monthly_bonificaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.bonifications_received (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  product_id uuid,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  received_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonifications_received TO authenticated;
GRANT ALL ON public.bonifications_received TO service_role;
ALTER TABLE public.bonifications_received ENABLE ROW LEVEL SECURITY;
CREATE POLICY br_all ON public.bonifications_received FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ PROSPECTS ============
CREATE TABLE IF NOT EXISTS public.prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text,
  name text,
  contact_person text,
  municipio text,
  colonia text,
  direccion text,
  status text NOT NULL DEFAULT 'nuevo',
  source text,
  assigned_to uuid,
  notes text,
  converted_client_id uuid,
  enriched_at timestamptz,
  enrichment_status text,
  place_id text,
  lat numeric,
  lng numeric,
  rating numeric,
  review_count integer,
  website text,
  business_status text,
  opening_hours jsonb,
  description text,
  google_maps_url text,
  manual_maps_url text,
  primary_type text,
  price_level text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospects TO authenticated;
GRANT ALL ON public.prospects TO service_role;
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY pros_all ON public.prospects FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.prospect_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  called_at timestamptz NOT NULL DEFAULT now(),
  outcome text,
  notes text,
  next_action_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_prospect ON public.prospect_calls(prospect_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_calls TO authenticated;
GRANT ALL ON public.prospect_calls TO service_role;
ALTER TABLE public.prospect_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY pc_all ON public.prospect_calls FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ RRHH / FINANZAS ============
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text,
  payment_frequency text,
  base_amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text,
  start_date date,
  end_date date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY emp_all ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_type text,
  payment_method text,
  days_worked numeric(8,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_employee ON public.payroll_payments(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_payments TO authenticated;
GRANT ALL ON public.payroll_payments TO service_role;
ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY pp_all ON public.payroll_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.fixed_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  subcategory text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  frequency text,
  month date,
  expense_date date,
  payment_method text,
  is_recurring boolean DEFAULT false,
  vendor text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_expenses TO authenticated;
GRANT ALL ON public.fixed_expenses TO service_role;
ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY fe_all ON public.fixed_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.margins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid UNIQUE,
  cost_without_iva numeric(14,4),
  cost_with_iva numeric(14,4),
  bonificacion_pct numeric(8,4) DEFAULT 0,
  margin_pct numeric(8,4),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.margins TO authenticated;
GRANT ALL ON public.margins TO service_role;
ALTER TABLE public.margins ENABLE ROW LEVEL SECURITY;
CREATE POLICY mg_all ON public.margins FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ MISCELÁNEOS ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text,
  category text,
  priority text DEFAULT 'normal',
  title text NOT NULL,
  description text,
  route text,
  user_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_all ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.system_config (
  key text PRIMARY KEY,
  value text,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_config TO authenticated;
GRANT ALL ON public.system_config TO service_role;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY sc_all ON public.system_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.centrales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state text,
  type text,
  status text,
  petfood_potential_tier text,
  city text,
  address text,
  contact text,
  phone text,
  notes text,
  lat numeric,
  lng numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.centrales TO authenticated;
GRANT ALL ON public.centrales TO service_role;
ALTER TABLE public.centrales ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctr_all ON public.centrales FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_pinned boolean NOT NULL DEFAULT false,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_all ON public.chat_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  route_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, route_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY upo_all ON public.user_permission_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.product_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  promo_clave text,
  promo_name text,
  promo_weight_kg numeric(10,3),
  promo_cost_with_iva numeric(14,4),
  promo_cost_without_iva numeric(14,4),
  description text,
  valid_from date,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_promotions TO authenticated;
GRANT ALL ON public.product_promotions TO service_role;
ALTER TABLE public.product_promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pp_promo_all ON public.product_promotions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  clave text,
  product_name text,
  image_url text,
  supplier text,
  price numeric(14,4),
  cost_with_iva numeric(14,4),
  cost_without_iva numeric(14,4),
  bonificacion_pct numeric(8,4) DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_prices TO authenticated;
GRANT ALL ON public.product_prices TO service_role;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY pp_prices_all ON public.product_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);
