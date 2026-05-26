/**
 * BarcodeScannerDialog — phone camera barcode reader.
 *
 * Uses the native `BarcodeDetector` API (Chrome, Android Chrome,
 * iOS Safari 17+). On detection it calls `onScan(value)` and closes
 * the dialog. For browsers without the API, a paste / type-in input
 * is offered as a fallback so the feature is still usable.
 *
 * UI:
 *   - rear-facing camera viewfinder
 *   - translucent dark mask around a centered rectangle (scan target)
 *   - animated red horizontal laser line bouncing inside the rectangle
 *   - bottom: detected text + "Cerrar" button
 *
 * The laser is purely visual; the API scans the whole frame either way.
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, X, Loader2, Search, PackageMinus } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScannerMode = "buscar" | "picar";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Called with the decoded string when a barcode is detected. The
   *  parent decides what to do with the value based on the current
   *  scanner mode (passed back in via `mode`). */
  onScan: (value: string, mode: ScannerMode) => void;
  /** Scanner mode — controls the verb on the manual-input button + the
   *  callback semantics. */
  mode?: ScannerMode;
  onModeChange?: (m: ScannerMode) => void;
}

// Loose type — TS doesn't know about BarcodeDetector by default
type BarcodeDetectorAny = {
  detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue: string; format: string }>>;
};

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"];

export function BarcodeScannerDialog({
  open, onOpenChange, onScan, mode = "buscar", onModeChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorAny | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "no-api" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [manualValue, setManualValue] = useState("");

  // Stop everything cleanly
  const cleanup = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!open) { cleanup(); return; }

    let cancelled = false;
    (async () => {
      setStatus("starting");
      setErrorMsg("");

      // 1. Check for BarcodeDetector API support
      const BD = (globalThis as any).BarcodeDetector;
      if (!BD) {
        if (!cancelled) setStatus("no-api");
        return;
      }
      try {
        const supported: string[] = await BD.getSupportedFormats?.() ?? [];
        const useFormats = FORMATS.filter(f => !supported.length || supported.includes(f));
        detectorRef.current = new BD({ formats: useFormats.length ? useFormats : undefined });
      } catch {
        if (!cancelled) setStatus("no-api");
        return;
      }

      // 2. Open rear camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { for (const t of stream.getTracks()) t.stop(); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("scanning");
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message ?? "No se pudo acceder a la cámara");
          setStatus("error");
        }
        return;
      }

      // 3. Detect loop — runs at ~rAF cadence, throttled to ~5/sec
      let lastTick = 0;
      const tick = async () => {
        if (cancelled || !videoRef.current || !detectorRef.current) return;
        const now = performance.now();
        if (now - lastTick > 200) {
          lastTick = now;
          try {
            const codes = await detectorRef.current.detect(videoRef.current);
            if (codes.length > 0 && !cancelled) {
              onScan(codes[0].rawValue, mode);
              onOpenChange(false);
              return;
            }
          } catch { /* transient — keep looping */ }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    })();

    return () => { cancelled = true; cleanup(); };
  }, [open, onScan, onOpenChange]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = manualValue.trim();
    if (!v) return;
    onScan(v, mode);
    setManualValue("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[96vw] p-0 overflow-hidden gap-0">
        {/* Mode toggle — Buscar (find slot) vs Picar (subtract qty) */}
        {onModeChange && (
          <div className="px-3 pt-3 pb-2 border-b bg-card flex gap-2">
            <Button
              variant={mode === "buscar" ? "default" : "outline"}
              size="sm"
              className="flex-1 gap-1.5 h-8"
              onClick={() => onModeChange("buscar")}
            >
              <Search className="h-3.5 w-3.5" />
              Buscar
            </Button>
            <Button
              variant={mode === "picar" ? "default" : "outline"}
              size="sm"
              className={cn(
                "flex-1 gap-1.5 h-8",
                mode === "picar" && "bg-emerald-500 hover:bg-emerald-600 text-white",
              )}
              onClick={() => onModeChange("picar")}
            >
              <PackageMinus className="h-3.5 w-3.5" />
              Picar
            </Button>
          </div>
        )}

        <div className="relative aspect-[3/4] bg-black w-full">
          {/* Video viewport */}
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
            aria-label="Cámara"
          />

          {/* Dark mask + scanning rectangle */}
          {status === "scanning" && (
            <>
              {/* Four mask quadrants surrounding the center rectangle */}
              <div className="absolute inset-x-0 top-0 h-[28%] bg-black/55" />
              <div className="absolute inset-x-0 bottom-0 h-[28%] bg-black/55" />
              <div className="absolute top-[28%] bottom-[28%] left-0 w-[10%] bg-black/55" />
              <div className="absolute top-[28%] bottom-[28%] right-0 w-[10%] bg-black/55" />

              {/* Scan rectangle outline + corner brackets */}
              <div className="absolute top-[28%] bottom-[28%] left-[10%] right-[10%] border-2 border-white/30 rounded-md">
                {/* Corner accents */}
                <span className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-4 border-l-4 border-red-500 rounded-tl-md" />
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-4 border-r-4 border-red-500 rounded-tr-md" />
                <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-4 border-l-4 border-red-500 rounded-bl-md" />
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-4 border-r-4 border-red-500 rounded-br-md" />

                {/* Animated red laser line */}
                <div className="scanner-laser absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.7)]" />
              </div>

              {/* Hint */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-sm">
                Centra el código de barras
              </div>
            </>
          )}

          {/* Loading overlay */}
          {status === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">Abriendo cámara…</span>
            </div>
          )}

          {/* No API fallback */}
          {(status === "no-api" || status === "error") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-6 text-center">
              <Camera className="h-10 w-10 opacity-60" />
              <p className="text-sm">
                {status === "no-api"
                  ? "Tu navegador no soporta cámara para escanear. Pega o escribe el código manualmente."
                  : errorMsg || "No se pudo acceder a la cámara."}
              </p>
            </div>
          )}

          {/* Close button (always available) */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Manual input — also useful for Bluetooth scanners that
            emulate a keyboard (autoFocus catches the typed digits). */}
        <form onSubmit={handleManualSubmit} className="p-4 border-t bg-background flex gap-2">
          <Input
            value={manualValue}
            onChange={e => setManualValue(e.target.value)}
            placeholder="O pega/escribe el código aquí"
            inputMode="numeric"
            autoFocus={status === "no-api" || status === "error"}
            style={{ fontSize: 16 }}
          />
          <Button type="submit" disabled={!manualValue.trim()}>
            {mode === "picar" ? "Picar" : "Buscar"}
          </Button>
        </form>
      </DialogContent>

      {/* Laser keyframes — global so it works inside the dialog portal */}
      <style>{`
        @keyframes scanner-laser-anim {
          0%   { top: 0%; opacity: 0.4; }
          50%  { top: calc(100% - 2px); opacity: 1; }
          100% { top: 0%; opacity: 0.4; }
        }
        .scanner-laser {
          animation: scanner-laser-anim 1.8s ease-in-out infinite;
          top: 0;
        }
      `}</style>
    </Dialog>
  );
}
