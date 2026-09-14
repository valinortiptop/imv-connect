DROP POLICY IF EXISTS "rep-evidence insert own" ON storage.objects;
DROP POLICY IF EXISTS "rep-evidence read own" ON storage.objects;
DROP POLICY IF EXISTS "rep-evidence delete own" ON storage.objects;
DROP POLICY IF EXISTS "rep_evidence_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "rep_evidence_read_own" ON storage.objects;
DROP POLICY IF EXISTS "rep_evidence_update_own" ON storage.objects;
DROP POLICY IF EXISTS "rep_evidence_delete_own" ON storage.objects;

CREATE POLICY "rep_evidence_insert_v2" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'rep-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "rep_evidence_select_v2" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'rep-evidence'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'ventas'::app_role])
  )
);

CREATE POLICY "rep_evidence_update_v2" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'rep-evidence'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  bucket_id = 'rep-evidence'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "rep_evidence_delete_v2" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'rep-evidence'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::app_role))
);