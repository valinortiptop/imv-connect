// @ts-nocheck
// Route map — uses Leaflet + OpenStreetMap (no browser key needed).
// Server-side geocoding + route optimization go through the Valinor proxy
// via existing server functions.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MapContainer, TileLayer, CircleMarker, Marker, Polyline, Tooltip, useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  getMyClientsFn,
  optimizeRouteFn,
  geocodeClientFn,
  getOpportunityHeatmapFn,
} from "@/lib/rep.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRepContext } from "./RepLayout";
import { MapPin, Route as RouteIcon, Locate, Flame } from "lucide-react";

const meIcon = L.divIcon({
  className: "rep-me-marker",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#111827;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
  iconSize: [16, 16], iconAnchor: [8, 8],
});

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

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 13); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
  }, [points, map]);
  return null;
}

export default function RouteMap() {
  const { geo } = useRepContext();
  const fetchClients = useServerFn(getMyClientsFn);
  const optimize = useServerFn(optimizeRouteFn);
  const geocode = useServerFn(geocodeClientFn);
  const fetchHeat = useServerFn(getOpportunityHeatmapFn);

  const { data, refetch } = useQuery({ queryKey: ["rep-clients"], queryFn: () => fetchClients() });
  const heatQ = useQuery({ queryKey: ["rep-heatmap"], queryFn: () => fetchHeat() });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ km: number; min: number; path: [number, number][] } | null>(null);

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

  const toggleSel = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

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

      <div className="h-[420px] w-full overflow-hidden rounded-lg border border-border">
        <MapContainer center={center} zoom={11} scrollWheelZoom style={{ width: "100%", height: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={geo ? [[geo.lat, geo.lng], ...allPoints] : allPoints} />
          {showHeatmap && (heatQ.data?.points ?? []).map((p: any, i: number) => (
            <CircleMarker
              key={`heat-${i}`}
              center={[p.lat, p.lng]}
              radius={Math.min(30, 8 + p.weight * 3)}
              pathOptions={{ color: "#f97316", fillColor: "#f97316", fillOpacity: 0.25, weight: 0 }}
              interactive={false}
            />
          ))}
          {clientsWithCoords.map((c: any) => {
            const isSel = selected.has(c.id);
            const risk = (c.churn_risk_score ?? 0) >= 0.6;
            const color = isSel ? "#2563eb" : risk ? "#dc2626" : "#059669";
            return (
              <CircleMarker
                key={c.id}
                center={[Number(c.lat), Number(c.lng)]}
                radius={isSel ? 10 : 7}
                pathOptions={{ color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.9 }}
                eventHandlers={{ click: () => toggleSel(c.id) }}
              >
                <Tooltip>{c.nombre_comercial ?? c.razon_social}</Tooltip>
              </CircleMarker>
            );
          })}
          {geo && <Marker position={[geo.lat, geo.lng]} icon={meIcon}><Tooltip>Tú</Tooltip></Marker>}
          {routeInfo?.path && routeInfo.path.length > 1 && (
            <Polyline positions={routeInfo.path} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.8 }} />
          )}
        </MapContainer>
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
