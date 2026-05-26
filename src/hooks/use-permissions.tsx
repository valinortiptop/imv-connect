import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const PERMISSIONS_CHANGED_EVENT = "permissions-changed";

export function notifyPermissionsChanged() {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new Event(PERMISSIONS_CHANGED_EVENT)); } catch {}
}

export interface PermissionEntry {
  route_key: string;
  route_path: string;
  group_label: string;
}

/**
 * Returns the set of routes currently visible to the user. Backed by the
 * `get_my_permissions` RPC (only returns rows where `active = true` in
 * `permission_routes`). If the RPC is missing or fails we fall back to
 * allowing everything so the sidebar never disappears entirely.
 */
export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissive, setPermissive] = useState(false);

  const fetchPermissions = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_my_permissions");
      if (error) {
        setPermissive(true);
        return [] as PermissionEntry[];
      }
      if (Array.isArray(data)) return data as PermissionEntry[];
      return [] as PermissionEntry[];
    } catch {
      setPermissive(true);
      return [] as PermissionEntry[];
    }
  }, []);

  useEffect(() => {
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
  }, [fetchPermissions]);

  useEffect(() => {
    const onChange = async () => {
      const data = await fetchPermissions();
      setPermissions(data);
    };
    window.addEventListener(PERMISSIONS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PERMISSIONS_CHANGED_EVENT, onChange);
  }, [fetchPermissions]);

  const allowedRouteKeys = new Set(permissions.map((p) => p.route_key));
  const allowedRoutePaths = permissions.map((p) => p.route_path);
  const allowedGroups = [...new Set(permissions.map((p) => p.group_label))];

  const canAccess = (pathname: string): boolean => {
    if (permissive) return true;
    return allowedRoutePaths.some((r) =>
      r === "/admin" ? pathname === "/admin" : pathname.startsWith(r)
    );
  };
  const canAccessKey = (key: string): boolean => permissive || allowedRouteKeys.has(key);
  const canAccessPath = (path: string): boolean =>
    permissive || allowedRoutePaths.includes(path);

  return {
    permissions,
    allowedGroups,
    allowedRouteKeys,
    allowedRoutePaths,
    canAccess,
    canAccessKey,
    canAccessPath,
    loading,
    permissive,
  };
}
