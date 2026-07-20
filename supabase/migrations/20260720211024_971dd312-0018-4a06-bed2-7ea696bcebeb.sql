
-- 1) Audit history for cliente_credito
CREATE TABLE IF NOT EXISTS public.cliente_credito_historial (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  motivo TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.cliente_credito_historial TO authenticated;
GRANT ALL ON public.cliente_credito_historial TO service_role;
ALTER TABLE public.cliente_credito_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read historial" ON public.cliente_credito_historial FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert historial" ON public.cliente_credito_historial FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cliente_credito_historial_cliente ON public.cliente_credito_historial(cliente_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.fn_audit_cliente_credito()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.limite_credito IS DISTINCT FROM OLD.limite_credito THEN
      INSERT INTO cliente_credito_historial(cliente_id, campo, valor_anterior, valor_nuevo, changed_by)
      VALUES (NEW.cliente_id, 'limite_credito', OLD.limite_credito::text, NEW.limite_credito::text, uid);
    END IF;
    IF NEW.dias_credito IS DISTINCT FROM OLD.dias_credito THEN
      INSERT INTO cliente_credito_historial(cliente_id, campo, valor_anterior, valor_nuevo, changed_by)
      VALUES (NEW.cliente_id, 'dias_credito', OLD.dias_credito::text, NEW.dias_credito::text, uid);
    END IF;
    IF NEW.condicion_pago IS DISTINCT FROM OLD.condicion_pago THEN
      INSERT INTO cliente_credito_historial(cliente_id, campo, valor_anterior, valor_nuevo, changed_by)
      VALUES (NEW.cliente_id, 'condicion_pago', OLD.condicion_pago, NEW.condicion_pago, uid);
    END IF;
    IF NEW.bloqueado IS DISTINCT FROM OLD.bloqueado THEN
      INSERT INTO cliente_credito_historial(cliente_id, campo, valor_anterior, valor_nuevo, motivo, changed_by)
      VALUES (NEW.cliente_id, 'bloqueado', OLD.bloqueado::text, NEW.bloqueado::text, NEW.motivo_bloqueo, uid);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_cliente_credito ON public.cliente_credito;
CREATE TRIGGER trg_audit_cliente_credito
AFTER UPDATE ON public.cliente_credito
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_cliente_credito();

-- 2) Extend pagos with REP tracking
ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS complemento_facturapi_id TEXT,
  ADD COLUMN IF NOT EXISTS complemento_uuid TEXT,
  ADD COLUMN IF NOT EXISTS complemento_estado TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS complemento_timbrado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complemento_xml_url TEXT,
  ADD COLUMN IF NOT EXISTS complemento_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS complemento_error TEXT;

CREATE INDEX IF NOT EXISTS idx_pagos_complemento_estado ON public.pagos(complemento_estado) WHERE complemento_estado IN ('pendiente','error');

-- 3) Autorizaciones link to pedido/factura
ALTER TABLE public.credito_autorizaciones
  ADD COLUMN IF NOT EXISTS pedido_id UUID,
  ADD COLUMN IF NOT EXISTS factura_id UUID;
