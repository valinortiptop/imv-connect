CREATE OR REPLACE FUNCTION public.current_rep_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id
    FROM public.representantes r
   WHERE r.user_id = auth.uid()
      OR (r.email IS NOT NULL AND lower(r.email) = lower((SELECT u.email FROM auth.users u WHERE u.id = auth.uid())))
   ORDER BY (r.user_id = auth.uid()) DESC
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_rep_id() TO authenticated;

CREATE INDEX IF NOT EXISTS clientes_representante_id_idx ON public.clientes (representante_id);

DROP POLICY IF EXISTS clientes_select ON public.clientes;
CREATE POLICY clientes_select ON public.clientes
FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'contabilidad'::app_role, 'logistica'::app_role, 'almacen'::app_role, 'facturacion'::app_role, 'cobranza'::app_role, 'compras'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['ventas'::app_role, 'representante'::app_role])
    AND (
      public.current_rep_id() IS NULL
      OR representante_id = public.current_rep_id()
    )
  )
);