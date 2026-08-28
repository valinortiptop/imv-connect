// Modal de detalle de una ruta planeada (vista supervisor).
// Muestra el mapa, las paradas paso a paso y — para admins — permite
// renombrar, exportar o eliminar el plan.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getSavedRouteDetailFn,
  renameSavedRouteFn,
  deleteSavedRouteFn,
} from "@/lib/rep.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import SavedRoutePreview from "./SavedRoutePreview";
import { downloadRoutePdf, printRoute } from "@/lib/route-export";
import { toast } from "sonner";
import { MapPin, Pencil, Trash2, Download, Printer, Clock, Route as RouteIcon, CheckCircle2, CircleDashed, Camera, ShoppingCart } from "lucide-react";

export default function RouteDetailsDialog({
  routeId,
  open,
  onOpenChange,
}: {
  routeId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getSavedRouteDetailFn);
  const rename = useServerFn(renameSavedRouteFn);
  const remove = useServerFn(deleteSavedRouteFn);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["saved-route-detail", routeId],
    queryFn: () => fetchDetail({ data: { id: routeId! } }),
    enabled: open && !!routeId,
  });

  const route: any = data?.route;
  const isAdmin = !!data?.isAdmin;
  const stops: any[] = route?.ordered_stops ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["saved-route-detail", routeId] });
    qc.invalidateQueries({ queryKey: ["daily-routes-summary"] });
    qc.invalidateQueries({ queryKey: ["rep-saved-routes"] });
  };

  const renameMut = useMutation({
    mutationFn: () => rename({ data: { id: routeId!, nombre: name.trim() } }),
    onSuccess: () => {
      toast.success("Nombre actualizado");
      setEditing(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo renombrar"),
  });

  const deleteMut = useMutation({
    mutationFn: () => remove({ data: { id: routeId! } }),
    onSuccess: () => {
      toast.success("Ruta eliminada");
      onOpenChange(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  const exportPayload = () => ({
    title: route?.nombre ?? "Ruta",
    fecha: route?.fecha ?? null,
    totalKm: route?.total_km ?? null,
    totalMin: route?.total_minutes ?? null,
    stops: stops.map((s: any) => ({
      cliente_id: String(s.cliente_id),
      nombre: s.nombre ?? "Cliente",
      direccion: s.direccion ?? null,
      lat: s.lat ?? null,
      lng: s.lng ?? null,
    })),
    legs: (route?.legs as any[]) ?? undefined,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RouteIcon className="h-4 w-4 text-primary" />
            {route?.nombre ?? "Ruta planeada"}
          </DialogTitle>
          <DialogDescription>
            {route
              ? `${route.fecha} · ${stops.length} paradas${
                  route.total_km ? ` · ${route.total_km} km` : ""
                }${route.representante_nombre ? ` · ${route.representante_nombre}` : ""}`
              : "Cargando detalle de la ruta…"}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {route && (
          <div className="space-y-4">
            {editing ? (
              <div className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre de la ruta"
                  className="h-9"
                />
                <Button
                  size="sm"
                  onClick={() => renameMut.mutate()}
                  disabled={!name.trim() || renameMut.isPending}
                >
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setName(route.nombre ?? "");
                      setEditing(true);
                    }}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Renombrar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadRoutePdf(exportPayload())}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => printRoute(exportPayload())}
                >
                  <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir
                </Button>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="ml-auto"
                    onClick={() => {
                      if (confirm("¿Eliminar esta ruta planeada?")) deleteMut.mutate();
                    }}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
                  </Button>
                )}
              </div>
            )}

            <div className="overflow-hidden rounded-md border">
              <SavedRoutePreview
                polyline={route.polyline}
                stops={stops}
                startLat={route.start_lat}
                startLng={route.start_lng}
                height={260}
              />
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {route.total_minutes != null && (
                <Badge variant="secondary" className="font-normal">
                  <Clock className="mr-1 h-3 w-3" /> {route.total_minutes} min estimados
                </Badge>
              )}
              {route.total_km != null && (
                <Badge variant="secondary" className="font-normal">
                  <MapPin className="mr-1 h-3 w-3" /> {route.total_km} km
                </Badge>
              )}
              <Badge
                variant="outline"
                className="border-green-500/40 bg-green-500/10 font-normal text-green-700 dark:text-green-400"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" /> {route.visited_count ?? 0}/{stops.length} visitados
              </Badge>
              {!!route.visited_minutes && (
                <Badge variant="outline" className="font-normal">
                  <Clock className="mr-1 h-3 w-3" /> {route.visited_minutes} min con clientes
                </Badge>
              )}
            </div>

            <ol className="space-y-1.5">
              {stops.map((s, i) => {
                const v = s.visit;
                const visited = !!s.visited;
                return (
                  <li
                    key={`${s.cliente_id}-${i}`}
                    className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
                      visited ? "border-green-500/40 bg-green-500/5" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                        visited ? "bg-green-600" : "bg-destructive"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{s.nombre ?? "Cliente"}</p>
                        {visited ? (
                          <Badge className="border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-400" variant="outline">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {v?.in_progress ? "En visita" : "Visitado"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <CircleDashed className="mr-1 h-3 w-3" /> No visitado
                          </Badge>
                        )}
                      </div>
                      {s.direccion && (
                        <p className="truncate text-xs text-muted-foreground">{s.direccion}</p>
                      )}
                      {v && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(v.check_in_at).toLocaleTimeString("es-MX", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {v.check_out_at
                              ? ` – ${new Date(v.check_out_at).toLocaleTimeString("es-MX", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : " – en curso"}
                          </span>
                          <span className="font-medium text-foreground">
                            {v.minutos != null ? `${v.minutos} min` : "duración pendiente"}
                          </span>
                          {v.outcome && <span>Resultado: {v.outcome}</span>}
                          {v.pedido_id && (
                            <span className="inline-flex items-center gap-1">
                              <ShoppingCart className="h-3 w-3" /> pedido
                            </span>
                          )}
                          {!!v.photos && (
                            <span className="inline-flex items-center gap-1">
                              <Camera className="h-3 w-3" /> {v.photos}
                            </span>
                          )}
                          {v.distance_m != null && <span>{Math.round(v.distance_m)} m del punto</span>}
                          {v.unplanned && <span>fuera de ruta</span>}
                        </div>
                      )}
                      {v?.notes && (
                        <p className="mt-1 line-clamp-2 text-[11px] italic text-muted-foreground">
                          “{v.notes}”
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
              {stops.length === 0 && (
                <li className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Esta ruta no tiene paradas.
                </li>
              )}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
