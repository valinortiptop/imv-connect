-- Helper: caller is an IMV team member (has any assigned role)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

-- Replace FOR ALL USING(true)/WITH CHECK(true) policies with staff-only policies
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('almacenes','auth_rw_almacenes'),
      ('bonifications_received','br_all'),
      ('centrales','ctr_all'),
      ('client_price_overrides','auth_rw_cpo'),
      ('cobranza_config','auth_all_config'),
      ('cobranza_templates','auth_all_templates'),
      ('cost_history','auth_rw_costh'),
      ('damaged_batches','db_all'),
      ('delivery_reveal_photos','drp_all'),
      ('delivery_trip_items','dti_all'),
      ('delivery_trips','dt_all'),
      ('devolucion_items','auth_rw_dev_items'),
      ('devoluciones','auth_rw_devs'),
      ('factura_items','auth_rw_factura_items'),
      ('facturas','auth_rw_facturas'),
      ('kanban_boards','kanban_boards_all'),
      ('kanban_cards','kanban_cards_all'),
      ('kanban_columns','kanban_columns_all'),
      ('kanban_comments','kanban_comments_all'),
      ('laboratorios','auth_write_laboratorios'),
      ('logistics_last_seen','lls_all'),
      ('maniobra_count_events','mce_all'),
      ('maniobra_plans','mp_all'),
      ('monthly_bonificaciones','mb_all'),
      ('movimientos_inventario','auth_rw_movs'),
      ('notas_credito','auth_rw_nc'),
      ('oc_items','auth_rw_oc_items'),
      ('onboarding_archivos','ob_arch_write_auth'),
      ('onboarding_items','ob_items_write_auth'),
      ('ordenes_compra','auth_rw_oc'),
      ('order_adjustments','oa_all'),
      ('order_changes','oc_all'),
      ('order_documents','od_all'),
      ('order_stop_items','osi_all'),
      ('order_stops','os_all'),
      ('pagos','auth_rw_pagos'),
      ('partner_monthly_settlements','pms_all'),
      ('partner_shipment_items','psi_all'),
      ('partner_shipments','ps_all'),
      ('partners','partners_all'),
      ('pedido_items','auth_rw_pedido_items'),
      ('pedidos','auth_rw_pedidos'),
      ('precios_cliente','auth_rw_precios_cliente'),
      ('price_list_items','price_list_items_all'),
      ('price_lists','auth_rw_price_lists'),
      ('product_batches','auth_rw_batches'),
      ('product_promotions','pp_promo_all'),
      ('product_stock_params','auth_rw_psp'),
      ('productos','auth_write_productos'),
      ('prospect_calls','pc_all'),
      ('purchase_alerts','auth_rw_palerts'),
      ('purchase_budgets','auth_rw_purchase_budgets'),
      ('purchase_config','auth_rw_pconfig'),
      ('quote_items','quote_items_all'),
      ('quotes','quotes_all'),
      ('shortage_events','auth_rw_sevents'),
      ('shortage_reasons','auth_rw_sreasons'),
      ('sku_aliases','ska_all'),
      ('slot_contents','sc_all'),
      ('slot_movements','sm_all'),
      ('stock','auth_rw_stock'),
      ('stock_adjustments','sa_all'),
      ('stock_deliveries','sd_all'),
      ('stock_delivery_documents','sdd_all'),
      ('stock_entries','se_all'),
      ('supplier_incidents','auth_rw_sinc'),
      ('supplier_metrics','auth_rw_smetrics'),
      ('transport_types','tt_all'),
      ('warehouse_slots','ws_all')
    ) AS t(tbl, pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()))',
      r.pol, r.tbl);
  END LOOP;
END $$;

-- Duplicate permissive policy on price_lists
DROP POLICY IF EXISTS price_lists_all ON public.price_lists;

-- SELECT-only USING(true) policies -> staff-only reads
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('empresas','Authenticated can read empresas'),
      ('laboratorios','auth_read_laboratorios'),
      ('message_templates','Authenticated can read templates'),
      ('onboarding_archivos','ob_arch_select_auth'),
      ('onboarding_items','ob_items_select_auth'),
      ('permission_routes','auth read permission_routes'),
      ('productos','auth_read_productos'),
      ('role_permissions','rp_read_auth'),
      ('sales_history','sales_history_auth_read'),
      ('system_config','sc_read')
    ) AS t(tbl, pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))',
      r.pol, r.tbl);
  END LOOP;
END $$;

-- sales_history write policies
DROP POLICY IF EXISTS sales_history_auth_update ON public.sales_history;
CREATE POLICY sales_history_auth_update ON public.sales_history
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS sales_history_auth_write ON public.sales_history;
CREATE POLICY sales_history_auth_write ON public.sales_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- Storage: bind access to an authenticated team member
DROP POLICY IF EXISTS "auth can read order summaries" ON storage.objects;
CREATE POLICY "auth can read order summaries" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'order-summaries' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth can upload order summaries" ON storage.objects;
CREATE POLICY "auth can upload order summaries" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-summaries' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth read cliente-documentos" ON storage.objects;
CREATE POLICY "auth read cliente-documentos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cliente-documentos' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth write cliente-documentos" ON storage.objects;
CREATE POLICY "auth write cliente-documentos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cliente-documentos' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth update cliente-documentos" ON storage.objects;
CREATE POLICY "auth update cliente-documentos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'cliente-documentos' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'cliente-documentos' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth delete cliente-documentos" ON storage.objects;
CREATE POLICY "auth delete cliente-documentos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cliente-documentos' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS productos_insert_auth ON storage.objects;
CREATE POLICY productos_insert_auth ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'productos' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS productos_update_auth ON storage.objects;
CREATE POLICY productos_update_auth ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'productos' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'productos' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS productos_delete_auth ON storage.objects;
CREATE POLICY productos_delete_auth ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'productos' AND public.is_staff(auth.uid()));