import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  computeDayCloseFn,
  saveDayCloseFn,
  listDayClosesFn,
} from "@/lib/rep-performance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarCheck2, MapPin, Users, ShoppingBag, Wallet, RotateCcw, Clock } from "lucide-react";
import AIPageInsights from "@/components/ai/AIPageInsights";
import { useState } from "react";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Page() {
  const qc = useQueryClient();
  const compute = useServerFn(computeDayCloseFn);
  const save = useServerFn(saveDayCloseFn);
  const listClosesFn = useServerFn(listDayClosesFn);

  const [narrative, setNarrative] = useState("");

  const today = useQuery({
    queryKey: ["rep-day-close-today"],
    queryFn: () => compute({ data: {} }),
  });

  const history = useQuery({
    queryKey: ["rep-day-closes"],
    queryFn: () => listClosesFn({ data: { limit: 14 } }),
  });

  const mutate = useMutation({
    mutationFn: () => {
      if (!today.data) throw new Error("Aún calculando");
      return save({
        data: {
          close_date: today.data.close_date,
          narrative,
          summary: today.data.summary,
        },
      });
    },
    onSuccess: () => {
      toast.success("Cierre guardado");
      setNarrative("");
      qc.invalidateQueries({ queryKey: ["rep-day-closes"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const s = today.data?.summary;

  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-cierre" />
      <div>
        <h1 className="text-2xl font-semibold">Cierre de día</h1>
        <p className="text-sm text-muted-foreground">
          Resumen automático de tu jornada. Guarda con una nota para dejar constancia.
        </p>
      </div>

      {today.isLoading || !s ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric icon={Users} label="Visitas" value={String(s.visits_count)} />
            <Metric icon={ShoppingBag} label="Pedidos" value={`${s.orders_count} · ${fmtMXN(s.orders_amount)}`} />
            <Metric icon={Wallet} label="Cobros" value={fmtMXN(s.payments_amount)} />
            <Metric icon={RotateCcw} label="Devoluciones" value={String(s.returns_count)} />
            <Metric icon={MapPin} label="Km recorridos" value={s.km_traveled.toFixed(1)} />
            <Metric icon={Clock} label="Tiempo prom." value={`${s.avg_time_per_client_min.toFixed(0)} min`} />
          </div>

          {s.top_clients.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top clientes del día</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {s.top_clients.map((c: any) => (
                  <div key={c.id} className="flex justify-between border-b py-1 last:border-none">
                    <span>{c.name}</span>
                    <span className="font-medium">{fmtMXN(c.amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Nota / narrativa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                rows={3}
                placeholder="Comentarios de la jornada, pendientes, incidencias…"
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
              />
              <Button onClick={() => mutate.mutate()} disabled={mutate.isPending}>
                <CalendarCheck2 className="mr-2 h-4 w-4" />
                Guardar cierre
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {history.isLoading ? (
            <Skeleton className="h-20" />
          ) : (history.data?.closes ?? []).length === 0 ? (
            <p className="text-muted-foreground">Aún no hay cierres guardados.</p>
          ) : (
            history.data!.closes.map((c: any) => (
              <div key={c.id} className="flex justify-between rounded border p-2">
                <div>
                  <div className="font-medium">{c.close_date}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.visits_count} visitas · {c.orders_count} pedidos · {c.km_traveled} km
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmtMXN(Number(c.orders_amount))}</div>
                  <div className="text-xs text-muted-foreground">Cobros {fmtMXN(Number(c.payments_amount))}</div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/rep/cierre")({
  head: () => ({ meta: [{ title: "Cierre de día · Panel Rep" }] }),
  component: Page,
});
