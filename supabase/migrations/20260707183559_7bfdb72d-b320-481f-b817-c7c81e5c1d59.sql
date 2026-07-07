
-- FK to make PostgREST embed (clientes) work on facturas
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facturas_cliente_id_fkey'
  ) THEN
    ALTER TABLE public.facturas
      ADD CONSTRAINT facturas_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='facturas_empresa_id_fkey') THEN
    ALTER TABLE public.facturas
      ADD CONSTRAINT facturas_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='facturas_poliza_id_fkey') THEN
    ALTER TABLE public.facturas
      ADD CONSTRAINT facturas_poliza_id_fkey
      FOREIGN KEY (poliza_id) REFERENCES public.polizas(id) ON DELETE SET NULL;
  END IF;
END $$;

-- CFDI 4.0 fields on facturas
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS facturapi_id text,
  ADD COLUMN IF NOT EXISTS uuid_fiscal text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS xml_url text,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS cfdi_status text,
  ADD COLUMN IF NOT EXISTS cfdi_use text,
  ADD COLUMN IF NOT EXISTS payment_form text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS cancel_motivo text,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS facturapi_id text,
  ADD COLUMN IF NOT EXISTS regimen_fiscal text,
  ADD COLUMN IF NOT EXISTS uso_cfdi_default text;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS facturapi_id text,
  ADD COLUMN IF NOT EXISTS sat_product_key text,
  ADD COLUMN IF NOT EXISTS sat_unit_key text;
