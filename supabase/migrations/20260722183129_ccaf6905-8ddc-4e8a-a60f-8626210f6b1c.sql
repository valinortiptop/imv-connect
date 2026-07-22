
CREATE TABLE public.rep_rutas_guardadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  representante_id UUID NULL,
  fecha DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Mexico_City')::date,
  nombre TEXT NULL,
  start_lat DOUBLE PRECISION NULL,
  start_lng DOUBLE PRECISION NULL,
  total_km NUMERIC NULL,
  total_minutes INTEGER NULL,
  polyline TEXT NULL,
  ordered_stops JSONB NOT NULL DEFAULT '[]'::jsonb,
  legs JSONB NOT NULL DEFAULT '[]'::jsonb,
  origen TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rep_rutas_user_fecha ON public.rep_rutas_guardadas(user_id, fecha DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_rutas_guardadas TO authenticated;
GRANT ALL ON public.rep_rutas_guardadas TO service_role;
ALTER TABLE public.rep_rutas_guardadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reps manage their own saved routes" ON public.rep_rutas_guardadas
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
