/**
 * Geocodificación con caché en base de datos.
 *
 * Toda búsqueda de coordenadas pasa por aquí: primero se consulta
 * `address_geocodes` (llave = dirección normalizada en SQL por
 * `geocode_address_key`). Solo si no existe se llama a Google Maps vía el
 * proxy de Valinor, y el resultado (incluido "sin resultado") se guarda para
 * que la misma dirección nunca se vuelva a cobrar.
 *
 * Server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { googleGeocode } from "./valinor-proxy.server";

type Client = SupabaseClient<Database>;

export type GeocodeResult = {
  status: "ok" | "sin_resultado";
  lat: number | null;
  lng: number | null;
  formatted_address: string | null;
  place_id: string | null;
  postal_code: string | null;
  source: "cache" | "google";
};

/** Construye el texto que se manda a Google (y del que sale la llave del caché). */
export function buildGeocodeQuery(address: string, postalCode?: string | null): string {
  const a = address.trim();
  const cp = (postalCode ?? "").trim();
  const withCp = cp && !a.includes(cp) ? `${a}, CP ${cp}` : a;
  return /m[eé]xico\s*$/i.test(withCp) ? withCp : `${withCp}, México`;
}

/**
 * Devuelve coordenadas para la dirección usando el caché primero.
 * Lanza error si Google responde con un problema temporal (cuota, permisos,
 * red) — esos casos NO se guardan para poder reintentar.
 */
export async function geocodeWithCache(
  supabase: Client,
  query: string,
): Promise<GeocodeResult> {
  const { data: cached, error: cacheErr } = await supabase.rpc("geocode_cache_get", {
    _query: query,
  });
  if (cacheErr) console.error("[geocode] cache read failed:", cacheErr.message);
  const hit = Array.isArray(cached) ? cached[0] : null;
  if (hit) {
    return {
      status: hit.status === "ok" ? "ok" : "sin_resultado",
      lat: hit.latitude != null ? Number(hit.latitude) : null,
      lng: hit.longitude != null ? Number(hit.longitude) : null,
      formatted_address: hit.formatted_address,
      place_id: hit.place_id,
      postal_code: hit.postal_code,
      source: "cache",
    };
  }

  const res = await googleGeocode({ address: query });
  if (res.status !== "OK" && res.status !== "ZERO_RESULTS") {
    throw new Error(
      `Google Maps no pudo ubicar la dirección (${res.status}${res.error_message ? `: ${res.error_message}` : ""})`,
    );
  }
  const top = res.results?.[0];
  const loc = top?.geometry?.location;
  const ok = res.status === "OK" && typeof loc?.lat === "number" && typeof loc?.lng === "number";
  const result: GeocodeResult = {
    status: ok ? "ok" : "sin_resultado",
    lat: ok ? loc!.lat : null,
    lng: ok ? loc!.lng : null,
    formatted_address: ok ? (top?.formatted_address ?? null) : null,
    place_id: ok ? (top?.place_id ?? null) : null,
    postal_code: ok
      ? (top?.address_components?.find((c) => c.types?.includes("postal_code"))?.long_name ?? null)
      : null,
    source: "google",
  };

  const { error: putErr } = await supabase.rpc("geocode_cache_put", {
    _query: query,
    _status: result.status,
    _lat: result.lat as number,
    _lng: result.lng as number,
    _formatted: result.formatted_address as string,
    _place_id: result.place_id as string,
    _postal_code: result.postal_code as string,
  });
  if (putErr) console.error("[geocode] cache write failed:", putErr.message);

  return result;
}
