
## What's actually happening

Two separate issues, neither is a failed publish.

### 1. The changes exist but are not on the live domain

All the edits from this hour (merged "Importar imágenes" CTA, "No timbrada" badge + Timbrar action, catalog import IVA validation, Gemini model fix) are in the **preview** build. Your `imv.valinor.studio` / `imv-catalogo-digital.lovable.app` sites still serve the last published version. Frontend changes require clicking **Publish → Update** in the publish dialog to go live — they don't auto-deploy. Nothing failed; nothing was pushed.

### 2. The 404 on `/rpc/get_my_role` is real

`src/hooks/use-auth.tsx` calls `supabase.rpc("get_my_role")` in two places (lines 61 and 137). I queried the database directly — the function does not exist. Only `has_role(uuid, app_role)` exists. The earlier migration that would have created `get_my_role` was never approved, so it never ran.

## Plan

**Step 1 — Create the missing `get_my_role` RPC**

Add a migration creating a `SECURITY DEFINER` function that returns the current user's highest-priority role from `public.user_roles`:

```sql
create or replace function public.get_my_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles
   where user_id = auth.uid()
   order by case role
     when 'admin' then 1
     when 'moderator' then 2
     when 'user' then 3
     else 99
   end
   limit 1
$$;

grant execute on function public.get_my_role() to authenticated;
```

This matches the shape `use-auth.tsx` already expects (a single role string or null). Once created, the 404s in every page disappear.

**Step 2 — Tell the user to publish**

After the migration lands, click **Publish → Update** so the merged imágenes button, "No timbrada" badge, catalog import fixes, and Gemini model update reach the live domain. The migration itself (backend) deploys immediately and does not need a re-publish.

## Files touched

- New migration creating `public.get_my_role()` (via the migration tool, requires your approval).
- No frontend edits are needed for the 404 — the client code is already correct.
