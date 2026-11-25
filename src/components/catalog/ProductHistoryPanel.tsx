import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const REASON: Record<string, string> = {
  seed: "Carga inicial", entrada: "Entrada", pedido: "Pedido", ajuste: "Ajuste", reubicacion: "Reubicación",
};
const TIPO: Record<string, string> = {
  entrada: "Entrada", salida: "Salida", ajuste: "Ajuste", venta: "Venta", devolucion: "Devolución",
};
const fdt = (d: string) =>
  new Date(d).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function pageAll(build: (from: number, to: number) => any, max = 3000) {
  const out: any[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Historial completo del producto: posiciones (kardex) y movimientos por almacén con su origen. */
export function ProductHistoryPanel({ productId }: { productId: string }) {
  const q = useQuery({
    queryKey: ["product-history", productId],
    queryFn: async () => {
      const [kardex, movs] = await Promise.all([
        pageAll((a, b) => (supabase as any).from("v_kardex_movements")
          .select("id, created_at, slot_code, delta, reason, note, lote, description, source")
          .eq("product_id", productId).order("created_at", { ascending: false }).range(a, b)),
        pageAll((a, b) => supabase.from("movimientos_inventario")
          .select("id, created_at, tipo, cantidad, referencia, notas, lote, caducidad, origen_tipo, almacenes(nombre)")
          .eq("producto_id", productId).order("created_at", { ascending: false }).range(a, b)),
      ]);
      return { kardex, movs };
    },
  });

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <p className="text-sm text-destructive">No se pudo cargar el historial: {(q.error as Error).message}</p>;
  const { kardex, movs } = q.data!;
  const entradas = kardex.filter((k) => k.delta > 0).reduce((s, k) => s + Number(k.delta), 0);
  const salidas = kardex.filter((k) => k.delta < 0).reduce((s, k) => s - Number(k.delta), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">Movimientos</div><div className="font-semibold tabular-nums">{kardex.length}</div></div>
        <div className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">Entradas (pzas)</div><div className="font-semibold tabular-nums text-emerald-600">+{entradas}</div></div>
        <div className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">Salidas (pzas)</div><div className="font-semibold tabular-nums text-red-600">−{salidas}</div></div>
      </div>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Movimientos por posición (kardex)</h4>
        {kardex.length === 0 ? <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p> : (
          <ol className="relative space-y-2 border-l pl-4">
            {kardex.map((k) => (
              <li key={k.id} className="relative">
                <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full", k.delta > 0 ? "bg-emerald-500" : "bg-red-500")} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{REASON[k.reason] ?? k.reason}</Badge>
                    <span className={cn("font-bold tabular-nums", k.delta > 0 ? "text-emerald-600" : "text-red-600")}>{k.delta > 0 ? "+" : ""}{k.delta}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{fdt(k.created_at)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Posición: <span className="font-mono">{k.slot_code ?? "—"}</span> · Lote: <span className="font-mono">{k.lote ?? "—"}</span>
                  {k.note ? ` · ${k.note}` : k.description ? ` · ${k.description}` : ""}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Movimientos por almacén y origen</h4>
        {movs.length === 0 ? <p className="text-sm text-muted-foreground">Sin movimientos de almacén.</p> : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground"><tr>
                <th className="px-2 py-1.5 text-left">Fecha</th><th className="px-2 py-1.5 text-left">Tipo</th>
                <th className="px-2 py-1.5 text-left">Almacén</th><th className="px-2 py-1.5 text-left">Lote / cad.</th>
                <th className="px-2 py-1.5 text-left">Origen</th><th className="px-2 py-1.5 text-right">Pzas</th>
              </tr></thead>
              <tbody>
                {movs.map((m: any) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{fdt(m.created_at)}</td>
                    <td className="px-2 py-1.5">{TIPO[m.tipo] ?? m.tipo}</td>
                    <td className="px-2 py-1.5">{m.almacenes?.nombre ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono">{m.lote ?? "—"}{m.caducidad ? ` · ${m.caducidad}` : ""}</td>
                    <td className="px-2 py-1.5">{m.referencia ?? m.origen_tipo ?? "—"}{m.notas ? <div className="text-muted-foreground">{m.notas}</div> : null}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{Number(m.cantidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
