
-- 1) Bucket privado para CSD (creado vía tool si aplica; aquí solo RLS por si ya existe)
-- El bucket "csd" debe crearse con supabase--storage_create_bucket (private).

-- 2) Tabla que registra el CSD activo por empresa (metadatos únicamente; los archivos viven en storage.csd)
CREATE TABLE IF NOT EXISTS public.empresa_csd (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  rfc TEXT NOT NULL,
  no_certificado TEXT NOT NULL,
  cer_path TEXT NOT NULL,           -- ruta en bucket csd, ej: {empresa_id}/csd.cer
  key_path TEXT NOT NULL,           -- ruta en bucket csd, ej: {empresa_id}/csd.key
  cer_pem TEXT NOT NULL,            -- contenido base64 del .cer (para inyectar en <Sello Certificado="...">)
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  tipo TEXT NOT NULL DEFAULT 'CSD', -- 'CSD' | 'FIEL' (solo CSD es válido para Contabilidad Electrónica)
  is_active BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS empresa_csd_active_uniq
  ON public.empresa_csd(empresa_id) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_csd TO authenticated;
GRANT ALL ON public.empresa_csd TO service_role;

ALTER TABLE public.empresa_csd ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csd_select_admin_conta" ON public.empresa_csd
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));

CREATE POLICY "csd_insert_admin_conta" ON public.empresa_csd
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));

CREATE POLICY "csd_update_admin_conta" ON public.empresa_csd
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));

CREATE POLICY "csd_delete_admin_conta" ON public.empresa_csd
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));

-- trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_empresa_csd_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS empresa_csd_touch ON public.empresa_csd;
CREATE TRIGGER empresa_csd_touch BEFORE UPDATE ON public.empresa_csd
  FOR EACH ROW EXECUTE FUNCTION public.tg_empresa_csd_touch();

-- 3) RLS del bucket csd (storage.objects) — solo admin/contabilidad
CREATE POLICY "csd_bucket_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'csd' AND public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));

CREATE POLICY "csd_bucket_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'csd' AND public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));

CREATE POLICY "csd_bucket_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'csd' AND public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));

CREATE POLICY "csd_bucket_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'csd' AND public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));
