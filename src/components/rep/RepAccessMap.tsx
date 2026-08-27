// @ts-nocheck
// Supervisor map — shows every platform sign-in event pinned on Google Maps.
// Loaded through the Valinor proxy, matching RouteMap.tsx.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRepAccessEventsFn, type RepAccessEvent } from "@/lib/rep-access.functions";
import { listRepresentantesFn } from "@/lib/rep-calendar.functions";
import { loadGoogleMapsViaValinor } from "@/lib/google-maps-loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MapPin, Clock, Users, ClipboardCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type RangeKey = "today" | "7d" | "30d";

function rangeToDates(r: RangeKey) {
  const to = new Date();
  const from = new Date();
  if (r === "today") from.setHours(0, 0, 0, 0);
  else if (r === "7d") from.setDate(from.getDate() - 7);
  else from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

function colorForAge(iso: string): string {
  const ageH = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (ageH < 6) return "#16a34a"; // green
  if (ageH < 24) return "#0ea5e9"; // blue
  if (ageH < 24 * 7) return "#f59e0b"; // amber
  return "#94a3b8"; // slate
}

const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function RepAccessMap() {
  const fetchEvents = useServerFn(listRepAccessEventsFn);
  const fetchReps = useServerFn(listRepresentantesFn);

  const [range, setRange] = useState<RangeKey>("7d");
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);
  const [onlyWithLocation, setOnlyWithLocation] = useState(false);
  const [groupByDevice, setGroupByDevice] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);

  const { from, to } = useMemo(() => rangeToDates(range), [range]);

  const repsQuery = useQuery({
    queryKey: ["rep-access-reps"],
    queryFn: () => fetchReps(),
  });

  const eventsQuery = useQuery({
    queryKey: ["rep-access-events", from, to, selectedRepIds.join(","), onlyWithLocation, groupByDevice],
    queryFn: () =>
      fetchEvents({
        data: {
          from,
          to,
          repIds: selectedRepIds.length ? selectedRepIds : undefined,
          onlyWithLocation,
          groupByDevice,
        },
      }),
  });

  const events: RepAccessEvent[] = eventsQuery.data?.events ?? [];
  const withLoc = events.filter((e) => e.has_location && e.lat != null && e.lng != null);
  const withoutLoc = events.filter((e) => !e.has_location || e.lat == null || e.lng == null);

  // Init map
  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsViaValinor()
      .then((maps: any) => {
        if (cancelled || !mapElRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapElRef.current, {
            center: { lat: 19.4326, lng: -99.1332 },
            zoom: 5,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false,
            gestureHandling: "cooperative",
          });
          infoRef.current = new maps.InfoWindow();
        }
        setMapStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setMapStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const infoHtml = (e: RepAccessEvent) => `
    <div style="font-family:system-ui;font-size:12px;min-width:200px">
      <div style="font-weight:600;margin-bottom:2px">${e.representante_nombre ?? "Representante"}</div>
      <div>${fmtDT(e.signed_in_at)}</div>
      ${e.device_label ? `<div style="color:#64748b">${e.device_label}</div>` : ""}
      ${e.accuracy != null ? `<div style="color:#64748b">±${Math.round(e.accuracy)} m</div>` : ""}
      ${e.group_count > 1 ? `<div style="color:#64748b">${e.group_count} ventanas del mismo dispositivo</div>` : ""}
      ${
        e.visit
          ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0">
               <div style="font-weight:600;color:#0f766e">Visita registrada</div>
               <div>${e.visit.cliente}</div>
               <div style="color:#64748b">${fmtDT(e.visit.check_in_at)}${
                 e.visit.check_out_at ? ` – ${fmtDT(e.visit.check_out_at)}` : " · en curso"
               }${e.visit.minutos != null ? ` (${e.visit.minutos} min)` : ""}</div>
               ${e.visit.unplanned ? `<div style="color:#b45309">Fuera de ruta</div>` : ""}
               ${e.visit.outcome ? `<div style="color:#64748b">${e.visit.outcome}</div>` : ""}
               ${
                 e.visit.distancia_m != null
                   ? `<div style="color:#64748b">a ${e.visit.distancia_m} m del check-in</div>`
                   : ""
               }
             </div>`
          : `<div style="margin-top:6px;color:#94a3b8">Sin visita asociada</div>`
      }
    </div>`;

  const focusEvent = (e: RepAccessEvent) => {
    setSelectedId(e.id);
    const map = mapRef.current;
    if (!map || e.lat == null || e.lng == null) return;
    map.panTo({ lat: e.lat, lng: e.lng });
    map.setZoom(Math.max(map.getZoom() ?? 14, 15));
    const marker = markersRef.current.find((m: any) => m.__eventId === e.id);
    if (marker) {
      infoRef.current?.setContent(infoHtml(e));
      infoRef.current?.open({ anchor: marker, map });
    }
  };

  // Render markers
  useEffect(() => {
    const maps = (window as any).google?.maps;
    const map = mapRef.current;
    if (!maps || !map) return;

    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];

    if (!withLoc.length) return;

    const bounds = new maps.LatLngBounds();
    for (const e of withLoc) {
      const pos = { lat: e.lat!, lng: e.lng! };
      const color = e.visit ? "#0d9488" : colorForAge(e.signed_in_at);
      const marker = new maps.Marker({
        position: pos,
        map,
        zIndex: e.visit ? 3 : 1,
        title: `${e.representante_nombre ?? "Rep"} · ${fmtDT(e.signed_in_at)}${
          e.visit ? ` · visita: ${e.visit.cliente}` : ""
        }`,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: e.visit ? 10 : 8,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      (marker as any).__eventId = e.id;
      marker.addListener("click", () => {
        setSelectedId(e.id);
        infoRef.current?.setContent(infoHtml(e));
        infoRef.current?.open({ anchor: marker, map });
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
    }
    if (withLoc.length === 1) {
      map.setCenter(withLoc[0] as any);
      map.setZoom(13);
    } else {
      map.fitBounds(bounds, 60);
    }
  }, [withLoc, mapStatus]);

  const toggleRep = (id: string) =>
    setSelectedRepIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" /> Mapa de accesos de representantes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border">
            {(["today", "7d", "30d"] as RangeKey[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "px-3 py-1.5 text-xs",
                  range === r ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {r === "today" ? "Hoy" : r === "7d" ? "7 días" : "30 días"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs ml-2">
            <Switch checked={onlyWithLocation} onCheckedChange={setOnlyWithLocation} />
            Solo con ubicación
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={groupByDevice} onCheckedChange={setGroupByDevice} />
            Agrupar por dispositivo
          </label>
          <div className="ml-auto text-xs text-muted-foreground">
            {events.length} acceso{events.length === 1 ? "" : "s"} · {withLoc.length} con ubicación
          </div>
        </div>

        {/* Rep filter */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedRepIds([])}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              selectedRepIds.length === 0 ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            <Users className="inline h-3 w-3 mr-1" /> Todos
          </button>
          {(repsQuery.data?.representantes ?? []).map((r: any) => {
            const active = selectedRepIds.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => toggleRep(r.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {r.nombre}
              </button>
            );
          })}
        </div>

        {/* Map + list */}
        <div className="grid gap-3 md:grid-cols-[1fr,320px]">
          <div className="relative rounded-md overflow-hidden border" style={{ minHeight: 420 }}>
            <div ref={mapElRef} className="absolute inset-0" />
            {mapStatus !== "ready" && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/40 text-sm text-muted-foreground">
                {mapStatus === "loading"
                  ? "Cargando Google Maps vía Valinor..."
                  : "No se pudo cargar Google Maps"}
              </div>
            )}
          </div>

          <div className="rounded-md border overflow-hidden max-h-[420px] overflow-y-auto">
            <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" /> Historial reciente
            </div>
            {events.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">Sin accesos en el rango.</div>
            ) : (
              <ul className="divide-y">
                {events.slice(0, 100).map((e) => (
                  <li
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => focusEvent(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        focusEvent(e);
                      }
                    }}
                    className={cn(
                      "cursor-pointer px-3 py-2 text-xs transition-colors hover:bg-muted/60",
                      selectedId === e.id && "bg-primary/10",
                    )}
                    title={e.has_location ? "Ver en el mapa" : "Este acceso no tiene ubicación"}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium truncate">
                        {e.representante_nombre ?? "—"}
                      </span>
                      {e.has_location ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5"
                          style={{ borderColor: colorForAge(e.signed_in_at) }}
                        >
                          <MapPin className="h-2.5 w-2.5 mr-0.5" /> ubic
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5">
                          sin ubic
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{fmtDT(e.signed_in_at)}</span>
                      {e.device_label && (
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px]">{e.device_label}</span>
                      )}
                      {e.group_count > 1 && (
                        <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
                          {e.group_count} ventanas
                        </span>
                      )}
                    </div>
                    {e.visit && (
                      <div className="mt-1 rounded-md border border-teal-500/40 bg-teal-500/5 px-1.5 py-1">
                        <div className="flex items-center gap-1 font-medium text-teal-700 dark:text-teal-400">
                          <ClipboardCheck className="h-3 w-3" /> Visita
                          {e.visit.unplanned && (
                            <Zap className="h-3 w-3 text-amber-500" aria-label="fuera de ruta" />
                          )}
                        </div>
                        <div className="truncate">{e.visit.cliente}</div>
                        <div className="text-muted-foreground">
                          {new Date(e.visit.check_in_at).toLocaleTimeString("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {e.visit.check_out_at
                            ? `–${new Date(e.visit.check_out_at).toLocaleTimeString("es-MX", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : " · en curso"}
                          {e.visit.minutos != null ? ` (${e.visit.minutos}m)` : ""}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {withoutLoc.length > 0 && (
              <div className="px-3 py-2 border-t text-[11px] text-muted-foreground bg-muted/20">
                {withoutLoc.length} acceso{withoutLoc.length === 1 ? "" : "s"} sin ubicación
                (permiso denegado o no disponible).
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <LegendDot color="#16a34a" label="< 6h" />
          <LegendDot color="#0ea5e9" label="< 24h" />
          <LegendDot color="#f59e0b" label="< 7d" />
          <LegendDot color="#94a3b8" label="más antiguo" />
          <LegendDot color="#0d9488" label="con visita registrada" />
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full border border-white"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
