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

  // ── Auto-geocoding of clients without coordinates ──────────────────
  const bulkGeocode = useServerFn(geocodeClientsBulkFn);
  const queryClient = useQueryClient();
  const [geoRunning, setGeoRunning] = useState(false);
  const [geoDone, setGeoDone] = useState(0);
  const [geoRemaining, setGeoRemaining] = useState<number | null>(null);
  const startedRef = useRef(false);

  async function runGeocoding() {
    if (geoRunning) return;
    setGeoRunning(true);
    setGeoDone(0);
    try {
      // Chained batches — stops when nothing is left or a batch fails to
      // resolve any address (avoids looping forever on bad addresses).
      for (let i = 0; i < 60; i++) {
        const res: any = await bulkGeocode({ data: { limit: 20 } });
        setGeoDone((d) => d + (res?.updated ?? 0));
        setGeoRemaining(res?.remaining ?? 0);
        if (!res?.processed || !res?.updated) break;
        if ((res?.remaining ?? 0) <= 0) break;
      }
      await queryClient.invalidateQueries();
    } finally {
      setGeoRunning(false);
    }
  }

  // Kick off automatically the first time the map renders with clients
  // that have no coordinates.
  useEffect(() => {
    if (startedRef.current) return;
    const pendientes = clients.filter(
      (c) => typeof c.lat !== "number" || typeof c.lng !== "number",
    ).length;
    if (pendientes === 0) return;
    startedRef.current = true;
    void runGeocoding();
  }, [clients]);


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
        {geoRunning ? (
          <Badge variant="outline" className="gap-1 border-blue-500/40 text-blue-700 dark:text-blue-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            Geolocalizando… {geoDone} listos
            {geoRemaining != null ? ` · faltan ${geoRemaining}` : ""}
          </Badge>
        ) : (
          missing > 0 && (
            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-xs" onClick={() => void runGeocoding()}>
              <Locate className="h-3 w-3" /> Ubicar todos
            </Button>
          )
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
