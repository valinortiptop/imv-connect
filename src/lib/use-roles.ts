import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "ventas" | "almacen" | "contabilidad";

export function useRoles() {
  const q = useQuery({
    queryKey: ["current-user-roles"],
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase.rpc("current_user_roles");
      if (error) throw error;
      return (data ?? []) as AppRole[];
    },
    staleTime: 60_000,
  });
  const roles = q.data ?? [];
  return {
    roles,
    isLoading: q.isLoading,
    has: (r: AppRole) => roles.includes(r),
    hasAny: (rs: AppRole[]) => rs.some((r) => roles.includes(r)),
    isAdmin: roles.includes("admin"),
  };
}
