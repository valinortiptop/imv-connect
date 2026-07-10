ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS required_documents jsonb NOT NULL DEFAULT '{"cash": [], "transfer": []}'::jsonb;

-- Refresh clients view to include the new column
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_viewdef('public.clients'::regclass, true) INTO v_def;
  EXECUTE 'CREATE OR REPLACE VIEW public.clients AS SELECT c.*, c.razon_social AS name_legacy_placeholder FROM public.clientes c';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';