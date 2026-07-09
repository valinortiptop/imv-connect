// @ts-nocheck
// Route map — uses Google Maps JS loaded through the Valinor proxy.
// Server-side geocoding + route optimization go through the Valinor proxy
// via existing server functions.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyClientsFn,
  optimizeRouteFn,
  geocodeClientFn,
  getOpportunityHeatmapFn,
} from "@/lib/rep.functions";
import { loadGoogleMapsViaValinor } from "@/lib/google-maps-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useRepContext } from "./RepLayout";
import { MapPin, Route as RouteIcon, Locate, Flame, ListChecks, Search } from "lucide-react";

function decodePolyline(str: string): [number, number][] {
  // Google encoded polyline algorithm.
  let index = 0, lat = 0, lng = 0;
  const coords: [number, number][] = [];
  while (index < str.length) {
    let b: number, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

export default function RouteMap() {
  const { geo } = useRepContext();
  const fetchClients = useServerFn(getMyClientsFn);
  const optimize = useServerFn(optimizeRouteFn);
  const geocode = useServerFn(geocodeClientFn);
  const fetchHeat = useServerFn(getOpportunityHeatmapFn);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const didFitRef = useRef<boolean>(false);
  const userInteractedRef = useRef<boolean>(false);

  const { data, refetch } = useQuery({ queryKey: ["rep-clients"], queryFn: () => fetchClients() });
  const heatQ = useQuery({ queryKey: ["rep-heatmap"], queryFn: () => fetchHeat() });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ km: number; min: number; path: [number, number][] } | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [clientQuery, setClientQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);


  const clientsWithCoords = useMemo(
    () => (data?.clients ?? []).filter((c: any) => c.lat && c.lng),
    [data],
  );

  const allPoints = useMemo<[number, number][]>(
    () => clientsWithCoords.map((c: any) => [Number(c.lat), Number(c.lng)]),
    [clientsWithCoords],
  );

  const center: [number, number] = geo
    ? [geo.lat, geo.lng]
    : allPoints[0] ?? [19.4326, -99.1332];

  const toggleSel = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsViaValinor()
      .then((maps) => {
        if (cancelled || !mapElRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapElRef.current, {
            center: { lat: center[0], lng: center[1] },
            zoom: 11,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false,
            gestureHandling: "greedy",
          });
          // Detect real user interactions so we don't override their zoom/pan.
          mapRef.current.addListener("dragstart", () => { userInteractedRef.current = true; });
          mapRef.current.addListener("zoom_changed", () => {
            // Ignore programmatic zoom changes flagged by didFitRef.
            if (didFitRef.current) userInteractedRef.current = true;
          });
        }
        setMapStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setMapStatus("error");
      });
    return () => { cancelled = true; };
  }, []);


  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!maps || !map) return;

    overlaysRef.current.forEach((overlay) => overlay?.setMap?.(null));
    overlaysRef.current = [];

    if (showHeatmap) {
      (heatQ.data?.points ?? []).forEach((p: any) => {
        const circle = new maps.Circle({
          map,
          center: { lat: Number(p.lat), lng: Number(p.lng) },
          radius: Math.min(2500, 350 + Number(p.weight ?? 1) * 260),
          strokeWeight: 0,
          fillColor: "#f97316",
          fillOpacity: 0.25,
          clickable: false,
        });
        overlaysRef.current.push(circle);
      });
    }

    clientsWithCoords.forEach((c: any) => {
      const isSel = selected.has(c.id);
      const risk = (c.churn_risk_score ?? 0) >= 0.6;
      const color = isSel ? "#2563eb" : risk ? "#dc2626" : "#059669";
      const marker = new maps.Marker({
        map,
        position: { lat: Number(c.lat), lng: Number(c.lng) },
        title: c.nombre_comercial ?? c.razon_social,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: isSel ? 10 : 7,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => toggleSel(c.id));
      overlaysRef.current.push(marker);
    });

    if (geo) {
      const marker = new maps.Marker({
        map,
        position: { lat: geo.lat, lng: geo.lng },
        title: "Tú",
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#111827",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      overlaysRef.current.push(marker);
    }

    if (routeInfo?.path && routeInfo.path.length > 1) {
      const line = new maps.Polyline({
        map,
        path: routeInfo.path.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: "#2563eb",
        strokeOpacity: 0.85,
        strokeWeight: 4,
      });
      overlaysRef.current.push(line);
    }

    // Fit bounds ONLY on the first render after the map is ready, and only when
    // the user hasn't already zoomed/panned. This prevents clicking a marker
    // (which changes `selected`) from resetting the view.
    if (!userInteractedRef.current && !didFitRef.current) {
      const fitPoints = geo ? [[geo.lat, geo.lng], ...allPoints] : allPoints;
      if (fitPoints.length === 0) {
        map.setCenter({ lat: center[0], lng: center[1] });
        map.setZoom(11);
      } else if (fitPoints.length === 1) {
        map.setCenter({ lat: fitPoints[0][0], lng: fitPoints[0][1] });
        map.setZoom(13);
      } else {
        const bounds = new maps.LatLngBounds();
        fitPoints.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
        map.fitBounds(bounds, 48);
      }
      if (allPoints.length > 0) didFitRef.current = true;
    }
  }, [allPoints, center, clientsWithCoords, geo, heatQ.data, routeInfo, selected, showHeatmap, mapStatus]);


  const doOptimize = useMutation({
    mutationFn: async () => {
      if (!geo) throw new Error("Activa tu ubicación primero");
      const stops = clientsWithCoords
        .filter((c: any) => selected.has(c.id))
        .map((c: any) => ({ cliente_id: c.id, lat: Number(c.lat), lng: Number(c.lng) }));
      if (stops.length === 0) throw new Error("Selecciona al menos un cliente");
      return optimize({ data: { startLat: geo.lat, startLng: geo.lng, stops } });
    },
    onSuccess: (r: any) => {
      const path = r.polyline ? decodePolyline(r.polyline) : [];
      setRouteInfo({ km: r.total_km, min: r.total_minutes, path });
      toast.success(`Ruta: ${r.total_km} km · ${r.total_minutes} min`);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const geocodeMut = useMutation({
    mutationFn: (clienteId: string) => geocode({ data: { clienteId } }),
    onSuccess: () => { toast.success("Ubicación calculada"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const withoutCoords = (data?.clients ?? []).filter((c: any) => !c.lat || !c.lng);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Ruta del día</h1>
          <p className="text-sm text-muted-foreground">
            Toca los marcadores para seleccionar y optimizar
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                <ListChecks className="mr-1 h-4 w-4" /> Seleccionar clientes
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="border-b p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder="Buscar cliente…"
                    className="h-8 pl-7 text-sm"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{selected.size} seleccionados</span>
                  <div className="flex gap-2">
                    <button
                      className="hover:underline"
                      onClick={() =>
                        setSelected(new Set(clientsWithCoords.map((c: any) => c.id)))
                      }
                    >
                      Todos
                    </button>
                    <button
                      className="hover:underline"
                      onClick={() => setSelected(new Set())}
                      disabled={selected.size === 0}
                    >
                      Ninguno
                    </button>
                  </div>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {clientsWithCoords
                  .filter((c: any) => {
                    const q = clientQuery.trim().toLowerCase();
                    if (!q) return true;
                    const name = (c.nombre_comercial ?? c.razon_social ?? "").toLowerCase();
                    return name.includes(q);
                  })
                  .slice(0, 200)
                  .map((c: any) => {
                    const isSel = selected.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => toggleSel(c.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {c.nombre_comercial ?? c.razon_social}
                        </span>
                        <button
                          className="text-[11px] text-primary hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            const map = mapRef.current;
                            if (!map) return;
                            userInteractedRef.current = true;
                            map.panTo({ lat: Number(c.lat), lng: Number(c.lng) });
                            if (map.getZoom() < 15) map.setZoom(15);
                          }}
                        >
                          Ver
                        </button>
                      </label>
                    );
                  })}
                {clientsWithCoords.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No hay clientes con coordenadas.
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant={showHeatmap ? "default" : "outline"} onClick={() => setShowHeatmap((v) => !v)}>
            <Flame className="mr-1 h-4 w-4" /> Heatmap
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
            Limpiar ({selected.size})
          </Button>
          <Button size="sm" disabled={doOptimize.isPending} onClick={() => doOptimize.mutate()}>
            <RouteIcon className="mr-1 h-4 w-4" /> Optimizar
          </Button>
        </div>

      </div>

      <div className="relative h-[420px] w-full overflow-hidden rounded-lg border border-border bg-muted">
        <div ref={mapElRef} className="h-full w-full" />
        {mapStatus !== "ready" && (
          <div className="absolute inset-0 grid place-items-center bg-muted/80 text-sm text-muted-foreground">
            {mapStatus === "loading" ? "Cargando Google Maps vía Valinor..." : "No se pudo cargar Google Maps"}
          </div>
        )}
      </div>
      {routeInfo && (
        <div className="text-sm text-muted-foreground">
          Total: {routeInfo.km} km · {routeInfo.min} min
        </div>
      )}

      {withoutCoords.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-amber-500" />
              Sin coordenadas ({withoutCoords.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {withoutCoords.slice(0, 10).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{c.nombre_comercial ?? c.razon_social}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!c.direccion || geocodeMut.isPending}
                  onClick={() => geocodeMut.mutate(c.id)}
                >
                  <Locate className="mr-1 h-3.5 w-3.5" /> Ubicar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {selected.size > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Seleccionados</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {[...selected].map((id) => {
              const c = clientsWithCoords.find((x: any) => x.id === id) as any;
              if (!c) return null;
              return (
                <Badge key={id} variant="secondary">
                  {c.nombre_comercial ?? c.razon_social}
                </Badge>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
