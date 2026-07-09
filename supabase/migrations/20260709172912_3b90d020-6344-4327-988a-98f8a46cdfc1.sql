
ALTER TABLE public.rep_visits
  ADD COLUMN IF NOT EXISTS photo_paths text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS signature_path text,
  ADD COLUMN IF NOT EXISTS signed_by_name text,
  ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "rep_evidence_read_own" ON storage.objects;
DROP POLICY IF EXISTS "rep_evidence_write_own" ON storage.objects;
DROP POLICY IF EXISTS "rep_evidence_update_own" ON storage.objects;
DROP POLICY IF EXISTS "rep_evidence_delete_own" ON storage.objects;

CREATE POLICY "rep_evidence_read_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'rep-evidence' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "rep_evidence_write_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'rep-evidence' AND owner = auth.uid());

CREATE POLICY "rep_evidence_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'rep-evidence' AND owner = auth.uid());

CREATE POLICY "rep_evidence_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'rep-evidence' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));
