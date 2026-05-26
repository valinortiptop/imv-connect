// Simplified permissions hook: always allow all routes for the current user.
// The full role/permission backend (RPC `get_my_permissions`) is not wired in
// this project yet, so we fall back to a permissive default so the sidebar
// renders all configured items.
import { useCallback } from "react";

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

export function usePermissions() {
  const canAccess = useCallback((_p: string) => true, []);
  const canAccessKey = useCallback((_k: string) => true, []);
  return {
    permissions: [] as PermissionEntry[],
    allowedGroups: [] as string[],
    allowedRouteKeys: new Set<string>(),
    canAccess,
    canAccessKey,
    loading: false,
  };
}
