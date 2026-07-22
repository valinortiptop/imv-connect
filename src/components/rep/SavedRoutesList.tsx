import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  listSavedRoutesFn,
  deleteSavedRouteFn,
  duplicateSavedRouteFn,
  renameSavedRouteFn,
} from "@/lib/rep.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  History,
  ChevronDown,
  ChevronRight,
  Trash2,
  MapPin,
  Pencil,
  ClipboardCheck,
  Copy,
  Check,
  X as XIcon,
  Printer,
  Download,
} from "lucide-react";
import CheckInDialog from "./CheckInDialog";
import SavedRoutePreview from "./SavedRoutePreview";
import { downloadRoutePdf, printRoute as printRouteHtml } from "@/lib/route-export";

type Stop = {
  cliente_id: string;
  lat?: number;
  lng?: number;
  nombre?: string | null;
  direccion?: string | null;
};
type SavedRoute = {
  id: string;
  fecha: string;
  nombre: string | null;
  total_km: number | null;
  total_minutes: number | null;
  ordered_stops: Stop[];
  legs: any[];
  polyline: string | null;
  start_lat: number | null;
  start_lng: number | null;
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
  const dup = useServerFn(duplicateSavedRouteFn);
  const rename = useServerFn(renameSavedRouteFn);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<{ id: string; nombre: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");

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

  const duplicateMut = useMutation({
    mutationFn: (vars: { id: string; fecha?: string }) => dup({ data: vars }),
    onSuccess: () => {
      toast.success("Ruta duplicada");
      qc.invalidateQueries({ queryKey: ["rep-saved-routes"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo duplicar"),
  });

  const renameMut = useMutation({
    mutationFn: (vars: { id: string; nombre: string }) => rename({ data: vars }),
    onSuccess: () => {
      toast.success("Nombre actualizado");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["rep-saved-routes"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo renombrar"),
  });

  const loadRouteIntoMap = (r: SavedRoute) => {
    try {
      sessionStorage.setItem("rep:load-route", JSON.stringify(r));
    } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("rep:load-route", { detail: r }));
    }
    navigate({ to: "/rep/ruta" });
    toast.success("Ruta cargada en el mapa");
  };

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
    <>
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
                    const isEditing = editingId === r.id;
                    const displayName = r.nombre || `Ruta ${time}`;
                    return (
                      <div key={r.id} className="rounded-md border border-border">
                        <div className="flex items-center gap-2 p-2">
                          <button
                            type="button"
                            onClick={() => setOpenId(open ? null : r.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            {open ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <div
                                  className="flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Input
                                    autoFocus
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const n = editingName.trim();
                                        if (n) renameMut.mutate({ id: r.id, nombre: n });
                                      } else if (e.key === "Escape") {
                                        setEditingId(null);
                                      }
                                    }}
                                    className="h-7 text-sm"
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 shrink-0"
                                    disabled={renameMut.isPending || !editingName.trim()}
                                    onClick={() => {
                                      const n = editingName.trim();
                                      if (n) renameMut.mutate({ id: r.id, nombre: n });
                                    }}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() => setEditingId(null)}
                                  >
                                    <XIcon className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="truncate text-sm font-medium">{displayName}</div>
                              )}
                              <div className="text-[11px] text-muted-foreground tabular-nums">
                                {(r.ordered_stops?.length ?? 0)} paradas
                                {r.total_km != null ? ` · ${r.total_km} km` : ""}
                                {r.total_minutes != null ? ` · ${r.total_minutes} min` : ""}
                              </div>
                            </div>
                          </button>
                          {!isEditing && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                              title="Renombrar"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(r.id);
                                setEditingName(r.nombre || "");
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 gap-1 px-2 text-xs"
                            onClick={() => loadRouteIntoMap(r)}
                          >
                            Ver / Editar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            title="Duplicar ruta"
                            disabled={duplicateMut.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              const today = new Date().toISOString().slice(0, 10);
                              const suggested = prompt(
                                "Fecha para la ruta duplicada (YYYY-MM-DD):",
                                r.fecha || today,
                              );
                              if (suggested === null) return;
                              const fecha = suggested.trim() || r.fecha || today;
                              duplicateMut.mutate({ id: r.id, fecha });
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
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
                        </div>
                        {open && (
                          <div className="border-t border-border bg-muted/20 p-2 space-y-2">
                            <SavedRoutePreview
                              polyline={r.polyline}
                              stops={r.ordered_stops as any}
                              startLat={r.start_lat}
                              startLng={r.start_lng}
                              height={220}
                            />
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{(r.ordered_stops?.length ?? 0)} paradas</span>
                              {r.total_km != null && <span>· {r.total_km} km</span>}
                              {r.total_minutes != null && <span>· {r.total_minutes} min</span>}
                              <span className="ml-auto">Guardada {time}</span>
                            </div>
                            <ol className="space-y-1">
                              {(r.ordered_stops ?? []).map((s: Stop, i: number) => (
                                <li key={`${s.cliente_id}-${i}`} className="flex items-start gap-2 text-xs">
                                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                                    {i + 1}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1 font-medium text-foreground">
                                      <MapPin className="h-3 w-3 text-muted-foreground" />
                                      <span className="truncate">
                                        {s.nombre || "Cliente sin nombre"}
                                      </span>
                                    </div>
                                    {s.direccion && (
                                      <div className="truncate pl-4 text-[11px] text-muted-foreground">
                                        {s.direccion}
                                      </div>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                                    onClick={() =>
                                      setCheckIn({
                                        id: s.cliente_id,
                                        nombre: s.nombre || "Cliente",
                                      })
                                    }
                                  >
                                    <ClipboardCheck className="h-3 w-3" />
                                    Check-in
                                  </Button>
                                </li>
                              ))}
                              {(r.ordered_stops ?? []).length === 0 && (
                                <li className="text-xs text-muted-foreground">Sin paradas registradas</li>
                              )}
                            </ol>
                          </div>
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

      {checkIn && (
        <CheckInDialog
          open={!!checkIn}
          onOpenChange={(o) => !o && setCheckIn(null)}
          clienteId={checkIn.id}
          clienteNombre={checkIn.nombre}
        />
      )}
    </>
  );
}
