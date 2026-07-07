import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "imv:selected_empresa_id";

export type EmpresaLite = {
  id: string;
  razon_social: string;
  nombre_comercial: string | null;
  rfc: string;
  is_default: boolean;
};

/** Global selected-empresa for contabilidad module (persisted in localStorage). */
export function useSelectedEmpresa() {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ["empresas-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas" as any)
        .select("id, razon_social, nombre_comercial, rfc, is_default")
        .eq("active", true)
        .order("is_default", { ascending: false })
        .order("razon_social");
      if (error) throw error;
      return (data ?? []) as unknown as EmpresaLite[];
    },
  });

  // Auto-select default if none picked yet
  useEffect(() => {
    if (selectedId) return;
    if (empresas.length === 0) return;
    const def = empresas.find((e) => e.is_default) ?? empresas[0];
    if (def) {
      setSelectedId(def.id);
      try { window.localStorage.setItem(STORAGE_KEY, def.id); } catch {}
    }
  }, [empresas, selectedId]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch {}
  }, []);

  const selected = empresas.find((e) => e.id === selectedId) ?? null;

  return { empresas, selected, selectedId, select, isLoading };
}
