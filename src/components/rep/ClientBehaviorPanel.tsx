import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClientProductBehaviorFn } from "@/lib/rep-behavior.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, TrendingUp, Clock, AlertTriangle } from "lucide-react";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const statusMeta: Record<string, { label: string; className: string; icon: any }> = {
  activo: { label: "Activo", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: TrendingUp },
  subiendo: { label: "Subiendo", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", icon: TrendingUp },
  en_baja: { label: "En baja", className: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: TrendingDown },
  dormido: { label: "Dormido", className: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: Clock },
  perdido: { label: "Perdido", className: "bg-red-500/15 text-red-600 border-red-500/30", icon: AlertTriangle },
};

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - ((p - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="text-primary">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function ClientBehaviorPanel({ clienteId }: { clienteId: string }) {
  const fn = useServerFn(getClientProductBehaviorFn);
  const q = useQuery({
    queryKey: ["client-behavior", clienteId],
    queryFn: () => fn({ data: { clienteId } }),
  });

  const grouped = useMemo(() => {
    const skus = q.data?.sku_behavior ?? [];
    return {
      perdido: skus.filter((s: any) => s.status === "perdido"),
      dormido: skus.filter((s: any) => s.status === "dormido"),
      en_baja: skus.filter((s: any) => s.status === "en_baja"),
      subiendo: skus.filter((s: any) => s.status === "subiendo"),
      activo: skus.filter((s: any) => s.status === "activo"),
    };
  }, [q.data]);

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError)
    return <p className="text-sm text-muted-foreground">No se pudo cargar el comportamiento.</p>;

  const trend = q.data?.ticket_trend ?? [];
  const trendTotals = trend.map((t: any) => t.total);
  const lastTicket = trend.length > 0 ? trend[trend.length - 1].total : 0;
  const prevTicket = trend.length > 1 ? trend[trend.length - 2].total : lastTicket;
  const trendDelta = prevTicket > 0 ? Math.round(((lastTicket - prevTicket) / prevTicket) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Ticket trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tendencia de ventas (12m)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold md:text-2xl">{fmtMXN(lastTicket)}</div>
              <div className="text-xs text-muted-foreground">
                {trend.length > 0 ? `Mes ${trend[trend.length - 1].month}` : "Sin ventas"}
                {trendDelta !== 0 && (
                  <span className={trendDelta >= 0 ? " text-emerald-600" : " text-red-600"}>
                    {" "}· {trendDelta >= 0 ? "+" : ""}{trendDelta}% vs mes previo
                  </span>
                )}
              </div>
            </div>
            <Sparkline points={trendTotals} />
          </div>
        </CardContent>
      </Card>

      {(["perdido", "dormido", "en_baja", "subiendo"] as const).map((key) => {
        const list = grouped[key];
        if (list.length === 0) return null;
        const meta = statusMeta[key];
        const Icon = meta.icon;
        return (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4" />
                {key === "perdido" && "Productos que dejó de comprar"}
                {key === "dormido" && "Productos con periodo vencido"}
                {key === "en_baja" && "Bajando consumo"}
                {key === "subiendo" && "Subiendo consumo"}
                <span className="text-muted-foreground">({list.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {list.slice(0, 12).map((s: any) => (
                <div
                  key={s.producto_id}
                  className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.nombre}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {s.sku} · {s.marca ?? "—"} · {s.qty_12m} u/12m
                      {s.avg_gap_days ? ` · c/${s.avg_gap_days}d` : ""}
                      {s.days_since_last != null ? ` · última hace ${s.days_since_last}d` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={meta.className}>
                      {s.delta_pct >= 0 ? "+" : ""}{s.delta_pct}%
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
