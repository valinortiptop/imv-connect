
-- 1) Extend rep_visits
ALTER TABLE public.rep_visits
  ADD COLUMN IF NOT EXISTS distance_m numeric,
  ADD COLUMN IF NOT EXISTS override_reason text;

-- 2) Shelf photos
CREATE TABLE IF NOT EXISTS public.visit_shelf_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.rep_visits(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  representante_id uuid REFERENCES public.representantes(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'anaquel',
  photo_path text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vsp_visit ON public.visit_shelf_photos(visit_id);
CREATE INDEX IF NOT EXISTS idx_vsp_cliente ON public.visit_shelf_photos(cliente_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_shelf_photos TO authenticated;
GRANT ALL ON public.visit_shelf_photos TO service_role;
ALTER TABLE public.visit_shelf_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shelf photos rep owner or admin" ON public.visit_shelf_photos;
CREATE POLICY "shelf photos rep owner or admin"
  ON public.visit_shelf_photos FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.representantes r WHERE r.id = visit_shelf_photos.representante_id AND r.user_id = auth.uid())
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.representantes r WHERE r.id = visit_shelf_photos.representante_id AND r.user_id = auth.uid())
    OR created_by = auth.uid()
  );

-- 3) Templates
CREATE TABLE IF NOT EXISTS public.visit_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.visit_form_templates TO authenticated;
GRANT ALL ON public.visit_form_templates TO service_role;
ALTER TABLE public.visit_form_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read active templates" ON public.visit_form_templates;
CREATE POLICY "read active templates"
  ON public.visit_form_templates FOR SELECT
  TO authenticated
  USING (active OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admin manage templates" ON public.visit_form_templates;
CREATE POLICY "admin manage templates"
  ON public.visit_form_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) Form responses
CREATE TABLE IF NOT EXISTS public.visit_form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.rep_visits(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.visit_form_templates(id) ON DELETE RESTRICT,
  representante_id uuid REFERENCES public.representantes(id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vfr_visit ON public.visit_form_responses(visit_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_form_responses TO authenticated;
GRANT ALL ON public.visit_form_responses TO service_role;
ALTER TABLE public.visit_form_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "form responses rep owner or admin" ON public.visit_form_responses;
CREATE POLICY "form responses rep owner or admin"
  ON public.visit_form_responses FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.representantes r WHERE r.id = visit_form_responses.representante_id AND r.user_id = auth.uid())
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.representantes r WHERE r.id = visit_form_responses.representante_id AND r.user_id = auth.uid())
    OR created_by = auth.uid()
  );

-- 5) Storage policies for rep-evidence bucket
DROP POLICY IF EXISTS "rep-evidence read own" ON storage.objects;
CREATE POLICY "rep-evidence read own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'rep-evidence' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS "rep-evidence insert own" ON storage.objects;
CREATE POLICY "rep-evidence insert own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'rep-evidence' AND owner = auth.uid());
DROP POLICY IF EXISTS "rep-evidence delete own" ON storage.objects;
CREATE POLICY "rep-evidence delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'rep-evidence' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));
