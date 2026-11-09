CREATE TABLE public.rep_ai_access (
  representante_id UUID NOT NULL PRIMARY KEY REFERENCES public.representantes(id) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_ai_access TO authenticated;
GRANT ALL ON public.rep_ai_access TO service_role;

ALTER TABLE public.rep_ai_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage rep ai access" ON public.rep_ai_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Reps read own ai access" ON public.rep_ai_access
  FOR SELECT TO authenticated
  USING (representante_id IN (SELECT public.current_rep_ids()));

CREATE TRIGGER update_rep_ai_access_updated_at
  BEFORE UPDATE ON public.rep_ai_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.current_user_ai_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.rep_ai_access a
        WHERE a.allowed = true
          AND a.representante_id IN (SELECT public.current_rep_ids())
      )
$$;

GRANT EXECUTE ON FUNCTION public.current_user_ai_allowed() TO authenticated, service_role;