import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getLabRiskPanelFn } from "@/lib/rep.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const riskColor: Record<string, string> = {
  alto: "bg-red-500/15 text-red-600 border-red-500/30",
  medio: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  bajo: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  estable: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

export default function LabRiskPanel({ maxLabs, compact }: { maxLabs?: number; compact?: boolean } = {}) {
  const fetchLabs = useServerFn(getLabRiskPanelFn);
  const q = useQuery({ queryKey: ["rep-lab-risk"], queryFn: () => fetchLabs() });

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError)
    return <p className="text-sm text-muted-foreground">No se pudo cargar el análisis de laboratorios.</p>;

  const labs = q.data?.labs ?? [];
  const shown = maxLabs ? labs.slice(0, maxLabs) : labs;

  if (shown.length === 0) {
    return <p className="text-sm text-muted-foreground">Aún no hay suficientes datos para evaluar laboratorios.</p>;
  }

  return (
    <div className="space-y-3">
      {shown.map((l: any) => {
        const dropPct = Math.round(l.drop_pct * 100);
        const isDown = l.drop_pct > 0;
        return (
          <Card key={l.laboratorio_id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="min-w-0">
                <CardTitle className="text-base">{l.nombre}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {l.clientes_recent} clientes activos (60d) · antes {l.clientes_previous}
                </p>
              </div>
              <Badge variant="outline" className={riskColor[l.risk_level] ?? ""}>
                {l.risk_level === "alto" && <AlertTriangle className="mr-1 h-3 w-3" />}
                {l.risk_level}
              </Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Últimos 60d</div>
                  <div className="mt-0.5 font-semibold">{fmtMXN(l.importe_recent)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">60d previos</div>
                  <div className="mt-0.5 font-semibold">{fmtMXN(l.importe_previous)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Variación</div>
                  <div
                    className={`mt-0.5 flex items-center gap-1 font-semibold ${isDown ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {isDown ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {isDown ? "-" : "+"}
                    {Math.abs(dropPct)}%
                  </div>
                </div>
              </div>

              {!compact && l.clientes_perdidos?.length > 0 && (
                <div className="mt-3 rounded-md border border-dashed border-border p-2">
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                    Clientes que dejaron de comprar este laboratorio (posible migración):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {l.clientes_perdidos.map((c: any) => (
                      <Link
                        key={c.cliente_id}
                        to="/rep/clientes/$id"
                        params={{ id: c.cliente_id }}
                        className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-muted"
                      >
                        {c.nombre} · {fmtMXN(c.importe_prev)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
