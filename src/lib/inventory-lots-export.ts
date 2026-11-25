import { supabase } from "@/integrations/supabase/client";

export type LoteExport = { lote: string | null; caducidad: string | null; cantidad: number; almacen: string | null };

/** Lotes por producto (paginado, ordenado por caducidad) para exportar Inventario. */
export async function fetchLotesPorProducto(ids: string[]): Promise<Map<string, LoteExport[]>> {
  const out = new Map<string, LoteExport[]>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 150) {
    const chunk = unique.slice(i, i + 150);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("product_batches")
        .select("producto_id, lote, caducidad, cantidad, almacenes(nombre)")
        .in("producto_id", chunk)
        .order("caducidad", { ascending: true, nullsFirst: false })
        .range(from, from + 999);
      if (error) throw error;
      for (const b of (data ?? []) as any[]) {
        const arr = out.get(b.producto_id) ?? [];
        arr.push({ lote: b.lote, caducidad: b.caducidad, cantidad: Number(b.cantidad ?? 0), almacen: b.almacenes?.nombre ?? null });
        out.set(b.producto_id, arr);
      }
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

export function fmtCaducidad(c: string | null): string {
  return c ? new Date(c + "T00:00:00").toLocaleDateString("es-MX") : "Sin fecha";
}
