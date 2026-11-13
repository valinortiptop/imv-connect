ALTER TABLE public.onboarding_archivos
  ALTER COLUMN item_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS ai_estado text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS ai_veredicto text,
  ADD COLUMN IF NOT EXISTS ai_resumen text,
  ADD COLUMN IF NOT EXISTS ai_observaciones jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_at timestamptz,
  ADD COLUMN IF NOT EXISTS destacado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS atencion boolean NOT NULL DEFAULT false;

ALTER TABLE public.onboarding_tareas_dev
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'tarea',
  ADD COLUMN IF NOT EXISTS prioridad text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS modulo text,
  ADD COLUMN IF NOT EXISTS responsable text,
  ADD COLUMN IF NOT EXISTS adjunto_path text,
  ADD COLUMN IF NOT EXISTS sesion_id uuid REFERENCES public.onboarding_sesiones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid;

DROP POLICY IF EXISTS "Admin insert" ON public.onboarding_tareas_dev;
DROP POLICY IF EXISTS "Admin update" ON public.onboarding_tareas_dev;
CREATE POLICY "Staff insert" ON public.onboarding_tareas_dev FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update" ON public.onboarding_tareas_dev FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.onboarding_asistentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id uuid NOT NULL REFERENCES public.onboarding_sesiones(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  rol text,
  email text,
  asistio boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_asistentes TO authenticated;
GRANT ALL ON public.onboarding_asistentes TO service_role;
ALTER TABLE public.onboarding_asistentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff all" ON public.onboarding_asistentes FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.onboarding_disponibilidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona text NOT NULL,
  rol text NOT NULL,
  slots text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (persona, rol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_disponibilidad TO authenticated;
GRANT ALL ON public.onboarding_disponibilidad TO service_role;
ALTER TABLE public.onboarding_disponibilidad ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff all" ON public.onboarding_disponibilidad FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.ob_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER ob_asist_touch BEFORE UPDATE ON public.onboarding_asistentes FOR EACH ROW EXECUTE FUNCTION public.ob_touch_updated_at();
CREATE TRIGGER ob_disp_touch BEFORE UPDATE ON public.onboarding_disponibilidad FOR EACH ROW EXECUTE FUNCTION public.ob_touch_updated_at();

DROP POLICY IF EXISTS ob_storage_read ON storage.objects;
CREATE POLICY ob_storage_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'onboarding' AND public.is_staff(auth.uid()));
DROP POLICY IF EXISTS ob_storage_write ON storage.objects;
CREATE POLICY ob_storage_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'onboarding' AND owner = auth.uid() AND public.is_staff(auth.uid()));