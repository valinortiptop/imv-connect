// @ts-nocheck
import { useEffect, useRef } from "react";
import { loadGoogleMapsViaValinor } from "@/lib/google-maps-loader";

function decodePolyline(str: string): [number, number][] {
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

type Stop = {
  cliente_id: string;
  lat?: number | null;
  lng?: number | null;
  nombre?: string | null;
  visited?: boolean;
  /** visita abierta (check-in sin check-out) → pin amarillo */
  visit?: { in_progress?: boolean } | null;
};


export default function SavedRoutePreview({
  polyline,
  stops,
  startLat,
  startLng,
  height = 220,
}: {
  polyline?: string | null;
  stops: Stop[];
  startLat?: number | null;
  startLng?: number | null;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: any;
    let overlays: any[] = [];

    (async () => {
      try {
        const gm = await loadGoogleMapsViaValinor();
        if (cancelled || !ref.current) return;

        const path = polyline ? decodePolyline(polyline).map(([lat, lng]) => ({ lat, lng })) : [];
        const markerPts = (stops ?? [])
          .map((s) =>
            s.lat != null && s.lng != null
              ? {
                  lat: Number(s.lat),
                  lng: Number(s.lng),
                  name: s.nombre,
                  visited: !!s.visited,
                  ongoing: !!s.visit?.in_progress,
                }
              : null,
          )
          .filter(Boolean) as {
          lat: number;
          lng: number;
          name?: string | null;
          visited?: boolean;
          ongoing?: boolean;
        }[];


        const bounds = new gm.LatLngBounds();
        for (const p of path) bounds.extend(p);
        for (const m of markerPts) bounds.extend({ lat: m.lat, lng: m.lng });
        if (startLat != null && startLng != null) bounds.extend({ lat: Number(startLat), lng: Number(startLng) });

        map = new gm.Map(ref.current, {
          center: !bounds.isEmpty() ? bounds.getCenter() : { lat: 19.4326, lng: -99.1332 },
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
        });

        if (path.length > 1) {
          overlays.push(
            new gm.Polyline({
              path,
              strokeColor: "#2563eb",
              strokeOpacity: 0.9,
              strokeWeight: 4,
              map,
            }),
          );
        }

        if (startLat != null && startLng != null) {
          overlays.push(
            new gm.Marker({
              position: { lat: Number(startLat), lng: Number(startLng) },
              map,
              label: { text: "A", color: "#fff", fontSize: "11px", fontWeight: "700" },
              title: "Inicio",
            }),
          );
        }

        markerPts.forEach((m, i) => {
          overlays.push(
            new gm.Marker({
              position: { lat: m.lat, lng: m.lng },
              map,
              label: { text: String(i + 1), color: "#fff", fontSize: "11px", fontWeight: "700" },
              icon: {
                path: gm.SymbolPath.CIRCLE,
                scale: 11,
                fillColor: m.ongoing ? "#f59e0b" : m.visited ? "#16a34a" : "#dc2626",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              },
              title: `${m.name || `Parada ${i + 1}`}${
                m.ongoing ? " · visita en curso" : m.visited ? " · visitado" : " · no visitado"
              }`,

            }),
          );
        });

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 40);
        }
      } catch (e) {
        // fail silently in preview
      }
    })();

    return () => {
      cancelled = true;
      for (const o of overlays) {
        try { o.setMap(null); } catch {}
      }
    };
  }, [polyline, stops, startLat, startLng]);

  return (
    <div
      ref={ref}
      className="w-full overflow-hidden rounded-md border border-border bg-muted"
      style={{ height }}
    />
  );
}
