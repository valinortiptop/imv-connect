
-- 1. Create empresas table
CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social text NOT NULL,
  nombre_comercial text,
  rfc text NOT NULL,
  regimen_fiscal text,
  uso_cfdi_default text,
  cp_fiscal text,
  direccion_fiscal text,
  lugar_expedicion text,
  telefono text,
  email_contacto text,
  sitio_web text,
  representante_legal text,
  logo_url text,
  serie_factura_default text,
  folio_next integer NOT NULL DEFAULT 1,
  moneda_default text NOT NULL DEFAULT 'MXN',
  iva_default numeric(5,2) NOT NULL DEFAULT 16.00,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Only one default at a time
CREATE UNIQUE INDEX empresas_only_one_default
  ON public.empresas ((true))
  WHERE is_default = true;

CREATE INDEX empresas_active_idx ON public.empresas (active);

-- 2. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;

-- 3. RLS
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read empresas"
  ON public.empresas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert empresas"
  ON public.empresas FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update empresas"
  ON public.empresas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins can delete empresas"
  ON public.empresas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION public.empresas_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;

CREATE TRIGGER empresas_touch_trg
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.empresas_touch();

-- 5. Seed from empresa_datos (if a row exists)
INSERT INTO public.empresas (
  razon_social, rfc, regimen_fiscal, cp_fiscal, direccion_fiscal,
  telefono, email_contacto, sitio_web, representante_legal,
  moneda_default, iva_default, is_default, active
)
SELECT
  COALESCE(razon_social, 'Mi Empresa'),
  COALESCE(rfc, 'XAXX010101000'),
  regimen_fiscal, cp_fiscal, direccion_fiscal,
  telefono, email_contacto, sitio_web, representante_legal,
  COALESCE(moneda_default, 'MXN'),
  COALESCE(iva_default, 16.00),
  true, true
FROM public.empresa_datos
WHERE id = 1
  AND (razon_social IS NOT NULL OR rfc IS NOT NULL);

-- 6. Add empresa_id to facturas
ALTER TABLE public.facturas
  ADD COLUMN empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL;

CREATE INDEX facturas_empresa_id_idx ON public.facturas (empresa_id);
