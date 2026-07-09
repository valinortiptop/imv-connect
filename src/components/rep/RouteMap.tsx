import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { MapPin, Route, Locate, Flame } from "lucide-react";

declare global {
  interface Window {
    __repInitMap?: () => void;
    google?: any;
  }
}

const MAPS_KEY = (import.meta as any).env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
const TRACKING = (import.meta as any).env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;

function loadMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) { resolve(); return; }
    if (!MAPS_KEY) { reject(new Error("Google Maps key no configurada")); return; }
    window.__repInitMap = () => resolve();
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=visualization,geometry&loading=async&callback=__repInitMap${TRACKING ? `&channel=${TRACKING}` : ""}`;
    s.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(s);
  });
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
  const [routeInfo, setRouteInfo] = useState<{ km: number; min: number } | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);
  const heatLayerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    loadMaps().then(() => setMapReady(true)).catch((e) => toast.error(e.message));
  }, []);

  const clientsWithCoords = useMemo(
    () => (data?.clients ?? []).filter((c: any) => c.lat && c.lng),
    [data],
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current || mapObj.current) return;
    const center = geo ?? { lat: 19.4326, lng: -99.1332 };
    mapObj.current = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 11,
      disableDefaultUI: false,
      streetViewControl: false,
      mapTypeControl: false,
    });
  }, [mapReady, geo]);

  useEffect(() => {
    if (!mapObj.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    clientsWithCoords.forEach((c: any) => {
      const isSel = selected.has(c.id);
      const risk = (c.churn_risk_score ?? 0) >= 0.6;
      const color = isSel ? "#2563eb" : risk ? "#dc2626" : "#059669";
      const m = new window.google.maps.Marker({
        position: { lat: Number(c.lat), lng: Number(c.lng) },
        map: mapObj.current,
        title: c.nombre_comercial ?? c.razon_social,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: "#fff",
          strokeWeight: 2,
          scale: isSel ? 10 : 7,
        },
      });
      m.addListener("click", () => {
        setSelected((prev) => {
          const n = new Set(prev);
          if (n.has(c.id)) n.delete(c.id);
          else n.add(c.id);
          return n;
        });
      });
      markersRef.current.push(m);
    });
    if (geo) {
      markersRef.current.push(
        new window.google.maps.Marker({
          position: geo,
          map: mapObj.current,
          title: "Tú",
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "#111827", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2, scale: 8,
          },
        }),
      );
    }
  }, [clientsWithCoords, selected, geo, mapReady]);

  const doOptimize = useMutation({
    mutationFn: async () => {
      if (!geo) throw new Error("Activa tu ubicación primero");
      const stops = clientsWithCoords
        .filter((c: any) => selected.has(c.id))
        .map((c: any) => ({
          cliente_id: c.id, lat: Number(c.lat), lng: Number(c.lng),
        }));
      if (stops.length === 0) throw new Error("Selecciona al menos un cliente");
      return optimize({
        data: { startLat: geo.lat, startLng: geo.lng, stops },
      });
    },
    onSuccess: (r: any) => {
      setRouteInfo({ km: r.total_km, min: r.total_minutes });
      if (polylineRef.current) polylineRef.current.setMap(null);
      if (r.polyline && window.google?.maps?.geometry) {
        const path = window.google.maps.geometry.encoding.decodePath(r.polyline);
        polylineRef.current = new window.google.maps.Polyline({
          path, map: mapObj.current, strokeColor: "#2563eb", strokeWeight: 4, strokeOpacity: 0.8,
        });
      }
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
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0}
          >
            Limpiar ({selected.size})
          </Button>
          <Button size="sm" disabled={doOptimize.isPending} onClick={() => doOptimize.mutate()}>
            <Route className="mr-1 h-4 w-4" /> Optimizar
          </Button>
        </div>
      </div>

      <div ref={mapRef} className="h-[420px] w-full overflow-hidden rounded-lg border border-border bg-muted" />
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
