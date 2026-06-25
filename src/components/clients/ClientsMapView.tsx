// @ts-nocheck
// Multi-client map view — plots every client with lat/lng on an OpenStreetMap
// canvas using Leaflet. Clicking a marker opens that client's 360 drawer.
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, ExternalLink } from "lucide-react";

// Fix default Leaflet marker assets (Vite breaks the relative URLs).
const markerIcon = L.divIcon({
  className: "imv-client-marker",
  html: `<div style="
    width: 22px; height: 22px; border-radius: 50%;
    background: linear-gradient(135deg, #001D77, #2DE2C5);
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

type ClientPoint = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  client_type: string | null;
  lat: number;
  lng: number;
};

function FitBounds({ points }: { points: ClientPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [points, map]);
  return null;
}

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

      <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-border">
        <MapContainer
          center={center}
          zoom={6}
          scrollWheelZoom
          style={{ width: "100%", height: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />
          {points.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={markerIcon}>
              <Popup>
                <div className="space-y-1.5 min-w-[180px]">
                  <div className="font-semibold text-sm">{p.name}</div>
                  {p.client_type && (
                    <Badge variant="secondary" className="capitalize text-[10px]">
                      {p.client_type}
                    </Badge>
                  )}
                  {p.address && (
                    <div className="text-xs text-muted-foreground">{p.address}</div>
                  )}
                  {p.phone && (
                    <div className="text-xs">📞 {p.phone}</div>
                  )}
                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" className="h-7 text-xs" onClick={() => onSelect(p.id)}>
                      Abrir ficha
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                    >
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-3 w-3" /> Maps
                      </a>
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

export default ClientsMapView;
