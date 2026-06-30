
-- Allow authenticated users to upload/update/delete product images in the public `productos` bucket.
create policy "productos_read_public" on storage.objects for select using (bucket_id = 'productos');
create policy "productos_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'productos');
create policy "productos_update_auth" on storage.objects for update to authenticated using (bucket_id = 'productos') with check (bucket_id = 'productos');
create policy "productos_delete_auth" on storage.objects for delete to authenticated using (bucket_id = 'productos');
