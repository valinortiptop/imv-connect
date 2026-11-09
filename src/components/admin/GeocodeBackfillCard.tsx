// Ubicación única de direcciones pendientes (clientes y prospectos).
// Cada registro procesado queda marcado como ubicado o "sin resultado", por
// lo que volver a correrlo no repite cobros de Google Maps.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { geocodeBackfillFn, geocodeStatusFn } from "@/lib/rep.functions";

type Target = "clientes" | "prospects";
const LABEL: Record<Target, string> = { clientes: "Clientes", prospects: "Prospectos" };

export function GeocodeBackfillCard() {
  const fetchStatus = useServerFn(geocodeStatusFn);
  const backfill = useServerFn(geocodeBackfillFn);
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["geocode-status"],
    queryFn: () => fetchStatus(),
    staleTime: 15_000,
  });

  const [running, setRunning] = useState<Target | null>(null);
  const [progress, setProgress] = useState<{
    start: number;
    done: number;
    google: number;
    cache: number;
    failed: number;
  } | null>(null);

  async function run(target: Target) {
    const start = status.data?.[target].pending ?? 0;
    if (start === 0 || running) return;
    setRunning(target);
    setProgress({ start, done: 0, google: 0, cache: 0, failed: 0 });
    try {
      for (let i = 0; i < 500; i++) {
        const r = await backfill({ data: { target, limit: 20 } });
        setProgress((p) =>
          p && {
            ...p,
            done: Math.min(p.start, p.start - r.remaining),
            google: p.google + r.from_google,
            cache: p.cache + r.from_cache,
            failed: p.failed + r.failed,
          },
        );
        if (r.error) {
          toast.error(`Se detuvo: ${r.error}`);
          break;
        }
        if (r.processed === 0 || r.remaining <= 0) break;
      }
      toast.success(`${LABEL[target]}: ubicación terminada`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setRunning(null);
      await status.refetch();
      void qc.invalidateQueries({ queryKey: ["clients"] });
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <MapPin className="h-4 w-4" /> Direcciones guardadas
          </h2>
          <p className="text-xs text-muted-foreground">
            Cada dirección se busca en Google Maps una sola vez; después se reutiliza.
          </p>
        </div>
        {status.data && (
          <div className="text-right text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">
                {status.data.cache.ok_entries.toLocaleString("es-MX")}
              </span>{" "}
              direcciones guardadas
            </p>
            <p>
              <span className="font-medium text-foreground">
                {status.data.cache.hits.toLocaleString("es-MX")}
              </span>{" "}
              búsquedas ahorradas
            </p>
          </div>
        )}
      </div>

      {status.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {status.error && (
        <p className="text-sm text-destructive">
          No se pudo cargar: {(status.error as Error).message}
        </p>
      )}

      {status.data && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["clientes", "prospects"] as Target[]).map((t) => {
            const s = status.data[t];
            const isRunning = running === t;
            const pct =
              isRunning && progress && progress.start > 0
                ? Math.round((progress.done / progress.start) * 100)
                : 0;
            return (
              <div key={t} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{LABEL[t]}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={s.pending === 0 || running !== null}
                    onClick={() => void run(t)}
                  >
                    {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {s.pending === 0 ? "Todo ubicado" : `Ubicar ${s.pending}`}
                  </Button>
                </div>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>{s.total.toLocaleString("es-MX")} en total</li>
                  <li>{s.pending.toLocaleString("es-MX")} pendientes de ubicar</li>
                  <li>{s.sin_resultado.toLocaleString("es-MX")} sin resultado en Google (no se reintentan)</li>
                  <li>{s.sin_direccion.toLocaleString("es-MX")} sin dirección capturada</li>
                </ul>
                {isRunning && progress && (
                  <div className="space-y-1">
                    <Progress value={pct} aria-label={`Progreso ${LABEL[t]}`} />
                    <p className="text-xs text-muted-foreground">
                      {progress.done} de {progress.start} · {progress.cache} reutilizadas ·{" "}
                      {progress.google} nuevas en Google · {progress.failed} sin resultado
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
