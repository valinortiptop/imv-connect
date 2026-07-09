import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCompetitiveLandscapeFn, listCompetitorMigrationsFn } from "@/lib/rep-behavior.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";

export default function CompetitiveLandscape() {
  const fnLand = useServerFn(getCompetitiveLandscapeFn);
  const fnList = useServerFn(listCompetitorMigrationsFn);
  const land = useQuery({ queryKey: ["competitive-landscape"], queryFn: () => fnLand() });
  const list = useQuery({
    queryKey: ["competitor-migrations", "all"],
    queryFn: () => fnList({ data: {} }),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Competidores más mencionados</CardTitle>
        </CardHeader>
        <CardContent>
          {land.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (land.data?.competitors ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún sin datos. Captura migraciones desde la ficha de cliente.
            </p>
          ) : (
            <div className="space-y-1.5">
              {(land.data?.competitors ?? []).slice(0, 10).map((c: any) => (
                <div
                  key={c.competitor_name}
                  className="flex items-center justify-between rounded border border-border/50 px-2 py-1.5 text-sm"
                >
                  <span className="font-medium">{c.competitor_name}</span>
                  <div className="flex gap-2">
                    <Badge variant="outline">{c.menciones} menciones</Badge>
                    <Badge variant="outline">{c.clientes} clientes</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Laboratorios que estamos perdiendo</CardTitle>
        </CardHeader>
        <CardContent>
          {land.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (land.data?.labs_perdidos ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin migraciones registradas.</p>
          ) : (
            <div className="space-y-1.5">
              {(land.data?.labs_perdidos ?? []).slice(0, 10).map((l: any) => (
                <div
                  key={l.laboratorio_id}
                  className="flex items-center justify-between rounded border border-border/50 px-2 py-1.5 text-sm"
                >
                  <div>
                    <div className="font-medium">{l.laboratorio_nombre}</div>
                    {l.top_competitor && (
                      <div className="text-xs text-muted-foreground">
                        Principal: {l.top_competitor}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline">{l.menciones}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Migraciones registradas</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (list.data?.migrations ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay registros.</p>
          ) : (
            <div className="space-y-1.5">
              {(list.data?.migrations ?? []).slice(0, 30).map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/rep/clientes/$id"
                      params={{ id: m.cliente_id }}
                      className="truncate font-medium text-primary hover:underline"
                    >
                      {m.cliente_nombre}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {m.laboratorio_nombre && <>Lab {m.laboratorio_nombre} · </>}
                      Ahora con <span className="font-medium">{m.competitor_name}</span>
                      {m.motivo && ` · ${m.motivo}`}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {String(m.detected_at).slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
