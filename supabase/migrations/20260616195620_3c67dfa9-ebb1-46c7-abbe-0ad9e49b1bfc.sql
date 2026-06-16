
-- 1. _lovable_migrations
ALTER TABLE public._lovable_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._lovable_migrations FROM anon, authenticated;

-- 2. chat_conversations: per-user
DROP POLICY IF EXISTS cc_all ON public.chat_conversations;
CREATE POLICY cc_select_own ON public.chat_conversations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY cc_insert_own ON public.chat_conversations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY cc_update_own ON public.chat_conversations FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY cc_delete_own ON public.chat_conversations FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 3. notifications: per-user (NULL user_id = broadcast)
DROP POLICY IF EXISTS notif_all ON public.notifications;
CREATE POLICY notif_select_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notif_delete_own ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY notif_insert_admin ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. user_permission_overrides: admin only
DROP POLICY IF EXISTS upo_all ON public.user_permission_overrides;
CREATE POLICY upo_admin_all ON public.user_permission_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY upo_select_own ON public.user_permission_overrides FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 5. empresa_datos: admin only
DROP POLICY IF EXISTS emp_select_auth ON public.empresa_datos;
DROP POLICY IF EXISTS emp_update_auth ON public.empresa_datos;
CREATE POLICY emp_admin_all ON public.empresa_datos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6. employees + payroll_payments: admin/contabilidad only
DROP POLICY IF EXISTS emp_all ON public.employees;
CREATE POLICY emp_finance_all ON public.employees FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]));

DROP POLICY IF EXISTS pp_all ON public.payroll_payments;
CREATE POLICY pp_finance_all ON public.payroll_payments FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]));

-- 7. fixed_expenses: admin/contabilidad
DROP POLICY IF EXISTS fe_all ON public.fixed_expenses;
CREATE POLICY fe_finance_all ON public.fixed_expenses FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]));

-- 8. margins + product_prices: read admin/contabilidad/ventas, write admin/contabilidad
DROP POLICY IF EXISTS mg_all ON public.margins;
CREATE POLICY mg_select ON public.margins FOR SELECT TO authenticated USING (
  public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas']::public.app_role[]));
CREATE POLICY mg_write ON public.margins FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]));

DROP POLICY IF EXISTS pp_prices_all ON public.product_prices;
CREATE POLICY pp_prices_select ON public.product_prices FOR SELECT TO authenticated USING (
  public.has_any_role(auth.uid(), ARRAY['admin','contabilidad','ventas']::public.app_role[]));
CREATE POLICY pp_prices_write ON public.product_prices FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::public.app_role[]));

-- 9. maniobra_pins: admin only
DROP POLICY IF EXISTS mpi_all ON public.maniobra_pins;
CREATE POLICY mpi_admin_all ON public.maniobra_pins FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 10. system_config: read auth, write admin
DROP POLICY IF EXISTS sc_all ON public.system_config;
CREATE POLICY sc_read ON public.system_config FOR SELECT TO authenticated USING (true);
CREATE POLICY sc_admin_write ON public.system_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 11. user_roles: drop blanket read
DROP POLICY IF EXISTS auth_read_user_roles ON public.user_roles;

-- 12. clientes: read for any role-bearing user, write for admin/ventas/contabilidad
DROP POLICY IF EXISTS auth_read_clientes ON public.clientes;
DROP POLICY IF EXISTS auth_write_clientes ON public.clientes;
CREATE POLICY clientes_select ON public.clientes FOR SELECT TO authenticated USING (
  public.has_any_role(auth.uid(), ARRAY['admin','ventas','representante','contabilidad','logistica','almacen']::public.app_role[]));
CREATE POLICY clientes_write ON public.clientes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','ventas','contabilidad']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','ventas','contabilidad']::public.app_role[]));

-- 13. representantes
DROP POLICY IF EXISTS auth_rw_representantes ON public.representantes;
CREATE POLICY rep_select ON public.representantes FOR SELECT TO authenticated USING (
  public.has_any_role(auth.uid(), ARRAY['admin','ventas','representante','contabilidad','logistica']::public.app_role[]));
CREATE POLICY rep_write ON public.representantes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 14. prospects
DROP POLICY IF EXISTS pros_all ON public.prospects;
CREATE POLICY pros_rw ON public.prospects FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','ventas','representante']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','ventas','representante']::public.app_role[]));

-- 15. storage onboarding bucket: owner or admin
DROP POLICY IF EXISTS ob_storage_read ON storage.objects;
DROP POLICY IF EXISTS ob_storage_write ON storage.objects;
DROP POLICY IF EXISTS ob_storage_delete_auth ON storage.objects;
CREATE POLICY ob_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'onboarding' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY ob_storage_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'onboarding' AND owner = auth.uid());
CREATE POLICY ob_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'onboarding' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')))
  WITH CHECK (bucket_id = 'onboarding' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY ob_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'onboarding' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));

-- 16. Views: security_invoker so caller's RLS applies
ALTER VIEW public.v_stock_productos SET (security_invoker = on);
ALTER VIEW public.v_saldos_clientes SET (security_invoker = on);
ALTER VIEW public.v_ventas_por_mes SET (security_invoker = on);
ALTER VIEW public.v_pedidos_por_mes SET (security_invoker = on);
ALTER VIEW public.v_top_productos SET (security_invoker = on);
ALTER VIEW public.v_top_clientes SET (security_invoker = on);
ALTER VIEW public.v_comisiones_representante SET (security_invoker = on);
ALTER VIEW public.v_stock_bajo SET (security_invoker = on);
ALTER VIEW public.v_dashboard_resumen SET (security_invoker = on);
ALTER VIEW public.v_ordenes_compra SET (security_invoker = on);
ALTER VIEW public.v_margen_productos SET (security_invoker = on);
ALTER VIEW public.v_devoluciones SET (security_invoker = on);
ALTER VIEW public.orders SET (security_invoker = on);
ALTER VIEW public.order_summary SET (security_invoker = on);
ALTER VIEW public.order_items SET (security_invoker = on);
ALTER VIEW public.clients SET (security_invoker = on);
ALTER VIEW public.v_products_with_stock SET (security_invoker = on);
ALTER VIEW public.delivery_summary SET (security_invoker = on);
ALTER VIEW public.v_open_orders SET (security_invoker = on);
ALTER VIEW public.v_order_item_breakdown SET (security_invoker = on);
ALTER VIEW public.v_purchase_by_order SET (security_invoker = on);
ALTER VIEW public.v_purchase_needs SET (security_invoker = on);
ALTER VIEW public.products SET (security_invoker = on);

-- 17. Trigger functions: set fixed search_path
ALTER FUNCTION public._aplicar_stock(uuid, uuid, numeric) SET search_path = public;
ALTER FUNCTION public.dev_items_after_change() SET search_path = public;
ALTER FUNCTION public.dev_recalc(uuid) SET search_path = public;
ALTER FUNCTION public.dev_set_folio() SET search_path = public;
ALTER FUNCTION public.factura_items_after_change() SET search_path = public;
ALTER FUNCTION public.facturas_recalc(uuid) SET search_path = public;
ALTER FUNCTION public.fmt_month(date) SET search_path = public;
ALTER FUNCTION public.movimientos_apply_trigger() SET search_path = public;
ALTER FUNCTION public.nc_after_change() SET search_path = public;
ALTER FUNCTION public.nc_set_folio() SET search_path = public;
ALTER FUNCTION public.oc_items_recalc_trigger() SET search_path = public;
ALTER FUNCTION public.oc_recalc_totales(uuid) SET search_path = public;
ALTER FUNCTION public.oc_set_folio() SET search_path = public;
ALTER FUNCTION public.pagos_after_change() SET search_path = public;
ALTER FUNCTION public.pedidos_calc_comision() SET search_path = public;
ALTER FUNCTION public.pedidos_touch() SET search_path = public;
ALTER FUNCTION public.productos_search_tsv_trigger() SET search_path = public;
ALTER FUNCTION public.tg_onboarding_touch() SET search_path = public;

-- 18. Revoke public/anon EXECUTE on admin-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.admin_list_all_routes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_role_permission(public.app_role, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_route_active(text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ajustar_stock(uuid, uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.aplicar_devolucion(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.asignar_rol(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crear_factura_desde_pedido(uuid, integer, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_order_with_client(text, text, text, text, text, text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_roles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_kpis_for_range(date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_user_as_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_all_users_for_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_permissions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_role_permissions(public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.listar_usuarios() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recibir_oc(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remover_rol(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resync_price_list(uuid) FROM PUBLIC, anon;
-- get_catalog_for_token & crear_pedido_para_token remain executable by anon (client portal by token)
