/**
 * Oficina / matriz IMV.
 * Se usa como parada especial en las rutas de los representantes y para
 * detectar en el mapa de ubicaciones si un representante está en la oficina.
 */
export const OFFICE_STOP_ID = "oficina";

export const OFFICE_LOCATION = {
  id: OFFICE_STOP_ID,
  nombre: "Oficina IMV",
  direccion: "Necaxa 125, Portales Nte, Benito Juárez, 03303 Ciudad de México, CDMX",
  lat: 19.371694,
  lng: -99.14850,
  /** radio de tolerancia para considerar que alguien está "en oficina" */
  radiusM: 250,
} as const;

/** Motivos por los que un representante pasa a la oficina dentro de su ruta. */
export const OFFICE_PURPOSES = [
  "Oficina IMV",
  "Capacitación",
  "Recoger pedido",
  "Entrega de RC",
  "Visita semanal",
  "Otro",
] as const;

export type OfficePurpose = (typeof OFFICE_PURPOSES)[number];

/** Distancia en metros entre dos coordenadas (haversine). */
export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** ¿La coordenada cae dentro del radio de la oficina? */
export function isAtOffice(
  lat?: number | null,
  lng?: number | null,
  radiusM = OFFICE_LOCATION.radiusM,
): boolean {
  if (lat == null || lng == null) return false;
  return (
    distanceMeters(Number(lat), Number(lng), OFFICE_LOCATION.lat, OFFICE_LOCATION.lng) <=
    radiusM
  );
}

/** true si la parada de una ruta es la oficina (y no un cliente). */
export function isOfficeStop(stop: any): boolean {
  return String(stop?.cliente_id ?? "") === OFFICE_STOP_ID || stop?.kind === "office";
}
