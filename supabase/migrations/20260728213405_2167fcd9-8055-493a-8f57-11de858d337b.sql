DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public'
      AND policyname IN (
        'cobranza_gestiones_finance_sales','cliente_credito_finance_sales',
        'cobranza_promesas_finance_sales','credito_autorizaciones_finance_sales',
        'cobranza_comunicaciones_finance_sales','cobranza_alertas_finance_sales',
        'cliente_credito_historial_read')
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (public.has_any_role(auth.uid(), ARRAY[''admin'',''contabilidad'',''cobranza'',''facturacion'',''ventas'',''representante'']::app_role[]))',
      t.policyname, t.tablename);
  END LOOP;
END $$;