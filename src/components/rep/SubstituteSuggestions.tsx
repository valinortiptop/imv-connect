import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductSubstitutesFn } from "@/lib/rep-behavior.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(n);

export default function SubstituteSuggestions({ productoId }: { productoId: string }) {
  const fn = useServerFn(getProductSubstitutesFn);
  const q = useQuery({
    queryKey: ["product-substitutes", productoId],
    queryFn: () => fn({ data: { productoId } }),
  });

  if (q.isLoading) return <Skeleton className="h-16 w-full" />;
  const subs = q.data?.substitutes ?? [];
  if (subs.length === 0)
    return (
      <p className="text-xs text-muted-foreground">Sin sustitutos configurados para este SKU.</p>
    );

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">Sustitutos sugeridos</div>
      {subs.slice(0, 5).map((s: any) => {
        const disp = Number(s.stock_disponible ?? 0);
        return (
          <div
            key={s.id}
            className="flex items-center justify-between rounded border border-border/50 px-2 py-1.5 text-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{s.nombre}</div>
              <div className="text-[10px] text-muted-foreground">
                {s.sku} · {s.marca ?? "—"}
                {s.motivo && ` · ${s.motivo}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={disp <= 0 ? "text-red-600" : "text-emerald-600"}>
                Disp: {disp}
              </Badge>
              {s.precio_lista != null && <span>{fmtMXN(Number(s.precio_lista))}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
