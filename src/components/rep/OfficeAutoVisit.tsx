import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkInFn, getOpenVisitFn } from "@/lib/rep.functions";
import { isAtOffice, OFFICE_LOCATION, OFFICE_PURPOSES } from "@/lib/office";
import { useOfficeAutoVisit } from "@/hooks/use-office-auto-visit";
import { toast } from "sonner";

/** Lecturas consecutivas dentro de la oficina antes de registrar el check-in. */
const INSIDE_HITS = 2;
/** Bandera local: hay que salir del radio de la oficina antes de re-armar el auto check-in. */
const REARM_KEY = "rep-office-auto-rearm-pending";

function setRearmPending(v: boolean) {
  try {
    if (v) window.localStorage.setItem(REARM_KEY, "1");
    else window.localStorage.removeItem(REARM_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

function isRearmPending(): boolean {
  try {
    return window.localStorage.getItem(REARM_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Registro automático de visitas a la oficina IMV.
 * Cuando el representante activa la preferencia, esta pieza vigila su ubicación
 * y hace el check-in en cuanto entra al radio de la matriz. El check-out
 * automático lo dispara la barra de visita en curso al alejarse de la zona.
 *
 * Tras cerrar una visita estando aún en la oficina NO se vuelve a registrar
 * automáticamente: primero hay que salir del radio de la matriz.
 */
export default function OfficeAutoVisit() {
  const { enabled } = useOfficeAutoVisit();
  const qc = useQueryClient();
  const doCheckIn = useServerFn(checkInFn);
  const getOpenVisit = useServerFn(getOpenVisitFn);
  const insideHits = useRef(0);
  const starting = useRef(false);
  const hadOpenVisit = useRef(false);

  const { data } = useQuery({
    queryKey: ["open-visit"],
    queryFn: () => getOpenVisit({ data: {} }) as Promise<{ visit: any }>,
    refetchInterval: 60_000,
    enabled,
  });
  const hasOpenVisit = !!data?.visit;

  // Al terminar una visita, exigimos salir del radio antes de re-armar.
  useEffect(() => {
    if (hasOpenVisit) {
      hadOpenVisit.current = true;
      return;
    }
    if (hadOpenVisit.current) {
      hadOpenVisit.current = false;
      setRearmPending(true);
    }
  }, [hasOpenVisit]);

  useEffect(() => {
    if (!enabled || hasOpenVisit) {
      insideHits.current = 0;
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (!isAtOffice(lat, lng)) {
          insideHits.current = 0;
          // salió del radio: ya se puede volver a registrar automáticamente
          if (isRearmPending()) setRearmPending(false);
          return;
        }
        if (isRearmPending()) {
          insideHits.current = 0;
          return;
        }
        insideHits.current += 1;
        if (insideHits.current < INSIDE_HITS || starting.current) return;
        starting.current = true;
        try {
          await doCheckIn({
            data: {
              kind: "oficina" as const,
              officePurpose: OFFICE_PURPOSES[0],
              autoRegistered: true,
              lat,
              lng,
            },
          });
          toast.success(`Check-in automático en ${OFFICE_LOCATION.nombre}`);
          qc.invalidateQueries({ queryKey: ["open-visit"] });
          qc.invalidateQueries({ queryKey: ["rep-visits"] });
        } catch {
          /* si falla (p.ej. sin ficha de vendedor) no insistimos en bucle */
        } finally {
          starting.current = false;
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [enabled, hasOpenVisit, doCheckIn, qc]);


  return null;
}
