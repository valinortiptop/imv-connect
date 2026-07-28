-- 1) Views: enforce the querying user's permissions
ALTER VIEW public.bank_account_balances SET (security_invoker = on);
ALTER VIEW public.clients SET (security_invoker = on);
ALTER VIEW public.order_summary SET (security_invoker = on);
ALTER VIEW public.orders SET (security_invoker = on);
ALTER VIEW public.v_baja_rotacion SET (security_invoker = on);
ALTER VIEW public.v_caducidades SET (security_invoker = on);
ALTER VIEW public.v_caducidades_clientes SET (security_invoker = on);
ALTER VIEW public.v_cliente_credito_360 SET (security_invoker = on);
ALTER VIEW public.v_cliente_timeline SET (security_invoker = on);
ALTER VIEW public.v_compras_planeacion SET (security_invoker = on);
ALTER VIEW public.v_supplier_kpis SET (security_invoker = on);
ALTER VIEW public.v_ventas_unified SET (security_invoker = on);

-- 2) Fixed search_path on remaining functions
ALTER FUNCTION public.set_updated_at_cobranza() SET search_path = public;
ALTER FUNCTION public.tg_empresa_csd_touch() SET search_path = public;

-- 3) Revoke anonymous EXECUTE on SECURITY DEFINER functions,
--    keeping only the two intentionally-public customer portal routines.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prosecdef
       AND p.prorettype <> 'trigger'::regtype
       AND p.proname NOT IN ('get_catalog_for_token', 'crear_pedido_para_token')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- 4) Credit & collections tables: restrict to finance/sales roles
DROP POLICY IF EXISTS "auth_rw_cliente_credito" ON public.cliente_credito;
CREATE POLICY "cliente_credito_finance_sales" ON public.cliente_credito
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas']::public.app_role[]));

DROP POLICY IF EXISTS "auth read historial" ON public.cliente_credito_historial;
DROP POLICY IF EXISTS "auth insert historial" ON public.cliente_credito_historial;
CREATE POLICY "cliente_credito_historial_read" ON public.cliente_credito_historial
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]));
CREATE POLICY "cliente_credito_historial_insert" ON public.cliente_credito_historial
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas']::public.app_role[]));

DROP POLICY IF EXISTS "auth_rw_cliente_riesgo_snapshots" ON public.cliente_riesgo_snapshots;
CREATE POLICY "cliente_riesgo_snapshots_finance_sales" ON public.cliente_riesgo_snapshots
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas']::public.app_role[]));

DROP POLICY IF EXISTS "auth manage cobranza_alertas" ON public.cobranza_alertas;
CREATE POLICY "cobranza_alertas_finance_sales" ON public.cobranza_alertas
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]));

DROP POLICY IF EXISTS "auth_rw_cobranza_comunicaciones" ON public.cobranza_comunicaciones;
CREATE POLICY "cobranza_comunicaciones_finance_sales" ON public.cobranza_comunicaciones
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]));

DROP POLICY IF EXISTS "auth_rw_cobranza_gestiones" ON public.cobranza_gestiones;
CREATE POLICY "cobranza_gestiones_finance_sales" ON public.cobranza_gestiones
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]));

DROP POLICY IF EXISTS "auth_rw_promesas" ON public.cobranza_promesas_pago;
CREATE POLICY "cobranza_promesas_finance_sales" ON public.cobranza_promesas_pago
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]));

DROP POLICY IF EXISTS "auth_rw_autorizaciones" ON public.credito_autorizaciones;
CREATE POLICY "credito_autorizaciones_finance_sales" ON public.credito_autorizaciones
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas','representante']::public.app_role[]));

-- 5) Client documents: restrict to admin/contabilidad/ventas
DROP POLICY IF EXISTS "auth manage cliente_documentos" ON public.cliente_documentos;
CREATE POLICY "cliente_documentos_staff" ON public.cliente_documentos
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas']::public.app_role[]));

-- 6) CSD (fiscal signing certificates): admin only at the table level.
--    Accounting continues to operate through the secured server routines.
DROP POLICY IF EXISTS "csd_select_admin_conta" ON public.empresa_csd;
DROP POLICY IF EXISTS "csd_insert_admin_conta" ON public.empresa_csd;
DROP POLICY IF EXISTS "csd_update_admin_conta" ON public.empresa_csd;
DROP POLICY IF EXISTS "csd_delete_admin_conta" ON public.empresa_csd;
CREATE POLICY "csd_admin_only" ON public.empresa_csd
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));