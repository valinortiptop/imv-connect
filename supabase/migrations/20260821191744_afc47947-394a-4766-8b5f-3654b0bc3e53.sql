ALTER TABLE public.rep_visits
  ADD COLUMN IF NOT EXISTS unplanned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unplanned_reason text;

CREATE INDEX IF NOT EXISTS rep_visits_checkin_idx ON public.rep_visits (check_in_at DESC);