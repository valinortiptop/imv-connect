import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOpenVisitFn, checkOutFn } from "@/lib/rep.functions";
import { Button } from "@/components/ui/button";
import { Clock, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";
import CheckInDialog from "./CheckInDialog";

type OpenVisit = {
  id: string;
  cliente_id: string | null;
  prospect_id: string | null;
  check_in_at: string;
  check_in_lat: number | null;
  check_in_lng: number | null;
  nombre: string;
};

/** Distancia (m) desde el punto de check-in que dispara el check-out automático. */
const AUTO_OUT_M = 350;
/** Lecturas consecutivas fuera de la zona antes de cerrar (evita saltos de GPS). */
const AUTO_OUT_HITS = 2;

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Barra global de "visita en curso": permite retomar y cerrar la visita desde
 * cualquier página (aunque el vendedor haya cerrado el teléfono), y cierra la
 * visita automáticamente cuando se aleja de la ubicación del check-in.
 */
export default function ActiveVisitBar() {
  const qc = useQueryClient();
  const getOpenVisit = useServerFn(getOpenVisitFn);
  const doCheckOut = useServerFn(checkOutFn);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const outsideHits = useRef(0);
  const closing = useRef(false);

  const { data } = useQuery({
    queryKey: ["open-visit"],
    queryFn: () => getOpenVisit({ data: {} }) as Promise<{ visit: OpenVisit | null }>,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });
  const visit = data?.visit ?? null;

  // Reloj de la visita
  useEffect(() => {
    if (!visit) return;
    setNowTs(Date.now());
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [visit?.id]);

  // Al volver a la app (regresar de bloquear el teléfono) revalidamos
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        qc.invalidateQueries({ queryKey: ["open-visit"] });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [qc]);

  // Geocerca: check-out automático al salir de la zona del cliente
  useEffect(() => {
    if (!visit || visit.check_in_lat == null || visit.check_in_lng == null) return;
    if (!navigator.geolocation) return;
    const origin = { lat: Number(visit.check_in_lat), lng: Number(visit.check_in_lng) };
    outsideHits.current = 0;
    closing.current = false;

    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const dist = haversineM(origin, here);
        const acc = pos.coords.accuracy ?? 0;
        if (dist - acc < AUTO_OUT_M) {
          outsideHits.current = 0;
          return;
        }
        outsideHits.current += 1;
        if (outsideHits.current < AUTO_OUT_HITS || closing.current) return;
        closing.current = true;
        try {
          await doCheckOut({
            data: {
              visitId: visit.id,
              lat: here.lat,
              lng: here.lng,
              notes: `Check-out automático: el vendedor se alejó ${dist} m del punto de check-in.`,
            },
          });
          toast.info(`Visita de ${visit.nombre} cerrada automáticamente al salir de la zona.`);
          qc.invalidateQueries({ queryKey: ["open-visit"] });
          qc.invalidateQueries({ queryKey: ["rep-visits"] });
          qc.invalidateQueries({ queryKey: ["daily-routes-summary"] });
        } catch {
          closing.current = false;
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [visit?.id, visit?.check_in_lat, visit?.check_in_lng, doCheckOut, qc]);

  if (!visit) return null;

  const total = Math.floor(Math.max(0, nowTs - new Date(visit.check_in_at).getTime()) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const elapsed = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(s).padStart(2, "0")}`;

  return (
    <>
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm backdrop-blur">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Clock className="h-3.5 w-3.5" /> {elapsed}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">Visita en curso · {visit.nombre}</span>
        </span>
        <Button size="sm" className="h-8" onClick={() => setDialogOpen(true)}>
          <LogOut className="mr-1 h-3.5 w-3.5" /> Check-out
        </Button>
      </div>

      <CheckInDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) qc.invalidateQueries({ queryKey: ["open-visit"] });
        }}
        clienteId={visit.cliente_id ?? undefined}
        prospectId={visit.prospect_id ?? undefined}
        clienteNombre={visit.nombre}
      />
    </>
  );
}
