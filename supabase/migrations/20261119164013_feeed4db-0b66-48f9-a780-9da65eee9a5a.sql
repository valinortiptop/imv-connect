CREATE OR REPLACE FUNCTION public.onboarding_full_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','contabilidad'))
$$;
REVOKE EXECUTE ON FUNCTION public.onboarding_full_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_full_access(uuid) TO authenticated, service_role;

-- Files: full-access users see everything; everyone else only what they uploaded.
DROP POLICY IF EXISTS ob_arch_write_auth ON public.onboarding_archivos;
DROP POLICY IF EXISTS ob_arch_select_auth ON public.onboarding_archivos;
CREATE POLICY ob_arch_select ON public.onboarding_archivos FOR SELECT TO authenticated
  USING (public.onboarding_full_access(auth.uid()) OR (uploaded_by = auth.uid() AND public.is_staff(auth.uid())));
CREATE POLICY ob_arch_insert ON public.onboarding_archivos FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY ob_arch_update ON public.onboarding_archivos FOR UPDATE TO authenticated
  USING (public.onboarding_full_access(auth.uid()) OR (uploaded_by = auth.uid() AND public.is_staff(auth.uid())))
  WITH CHECK (public.onboarding_full_access(auth.uid()) OR (uploaded_by = auth.uid() AND public.is_staff(auth.uid())));
CREATE POLICY ob_arch_delete ON public.onboarding_archivos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS ob_storage_read ON storage.objects;
CREATE POLICY ob_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'onboarding' AND public.is_staff(auth.uid())
         AND (public.onboarding_full_access(auth.uid()) OR owner = auth.uid()));

-- Requirements: everyone with a role reads the checklist; only full-access users change it.
DROP POLICY IF EXISTS ob_items_write_auth ON public.onboarding_items;
CREATE POLICY ob_items_write ON public.onboarding_items FOR ALL TO authenticated
  USING (public.onboarding_full_access(auth.uid()))
  WITH CHECK (public.onboarding_full_access(auth.uid()));