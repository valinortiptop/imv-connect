/**
 * revealPhotoQueue
 *
 * IndexedDB-backed queue for delivery-reveal selfies. When the driver
 * taps "Iniciar firma con cliente" at a delivery site, the dialog tries
 * to upload immediately. If the network is down (Mexican wholesale
 * delivery sites often have no signal) the photo is stashed locally
 * and retried automatically when connectivity returns.
 *
 * Design goals:
 *   - Reveal is NEVER blocked by network state. Photo upload runs in
 *     the background; client UX continues immediately.
 *   - Survives page reloads and tab closures (IndexedDB persistence).
 *   - Idempotent retries — same record gets uploaded once even if
 *     the user reopens the page repeatedly.
 *   - Tiny surface area: enqueue(), flush(), and a background tick
 *     wired to window.online / visibilitychange / a 30s interval.
 *
 * The queue calls the public `upload-reveal-photo` edge function. No
 * auth header — the signature_token in the form data is the only
 * credential the edge function needs.
 */

const DB_NAME = "croquetapp-reveal-photo-queue";
const DB_VERSION = 1;
const STORE = "queue";
const MAX_ATTEMPTS = 10;

const FUNCTION_URL =
  `https://rfyshhzkhewzjudohzii.supabase.co/functions/v1/upload-reveal-photo`;

export interface QueuedRevealPhoto {
  id: string;
  token: string;
  driver_name: string;
  stop_index: number | null;
  photo_blob: Blob | null; // null when cameraDenied
  taken_at: string;        // ISO
  lat: number | null;
  lng: number | null;
  location_accuracy_m: number | null;
  location_denied: boolean;
  camera_denied: boolean;
  device_id: string | null;
  user_agent: string | null;
  attempts: number;
  last_error?: string;
  last_attempt_at?: string;
  created_at: string;
}

/* ── IndexedDB plumbing ─────────────────────────────────────────────── */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    Promise.resolve(fn(store)).then((result) => {
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }).catch(reject);
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ── Device ID (stable per browser, anonymous) ──────────────────────── */

const DEVICE_KEY = "croquetapp:reveal-device-id";

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return "no-device-storage";
  }
}

/* ── Last driver name on this device (UX nicety) ────────────────────── */

const LAST_DRIVER_KEY = "croquetapp:last-driver-name";

export function getLastDriverName(): string {
  try { return localStorage.getItem(LAST_DRIVER_KEY) ?? ""; } catch { return ""; }
}

export function setLastDriverName(name: string) {
  try { localStorage.setItem(LAST_DRIVER_KEY, name); } catch { /* swallow */ }
}

/* ── Public API ─────────────────────────────────────────────────────── */

/**
 * Try to upload a reveal photo. If it succeeds, we're done. If it
 * fails (network down, edge function error), it gets queued in
 * IndexedDB and retried automatically.
 *
 * Either way, this resolves quickly — never blocks the reveal flow.
 */
export async function enqueueOrUpload(
  input: Omit<QueuedRevealPhoto, "id" | "attempts" | "created_at">,
): Promise<{ uploaded: boolean; queued: boolean; record_id?: string }> {
  const record: QueuedRevealPhoto = {
    ...input,
    id: crypto.randomUUID(),
    attempts: 0,
    created_at: new Date().toISOString(),
  };

  // Try direct upload first.
  if (navigator.onLine) {
    try {
      const result = await uploadOne(record);
      return { uploaded: true, queued: false, record_id: result.record_id };
    } catch (err: any) {
      // Fall through to queue.
      record.last_error = err?.message ?? "upload_failed";
      record.attempts = 1;
      record.last_attempt_at = new Date().toISOString();
    }
  }

  // Stash for retry.
  await withStore("readwrite", (store) => reqAsPromise(store.put(record)));
  return { uploaded: false, queued: true };
}

/**
 * Drain the queue. Called automatically on:
 *   - window 'online' event
 *   - document 'visibilitychange' (when becoming visible)
 *   - page load (registerBackgroundFlush)
 *   - 30s interval while page is open
 */
export async function flush(): Promise<{ ok: number; left: number }> {
  if (!navigator.onLine) return { ok: 0, left: -1 };

  const all = await listQueued();
  let ok = 0;
  for (const record of all) {
    if (record.attempts >= MAX_ATTEMPTS) continue;
    try {
      await uploadOne(record);
      await remove(record.id);
      ok++;
    } catch (err: any) {
      record.attempts += 1;
      record.last_error = err?.message ?? "upload_failed";
      record.last_attempt_at = new Date().toISOString();
      await withStore("readwrite", (store) => reqAsPromise(store.put(record)));
    }
  }
  const left = (await listQueued()).length;
  return { ok, left };
}

export async function listQueued(): Promise<QueuedRevealPhoto[]> {
  return withStore("readonly", (store) =>
    reqAsPromise(store.getAll() as IDBRequest<QueuedRevealPhoto[]>),
  );
}

export async function queuedCount(): Promise<number> {
  return (await listQueued()).length;
}

async function remove(id: string): Promise<void> {
  await withStore("readwrite", (store) => reqAsPromise(store.delete(id)));
}

/* ── Upload helper ──────────────────────────────────────────────────── */

async function uploadOne(record: QueuedRevealPhoto): Promise<{ record_id?: string }> {
  const fd = new FormData();
  fd.append("token", record.token);
  fd.append("driver_name", record.driver_name);
  if (record.stop_index != null) fd.append("stop_index", String(record.stop_index));
  fd.append("taken_at", record.taken_at);
  if (record.lat != null) fd.append("lat", String(record.lat));
  if (record.lng != null) fd.append("lng", String(record.lng));
  if (record.location_accuracy_m != null) {
    fd.append("location_accuracy_m", String(record.location_accuracy_m));
  }
  fd.append("location_denied", String(record.location_denied));
  fd.append("camera_denied", String(record.camera_denied));
  if (record.device_id) fd.append("device_id", record.device_id);
  if (record.user_agent) fd.append("user_agent", record.user_agent);
  if (record.photo_blob) {
    fd.append("photo", record.photo_blob, `${record.id}.jpg`);
  }

  const res = await fetch(FUNCTION_URL, { method: "POST", body: fd });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`upload_failed_${res.status}_${txt}`);
  }
  const json = (await res.json()) as { record_id?: string };
  return { record_id: json.record_id };
}

/* ── Background flush wiring ────────────────────────────────────────── */

let registered = false;
let intervalId: number | null = null;

/**
 * Wire up automatic flushes. Call once from app boot. Safe to call
 * multiple times — only wires up the first time.
 */
export function registerBackgroundFlush() {
  if (registered) return;
  registered = true;

  const tick = () => {
    void flush().catch(() => { /* swallow — retried on next tick */ });
  };

  // On reconnect.
  window.addEventListener("online", tick);
  // On tab becoming visible again (handles laptops waking from sleep).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
  // On boot.
  tick();
  // Light polling — every 30s while the page is open.
  intervalId = window.setInterval(tick, 30_000);
}

export function unregisterBackgroundFlush() {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  registered = false;
}
