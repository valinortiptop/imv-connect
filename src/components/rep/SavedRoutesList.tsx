import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSavedRoutesFn, deleteSavedRouteFn } from "@/lib/rep.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { History, ChevronDown, ChevronRight, Trash2, MapPin } from "lucide-react";

type Stop = { cliente_id: string; lat?: number; lng?: number };
type SavedRoute = {
  id: string;
  fecha: string;
  nombre: string | null;
  total_km: number | null;
  total_minutes: number | null;
  ordered_stops: Stop[];
  legs: any[];
  polyline: string | null;
  created_at: string;
  origen: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });
}

export default function SavedRoutesList({ limit = 60 }: { limit?: number }) {
  const list = useServerFn(listSavedRoutesFn);
  const del = useServerFn(deleteSavedRouteFn);
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["rep-saved-routes", limit],
    queryFn: () => list({ data: { limit } }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Ruta eliminada");
      qc.invalidateQueries({ queryKey: ["rep-saved-routes"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  const grouped = useMemo(() => {
    const rows = (q.data?.routes ?? []) as SavedRoute[];
    const map = new Map<string, SavedRoute[]>();
    for (const r of rows) {
      const key = r.fecha;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [q.data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <History className="h-5 w-5 text-primary" />
        <CardTitle className="text-base">Rutas guardadas</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading && <Skeleton className="h-24 w-full" />}
        {!q.isLoading && grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aún no has generado rutas. Al optimizar una ruta se guardará aquí, organizada por fecha.
          </p>
        )}
        <div className="space-y-4">
          {grouped.map(([fecha, routes]) => (
            <div key={fecha}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {fmtDate(fecha)}
                </span>
                <Badge variant="secondary" className="text-[10px]">{routes.length}</Badge>
              </div>
              <div className="space-y-2">
                {routes.map((r) => {
                  const open = openId === r.id;
                  const time = new Date(r.created_at).toLocaleTimeString("es-MX", {
                    hour: "2-digit", minute: "2-digit",
                  });
                  return (
                    <div key={r.id} className="rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : r.id)}
                        className="flex w-full items-center gap-2 p-2 text-left hover:bg-muted/40"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {r.nombre || `Ruta ${time}`}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {(r.ordered_stops?.length ?? 0)} paradas
                            {r.total_km != null ? ` · ${r.total_km} km` : ""}
                            {r.total_minutes != null ? ` · ${r.total_minutes} min` : ""}
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("¿Eliminar esta ruta guardada?")) removeMut.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </button>
                      {open && (
                        <ol className="space-y-1 border-t border-border bg-muted/20 p-2">
                          {(r.ordered_stops ?? []).map((s: any, i: number) => (
                            <li key={`${s.cliente_id}-${i}`} className="flex items-start gap-2 text-xs">
                              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                                {i + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate">
                                    {s.nombre || s.cliente_id}
                                  </span>
                                </div>
                              </div>
                            </li>
                          ))}
                          {(r.ordered_stops ?? []).length === 0 && (
                            <li className="text-xs text-muted-foreground">Sin paradas registradas</li>
                          )}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
