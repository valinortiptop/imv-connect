import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import {
  customSupervisorReportFn,
  REPORT_TYPES,
  REPORT_TYPE_LABELS,
} from "@/lib/rep-performance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Filter, Sparkles, Loader2 } from "lucide-react";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));

type Col = { key: string; label: string; align?: "left" | "right"; format?: "money" | "pct" };

const fmtCell = (v: any, c: Col) => {
  if (c.format === "money") return fmtMXN(Number(v || 0));
  if (c.format === "pct") return `${Number(v || 0)}%`;
  return v ?? "—";
};

const TOTAL_LABELS: Record<string, string> = {
  visits: "Visitas",
  visitados: "Clientes visitados",
  orders: "Pedidos",
  amount: "Monto",
  clientes: "Clientes",
  cartera: "Cartera",
  rutas: "Rutas",
  planeadas: "Paradas planeadas",
  visitadas: "Paradas visitadas",
};

const EXAMPLES = [
  "Quiero ver cuántas visitas hizo cada representante y cuánto duraron",
  "Necesito saber qué clientes de la cartera no fueron visitados",
  "Muéstrame el cumplimiento de las rutas planeadas por día",
];

export default function SupervisorReport() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400_000);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [repId, setRepId] = useState("");
  const [reportType, setReportType] = useState<string>("auto");
  const [description, setDescription] = useState("");

  const fn = useServerFn(customSupervisorReportFn);
  const run = useMutation({
    mutationFn: () =>
      fn({
        data: {
          from,
          to,
          rep_id: repId ? repId : undefined,
          report_type: reportType as any,
          description: description.trim() || undefined,
        },
      }),
    onError: (e: any) => toast.error(e?.message ?? "Error al generar el reporte"),
  });

  const result = run.data as any;
  const columns: Col[] = result?.columns ?? [];
  const rows: any[] = result?.rows ?? [];

  const download = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [columns.map((c) => esc(c.label)).join(",")];
    for (const r of rows) lines.push(columns.map((c) => esc(r[c.key])).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_${result?.report_type ?? "supervisor"}_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="h-4 w-4" /> Reporte con IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Tipo de reporte</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático (según descripción)</SelectItem>
                {REPORT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {REPORT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Rep ID (opcional)</Label>
            <Input placeholder="uuid" value={repId} onChange={(e) => setRepId(e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="text-xs">Describe el reporte que necesitas</Label>
          <Textarea
            rows={3}
            placeholder="Ej. Quiero ver qué clientes no se visitaron esta semana y qué representante los tiene asignados"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setDescription(ex)}
                className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3 w-3" />
            )}
            Generar reporte
          </Button>
          <Button size="sm" variant="outline" onClick={download} disabled={!rows.length}>
            <Download className="mr-1 h-3 w-3" /> CSV
          </Button>
        </div>

        {result && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-primary/10 px-2 py-0.5 font-medium">
                {result.report_label}
              </span>
              {result.ai_reason && (
                <span className="text-xs text-muted-foreground">{result.ai_reason}</span>
              )}
            </div>

            {result.analysis && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> Análisis IA
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed">{result.analysis}</p>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-3 rounded border bg-muted/40 p-2 text-sm">
              {Object.entries(result.totals ?? {}).map(([k, v]) => (
                <div key={k}>
                  {TOTAL_LABELS[k] ?? k}:{" "}
                  <span className="font-semibold">
                    {k === "amount" ? fmtMXN(Number(v)) : String(v)}
                  </span>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        className={`py-1 ${c.align === "right" ? "text-right" : "text-left"}`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b last:border-none">
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={`py-1 ${c.align === "right" ? "text-right" : "text-left"}`}
                        >
                          {fmtCell(r[c.key], c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={columns.length} className="py-4 text-center text-muted-foreground">
                        Sin datos para el periodo seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
