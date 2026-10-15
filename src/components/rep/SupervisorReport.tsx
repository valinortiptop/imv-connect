import { useEffect, useMemo, useState } from "react";
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
import { Download, Filter, Sparkles, Loader2, Star, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

type FavReport = { id: string; name: string; description: string; report_type: string; rep_id: string };
const FAV_KEY = "imv.supervisor.report-favs";
const DETAIL_COLS: Record<string, string> = {
  pending: "Sin visitar",
  visited: "Visitados",
  cartera: "Cartera",
};

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

  const [favs, setFavs] = useState<FavReport[]>([]);
  const [detail, setDetail] = useState<{ title: string; names: string[] } | null>(null);
  const [detailQ, setDetailQ] = useState("");
  useEffect(() => {
    try {
      setFavs(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
    } catch {
      /* ignore */
    }
  }, []);
  const saveFavs = (next: FavReport[]) => {
    setFavs(next);
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  };
  const currentFav = favs.find(
    (f) => f.description === description.trim() && f.report_type === reportType && f.rep_id === repId,
  );
  const toggleFav = () => {
    if (currentFav) {
      saveFavs(favs.filter((f) => f.id !== currentFav.id));
      toast.success("Quitado de favoritos");
      return;
    }
    if (!description.trim() && reportType === "auto") {
      toast.error("Escribe una descripción o elige un tipo de reporte");
      return;
    }
    const suggested =
      description.trim().slice(0, 60) ||
      REPORT_TYPE_LABELS[reportType as keyof typeof REPORT_TYPE_LABELS] ||
      "Reporte";
    const name = window.prompt("Nombre del reporte favorito", suggested);
    if (!name?.trim()) return;
    saveFavs([
      ...favs,
      { id: crypto.randomUUID(), name: name.trim(), description: description.trim(), report_type: reportType, rep_id: repId },
    ]);
    toast.success("Guardado en favoritos");
  };

  const fn = useServerFn(customSupervisorReportFn);
  const run = useMutation({
    mutationFn: (o?: { description: string; report_type: string; rep_id: string }) =>
      fn({
        data: {
          from,
          to,
          rep_id: (o?.rep_id ?? repId) || undefined,
          report_type: (o?.report_type ?? reportType) as any,
          description: (o?.description ?? description).trim() || undefined,
        },
      }),
    onError: (e: any) => toast.error(e?.message ?? "Error al generar el reporte"),
  });

  const result = run.data as any;
  const columns: Col[] = result?.columns ?? [];
  const rows: any[] = result?.rows ?? [];
  const filteredDetail = useMemo(
    () =>
      (detail?.names ?? []).filter((n) => n.toLowerCase().includes(detailQ.toLowerCase())),
    [detail, detailQ],
  );
  const loadFav = (f: FavReport) => {
    setDescription(f.description);
    setReportType(f.report_type);
    setRepId(f.rep_id);
    run.mutate({ description: f.description, report_type: f.report_type, rep_id: f.rep_id });
  };

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

        {favs.length > 0 && (
          <div>
            <Label className="flex items-center gap-1 text-xs">
              <Star className="h-3 w-3 fill-current text-primary" /> Reportes favoritos
            </Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {favs.map((f) => (
                <span key={f.id} className="inline-flex items-center rounded-full border bg-primary/5 text-xs">
                  <button
                    type="button"
                    onClick={() => loadFav(f)}
                    className="px-2 py-0.5 hover:underline"
                    title={f.description || f.name}
                  >
                    {f.name}
                  </button>
                  <button
                    type="button"
                    aria-label="Quitar favorito"
                    onClick={() => saveFavs(favs.filter((x) => x.id !== f.id))}
                    className="pr-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={toggleFav} title="Guardar en favoritos">
            <Star className={`mr-1 h-3 w-3 ${currentFav ? "fill-current text-primary" : ""}`} />
            {currentFav ? "En favoritos" : "Favorito"}
          </Button>
          <Button size="sm" onClick={() => run.mutate(undefined)} disabled={run.isPending}>
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
                          {r._details?.[c.key] && r._details[c.key].length > 0 ? (
                            <HoverCard openDelay={150}>
                              <HoverCardTrigger asChild>
                                <button
                                  type="button"
                                  className="font-medium text-primary underline-offset-2 hover:underline"
                                  onClick={() => {
                                    setDetailQ("");
                                    setDetail({
                                      title: `${DETAIL_COLS[c.key] ?? c.label} · ${r.name}`,
                                      names: r._details[c.key],
                                    });
                                  }}
                                >
                                  {fmtCell(r[c.key], c)}
                                </button>
                              </HoverCardTrigger>
                              <HoverCardContent align="end" className="w-72 text-left">
                                <div className="mb-1 text-xs font-semibold">
                                  {DETAIL_COLS[c.key] ?? c.label} · {r.name}
                                </div>
                                <ul className="space-y-0.5 text-xs">
                                  {r._details[c.key].slice(0, 8).map((n: string, i: number) => (
                                    <li key={i} className="truncate">{n}</li>
                                  ))}
                                </ul>
                                {r._details[c.key].length > 8 && (
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    +{r._details[c.key].length - 8} más · clic para ver todos
                                  </div>
                                )}
                              </HoverCardContent>
                            </HoverCard>
                          ) : (
                            fmtCell(r[c.key], c)
                          )}
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
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {detail?.title} ({detail?.names.length ?? 0})
            </DialogTitle>
          </DialogHeader>
          <Input placeholder="Buscar cliente…" value={detailQ} onChange={(e) => setDetailQ(e.target.value)} />
          <ul className="max-h-[60vh] divide-y overflow-y-auto text-sm">
            {filteredDetail.map((n, i) => (
              <li key={i} className="py-1.5">{n}</li>
            ))}
            {!filteredDetail.length && (
              <li className="py-4 text-center text-muted-foreground">Sin resultados</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
