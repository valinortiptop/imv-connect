DROP POLICY IF EXISTS clientes_write ON public.clientes;

CREATE POLICY clientes_admin_write ON public.clientes
FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'contabilidad'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'contabilidad'::app_role]));

CREATE POLICY clientes_rep_insert ON public.clientes
FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['ventas'::app_role, 'representante'::app_role])
  AND (public.current_rep_id() IS NULL OR representante_id IS NULL OR representante_id = public.current_rep_id())
);

CREATE POLICY clientes_rep_update ON public.clientes
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['ventas'::app_role, 'representante'::app_role])
  AND (public.current_rep_id() IS NULL OR representante_id = public.current_rep_id())
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['ventas'::app_role, 'representante'::app_role])
  AND (public.current_rep_id() IS NULL OR representante_id = public.current_rep_id())
);