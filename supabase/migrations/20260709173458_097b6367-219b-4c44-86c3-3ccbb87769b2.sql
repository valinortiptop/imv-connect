
-- rep_coaching: cache semanal del análisis Gemini
CREATE TABLE public.rep_coaching (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rep_id uuid NOT NULL REFERENCES public.representantes(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  summary text,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvements jsonb NOT NULL DEFAULT '[]'::jsonb,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rep_id, week_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_coaching TO authenticated;
GRANT ALL ON public.rep_coaching TO service_role;
ALTER TABLE public.rep_coaching ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rep_coaching_read_own"
  ON public.rep_coaching FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR rep_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
  );
CREATE POLICY "rep_coaching_write_own"
  ON public.rep_coaching FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR rep_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
  );
CREATE POLICY "rep_coaching_update_own"
  ON public.rep_coaching FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR rep_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
  );

-- rep_achievements: logros / badges obtenidos
CREATE TABLE public.rep_achievements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rep_id uuid NOT NULL REFERENCES public.representantes(id) ON DELETE CASCADE,
  badge_code text NOT NULL,
  label text NOT NULL,
  description text,
  points integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rep_id, badge_code, earned_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_achievements TO authenticated;
GRANT ALL ON public.rep_achievements TO service_role;
ALTER TABLE public.rep_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rep_ach_read_own"
  ON public.rep_achievements FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR rep_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
  );
CREATE POLICY "rep_ach_write_own"
  ON public.rep_achievements FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR rep_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
  );

CREATE INDEX rep_coaching_rep_week_idx ON public.rep_coaching(rep_id, week_start DESC);
CREATE INDEX rep_achievements_rep_idx ON public.rep_achievements(rep_id, earned_at DESC);
