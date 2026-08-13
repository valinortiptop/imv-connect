-- 1) Bitácora de sincronizaciones NetSuite
CREATE TABLE IF NOT EXISTS public.netsuite_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  trigger_source text NOT NULL DEFAULT 'manual',
  date_from date,
  date_to date,
  rows_read integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  unmatched jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.netsuite_sync_runs TO authenticated;
GRANT ALL ON public.netsuite_sync_runs TO service_role;

ALTER TABLE public.netsuite_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_netsuite_runs" ON public.netsuite_sync_runs;
CREATE POLICY "admins_read_netsuite_runs"
  ON public.netsuite_sync_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS netsuite_sync_runs_entity_started_idx
  ON public.netsuite_sync_runs (entity, started_at DESC);

CREATE OR REPLACE FUNCTION public.netsuite_sync_runs_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_netsuite_sync_runs_touch ON public.netsuite_sync_runs;
CREATE TRIGGER trg_netsuite_sync_runs_touch
  BEFORE UPDATE ON public.netsuite_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.netsuite_sync_runs_touch();

-- 2) Identificadores NetSuite para upserts idempotentes
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS netsuite_id text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS netsuite_id text;
ALTER TABLE public.sales_history ADD COLUMN IF NOT EXISTS netsuite_line_id text;
ALTER TABLE public.sales_history ADD COLUMN IF NOT EXISTS netsuite_tran_id text;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_netsuite_id_uidx
  ON public.clientes (netsuite_id) WHERE netsuite_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS productos_netsuite_id_uidx
  ON public.productos (netsuite_id) WHERE netsuite_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_history_netsuite_line_uidx
  ON public.sales_history (netsuite_line_id) WHERE netsuite_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_history_netsuite_tran_idx
  ON public.sales_history (netsuite_tran_id) WHERE netsuite_tran_id IS NOT NULL;