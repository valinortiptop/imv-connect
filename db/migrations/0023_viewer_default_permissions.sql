-- Viewer role: by default only the Onboarding page is allowed.
INSERT INTO public.role_permissions (role, route_key, allowed)
SELECT 'viewer'::public.app_role, pr.route_key,
       CASE WHEN pr.route_key = 'navOnboarding' THEN true ELSE false END
  FROM public.permission_routes pr
ON CONFLICT (role, route_key) DO NOTHING;
