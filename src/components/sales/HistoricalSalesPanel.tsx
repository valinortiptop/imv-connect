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

type Row = {
  fecha: string;
  client_name: string | null;
  rep_name: string | null;
  lab_name: string | null;
  sku: string | null;
  description: string | null;
  quantity: number;
  revenue: number;
  invoice_no: string | null;
};

export function HistoricalSalesPanel(props: Filters) {
  const { from, to, clientId, repId, productId, laboratorioId, title = "Historial de ventas (importado)", compact } = props;

  const { data, isLoading } = useQuery({
    queryKey: ["ventas_unified", "historico", { from, to, clientId, repId, productId, laboratorioId }],
    queryFn: async () => {
      let q = supabase
        .from("v_ventas_unified" as any)
        .select("fecha, client_name, rep_name, lab_name, sku, description, quantity, revenue, invoice_no, client_id, representante_id, product_id, laboratorio_id, fuente")
        .eq("fuente", "historico");
      if (from) q = q.gte("fecha", from);
      if (to) q = q.lte("fecha", to);
      if (clientId) q = q.eq("client_id", clientId);
      if (repId) q = q.eq("representante_id", repId);
      if (productId) q = q.eq("product_id", productId);
      if (laboratorioId) q = q.eq("laboratorio_id", laboratorioId);
      const { data, error } = await q.limit(50000).order("fecha", { ascending: false });
      if (error) throw error;
      return (data as any[]) as Row[];
    },
  });

  const rows = data || [];
  if (!isLoading && rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const qty = rows.reduce((s, r) => s + Number(r.quantity || 0), 0);
  const invoices = new Set(rows.map((r) => r.invoice_no).filter(Boolean)).size;

  const byMonth = new Map<string, number>();
  const byRep = new Map<string, number>();
  const byClient = new Map<string, number>();
  const byLab = new Map<string, number>();
  const byProduct = new Map<string, number>();
  for (const r of rows) {
    const m = (r.fecha || "").slice(0, 7);
    byMonth.set(m, (byMonth.get(m) || 0) + Number(r.revenue || 0));
    if (r.rep_name) byRep.set(r.rep_name, (byRep.get(r.rep_name) || 0) + Number(r.revenue || 0));
    if (r.client_name) byClient.set(r.client_name, (byClient.get(r.client_name) || 0) + Number(r.revenue || 0));
    if (r.lab_name) byLab.set(r.lab_name, (byLab.get(r.lab_name) || 0) + Number(r.revenue || 0));
    const p = r.description || r.sku;
    if (p) byProduct.set(p, (byProduct.get(p) || 0) + Number(r.revenue || 0));
  }
  const top = (m: Map<string, number>, n = 5) =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> {title}
          </CardTitle>
          <Badge variant="secondary" className="font-normal">
            {isLoading ? "…" : `${rows.length.toLocaleString()} líneas`}
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
            <TopBlock title="Por mes" rows={Array.from(byMonth.entries()).sort((a, b) => (a[0] > b[0] ? 1 : -1))} />
            <TopBlock title="Top representantes" rows={top(byRep)} />
            <TopBlock title="Top clientes" rows={top(byClient)} />
            <TopBlock title="Top laboratorios" rows={top(byLab)} />
            <TopBlock title="Top productos" rows={top(byProduct)} />
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
  if (rows.length === 0) return null;
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
