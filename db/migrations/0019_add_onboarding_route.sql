-- Add Onboarding entry to permission_routes so it appears in sidebar visibility settings
INSERT INTO public.permission_routes (route_key, route_path, group_label, active, sort_order)
VALUES ('navOnboarding', '/admin/onboarding', 'General', true, 5)
ON CONFLICT (route_key) DO UPDATE
  SET route_path = EXCLUDED.route_path,
      group_label = EXCLUDED.group_label;
