// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, TrendingUp } from "lucide-react";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);

type Filters = {
  from?: string;
  to?: string;
  clientId?: string;
  repId?: string;
  productId?: string;
  laboratorioId?: string;
  title?: string;
  compact?: boolean;
};

type Stats = {
  totals: { lines: number; revenue: number; quantity: number; invoices: number };
  by_month: { k: string; v: number }[];
  top_rep: { k: string; v: number }[];
  top_client: { k: string; v: number }[];
  top_lab: { k: string; v: number }[];
  top_product: { k: string; v: number }[];
};

export function HistoricalSalesPanel(props: Filters) {
  const { from, to, clientId, repId, productId, laboratorioId, title = "Historial de ventas (importado)", compact } = props;

  const { data, isLoading } = useQuery({
    queryKey: ["ventas_unified_stats", { from, to, clientId, repId, productId, laboratorioId }],
    queryFn: async (): Promise<Stats | null> => {
      const { data, error } = await (supabase as any).rpc("ventas_unified_stats", {
        p_from: from || null,
        p_to: to || null,
        p_client_id: clientId || null,
        p_rep_id: repId || null,
        p_product_id: productId || null,
        p_lab_id: laboratorioId || null,
        p_fuente: "historico",
        p_top_n: 5,
      });
      if (error) throw error;
      return data as Stats;
    },
    staleTime: 60_000,
  });

  const lines = data?.totals?.lines ?? 0;
  if (!isLoading && lines === 0) return null;

  const total = Number(data?.totals?.revenue ?? 0);
  const qty = Number(data?.totals?.quantity ?? 0);
  const invoices = Number(data?.totals?.invoices ?? 0);

  const byMonth: [string, number][] = (data?.by_month ?? []).map((r) => [r.k, Number(r.v)]);
  const top = (rows: { k: string; v: number }[] = []): [string, number][] =>
    rows.map((r) => [r.k, Number(r.v)]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> {title}
          </CardTitle>
          <Badge variant="secondary" className="font-normal">
            {isLoading ? "…" : `${lines.toLocaleString()} líneas`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Ingresos" value={fmtMXN(total)} />
          <Kpi label="Facturas" value={invoices.toLocaleString()} />
          <Kpi label="Piezas" value={qty.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
        </div>

        {!compact && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TopBlock title="Por mes" rows={byMonth} />
            <TopBlock title="Top representantes" rows={top(data?.top_rep)} />
            <TopBlock title="Top clientes" rows={top(data?.top_client)} />
            <TopBlock title="Top laboratorios" rows={top(data?.top_lab)} />
            <TopBlock title="Top productos" rows={top(data?.top_product)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-base font-semibold flex items-center gap-1">
        <TrendingUp className="h-3.5 w-3.5 text-primary" /> {value}
      </div>
    </div>
  );
}

function TopBlock({ title, rows }: { title: string; rows: [string, number][] }) {
  if (!rows || rows.length === 0) return null;
  const max = Math.max(...rows.map(([, v]) => v));
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-medium text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1.5">
        {rows.map(([name, val]) => (
          <div key={name} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate" title={name}>
                {name}
              </span>
              <span className="tabular-nums font-medium">{fmtMXN(val)}</span>
            </div>
            <div className="h-1 rounded bg-muted mt-1 overflow-hidden">
              <div
                className="h-full bg-primary/70"
                style={{ width: `${max ? (val / max) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
