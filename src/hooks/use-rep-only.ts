import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Roles that keep access to the main admin app. Anything else (i.e. a user
 * whose only role is `representante`) is limited to the /rep portal.
 */
const BACKOFFICE_ROLES = [
  "admin",
  "contabilidad",
  "logistica",
  "almacen",
  "facturacion",
  "cobranza",
  "compras",
  "ventas",
  "viewer",
];

export function isRepOnly(roles: string[]) {
  return roles.includes("representante") && !roles.some((r) => BACKOFFICE_ROLES.includes(r));
}

export async function fetchIsRepOnly(): Promise<boolean> {
  const { data, error } = await supabase.rpc("current_user_roles");
  if (error || !data) return false;
  return isRepOnly(data as string[]);
}

/** Loads whether the signed-in user should be restricted to the rep portal. */
export function useRepOnly() {
  const [loading, setLoading] = useState(true);
  const [repOnly, setRepOnly] = useState(false);

  useEffect(() => {
    let active = true;
    fetchIsRepOnly()
      .then((v) => {
        if (active) setRepOnly(v);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { loading, repOnly };
}
