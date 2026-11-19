CREATE OR REPLACE FUNCTION public.onboarding_full_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and _user_id = auth.uid() and role in ('admin','contabilidad'))
$$;

DROP POLICY IF EXISTS ob_items_write ON public.onboarding_items;
CREATE POLICY ob_items_insert ON public.onboarding_items FOR INSERT TO authenticated
  WITH CHECK (public.onboarding_full_access(auth.uid()));
CREATE POLICY ob_items_update ON public.onboarding_items FOR UPDATE TO authenticated
  USING (public.onboarding_full_access(auth.uid())) WITH CHECK (public.onboarding_full_access(auth.uid()));
CREATE POLICY ob_items_delete ON public.onboarding_items FOR DELETE TO authenticated
  USING (public.onboarding_full_access(auth.uid()));