
-- 1) empresas: restrict writes to admin/contabilidad
DROP POLICY IF EXISTS "Authenticated can insert empresas" ON public.empresas;
DROP POLICY IF EXISTS "Authenticated can update empresas" ON public.empresas;

CREATE POLICY "Admin/contabilidad can insert empresas" ON public.empresas
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]));

CREATE POLICY "Admin/contabilidad can update empresas" ON public.empresas
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]));

-- 2) empresa_documentos: restrict to admin/contabilidad
DROP POLICY IF EXISTS "empresa_documentos authenticated all" ON public.empresa_documentos;

CREATE POLICY "empresa_documentos admin/contabilidad all" ON public.empresa_documentos
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]));

-- 3) Set security_invoker on clients view
ALTER VIEW public.clients SET (security_invoker = on);

-- 4) Drop broad list policy on productos storage bucket (public URLs still work)
DROP POLICY IF EXISTS "productos_read_public" ON storage.objects;

-- 5) Revoke EXECUTE from PUBLIC/anon on privileged SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.balanza_de_comprobacion(uuid,date,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.libro_mayor_cuenta(uuid,date,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.iva_ieps_saldos(uuid,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_cuentas_empresa(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clients_iud_trigger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.orders_iud_trigger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pedidos_stock_trigger() FROM PUBLIC, anon;
