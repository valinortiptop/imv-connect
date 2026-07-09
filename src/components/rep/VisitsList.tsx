import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyVisitsFn } from "@/lib/rep.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const outcomeBar: Record<string, string> = {
  venta: "bg-emerald-500",
  cotizacion: "bg-blue-500",
  sin_venta: "bg-muted-foreground/40",
  seguimiento: "bg-amber-500",
  reclamo: "bg-red-500",
};

function groupLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, today)) return "Hoy";
  if (same(d, yesterday)) return "Ayer";
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export default function VisitsList() {
  const fn = useServerFn(listMyVisitsFn);
  const { data, isLoading } = useQuery({
    queryKey: ["rep-visits"],
    queryFn: () => fn({ data: { limit: 100 } }),
  });

  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    (data?.visits ?? []).forEach((v: any) => {
      const key = groupLabel(v.check_in_at);
      const arr = map.get(key) ?? [];
      arr.push(v);
      map.set(key, arr);
    });
    return [...map.entries()];
  }, [data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Historial de visitas</h1>
        <p className="text-sm text-muted-foreground">
          {data?.visits.length ?? 0} registradas
        </p>
      </div>
      {isLoading && <Skeleton className="h-40 w-full" />}

      <div className="space-y-6">
        {groups.map(([label, items]) => (
          <div key={label} className="space-y-2">
            <div className="sticky top-14 z-10 -mx-4 bg-background/95 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur md:static md:mx-0 md:px-0 md:py-0 md:text-[11px]">
              {label}
            </div>
            {items.map((v: any) => {
              const bar = outcomeBar[v.outcome] ?? "bg-muted-foreground/30";
              const durMin = v.check_out_at
                ? Math.round(
                    (new Date(v.check_out_at).getTime() -
                      new Date(v.check_in_at).getTime()) /
                      60000,
                  )
                : null;
              return (
                <Link
                  key={v.id}
                  to="/rep/clientes/$id"
                  params={{ id: v.cliente_id }}
                  className="block"
                >
                  <Card className="relative overflow-hidden hover:bg-muted/40 active:bg-muted">
                    <span
                      className={cn("absolute inset-y-0 left-0 w-1", bar)}
                    />
                    <CardContent className="p-3 pl-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {v.clientes?.nombre_comercial ??
                            v.clientes?.razon_social ??
                            "Cliente"}
                        </span>
                        {v.outcome && (
                          <Badge variant="outline" className="shrink-0">
                            {v.outcome}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {new Date(v.check_in_at).toLocaleTimeString("es-MX", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {durMin != null && ` · ${durMin} min`}
                      </div>
                      {v.notes && (
                        <p className="mt-1 line-clamp-2 text-xs">{v.notes}</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ))}

        {!isLoading && (data?.visits ?? []).length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aún no hay visitas registradas.
          </div>
        )}
      </div>
    </div>
  );
}
