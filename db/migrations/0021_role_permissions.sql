-- Per-role route permissions for the "Permisos por Rol" admin tab.

-- Ensure all role enum values exist (no-op if already present).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ventas';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'almacen';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'logistica';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'contabilidad';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role        public.app_role NOT NULL,
  route_key   text NOT NULL REFERENCES public.permission_routes(route_key) ON DELETE CASCADE,
  allowed     boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, route_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rp_read_auth" ON public.role_permissions;
CREATE POLICY "rp_read_auth" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rp_admin_write" ON public.role_permissions;
CREATE POLICY "rp_admin_write" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed: every (non-admin role × route) defaulting to allowed=true so the
-- editor starts from a permissive baseline (admin always full access).
INSERT INTO public.role_permissions (role, route_key, allowed)
SELECT r.role, pr.route_key, true
  FROM (SELECT unnest(ARRAY['ventas','almacen','contabilidad']::public.app_role[]) AS role) r
  CROSS JOIN public.permission_routes pr
ON CONFLICT (role, route_key) DO NOTHING;

-- RPC: list a role's permissions joined with route metadata
CREATE OR REPLACE FUNCTION public.get_role_permissions(p_role public.app_role)
RETURNS TABLE (
  route_key   text,
  route_path  text,
  group_label text,
  allowed     boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.route_key,
         pr.route_path,
         pr.group_label,
         COALESCE(rp.allowed, false) AS allowed
    FROM public.permission_routes pr
    LEFT JOIN public.role_permissions rp
           ON rp.route_key = pr.route_key AND rp.role = p_role
   ORDER BY pr.sort_order, pr.route_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_role_permissions(public.app_role) TO authenticated;

-- RPC: upsert a single (role, route) toggle (admin only)
CREATE OR REPLACE FUNCTION public.admin_set_role_permission(
  p_role public.app_role,
  p_route_key text,
  p_allowed boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'requiere_admin';
  END IF;
  INSERT INTO public.role_permissions (role, route_key, allowed, updated_at)
       VALUES (p_role, p_route_key, p_allowed, now())
  ON CONFLICT (role, route_key)
    DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_role_permission(public.app_role, text, boolean) TO authenticated;

-- Override get_my_permissions so it filters by the caller's role + the
-- per-route active flag. Admins always see everything.
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (
  route_key   text,
  route_path  text,
  group_label text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.route_key, pr.route_path, pr.group_label
    FROM public.permission_routes pr
   WHERE pr.active = true
     AND (
       public.has_role(auth.uid(), 'admin')
       OR EXISTS (
         SELECT 1
           FROM public.role_permissions rp
           JOIN public.user_roles ur ON ur.role = rp.role
          WHERE ur.user_id = auth.uid()
            AND rp.route_key = pr.route_key
            AND rp.allowed = true
       )
     )
   ORDER BY pr.sort_order, pr.route_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
