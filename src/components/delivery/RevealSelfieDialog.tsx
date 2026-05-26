/**
 * RevealSelfieDialog
 *
 * Full-screen modal that captures a selfie + driver name BEFORE the
 * customer signature page reveals prices/totals. Visible deterrent
 * against drivers peeking at totals to plan robberies (a real problem
 * for menudeo deliveries especially).
 *
 * Flow:
 *   1. Modal opens when driver taps "Iniciar firma con cliente".
 *   2. Front camera preview shows, with watermark overlay rendered
 *      live (order code, timestamp, driver name as it's typed).
 *   3. Driver types their name (pre-filled from last device value).
 *   4. Geolocation requested in parallel (silent — only blocks if user
 *      manually denies, otherwise resolves with whatever it gets).
 *   5. Driver taps "Tomar selfie y revelar →".
 *   6. Photo captured, watermarked, queued for background upload.
 *   7. onConfirm() fires → parent flips audience to 'client'.
 *
 * If camera permission is denied:
 *   - We show a clear warning explaining the reveal will still be
 *     logged with a camera_denied flag.
 *   - Driver can still proceed (client's time wins) by tapping
 *     "Continuar sin foto".
 *
 * Photo upload is fire-and-forget via revealPhotoQueue.enqueueOrUpload.
 * If the device is offline, the photo gets stashed in IndexedDB and
 * uploaded later. The reveal NEVER blocks on network state.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Loader2, MapPin, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  enqueueOrUpload, getDeviceId, getLastDriverName, setLastDriverName,
} from "@/lib/revealPhotoQueue";

interface Props {
  open: boolean;
  /** The signature_token from the URL (/entrega/:token). */
  token: string;
  orderCode: string;
  /** When multi-stop, pass the stop index being revealed. Else null. */
  stopIndex: number | null;
  /** Fires AFTER the reveal is logged (uploaded or queued). */
  onConfirm: () => void;
  onCancel: () => void;
}

type CamState = "idle" | "requesting" | "live" | "denied" | "error";
type GeoState = "idle" | "requesting" | "ok" | "denied" | "error";

export function RevealSelfieDialog({
  open, token, orderCode, stopIndex, onConfirm, onCancel,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [driverName, setDriverName] = useState(getLastDriverName());
  const [camState, setCamState] = useState<CamState>("idle");
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Live clock for the watermark — ticks every second while open.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Open/close lifecycle — start camera + geolocation when the dialog
  // opens, stop them when it closes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setError(null);
      setCamState("requesting");
      setGeoState("requesting");

      // Geolocation runs in parallel. Doesn't block camera.
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            setCoords({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
            setGeoState("ok");
          },
          (geoErr) => {
            if (cancelled) return;
            setGeoState(geoErr.code === geoErr.PERMISSION_DENIED ? "denied" : "error");
          },
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
        );
      } else {
        setGeoState("error");
      }

      // Camera — front-facing if available.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { /* user-gesture quirks */ });
        }
        setCamState("live");
      } catch (err: any) {
        if (cancelled) return;
        if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
          setCamState("denied");
        } else {
          setCamState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  if (!open) return null;

  /** Composite the watermark into the frame and return a JPEG blob. */
  async function captureFrame(): Promise<Blob | null> {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const w = video.videoWidth || 720;
    const h = video.videoHeight || 960;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // We mirror the preview for natural selfie UX, but bake the
    // UN-mirrored image into the file (true face orientation, what a
    // reviewer expects).
    ctx.drawImage(video, 0, 0, w, h);

    // Watermark — dark band along the bottom with white text.
    const bandH = Math.round(h * 0.18);
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.fillRect(0, h - bandH, w, bandH);

    const pad = Math.round(w * 0.025);
    const fontSize = Math.round(w * 0.04);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${fontSize}px -apple-system, system-ui, sans-serif`;
    ctx.textBaseline = "top";

    const line1Y = h - bandH + pad;
    const line2Y = line1Y + fontSize * 1.3;
    const line3Y = line2Y + fontSize * 1.1;
    const line4Y = line3Y + fontSize * 1.1;

    ctx.fillText(`${orderCode}${stopIndex ? ` · Parada ${stopIndex}` : ""}`, pad, line1Y);
    ctx.font = `${Math.round(fontSize * 0.9)}px -apple-system, system-ui, sans-serif`;
    ctx.fillText(`${formatStamp(new Date())}`, pad, line2Y);
    ctx.fillText(`Repartidor: ${driverName.trim().toUpperCase()}`, pad, line3Y);
    if (coords) {
      ctx.fillText(
        `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}  ±${Math.round(coords.accuracy)}m`,
        pad, line4Y,
      );
    }

    // 0.8 quality JPEG keeps file size in the 100-250 KB range — small
    // enough for retries over flaky mobile data.
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8);
    });
  }

  async function handleConfirm() {
    setError(null);
    const trimmed = driverName.trim();
    if (!trimmed) {
      setError("Escribe tu nombre antes de continuar.");
      return;
    }
    if (trimmed.length < 3) {
      setError("Escribe tu nombre completo.");
      return;
    }
    setBusy(true);
    try {
      setLastDriverName(trimmed);

      const cameraDenied = camState !== "live";
      const blob = cameraDenied ? null : await captureFrame();

      // Fire-and-forget upload (queued if offline).
      void enqueueOrUpload({
        token,
        driver_name: trimmed,
        stop_index: stopIndex,
        photo_blob: blob,
        taken_at: new Date().toISOString(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        location_accuracy_m: coords?.accuracy ?? null,
        location_denied: geoState === "denied",
        camera_denied: cameraDenied,
        device_id: getDeviceId(),
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });

      onConfirm();
    } catch (err: any) {
      setError(err?.message ?? "No se pudo registrar la foto.");
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = driverName.trim().length >= 3 && !busy;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header — small, dim. Designed for one-handed reach. */}
      <header className="bg-black/80 backdrop-blur px-4 py-3 flex items-center justify-between text-white">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider opacity-70">Antes de mostrar totales</p>
          <p className="text-sm font-mono text-blue-400 truncate">{orderCode}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="text-white hover:bg-white/10 -mr-2"
          disabled={busy}
        >
          <X className="h-5 w-5" />
        </Button>
      </header>

      {/* Camera preview area */}
      <div className="relative flex-1 bg-black overflow-hidden">
        {/* Mirrored video for natural selfie feel */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn(
            "absolute inset-0 w-full h-full object-cover",
            "scale-x-[-1]", // mirror
            camState !== "live" && "opacity-0",
          )}
        />

        {/* Live watermark band — matches what gets baked into the photo */}
        {camState === "live" && (
          <div className="absolute left-0 right-0 bottom-0 bg-black/60 text-white px-4 py-3 text-[11px] leading-tight font-mono">
            <p className="font-bold text-sm">
              {orderCode}{stopIndex ? ` · Parada ${stopIndex}` : ""}
            </p>
            <p className="opacity-80">{formatStamp(now)}</p>
            <p className="opacity-80">
              Repartidor: {driverName.trim() ? driverName.trim().toUpperCase() : "—"}
            </p>
            {coords && (
              <p className="opacity-60 text-[10px] flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} ±{Math.round(coords.accuracy)}m
              </p>
            )}
          </div>
        )}

        {/* Camera states */}
        {camState === "requesting" && (
          <CameraOverlay>
            <Loader2 className="h-8 w-8 animate-spin text-white/60" />
            <p className="text-white/80 text-sm">Activando cámara…</p>
          </CameraOverlay>
        )}
        {camState === "denied" && (
          <CameraOverlay>
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <div className="text-center space-y-1 max-w-xs">
              <p className="text-white font-semibold text-sm">Cámara bloqueada</p>
              <p className="text-white/70 text-xs">
                Sin foto no podemos verificar quién reveló los totales,
                pero queda registrado.
              </p>
            </div>
          </CameraOverlay>
        )}
        {camState === "error" && (
          <CameraOverlay>
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <p className="text-white/80 text-sm text-center max-w-xs">
              No se pudo iniciar la cámara en este dispositivo. Continúa
              y registramos la entrega sin foto.
            </p>
          </CameraOverlay>
        )}
      </div>

      {/* Bottom panel — name input + confirm */}
      <div className="bg-zinc-950 border-t border-white/10 p-4 space-y-3 text-white">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/60 block mb-1">
            ¿Quién entrega?
          </label>
          <Input
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="Tu nombre completo"
            className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-blue-400"
            disabled={busy}
            autoCapitalize="words"
          />
        </div>

        {/* Geolocation pill (informational) */}
        <div className="flex items-center gap-2 text-[11px]">
          <GeoChip state={geoState} />
        </div>

        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <Button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={cn(
            "w-full h-14 text-base font-semibold rounded-xl text-white shadow-lg transition active:scale-[0.99]",
            camState === "live"
              ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
              : "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none",
          )}
        >
          {busy ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Registrando…</>
          ) : camState === "live" ? (
            <><Camera className="h-5 w-5 mr-2" /> Tomar selfie y revelar</>
          ) : (
            <>Continuar sin foto <CheckCircle2 className="h-5 w-5 ml-2" /></>
          )}
        </Button>

        <p className="text-[10px] text-white/40 text-center leading-snug">
          La foto, tu nombre y la hora quedan registrados con el pedido.
          Esto protege al cliente y a ti.
        </p>
      </div>
    </div>
  );
}

/* ── Subcomponents ──────────────────────────────────────────────────── */

function CameraOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
      {children}
    </div>
  );
}

function GeoChip({ state }: { state: GeoState }) {
  if (state === "requesting") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-white/60">
        <Loader2 className="h-3 w-3 animate-spin" /> Ubicación…
      </span>
    );
  }
  if (state === "ok") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
        <MapPin className="h-3 w-3" /> Ubicación capturada
      </span>
    );
  }
  if (state === "denied") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
        <MapPin className="h-3 w-3" /> Sin permiso de ubicación
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-white/50">
      <MapPin className="h-3 w-3" /> Sin ubicación
    </span>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function formatStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
