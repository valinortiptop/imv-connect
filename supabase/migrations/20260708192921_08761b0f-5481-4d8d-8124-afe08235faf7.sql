
-- Storage policies for bank-statements (private bucket)
CREATE POLICY "bank-statements staff read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bank-statements' AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'contabilidad'::app_role]));

CREATE POLICY "bank-statements staff insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bank-statements' AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'contabilidad'::app_role]));

CREATE POLICY "bank-statements staff update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bank-statements' AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'contabilidad'::app_role]));

CREATE POLICY "bank-statements staff delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bank-statements' AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'contabilidad'::app_role]));

-- Compute current saldo of a bank account
CREATE OR REPLACE FUNCTION public.bank_account_saldo(_cuenta uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ba.saldo_inicial, 0)
       + COALESCE((
           SELECT SUM(
             CASE
               WHEN m.tipo IN ('entrada','traspaso_in','interes') THEN m.monto
               WHEN m.tipo IN ('salida','traspaso_out','comision','nomina') THEN -m.monto
               WHEN m.tipo = 'ajuste' THEN m.monto
               ELSE 0
             END
           ) FROM public.bank_movements m WHERE m.cuenta_id = _cuenta
         ), 0)
    FROM public.bank_accounts ba WHERE ba.id = _cuenta;
$$;

GRANT EXECUTE ON FUNCTION public.bank_account_saldo(uuid) TO authenticated;
