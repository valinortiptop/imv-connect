-- rep_access_events: registro de accesos de representantes con geolocalización opcional
CREATE TABLE public.rep_access_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  representante_id uuid REFERENCES public.representantes(id) ON DELETE SET NULL,
  signed_in_at timestamptz NOT NULL DEFAULT now(),
  lat numeric,
  lng numeric,
  accuracy numeric,
  has_location boolean NOT NULL DEFAULT false,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rep_access_events_rep_idx ON public.rep_access_events (representante_id, signed_in_at DESC);
CREATE INDEX rep_access_events_time_idx ON public.rep_access_events (signed_in_at DESC);
CREATE INDEX rep_access_events_user_idx ON public.rep_access_events (user_id, signed_in_at DESC);

GRANT SELECT, INSERT ON public.rep_access_events TO authenticated;
GRANT ALL ON public.rep_access_events TO service_role;

ALTER TABLE public.rep_access_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own access events"
  ON public.rep_access_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read their own access events"
  ON public.rep_access_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all access events"
  ON public.rep_access_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger: resolver representante_id automáticamente si viene null
CREATE OR REPLACE FUNCTION public.rep_access_events_resolve_rep()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.representante_id IS NULL THEN
    SELECT id INTO NEW.representante_id
      FROM public.representantes
      WHERE user_id = NEW.user_id
      LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rep_access_events_resolve_rep_trg
  BEFORE INSERT ON public.rep_access_events
  FOR EACH ROW EXECUTE FUNCTION public.rep_access_events_resolve_rep();

NOTIFY pgrst, 'reload schema';