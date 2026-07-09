import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyVisitsFn } from "@/lib/rep.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

export default function VisitsList() {
  const fn = useServerFn(listMyVisitsFn);
  const { data, isLoading } = useQuery({
    queryKey: ["rep-visits"],
    queryFn: () => fn({ data: { limit: 100 } }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Historial de visitas</h1>
        <p className="text-sm text-muted-foreground">
          {data?.visits.length ?? 0} registradas
        </p>
      </div>
      {isLoading && <Skeleton className="h-40 w-full" />}
      <div className="space-y-2">
        {(data?.visits ?? []).map((v: any) => (
          <Link
            key={v.id}
            to="/rep/clientes/$id"
            params={{ id: v.cliente_id }}
            className="block"
          >
            <Card className="hover:bg-muted/40">
              <CardContent className="p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {v.clientes?.nombre_comercial ?? v.clientes?.razon_social ?? "Cliente"}
                  </span>
                  {v.outcome && <Badge variant="outline">{v.outcome}</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(v.check_in_at).toLocaleString("es-MX")}
                  {v.check_out_at &&
                    ` · ${Math.round((new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60000)} min`}
                </div>
                {v.notes && (
                  <p className="mt-1 line-clamp-2 text-xs">{v.notes}</p>
                )}
              </CardContent>
            </Card>
          </Link>
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
