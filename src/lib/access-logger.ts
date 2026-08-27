// Registers a platform-access event for the signed-in user, with optional
// browser geolocation. One row per browser session (dedup via sessionStorage).
import { supabase } from "@/integrations/supabase/client";

const SESSION_FLAG = "rep_access_logged_v1";
const DEVICE_KEY = "imv_device_id_v1";
const SESSION_ID_KEY = "imv_session_id_v1";

/** Stable per-browser/device id (persists across tabs, windows and reloads). */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}

/** Per-tab session id — lets us tell "another window" apart from "another device". */
function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown-session";
  }
}

function detectPlatform(): string {
  const ua = navigator.userAgent ?? "";
  if (/iPad|iPhone|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Otro";
}

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
    // One row per user + device + day, so multiple browser windows/tabs on the
    // same device don't pin the same location several times in the supervisor map.
    const stamp = `${userId}:${getDeviceId()}:${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(SESSION_FLAG) === stamp) return;
    localStorage.setItem(SESSION_FLAG, stamp);
  } catch {
    // sessionStorage unavailable — still proceed once per page load
  }

  const coords = await getPosition();
  const payload: Record<string, unknown> = {
    user_id: userId,
    signed_in_at: new Date().toISOString(),
    user_agent: navigator.userAgent?.slice(0, 500) ?? null,
    has_location: !!coords,
    device_id: getDeviceId(),
    session_id: getSessionId(),
    platform: detectPlatform(),
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
