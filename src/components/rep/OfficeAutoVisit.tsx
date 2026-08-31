import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkInFn, getOpenVisitFn } from "@/lib/rep.functions";
import { isAtOffice, OFFICE_LOCATION, OFFICE_PURPOSES } from "@/lib/office";
import { useOfficeAutoVisit } from "@/hooks/use-office-auto-visit";
import { toast } from "sonner";

/** Lecturas consecutivas dentro de la oficina antes de registrar el check-in. */
const INSIDE_HITS = 2;

/**
 * Registro automático de visitas a la oficina IMV.
 * Cuando el representante activa la preferencia, esta pieza vigila su ubicación
 * y hace el check-in en cuanto entra al radio de la matriz. El check-out
 * automático lo dispara la barra de visita en curso al alejarse de la zona.
 */
export default function OfficeAutoVisit() {
  const { enabled } = useOfficeAutoVisit();
  const qc = useQueryClient();
  const doCheckIn = useServerFn(checkInFn);
  const getOpenVisit = useServerFn(getOpenVisitFn);
  const insideHits = useRef(0);
  const starting = useRef(false);

  const { data } = useQuery({
    queryKey: ["open-visit"],
    queryFn: () => getOpenVisit({ data: {} }) as Promise<{ visit: any }>,
    refetchInterval: 60_000,
    enabled,
  });
  const hasOpenVisit = !!data?.visit;

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
