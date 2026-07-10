// Registers a platform-access event for the signed-in user, with optional
// browser geolocation. One row per browser session (dedup via sessionStorage).
import { supabase } from "@/integrations/supabase/client";

const SESSION_FLAG = "rep_access_logged_v1";

type Coords = { lat: number; lng: number; accuracy: number | null };

function getPosition(): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (v: Coords | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        finish({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5000 },
    );
  });
}

export async function logPlatformAccess(userId: string | null | undefined): Promise<void> {
  if (typeof window === "undefined") return;
  if (!userId) return;
  try {
    if (sessionStorage.getItem(SESSION_FLAG) === userId) return;
    sessionStorage.setItem(SESSION_FLAG, userId);
  } catch {
    // sessionStorage unavailable — still proceed once per page load
  }

  const coords = await getPosition();
  const payload: Record<string, unknown> = {
    user_id: userId,
    signed_in_at: new Date().toISOString(),
    user_agent: navigator.userAgent?.slice(0, 500) ?? null,
    has_location: !!coords,
  };
  if (coords) {
    payload.lat = coords.lat;
    payload.lng = coords.lng;
    payload.accuracy = coords.accuracy;
  }

  const { error } = await supabase.from("rep_access_events" as any).insert(payload);
  if (error) {
    // Don't block sign-in flow; log for diagnostics only.
    console.warn("[access-logger]", error.message);
  }
}
