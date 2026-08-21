CREATE TABLE public.rep_lab_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  representante_id UUID NOT NULL REFERENCES public.representantes(id) ON DELETE CASCADE,
  laboratorio_id UUID NOT NULL REFERENCES public.laboratorios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (representante_id, laboratorio_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_lab_access TO authenticated;
GRANT ALL ON public.rep_lab_access TO service_role;

ALTER TABLE public.rep_lab_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage rep lab access" ON public.rep_lab_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Reps read own lab access" ON public.rep_lab_access
  FOR SELECT TO authenticated
  USING (representante_id = public.current_rep_id());

CREATE TRIGGER update_rep_lab_access_updated_at
  BEFORE UPDATE ON public.rep_lab_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();