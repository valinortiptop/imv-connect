import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Batch = {
  id: string;
  lote: string | null;
  caducidad: string | null;
  cantidad: number;
  almacen_id: string | null;
  almacenes?: { nombre: string } | null;
};

function expiryTone(caducidad: string | null) {
  if (!caducidad) return "text-muted-foreground";
  const days = Math.floor((new Date(caducidad).getTime() - Date.now()) / 86400000);
  if (days < 0) return "text-red-500 font-medium";
  if (days <= 90) return "text-amber-500 font-medium";
  return "text-foreground";
}

export function ProductLotsPanel({ productId }: { productId: string }) {
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["product-lots", productId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, lote, caducidad, cantidad, almacen_id, almacenes(nombre)")
        .eq("producto_id", productId)
        .order("caducidad", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Batch[];
    },
  });

  if (isLoading) return <Skeleton className="h-16 w-full bg-muted" />;
  if (batches.length === 0)
    return <p className="text-sm text-muted-foreground py-2">Este producto no tiene lotes registrados.</p>;

  const total = batches.reduce((s, b) => s + Number(b.cantidad || 0), 0);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Lotes ({batches.length})
        </span>
        <span className="text-xs text-muted-foreground">
          Total: <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString()}</span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="text-left font-medium py-1 pr-3">Lote</th>
              <th className="text-left font-medium py-1 pr-3">Almacén</th>
              <th className="text-left font-medium py-1 pr-3">Caducidad</th>
              <th className="text-right font-medium py-1">Existencia</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-t border-border/60">
                <td className="py-1.5 pr-3 font-mono text-xs">{b.lote || "—"}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{b.almacenes?.nombre || "—"}</td>
                <td className={cn("py-1.5 pr-3 tabular-nums", expiryTone(b.caducidad))}>
                  {b.caducidad ? new Date(b.caducidad + "T00:00:00").toLocaleDateString("es-MX") : "Sin fecha"}
                </td>
                <td className="py-1.5 text-right tabular-nums font-semibold">
                  {Number(b.cantidad).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
