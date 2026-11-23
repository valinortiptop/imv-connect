import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeConfig, type CodigoFiscal } from "@/lib/product-tax";

export function useCodigosFiscales() {
  return useQuery({
    queryKey: ["codigos-fiscales"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("codigos_fiscales" as any).select("*").order("orden");
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ ...normalizeConfig(r), id: r.id, clave: r.clave, nombre: r.nombre, orden: r.orden, activo: r.activo })) as CodigoFiscal[];
    },
  });
}

/** UI hint only; the database trigger and RLS enforce who can save. */
export function useCanEditFiscal() {
  return useQuery({
    queryKey: ["can-edit-fiscal"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.rpc("has_any_role" as any, { _user_id: u.user.id, _roles: ["admin", "contabilidad"] });
      return data === true;
    },
  });
}

export function fiscalUpdatePayload(cfg: ReturnType<typeof normalizeConfig>, codigoId: string | null) {
  return {
    codigo_fiscal_id: codigoId,
    iva_modo: cfg.iva_modo,
    iva_pct: cfg.iva_pct,
    objeto_impuesto: cfg.objeto_impuesto,
    ieps_pct: cfg.ieps_pct,
    ret_iva_modo: cfg.ret_iva_modo,
    ret_iva_pct: cfg.ret_iva_pct,
    ret_isr_modo: cfg.ret_isr_modo,
    ret_isr_pct: cfg.ret_isr_pct,
  };
}
