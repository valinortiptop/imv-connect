-- Allow any authenticated user to fill in onboarding (was admin-only, causing silent write failures for viewers).

drop policy if exists "ob_items_write_admin" on public.onboarding_items;
create policy "ob_items_write_auth" on public.onboarding_items
  for all to authenticated
  using (true) with check (true);

drop policy if exists "emp_update_admin" on public.empresa_datos;
create policy "emp_update_auth" on public.empresa_datos
  for update to authenticated
  using (true) with check (true);

-- Ensure deletes on archivos work for any authenticated user (mirrors existing "for all using(true)" but be explicit)
drop policy if exists "ob_storage_delete_admin" on storage.objects;
create policy "ob_storage_delete_auth" on storage.objects
  for delete to authenticated
  using (bucket_id = 'onboarding');