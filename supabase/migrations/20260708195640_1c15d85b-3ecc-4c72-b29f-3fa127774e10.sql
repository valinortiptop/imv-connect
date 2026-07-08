
CREATE POLICY "auth can upload order summaries"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-summaries');

CREATE POLICY "auth can read order summaries"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'order-summaries');
