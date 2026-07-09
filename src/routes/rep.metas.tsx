import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyTargetFn } from "@/lib/rep-performance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Target } from "lucide-react";
import AIPageInsights from "@/components/ai/AIPageInsights";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

function Page() {
  const fn = useServerFn(getMyTargetFn);
  const q = useQuery({ queryKey: ["rep-target"], queryFn: () => fn({ data: {} }) });

  const target = q.data?.target;
  const progress = q.data?.progress;

  const monthPct = target && progress
    ? Math.min(100, (progress.month_amount / Number(target.target_amount || 1)) * 100)
    : 0;
  const dayPct = target && progress
    ? Math.min(100, (progress.today_amount / Number(target.min_daily || 1)) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-metas" />
      <div>
        <h1 className="text-2xl font-semibold">Metas y avance</h1>
        <p className="text-sm text-muted-foreground">
          Meta del mes y mínimo diario configurados por tu supervisor.
        </p>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : !target ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Target className="mx-auto mb-2 h-8 w-8 opacity-50" />
            Todavía no tienes una meta asignada para este mes.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Meta del mes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">{fmtMXN(progress?.month_amount ?? 0)}</span>
                <span className="text-sm text-muted-foreground">
                  de {fmtMXN(Number(target.target_amount))}
                </span>
              </div>
              <Progress value={monthPct} />
              <div className="text-xs text-muted-foreground">
                {progress?.orders_count ?? 0} pedidos en el mes · {monthPct.toFixed(0)}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Mínimo diario</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">{fmtMXN(progress?.today_amount ?? 0)}</span>
                <span className="text-sm text-muted-foreground">
                  meta {fmtMXN(Number(target.min_daily))}
                </span>
              </div>
              <Progress value={dayPct} />
            </CardContent>
          </Card>

          {target.target_by_lab && Object.keys(target.target_by_lab).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Por laboratorio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {Object.entries(target.target_by_lab as Record<string, number>).map(([lab, amt]) => (
                  <div key={lab} className="flex justify-between border-b py-1 last:border-none">
                    <span>{lab}</span>
                    <span className="font-medium">{fmtMXN(Number(amt))}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute("/rep/metas")({
  head: () => ({ meta: [{ title: "Metas · Panel Rep" }] }),
  component: Page,
});
