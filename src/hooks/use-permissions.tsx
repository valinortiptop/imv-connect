import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface PermissionEntry {
  route_key: string;
  route_path: string;
  group_label: string;
}

/**
 * Name of the global event that callers (e.g. the admin "Visibilidad
 * de pestañas" toggle) dispatch when permission_routes data changes.
 * Every active usePermissions hook listens for it and refetches so the
 * sidebar updates instantly without a page reload.
 */
export const PERMISSIONS_CHANGED_EVENT = "permissions-changed";

/** Convenience helper for callers that flip routes on/off. */
export function notifyPermissionsChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(PERMISSIONS_CHANGED_EVENT));
  } catch {
    // older browsers without Event constructor support — fine to ignore,
    // the user can always refresh manually
  }
}

/**
 * Fetches the current user's effective permissions (role defaults + user overrides).
 * Admin gets all routes automatically.
 *
 * Auto-refresh: any code that mutates permission_routes (visibility
 * toggles, per-role permission edits, etc.) should call
 * notifyPermissionsChanged() after a successful save — every active
 * usePermissions hook will refetch in response.
 */
export function usePermissions() {
  const { session, role } = useAuth();
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-fetch only when the actual user or their role changes. We deliberately
  // depend on `session?.user?.id` (a stable string) instead of the whole
  // `session` object — token refreshes on tab focus produce a new session
  // reference but the user id is unchanged, and we don't want to re-run.
  const userId = session?.user?.id ?? null;

  // Extract the fetch into a stable callback so both the initial-load
  // effect and the event-listener effect call exactly the same code.
  const fetchPermissions = useCallback(async (): Promise<PermissionEntry[]> => {
    try {
      const { data, error } = await supabase.rpc("get_my_permissions");
      if (error) {
        console.error("[permissions] error:", error);
        return [];
      }
      if (data && Array.isArray(data)) {
        return data as unknown as PermissionEntry[];
      }
      return [];
    } catch (err) {
      console.error("[permissions] exception:", err);
      return [];
    }
  }, []);

  // Initial load + re-fetch when user/role changes
  useEffect(() => {
    if (!userId || !role) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchPermissions();
      if (!cancelled) {
        setPermissions(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, role, fetchPermissions]);

  // Listen for global "permissions-changed" events so the sidebar and
  // every other consumer of this hook reflect the new state instantly
  // when an admin toggles a tab on or off.
  useEffect(() => {
    if (!userId || !role) return;
    let cancelled = false;
    const onChange = async () => {
      const data = await fetchPermissions();
      if (!cancelled) setPermissions(data);
    };
    window.addEventListener(PERMISSIONS_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PERMISSIONS_CHANGED_EVENT, onChange);
    };
  }, [userId, role, fetchPermissions]);

  const allowedRouteKeys = new Set(permissions.map((p) => p.route_key));
  const allowedRoutePaths = permissions.map((p) => p.route_path);
  const allowedGroups = [...new Set(permissions.map((p) => p.group_label))];

  const canAccess = (pathname: string): boolean => {
    if (!role) return false;
    return allowedRoutePaths.some((r) =>
      r === "/" ? pathname === "/" : pathname.startsWith(r)
    );
  };

  const canAccessKey = (key: string): boolean => allowedRouteKeys.has(key);

  return {
    permissions,
    allowedGroups,
    allowedRouteKeys,
    canAccess,
    canAccessKey,
    loading,
  };
}
