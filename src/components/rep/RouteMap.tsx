// @ts-nocheck
// Route map — uses Google Maps JS loaded through the Valinor proxy.
// Server-side geocoding + route optimization go through the Valinor proxy
// via existing server functions.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  getMyClientsFn,
  optimizeRouteFn,
  geocodeClientFn,
  getOpportunityHeatmapFn,
  suggestRouteWithAIFn,
  saveRouteFn,
  listAssignableRepsFn,
} from "@/lib/rep.functions";

import { loadGoogleMapsViaValinor } from "@/lib/google-maps-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useRepContext } from "./RepLayout";
import {
  MapPin,
  Route as RouteIcon,
  Locate,
  Flame,
  ListChecks,
  Search,
  Sparkles,
  Printer,
  Download,
  X,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Trash2,
  RefreshCw,
  Plus,
} from "lucide-react";
import CheckInDialog from "./CheckInDialog";
import NewRouteWizardDialog from "./NewRouteWizardDialog";
import { downloadRoutePdf, printRoute as printRouteHtml } from "@/lib/route-export";
import {
  OFFICE_LOCATION,
  OFFICE_STOP_ID,
  OFFICE_PURPOSES,
} from "@/lib/office";


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

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const re = new RegExp(`(${escapeRegExp(q)})`, "ig");
  const parts = String(text ?? "").split(re);
  return (
    <>
      {parts.map((p, i) =>
        re.test(p) && p.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/40"
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const CDMX_ALCALDIAS = [
  "ALVARO OBREGON",
  "AZCAPOTZALCO",
  "BENITO JUAREZ",
  "COYOACAN",
  "CUAJIMALPA",
  "CUAUHTEMOC",
  "GUSTAVO A. MADERO",
  "GUSTAVO A MADERO",
  "IZTACALCO",
  "IZTAPALAPA",
  "LA MAGDALENA CONTRERAS",
  "MAGDALENA CONTRERAS",
  "MIGUEL HIDALGO",
  "MILPA ALTA",
  "TLALPAN",
  "TLAHUAC",
  "VENUSTIANO CARRANZA",
  "XOCHIMILCO",
];

function normalizeAddr(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractAlcaldia(direccion: string | null | undefined): string | null {
  if (!direccion) return null;
  const norm = normalizeAddr(direccion);
  // Prefer the municipality/alcaldía token that sits right before the 5-digit CP
  // (standard Mexican address format: ... , COLONIA, ALCALDIA CP, STATE).
  const m = norm.match(/,\s*([^,]+?)\s+\d{5}\b/);
  if (m) {
    const raw = normalizeAddr(m[1]);
    if (raw.length > 2 && raw.length < 60) {
      // Normalize to a known CDMX alcaldía name when possible.
      for (const a of CDMX_ALCALDIAS) {
        const na = normalizeAddr(a);
        if (raw === na || raw.includes(na)) return a;
      }
      // Otherwise return the raw municipality (for non-CDMX addresses).
      return raw;
    }
  }
  // Fallback: look for known alcaldía names anywhere in the address.
  for (const a of CDMX_ALCALDIAS) {
    if (norm.includes(normalizeAddr(a))) return a;
  }
  return null;
}

export default function RouteMap() {
  const { geo } = useRepContext();
  const fetchClients = useServerFn(getMyClientsFn);
  const optimize = useServerFn(optimizeRouteFn);
  const geocode = useServerFn(geocodeClientFn);
  const fetchHeat = useServerFn(getOpportunityHeatmapFn);
  const suggestAI = useServerFn(suggestRouteWithAIFn);
  const saveRoute = useServerFn(saveRouteFn);
  const listReps = useServerFn(listAssignableRepsFn);
  const repsQ = useQuery({ queryKey: ["rep-assignable-reps"], queryFn: () => listReps() });
  const qc = useQueryClient();

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const didFitRef = useRef<boolean>(false);
  const userInteractedRef = useRef<boolean>(false);

  const { data, refetch } = useQuery({ queryKey: ["rep-clients"], queryFn: () => fetchClients() });
  const heatQ = useQuery({ queryKey: ["rep-heatmap"], queryFn: () => fetchHeat() });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{
    km: number;
    min: number;
    path: [number, number][];
    ordered: { cliente_id: string; lat: number; lng: number }[];
    legs: { distance_km: number; duration_min: number; distance_text: string; duration_text: string }[];
  } | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [clientQuery, setClientQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const [checkInClient, setCheckInClient] = useState<{ id: string; nombre: string } | null>(null);
  const [showWithoutCoords, setShowWithoutCoords] = useState(false);
  const [routeFecha, setRouteFecha] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [alcaldiaFilter, setAlcaldiaFilter] = useState<string>("all");
  // Admins can create a route on behalf of a representative.
  const [assignedRepId, setAssignedRepId] = useState<string | null>(null);
  /** Motivo de la parada en oficina (null = la oficina no está en la ruta). */
  const [officeMotivo, setOfficeMotivo] = useState<string | null>(null);

  /** Nombre + dirección de una parada (cliente u oficina). */
  const stopLabel = (s: any, i: number) => {
    if (String(s?.cliente_id) === OFFICE_STOP_ID) {
      return {
        isOffice: true,
        name: s?.motivo ? `Oficina IMV · ${s.motivo}` : OFFICE_LOCATION.nombre,
        direccion: OFFICE_LOCATION.direccion,
      };
    }
    const c = clientsById.get(s?.cliente_id);
    return {
      isOffice: false,
      name: c ? (c.nombre_comercial ?? c.razon_social) : s?.nombre ?? `Parada ${i + 1}`,
      direccion: c?.direccion ?? s?.direccion ?? "",
    };
  };

  const officeStop = (motivo: string) => ({
    cliente_id: OFFICE_STOP_ID,
    kind: "office",
    nombre: OFFICE_LOCATION.nombre,
    direccion: OFFICE_LOCATION.direccion,
    motivo,
    lat: OFFICE_LOCATION.lat,
    lng: OFFICE_LOCATION.lng,
  });




  const clientsWithCoords = useMemo(
    () => (data?.clients ?? []).filter((c: any) => c.lat && c.lng),
    [data],
  );
  const clientsById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of data?.clients ?? []) m.set(c.id, c);
    return m;
  }, [data]);

  const allPoints = useMemo<[number, number][]>(
    () => clientsWithCoords.map((c: any) => [Number(c.lat), Number(c.lng)]),
    [clientsWithCoords],
  );

  const center: [number, number] = geo
    ? [geo.lat, geo.lng]
    : allPoints[0] ?? [19.4326, -99.1332];

  const toggleSel = (id: string) => {
    setAssignedRepId(null);
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const togglePickerSel = (id: string) =>
    setPickerSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => {
    if (pickerOpen) setPickerSelected(new Set(selected));
  }, [pickerOpen, selected]);

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
            gestureHandling: "cooperative",
          });
          mapRef.current.addListener("dragstart", () => { userInteractedRef.current = true; });
          mapRef.current.addListener("zoom_changed", () => {
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

  // Hydrate from a saved route (opened via "Ver / Editar" in SavedRoutesList)
  useEffect(() => {
    const hydrate = (r: any) => {
      if (!r) return;
      const stops = (r.ordered_stops ?? [])
        .filter((s: any) => s?.lat != null && s?.lng != null)
        .map((s: any) => ({
          cliente_id: String(s.cliente_id),
          lat: Number(s.lat),
          lng: Number(s.lng),
          ...(String(s.cliente_id) === OFFICE_STOP_ID
            ? { kind: "office", motivo: s.motivo ?? null }
            : {}),
        }));
      if (stops.length === 0) {
        toast.error("Esta ruta no tiene coordenadas");
        return;
      }
      const path = r.polyline ? decodePolyline(r.polyline) : [];
      setAssignedRepId(null);
      const officeIn = stops.find((s: any) => s.cliente_id === OFFICE_STOP_ID);
      setOfficeMotivo(officeIn ? (officeIn.motivo ?? OFFICE_PURPOSES[0]) : null);
      setSelected(
        new Set(
          stops
            .filter((s: any) => s.cliente_id !== OFFICE_STOP_ID)
            .map((s: any) => s.cliente_id),
        ),
      );
      setRouteInfo({
        km: Number(r.total_km ?? 0),
        min: Number(r.total_minutes ?? 0),
        path,
        ordered: stops,
        legs: r.legs ?? [],
      });
      if (r.fecha) setRouteFecha(String(r.fecha).slice(0, 10));
      // Fit map
      const maps = (window as any).google?.maps;
      const map = mapRef.current;
      if (maps && map) {
        const bounds = new maps.LatLngBounds();
        stops.forEach((s: any) => bounds.extend({ lat: s.lat, lng: s.lng }));
        if (path.length > 0) path.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
        userInteractedRef.current = true;
        map.fitBounds(bounds, 60);
      }
    };

    // Check sessionStorage on mount
    try {
      const raw = sessionStorage.getItem("rep:load-route");
      if (raw) {
        sessionStorage.removeItem("rep:load-route");
        // Defer until map is ready
        const tryHydrate = () => {
          if (mapRef.current) hydrate(JSON.parse(raw));
          else setTimeout(tryHydrate, 150);
        };
        tryHydrate();
      }
    } catch {}

    const onEvent = (e: any) => hydrate(e?.detail);
    window.addEventListener("rep:load-route", onEvent as any);
    return () => window.removeEventListener("rep:load-route", onEvent as any);
  }, []);



  const routeMode = !!routeInfo;

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!maps || !map) return;

    overlaysRef.current.forEach((overlay) => overlay?.setMap?.(null));
    overlaysRef.current = [];

    // Heatmap only when NOT in route-focused mode
    if (showHeatmap && !routeMode) {
      const rawPoints = (heatQ.data?.points ?? []) as Array<{
        lat: number;
        lng: number;
        weight: number;
      }>;
      const points = rawPoints.filter((p) => Number(p.weight ?? 0) > 0.05);

      if (maps.visualization?.HeatmapLayer && points.length > 0) {
        const layer = new maps.visualization.HeatmapLayer({
          map,
          data: points.map((p) => ({
            location: new maps.LatLng(Number(p.lat), Number(p.lng)),
            weight: Number(p.weight),
          })),
          radius: 42,
          opacity: 0.75,
          dissipating: true,
          maxIntensity: 1,
          gradient: [
            "rgba(0, 0, 0, 0)",
            "rgba(16, 185, 129, 0.55)",
            "rgba(132, 204, 22, 0.7)",
            "rgba(250, 204, 21, 0.8)",
            "rgba(249, 115, 22, 0.9)",
            "rgba(220, 38, 38, 1)",
          ],
        });
        overlaysRef.current.push(layer);
      } else {
        // Fallback if visualization library did not load: draw brighter circles.
        points.forEach((p) => {
          const w = Number(p.weight ?? 0);
          const circle = new maps.Circle({
            map,
            center: { lat: Number(p.lat), lng: Number(p.lng) },
            radius: Math.min(2800, 500 + w * 2200),
            strokeWeight: 0,
            fillColor: w > 0.65 ? "#dc2626" : w > 0.4 ? "#f97316" : "#facc15",
            fillOpacity: 0.55,
            clickable: false,
          });
          overlaysRef.current.push(circle);
        });
      }
    }

    // In route mode, only render ordered stops with numbered markers.
    if (routeMode && routeInfo) {
      routeInfo.ordered.forEach((s, idx) => {
        const isOffice = String(s.cliente_id) === OFFICE_STOP_ID;
        const c = clientsById.get(s.cliente_id);
        const marker = new maps.Marker({
          map,
          position: { lat: Number(s.lat), lng: Number(s.lng) },
          title: isOffice
            ? (s as any).motivo
              ? `Oficina IMV · ${(s as any).motivo}`
              : OFFICE_LOCATION.nombre
            : c
              ? (c.nombre_comercial ?? c.razon_social)
              : `Parada ${idx + 1}`,
          label: {
            text: String(idx + 1),
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: "700",
          },
          icon: {
            path: isOffice ? maps.SymbolPath.BACKWARD_CLOSED_ARROW : maps.SymbolPath.CIRCLE,
            scale: isOffice ? 11 : 13,
            fillColor: isOffice ? "#9333ea" : "#2563eb",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        overlaysRef.current.push(marker);
      });
    } else {
      clientsWithCoords.forEach((c: any) => {
        const isSel = selected.has(c.id);
        const risk = (c.churn_risk_score ?? 0) >= 0.6;
        const color = isSel ? "#2563eb" : risk ? "#dc2626" : "#059669";
        const dimmed = showHeatmap && !isSel;
        const marker = new maps.Marker({
          map,
          position: { lat: Number(c.lat), lng: Number(c.lng) },
          title: c.nombre_comercial ?? c.razon_social,
          opacity: dimmed ? 0.55 : 1,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: isSel ? 10 : 7,
            fillColor: color,
            fillOpacity: dimmed ? 0.7 : 0.9,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => toggleSel(c.id));
        overlaysRef.current.push(marker);
      });
    }

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
        strokeOpacity: 0.9,
        strokeWeight: 5,
      });
      overlaysRef.current.push(line);
    }

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
  }, [allPoints, center, clientsWithCoords, clientsById, geo, heatQ.data, routeInfo, routeMode, selected, showHeatmap, mapStatus]);


  const doOptimize = useMutation({
    mutationFn: async (vars?: { ids?: string[]; fecha?: string }) => {
      if (!geo) throw new Error("Activa tu ubicación primero");
      const idSet = vars?.ids ? new Set(vars.ids) : selected;
      const stops = clientsWithCoords
        .filter((c: any) => idSet.has(c.id))
        .map((c: any) => ({ cliente_id: c.id, lat: Number(c.lat), lng: Number(c.lng) }));
      const motivo = vars?.officeMotivo !== undefined ? vars.officeMotivo : officeMotivo;
      if (motivo) stops.push(officeStop(motivo));
      if (stops.length === 0) throw new Error("Selecciona al menos un cliente");
      return optimize({ data: { startLat: geo.lat, startLng: geo.lng, stops } });
    },
    onSuccess: (r: any, vars?: { ids?: string[]; fecha?: string }) => {
      const path = r.polyline ? decodePolyline(r.polyline) : [];
      setRouteInfo({
        km: r.total_km,
        min: r.total_minutes,
        path,
        ordered: r.orderedStops ?? [],
        legs: r.legs ?? [],
      });
      toast.success(`Ruta: ${r.total_km} km · ${r.total_minutes} min`);
      // Persist so it appears on Ruta history and Plan semanal
      saveRoute({
        data: {
          fecha: vars?.fecha ?? routeFecha,
          totalKm: r.total_km,
          totalMinutes: r.total_minutes,
          polyline: r.polyline ?? null,
          orderedStops: r.orderedStops ?? [],
          legs: r.legs ?? [],
          startLat: geo?.lat ?? null,
          startLng: geo?.lng ?? null,
          origen: "manual",
          assignedRepId,
        },
      })
        .then(() => qc.invalidateQueries({ queryKey: ["rep-saved-routes"] }))
        .catch(() => {});


      // Fit map to route
      const maps = (window as any).google?.maps;
      const map = mapRef.current;
      if (maps && map && path.length > 0) {
        const bounds = new maps.LatLngBounds();
        path.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
        if (geo) bounds.extend({ lat: geo.lat, lng: geo.lng });
        userInteractedRef.current = true;
        map.fitBounds(bounds, 60);
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  // Drag-and-drop reorder + remove for the optimized route
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const applyNewOrder = (
    newOrdered: { cliente_id: string; lat: number; lng: number }[],
  ) => {
    setRouteInfo((prev) =>
      prev ? { ...prev, ordered: newOrdered, legs: [], path: [], km: 0, min: 0 } : prev,
    );
  };

  const reorderStop = (from: number, to: number) => {
    if (!routeInfo) return;
    if (from === to || from < 0 || to < 0) return;
    const arr = [...routeInfo.ordered];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    applyNewOrder(arr);
  };

  const removeStop = (idx: number) => {
    if (!routeInfo) return;
    const arr = [...routeInfo.ordered];
    const [removed] = arr.splice(idx, 1);
    if (removed) {
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(removed.cliente_id);
        return n;
      });
    }
    if (arr.length === 0) {
      setRouteInfo(null);
      toast.info("Ruta vacía");
      return;
    }
    applyNewOrder(arr);
  };

  const recalcRoute = useMutation({
    mutationFn: async () => {
      if (!geo) throw new Error("Activa tu ubicación primero");
      if (!routeInfo || routeInfo.ordered.length === 0)
        throw new Error("Sin paradas");
      return optimize({
        data: {
          startLat: geo.lat,
          startLng: geo.lng,
          stops: routeInfo.ordered.map((s: any) => ({
            cliente_id: s.cliente_id,
            lat: Number(s.lat),
            lng: Number(s.lng),
            ...(String(s.cliente_id) === OFFICE_STOP_ID
              ? { kind: "office", motivo: s.motivo ?? null }
              : {}),
          })),
          optimize: false,
        },
      });
    },
    onSuccess: (r: any) => {
      const path = r.polyline ? decodePolyline(r.polyline) : [];
      setRouteInfo({
        km: r.total_km,
        min: r.total_minutes,
        path,
        ordered: r.orderedStops ?? [],
        legs: r.legs ?? [],
      });
      toast.success(`Ruta actualizada: ${r.total_km} km · ${r.total_minutes} min`);
      saveRoute({
        data: {
          fecha: routeFecha,
          totalKm: r.total_km,
          totalMinutes: r.total_minutes,
          polyline: r.polyline ?? null,
          orderedStops: r.orderedStops ?? [],
          legs: r.legs ?? [],
          startLat: geo?.lat ?? null,
          startLng: geo?.lng ?? null,
          origen: "manual",
          assignedRepId,
        },
      })
        .then(() => qc.invalidateQueries({ queryKey: ["rep-saved-routes"] }))
        .catch(() => {});
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const routeDirty = routeInfo ? routeInfo.legs.length === 0 : false;

  const aiSuggest = useMutation({
    mutationFn: async () => {
      const payload: any = { maxStops: 8 };
      if (geo) { payload.startLat = geo.lat; payload.startLng = geo.lng; }
      return suggestAI({ data: payload });
    },
    onSuccess: (r: any) => {
      const ids: string[] = r?.ordered ?? [];
      if (ids.length === 0) {
        toast.info(r?.rationale ?? "Sin sugerencias disponibles");
        return;
      }
      setSelected(new Set(ids));
      setAiRationale(r?.rationale ?? null);
      setRouteInfo(null);
      const maps = (window as any).google?.maps;
      const map = mapRef.current;
      if (maps && map) {
        const bounds = new maps.LatLngBounds();
        (r.detail ?? []).forEach((d: any) => bounds.extend({ lat: Number(d.lat), lng: Number(d.lng) }));
        if (geo) bounds.extend({ lat: geo.lat, lng: geo.lng });
        userInteractedRef.current = true;
        map.fitBounds(bounds, 60);
      }
      toast.success(`IA sugirió ${ids.length} clientes para hoy`);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo generar la ruta"),
  });

  const geocodeMut = useMutation({
    mutationFn: (clienteId: string) => geocode({ data: { clienteId } }),
    onSuccess: () => { toast.success("Ubicación calculada"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const withoutCoords = (data?.clients ?? []).filter((c: any) => !c.lat || !c.lng);

  // Global search across name + address, used inside the picker popover.
  const alcaldias = useMemo(() => {
    const set = new Set<string>();
    for (const c of clientsWithCoords) {
      const a = extractAlcaldia(c.direccion);
      if (a) set.add(a);
    }
    return Array.from(set).sort();
  }, [clientsWithCoords]);

  const filteredClients = useMemo(() => {
    let list = clientsWithCoords;
    if (alcaldiaFilter && alcaldiaFilter !== "all") {
      list = list.filter((c: any) => extractAlcaldia(c.direccion) === alcaldiaFilter);
    }
    const q = clientQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c: any) => {
      const haystack = [
        c.nombre_comercial,
        c.razon_social,
        c.nickname,
        c.direccion,
        c.codigo_postal,
        c.rfc,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [clientsWithCoords, clientQuery, alcaldiaFilter]);


  const buildExportRoute = () => {
    if (!routeInfo) return null;
    return {
      title: "Ruta del día",
      fecha: new Date().toISOString().slice(0, 10),
      totalKm: routeInfo.km,
      totalMin: routeInfo.min,
      stops: routeInfo.ordered.map((s: any, i: number) => {
        const l = stopLabel(s, i);
        return {
          cliente_id: s.cliente_id,
          nombre: l.name,
          direccion: l.direccion ?? "",
        };
      }),
      legs: routeInfo.legs,
    };
  };

  const downloadRoute = () => {
    const r = buildExportRoute();
    if (r) downloadRoutePdf(r);
  };

  const printRoute = () => {
    const r = buildExportRoute();
    if (r) printRouteHtml(r);
  };

  const clearRoute = () => {
    setRouteInfo(null);
    userInteractedRef.current = false;
    didFitRef.current = false;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold md:text-2xl">Ruta del día</h1>
          <p className="text-sm text-muted-foreground">
            Toca los marcadores para seleccionar y optimizar
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          <Button
            size="sm"
            onClick={() => setWizardOpen(true)}
            className="flex-1 md:flex-none"
          >
            <Plus className="mr-1 h-4 w-4" /> Nueva ruta
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="flex-1 md:flex-none">
                <ListChecks className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">Seleccionar clientes</span>
                <span className="sm:hidden">Clientes</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] max-w-sm p-0 sm:w-96" align="end">
              <div className="border-b p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder="Buscar por nombre o dirección…"
                    className="h-8 pl-7 text-sm"
                  />
                </div>
                <div className="mt-2">
                  <Select value={alcaldiaFilter} onValueChange={setAlcaldiaFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Filtrar por alcaldía / municipio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las alcaldías</SelectItem>
                      {alcaldias.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {pickerSelected.size} seleccionados · {filteredClients.length} resultados
                  </span>
                  <div className="flex gap-2">
                    <button
                      className="hover:underline"
                      onClick={() =>
                        setPickerSelected(
                          (prev) => {
                            const n = new Set(prev);
                            filteredClients.forEach((c: any) => n.add(c.id));
                            return n;
                          },
                        )
                      }
                    >
                      Todos
                    </button>
                    <button
                      className="hover:underline"
                      onClick={() => setPickerSelected(new Set())}
                      disabled={pickerSelected.size === 0}
                    >
                      Ninguno
                    </button>
                  </div>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto py-1">
                {filteredClients.slice(0, 200).map((c: any) => {
                  const isSel = pickerSelected.has(c.id);
                  const name = c.nombre_comercial ?? c.razon_social ?? "";
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => togglePickerSel(c.id)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          <Highlight text={name} query={clientQuery} />
                        </span>
                        {c.direccion && (
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            <Highlight text={c.direccion} query={clientQuery} />
                          </span>
                        )}
                      </span>
                      <button
                        className="shrink-0 text-[11px] text-primary hover:underline"
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
                {filteredClients.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    {clientQuery
                      ? "Sin coincidencias."
                      : "No hay clientes con coordenadas."}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t p-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPickerSelected(new Set(selected));
                    setPickerOpen(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setAssignedRepId(null);
                    setSelected(new Set(pickerSelected));
                    setPickerOpen(false);
                  }}
                >
                  Aceptar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            size="sm"
            variant={showHeatmap ? "default" : "outline"}
            onClick={() => {
              const next = !showHeatmap;
              if (next) {
                const pts = (heatQ.data?.points ?? []) as Array<{ weight: number }>;
                const hasSignal = pts.some((p) => Number(p.weight ?? 0) > 0.05);
                if (!hasSignal) {
                  toast.info("No hay suficientes datos de oportunidad todavía.");
                }
              }
              setShowHeatmap(next);
            }}
            disabled={routeMode}
          >
            <Flame className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Heatmap</span>
          </Button>
          {showHeatmap && !routeMode && (
            <div className="hidden items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[10px] text-muted-foreground sm:flex">
              <span>Baja</span>
              <span
                className="h-2 w-16 rounded-full"
                style={{
                  background:
                    "linear-gradient(to right, #10b981, #84cc16, #facc15, #f97316, #dc2626)",
                }}
              />
              <span>Alta oportunidad</span>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => { setAssignedRepId(null); setSelected(new Set()); }} disabled={selected.size === 0} className="hidden sm:inline-flex">
            Limpiar ({selected.size})
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={officeMotivo ? "default" : "outline"}
              onClick={() => setOfficeMotivo(officeMotivo ? null : OFFICE_PURPOSES[0])}
              title="Incluir una parada en la Oficina IMV (Necaxa 125)"
            >
              <MapPin className="mr-1 h-4 w-4" />
              Oficina
            </Button>
            {officeMotivo && (
              <Select value={officeMotivo} onValueChange={setOfficeMotivo}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Motivo" />
                </SelectTrigger>
                <SelectContent>
                  {OFFICE_PURPOSES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <label className="hidden text-[11px] text-muted-foreground sm:inline">Fecha:</label>
            <Input
              type="date"
              value={routeFecha}
              onChange={(e) => setRouteFecha(e.target.value)}
              className="h-8 w-36 text-xs"
              title="Fecha del plan / ruta"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={aiSuggest.isPending}
            onClick={() => aiSuggest.mutate()}
            className="flex-1 border-primary/40 text-primary hover:bg-primary/10 md:flex-none"
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {aiSuggest.isPending ? "IA…" : "Ruta con IA"}
          </Button>
          <Button size="sm" disabled={doOptimize.isPending} onClick={() => doOptimize.mutate()} className="flex-1 md:flex-none">
            <RouteIcon className="mr-1 h-4 w-4" /> Optimizar
          </Button>
        </div>

      </div>

      {/* Map: full-bleed on mobile, contained on desktop */}
      <div className="relative -mx-4 h-[60vh] overflow-hidden border-y border-border bg-muted md:mx-0 md:h-[420px] md:rounded-lg md:border">
        <div ref={mapElRef} className="h-full w-full" />
        {mapStatus !== "ready" && (
          <div className="absolute inset-0 grid place-items-center bg-muted/80 text-sm text-muted-foreground">
            {mapStatus === "loading" ? "Cargando Google Maps vía Valinor..." : "No se pudo cargar Google Maps"}
          </div>
        )}
      </div>

      {routeInfo && (
        <Card className="border-primary/30">
          <CardHeader className="flex flex-col items-stretch gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">Ruta optimizada</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {routeInfo.ordered.length} paradas · {routeInfo.km} km · {routeInfo.min} min
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Programada para {new Date(routeFecha + "T00:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" })}
              </p>
            </div>
            <div className="flex flex-wrap gap-1 sm:shrink-0 sm:justify-end">

              {routeDirty && (
                <Button
                  size="sm"
                  onClick={() => recalcRoute.mutate()}
                  disabled={recalcRoute.isPending}
                >
                  <RefreshCw className={`mr-1 h-3.5 w-3.5 ${recalcRoute.isPending ? "animate-spin" : ""}`} />
                  Recalcular
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={printRoute} disabled={routeDirty}>
                <Printer className="mr-1 h-3.5 w-3.5" /> Imprimir
              </Button>
              <Button size="sm" variant="outline" onClick={downloadRoute} disabled={routeDirty}>
                <Download className="mr-1 h-3.5 w-3.5" /> Descargar
              </Button>
              <Button size="sm" variant="ghost" onClick={clearRoute} title="Cerrar ruta">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {routeDirty && (
              <div className="mb-2 rounded-md border border-amber-400/40 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                Reordenaste la ruta. Pulsa <b>Recalcular</b> para actualizar distancias y trazo en el mapa.
              </div>
            )}
            <ol className="space-y-2">
              <li className="flex items-start gap-3 rounded-md bg-muted/50 p-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">
                  •
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Inicio</div>
                  <div className="text-xs text-muted-foreground">Tu ubicación actual</div>
                </div>
              </li>
              {routeInfo.ordered.map((s: any, i: number) => {
                const label = stopLabel(s, i);
                const isOffice = label.isOffice;
                const c = isOffice ? { direccion: label.direccion } : clientsById.get(s.cliente_id);
                const name = label.name;
                const leg = routeInfo.legs[i];
                const isDragging = dragIdx === i;
                const isOver = dragOverIdx === i && dragIdx !== null && dragIdx !== i;
                return (
                  <li
                    key={`${s.cliente_id}-${i}`}
                    draggable
                    onDragStart={(e) => {
                      setDragIdx(i);
                      e.dataTransfer.effectAllowed = "move";
                      try { e.dataTransfer.setData("text/plain", String(i)); } catch {}
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverIdx !== i) setDragOverIdx(i);
                    }}
                    onDragLeave={() => {
                      if (dragOverIdx === i) setDragOverIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragIdx ?? Number(e.dataTransfer.getData("text/plain"));
                      if (!Number.isNaN(from)) reorderStop(from, i);
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    className={`flex min-w-0 items-stretch gap-1 overflow-hidden rounded-md border transition ${
                      isDragging ? "opacity-40" : ""
                    } ${isOver ? "border-primary ring-2 ring-primary/30" : ""}`}
                  >
                    <div
                      className="hidden sm:flex cursor-grab items-center px-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                      title="Arrastra para reordenar"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isOffice) return;
                        setCheckInClient({ id: s.cliente_id, nombre: name });
                      }}
                      className="flex min-w-0 flex-1 items-start gap-2 rounded-md p-2 text-left transition hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          isOffice
                            ? "bg-purple-600 text-white"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{name}</div>
                        {c?.direccion && (
                          <div className="truncate text-xs text-muted-foreground">{c.direccion}</div>
                        )}
                        <div className="mt-0.5 text-[11px] text-primary">
                          {isOffice ? "Parada en oficina" : "Toca para registrar visita"}
                        </div>
                      </div>
                      {leg && !routeDirty && (
                        <div className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          <div>{leg.distance_text || `${leg.distance_km} km`}</div>
                          <div>{leg.duration_text || `${leg.duration_min} min`}</div>
                        </div>
                      )}
                    </button>
                    <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 px-1">
                      <button
                        type="button"
                        title="Subir"
                        disabled={i === 0}
                        onClick={(e) => { e.stopPropagation(); reorderStop(i, i - 1); }}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Bajar"
                        disabled={i === routeInfo.ordered.length - 1}
                        onClick={(e) => { e.stopPropagation(); reorderStop(i, i + 1); }}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      title="Eliminar parada"
                      onClick={(e) => { e.stopPropagation(); removeStop(i); }}
                      className="flex shrink-0 items-center px-2 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );

              })}
            </ol>

          </CardContent>
        </Card>
      )}

      {aiRationale && !routeInfo && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">Ruta sugerida por IA</div>
            <p className="mt-1 text-foreground">{aiRationale}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Revisa la selección y pulsa "Optimizar" para trazar el recorrido.
            </p>
          </div>
        </div>
      )}

      {withoutCoords.length > 0 && !routeInfo && (
        <Card>
          <CardHeader className="pb-2">
            <button
              type="button"
              onClick={() => setShowWithoutCoords((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-amber-500" />
                Sin coordenadas ({withoutCoords.length})
              </CardTitle>
              {showWithoutCoords ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showWithoutCoords && (
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
          )}
        </Card>
      )}


      {selected.size > 0 && !routeInfo && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Seleccionados</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {[...selected].map((id) => {
              const c = clientsWithCoords.find((x: any) => x.id === id) as any;
              if (!c) return null;
              return (
                <Badge key={id} variant="secondary" className="cursor-pointer" onClick={() => toggleSel(id)} title="Quitar">
                  {c.nombre_comercial ?? c.razon_social} ×
                </Badge>
              );
            })}
          </CardContent>
        </Card>
      )}

      {checkInClient && (
        <CheckInDialog
          open={!!checkInClient}
          onOpenChange={(v) => !v && setCheckInClient(null)}
          clienteId={checkInClient.id}
          clienteNombre={checkInClient.nombre}
        />
      )}

      <NewRouteWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        clients={data?.clients ?? []}
        initialFecha={routeFecha}
        isAdmin={!!repsQ.data?.isAdmin}
        reps={repsQ.data?.reps ?? []}
        onConfirm={({ fecha, clientIds, optimize: doOpt, assignedRepId: repId, officeMotivo: om }) => {
          setRouteFecha(fecha);
          setAssignedRepId(repId ?? null);
          setOfficeMotivo(om ?? null);
          setSelected(new Set(clientIds));
          setRouteInfo(null);
          didFitRef.current = false;
          if (doOpt) doOptimize.mutate({ ids: clientIds, fecha, officeMotivo: om ?? null });
        }}
      />
    </div>
  );
}

