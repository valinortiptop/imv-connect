
CREATE OR REPLACE FUNCTION public.fmt_month(d date) RETURNS text
  LANGUAGE sql IMMUTABLE AS
$$ SELECT extract(year from d)::int::text || '-' || lpad(extract(month from d)::int::text, 2, '0') $$;

CREATE TABLE IF NOT EXISTS public.warehouse_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  block text, row_letter text, position integer, zone text, access_type text,
  blocked boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_slots TO authenticated;
GRANT ALL ON public.warehouse_slots TO service_role;
ALTER TABLE public.warehouse_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_all ON public.warehouse_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.slot_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.warehouse_slots(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  order_id uuid, order_item_id uuid, description text, lote text, barcode text,
  quantity numeric NOT NULL DEFAULT 0, expiration_date date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slot_contents_slot ON public.slot_contents(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_contents_product ON public.slot_contents(product_id);
CREATE INDEX IF NOT EXISTS idx_slot_contents_order ON public.slot_contents(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slot_contents TO authenticated;
GRANT ALL ON public.slot_contents TO service_role;
ALTER TABLE public.slot_contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY sc_all ON public.slot_contents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.slot_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid REFERENCES public.warehouse_slots(id) ON DELETE SET NULL,
  from_slot_id uuid REFERENCES public.warehouse_slots(id) ON DELETE SET NULL,
  to_slot_id uuid REFERENCES public.warehouse_slots(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0, reason text, user_id uuid, user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slot_movements_slot ON public.slot_movements(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_movements_product ON public.slot_movements(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slot_movements TO authenticated;
GRANT ALL ON public.slot_movements TO service_role;
ALTER TABLE public.slot_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY sm_all ON public.slot_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stock_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_code text UNIQUE DEFAULT ('ENT-'||to_char(now(),'YYYYMMDD')||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  delivery_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier text, reference text,
  delivery_status text NOT NULL DEFAULT 'Pendiente',
  notes text, uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_deliveries TO authenticated;
GRANT ALL ON public.stock_deliveries TO service_role;
ALTER TABLE public.stock_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY sd_all ON public.stock_deliveries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid REFERENCES public.stock_deliveries(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  order_id uuid, entry_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity numeric NOT NULL DEFAULT 0, supplier text, notes text,
  entry_status text DEFAULT 'Pendiente', is_torton boolean DEFAULT false,
  maniobra_vendor text, maniobra_crew_size integer, maniobra_rate_per_person numeric,
  maniobra_cost numeric, factory_rate_per_bulto numeric, factory_reimbursement numeric,
  promo_id uuid, effective_weight_kg numeric, is_gifted boolean DEFAULT false,
  cost_with_iva numeric, cost_without_iva numeric,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_entries_delivery ON public.stock_entries(delivery_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_product ON public.stock_entries(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_entries TO authenticated;
GRANT ALL ON public.stock_entries TO service_role;
ALTER TABLE public.stock_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY se_all ON public.stock_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stock_delivery_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.stock_deliveries(id) ON DELETE CASCADE,
  category text, file_name text NOT NULL, file_path text NOT NULL,
  file_type text, file_size bigint,
  uploaded_at timestamptz NOT NULL DEFAULT now(), uploaded_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_delivery_documents TO authenticated;
GRANT ALL ON public.stock_delivery_documents TO service_role;
ALTER TABLE public.stock_delivery_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY sdd_all ON public.stock_delivery_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  order_id uuid, original_quantity numeric NOT NULL DEFAULT 0,
  remaining_quantity numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendiente', reason text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY sa_all ON public.stock_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.damaged_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  order_id uuid, original_quantity numeric NOT NULL DEFAULT 0,
  remaining_quantity numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendiente',
  cost_with_iva numeric, bonificacion_pct numeric,
  stock_adjustment numeric DEFAULT 0, delivery_date date,
  reason text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_damaged_batches_product ON public.damaged_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_damaged_batches_order ON public.damaged_batches(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.damaged_batches TO authenticated;
GRANT ALL ON public.damaged_batches TO service_role;
ALTER TABLE public.damaged_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY db_all ON public.damaged_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.sku_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_clave text NOT NULL UNIQUE, canonical_clave text NOT NULL,
  product_id uuid REFERENCES public.productos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sku_aliases TO authenticated;
GRANT ALL ON public.sku_aliases TO service_role;
ALTER TABLE public.sku_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY ska_all ON public.sku_aliases FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.transport_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, capacity_bultos integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_types TO authenticated;
GRANT ALL ON public.transport_types TO service_role;
ALTER TABLE public.transport_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY tt_all ON public.transport_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.delivery_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_date date NOT NULL DEFAULT CURRENT_DATE,
  truck_provider text, truck_type text, truck_capacity_bultos integer,
  truck_cost numeric DEFAULT 0, staff_cost numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'programado',
  month text GENERATED ALWAYS AS (public.fmt_month(trip_date)) STORED,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_date ON public.delivery_trips(trip_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_trips TO authenticated;
GRANT ALL ON public.delivery_trips TO service_role;
ALTER TABLE public.delivery_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY dt_all ON public.delivery_trips FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.delivery_trip_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.delivery_trips(id) ON DELETE CASCADE,
  order_id uuid, product_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dti_trip ON public.delivery_trip_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_dti_order ON public.delivery_trip_items(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_trip_items TO authenticated;
GRANT ALL ON public.delivery_trip_items TO service_role;
ALTER TABLE public.delivery_trip_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY dti_all ON public.delivery_trip_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.delivery_reveal_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid, trip_id uuid REFERENCES public.delivery_trips(id) ON DELETE SET NULL,
  storage_path text NOT NULL, caption text,
  taken_at timestamptz NOT NULL DEFAULT now(), uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_reveal_photos TO authenticated;
GRANT ALL ON public.delivery_reveal_photos TO service_role;
ALTER TABLE public.delivery_reveal_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY drp_all ON public.delivery_reveal_photos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.logistics_last_seen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_last_seen TO authenticated;
GRANT ALL ON public.logistics_last_seen TO service_role;
ALTER TABLE public.logistics_last_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY lls_all ON public.logistics_last_seen FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.delivery_summary AS
SELECT p.id, p.sku AS clave, p.nombre AS name, p.proveedor AS supplier,
  p.peso_kg AS weight_kg, p.imagen_url AS image_url, p.activo AS active,
  (SELECT max(sd.delivery_date) FROM public.stock_entries se
    JOIN public.stock_deliveries sd ON sd.id = se.delivery_id WHERE se.product_id = p.id) AS last_delivery_date,
  (SELECT sd.delivery_code FROM public.stock_entries se
    JOIN public.stock_deliveries sd ON sd.id = se.delivery_id WHERE se.product_id = p.id
    ORDER BY sd.delivery_date DESC NULLS LAST LIMIT 1) AS delivery_code
FROM public.productos p;
GRANT SELECT ON public.delivery_summary TO authenticated;
GRANT ALL ON public.delivery_summary TO service_role;
