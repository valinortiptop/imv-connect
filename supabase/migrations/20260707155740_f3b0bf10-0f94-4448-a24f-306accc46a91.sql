-- Link almacenes to empresas (companies) so each company has its own warehouse list.
ALTER TABLE public.almacenes
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_almacenes_empresa_id ON public.almacenes(empresa_id);

-- Backfill: attach any existing almacenes without an empresa to the default empresa (if one exists).
UPDATE public.almacenes a
   SET empresa_id = e.id
  FROM public.empresas e
 WHERE a.empresa_id IS NULL
   AND e.is_default = true;

-- Ensure basic grants (idempotent)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almacenes TO authenticated;
GRANT ALL ON public.almacenes TO service_role;
