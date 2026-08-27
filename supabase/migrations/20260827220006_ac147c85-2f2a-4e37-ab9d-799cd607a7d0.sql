-- 1) Backfill representantes.user_id from auth.users by email
UPDATE public.representantes r
SET user_id = u.id
FROM auth.users u
WHERE r.user_id IS NULL
  AND r.email IS NOT NULL
  AND lower(u.email) = lower(r.email);

-- 2) Resolve rep ids for the current user by user_id OR JWT email
CREATE OR REPLACE FUNCTION public.current_rep_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id
  FROM public.representantes r
  WHERE r.user_id = auth.uid()
     OR (
        r.email IS NOT NULL
        AND lower(r.email) = lower(coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
          ''
        ))
     )
$$;

GRANT EXECUTE ON FUNCTION public.current_rep_ids() TO authenticated, service_role;

-- 3) Visits policies use it
DROP POLICY IF EXISTS rep_visits_owner ON public.rep_visits;
CREATE POLICY rep_visits_owner ON public.rep_visits
  FOR ALL TO authenticated
  USING (representante_id IN (SELECT public.current_rep_ids()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (representante_id IN (SELECT public.current_rep_ids()) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS rep_visit_agreements_owner ON public.rep_visit_agreements;
CREATE POLICY rep_visit_agreements_owner ON public.rep_visit_agreements
  FOR ALL TO authenticated
  USING (
    visit_id IN (SELECT v.id FROM public.rep_visits v WHERE v.representante_id IN (SELECT public.current_rep_ids()))
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    visit_id IN (SELECT v.id FROM public.rep_visits v WHERE v.representante_id IN (SELECT public.current_rep_ids()))
    OR public.has_role(auth.uid(), 'admin')
  );

-- 4) Device / session grouping for access events
ALTER TABLE public.rep_access_events
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS platform text;

CREATE INDEX IF NOT EXISTS rep_access_events_user_device_idx
  ON public.rep_access_events (user_id, device_id, signed_in_at DESC);