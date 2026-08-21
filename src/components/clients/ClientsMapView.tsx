// @ts-nocheck
// Multi-client map view — plots clients on Google Maps loaded via Valinor.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, Locate } from "lucide-react";
import { loadGoogleMapsViaValinor } from "@/lib/google-maps-loader";
import { geocodeClientsBulkFn } from "@/lib/rep.functions";

type ClientPoint = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  client_type: string | null;
  lat: number;
  lng: number;
};

export function ClientsMapView({
  clients,
  onSelect,
}: {
  clients: Array<{
    id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    client_type?: string | null;
    lat: number | null;
    lng: number | null;
  }>;
  onSelect: (id: string) => void;
}) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");

  const points = useMemo<ClientPoint[]>(
    () =>
      clients
        .filter((c) => typeof c.lat === "number" && typeof c.lng === "number")
        .map((c) => ({
          id: c.id,
          name: c.name,
          address: c.address ?? null,
          phone: c.phone ?? null,
          client_type: c.client_type ?? null,
          lat: c.lat as number,
          lng: c.lng as number,
        })),
    [clients],
  );

  const missing = clients.length - points.length;
  // Default center: Mexico City — replaced once FitBounds runs.
  const center: [number, number] = points[0]
    ? [points[0].lat, points[0].lng]
    : [19.4326, -99.1332];

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

    markersRef.current.forEach((marker) => marker?.setMap?.(null));
    markersRef.current = [];

    points.forEach((p) => {
      const marker = new maps.Marker({
        map,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#059669",
          fillOpacity: 0.95,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => onSelect(p.id));
      markersRef.current.push(marker);
    });

    if (points.length === 0) {
      map.setCenter({ lat: center[0], lng: center[1] });
      map.setZoom(6);
    } else if (points.length === 1) {
      map.setCenter({ lat: points[0].lat, lng: points[0].lng });
      map.setZoom(14);
    } else {
      const bounds = new maps.LatLngBounds();
      points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 48);
    }
  }, [center, onSelect, points]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1">
          <MapPin className="h-3 w-3" /> {points.length} ubicados
        </Badge>
        {missing > 0 && (
          <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300">
            {missing} sin coordenadas
          </Badge>
        )}
        <span className="ml-auto">Click en un marcador para abrir la ficha 360</span>
      </div>

      <div className="relative h-[70vh] w-full overflow-hidden rounded-lg border border-border bg-muted">
        <div ref={mapElRef} className="h-full w-full" />
        {mapStatus !== "ready" && (
          <div className="absolute inset-0 grid place-items-center bg-muted/80 text-sm text-muted-foreground">
            {mapStatus === "loading" ? "Cargando Google Maps vía Valinor..." : "No se pudo cargar Google Maps"}
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientsMapView;
