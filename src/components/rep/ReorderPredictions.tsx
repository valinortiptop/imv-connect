import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getReorderPredictionsFn } from "@/lib/rep.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";

const urgencyColor: Record<string, string> = {
  vencido: "bg-red-500/15 text-red-600 border-red-500/30",
  inmediato: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  proximo: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

export default function ReorderPredictions({ withinDays = 10, limit }: { withinDays?: number; limit?: number }) {
  const fetchPred = useServerFn(getReorderPredictionsFn);
  const q = useQuery({
    queryKey: ["rep-reorders", withinDays],
    queryFn: () => fetchPred({ data: { withinDays } }),
  });

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError)
    return <p className="text-sm text-muted-foreground">No se pudo cargar las predicciones.</p>;

  const preds = q.data?.predictions ?? [];
  const shown = limit ? preds.slice(0, limit) : preds;

  if (shown.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay recompras probables en los próximos {withinDays} días.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {shown.map((p: any) => (
        <Link
          key={`${p.cliente_id}-${p.producto_id}`}
          to="/rep/clientes/$id"
          params={{ id: p.cliente_id }}
          className="block"
        >
          <Card className="transition-colors hover:bg-muted/40">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{p.cliente_nombre}</span>
                    <Badge variant="outline" className={urgencyColor[p.urgency] ?? ""}>
                      {p.urgency === "vencido"
                        ? "Vencido"
                        : p.urgency === "inmediato"
                          ? `${p.days_until}d`
                          : `${p.days_until}d`}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.producto_nombre} {p.sku ? `· ${p.sku}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    <Clock className="mr-1 inline h-3 w-3" />
                    Cadencia ~{p.cadencia_dias}d · sugerido: {p.qty_sugerida} u · confianza {p.confidence}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <div className="text-muted-foreground">Stock</div>
                  <div className={`font-semibold ${p.stock_disponible < p.qty_sugerida ? "text-red-600" : ""}`}>
                    {p.stock_disponible}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
