CREATE TABLE public.codigos_fiscales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  nombre text NOT NULL,
  iva_modo text NOT NULL DEFAULT 'producto',
  iva_pct numeric NOT NULL DEFAULT 16,
  objeto_impuesto boolean NOT NULL DEFAULT true,
  ieps_pct numeric NOT NULL DEFAULT 0,
  ret_iva_modo text NOT NULL DEFAULT 'sin',
  ret_iva_pct numeric NOT NULL DEFAULT 0,
  ret_isr_modo text NOT NULL DEFAULT 'sin',
  ret_isr_pct numeric NOT NULL DEFAULT 0,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.codigos_fiscales TO authenticated;
GRANT ALL ON public.codigos_fiscales TO service_role;
ALTER TABLE public.codigos_fiscales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read codigos_fiscales" ON public.codigos_fiscales FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "conta insert codigos_fiscales" ON public.codigos_fiscales FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));
CREATE POLICY "conta update codigos_fiscales" ON public.codigos_fiscales FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));
CREATE POLICY "conta delete codigos_fiscales" ON public.codigos_fiscales FOR DELETE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));
CREATE OR REPLACE FUNCTION public.codigos_fiscales_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER codigos_fiscales_touch BEFORE UPDATE ON public.codigos_fiscales FOR EACH ROW EXECUTE FUNCTION public.codigos_fiscales_touch();

INSERT INTO public.codigos_fiscales (clave,nombre,iva_modo,iva_pct,ieps_pct,ret_iva_modo,ret_iva_pct,ret_isr_modo,ret_isr_pct,orden) VALUES
 ('IVA16','Item normal','producto',16,0,'sin',0,'sin',0,1),
 ('IVA0','Item IVA 0%','producto',0,0,'sin',0,'sin',0,2),
 ('EXENTO','Item IVA exento','exento',0,0,'sin',0,'sin',0,3),
 ('IEPS6_IVA0','Item IEPS 6% + IVA 0%','producto',0,6,'sin',0,'sin',0,4),
 ('IVA_RET4','Item flete','producto',16,0,'producto',4,'sin',0,5),
 ('IVA_RET10.67','Item retención IVA','producto',16,0,'producto',10.666667,'sin',0,6),
 ('ISR_RET10','Item retención ISR 10%','producto',16,0,'sin',0,'producto',10,7),
 ('ISR_RET1.25','Item retención ISR RESICO','producto',16,0,'sin',0,'producto',1.25,8);

ALTER TABLE public.productos
  ADD COLUMN codigo_fiscal_id uuid REFERENCES public.codigos_fiscales(id) ON DELETE SET NULL,
  ADD COLUMN iva_modo text NOT NULL DEFAULT 'producto',
  ADD COLUMN objeto_impuesto boolean NOT NULL DEFAULT true,
  ADD COLUMN ret_iva_modo text NOT NULL DEFAULT 'sin',
  ADD COLUMN ret_iva_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN ret_isr_modo text NOT NULL DEFAULT 'sin',
  ADD COLUMN ret_isr_pct numeric NOT NULL DEFAULT 0;
CREATE INDEX productos_codigo_fiscal_idx ON public.productos(codigo_fiscal_id);

UPDATE public.productos p SET codigo_fiscal_id = c.id FROM public.codigos_fiscales c
WHERE c.clave = CASE
  WHEN coalesce(p.ieps_pct,0) = 6 AND coalesce(p.iva_pct,0) = 0 THEN 'IEPS6_IVA0'
  WHEN coalesce(p.ieps_pct,0) = 0 AND coalesce(p.iva_pct,0) = 16 THEN 'IVA16'
  WHEN coalesce(p.ieps_pct,0) = 0 AND coalesce(p.iva_pct,0) = 0 THEN 'IVA0'
  ELSE NULL END;

CREATE OR REPLACE FUNCTION public.productos_fiscal_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]) THEN
    RETURN NEW;
  END IF;
  IF NEW.codigo_fiscal_id IS DISTINCT FROM OLD.codigo_fiscal_id
     OR NEW.iva_modo IS DISTINCT FROM OLD.iva_modo
     OR NEW.objeto_impuesto IS DISTINCT FROM OLD.objeto_impuesto
     OR NEW.ret_iva_modo IS DISTINCT FROM OLD.ret_iva_modo
     OR NEW.ret_iva_pct IS DISTINCT FROM OLD.ret_iva_pct
     OR NEW.ret_isr_modo IS DISTINCT FROM OLD.ret_isr_modo
     OR NEW.ret_isr_pct IS DISTINCT FROM OLD.ret_isr_pct THEN
    RAISE EXCEPTION 'Solo administración o contabilidad pueden cambiar la configuración fiscal';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.productos_fiscal_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER productos_fiscal_guard BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.productos_fiscal_guard();

INSERT INTO public.permission_routes (route_key, route_path, group_label, active, sort_order)
VALUES ('navContaProdFiscal','/admin/contabilidad/productos-fiscal','Contabilidad',true,85)
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, route_key)
VALUES ('contabilidad','navContaProdFiscal'),('facturacion','navContaProdFiscal')
ON CONFLICT DO NOTHING;