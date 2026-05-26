-- Admin user-listing infra for the "Usuarios" tab

-- Add columns the UI expects
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Allow admins to write user_roles directly (UI uses .from('user_roles').update)
DROP POLICY IF EXISTS "ur_admin_write" ON public.user_roles;
CREATE POLICY "ur_admin_write" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- List every auth.users row for admins (used by Usuarios tab)
CREATE OR REPLACE FUNCTION public.get_all_users_for_admin()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  raw_user_meta_data jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'requiere_admin';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at, u.raw_user_meta_data
      FROM auth.users u
     ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_users_for_admin() TO authenticated;

-- Delete a user (admin only)
CREATE OR REPLACE FUNCTION public.delete_user_as_admin(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'requiere_admin';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'no_puedes_eliminarte';
  END IF;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_as_admin(uuid) TO authenticated;
