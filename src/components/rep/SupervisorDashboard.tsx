import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSupervisorDashboardFn } from "@/lib/rep-analytics.functions";
import Rep360Drawer from "@/components/rep/Rep360Drawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-MX");
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Preset = "hoy" | "7d" | "semana" | "mes" | "30d" | "90d" | "custom";

function presetRange(p: Preset): { days?: number; from?: string; to?: string } {
  const now = new Date();
  if (p === "hoy") return { from: iso(now), to: iso(now) };
  if (p === "semana") {
    const s = new Date(now);
    s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    return { from: iso(s), to: iso(now) };
  }
  if (p === "mes") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: iso(s), to: iso(now) };
  }
  if (p === "7d") return { days: 7 };
  if (p === "30d") return { days: 30 };
  if (p === "90d") return { days: 90 };
  return {};
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "7d" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "custom", label: "Personalizado" },
];

type SortKey =
  | "rep_nombre"
  | "visitas"
  | "pedidos"
  | "ratio"
  | "clientes_unicos"
  | "duracion_prom_min"
  | "ticket_prom"
  | "ventas";

export default function SupervisorDashboard() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("ventas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openRep, setOpenRep] = useState<string | null>(null);

  const range = preset === "custom" ? { from, to } : presetRange(preset);

  const fetchDash = useServerFn(getSupervisorDashboardFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["supervisor-dashboard", range.days ?? null, range.from ?? null, range.to ?? null],
    queryFn: () =>
      fetchDash({
        data: {
          days: range.days ?? 30,
          ...(range.from ? { from: range.from, to: range.to } : {}),
        },
      }),
  });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "rep_nombre" ? "asc" : "desc");
    }
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = (data?.rows ?? []).filter((r) =>
      needle ? String(r.rep_nombre ?? "").toLowerCase().includes(needle) : true,
    );
    if (onlyActive) list = list.filter((r) => r.visitas > 0 || r.pedidos > 0 || r.ventas > 0);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (typeof av === "string" || typeof bv === "string")
        return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
      return ((Number(av ?? 0) - Number(bv ?? 0)) as number) * dir;
    });
  }, [data, q, onlyActive, sortKey, sortDir]);

  const shown = useMemo(
    () => ({
      visits: rows.reduce((a, r) => a + r.visitas, 0),
      pedidos: rows.reduce((a, r) => a + r.pedidos, 0),
      ventas: rows.reduce((a, r) => a + r.ventas, 0),
    }),
    [rows],
  );

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <TableHead className={right ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${right ? "justify-end" : ""}`}
      >
        {label}
        {sortKey === k &&
          (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  if (error) return <p className="text-sm text-destructive">Error: {(error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold md:text-2xl">Panel supervisor</h1>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={preset === p.key ? "default" : "outline"}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {preset === "custom" && (
              <>
                <div className="space-y-1">
                  <Label className="text-[11px]">Desde</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Hasta</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-[11px]">Buscar representante</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre…" />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                variant={onlyActive ? "default" : "outline"}
                onClick={() => setOnlyActive((v) => !v)}
              >
                Solo con actividad
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {/* KPI stat rail: horizontal scroll on mobile, 3-col grid desktop */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 [&>*]:snap-start">
            <Card className="w-[70%] shrink-0 md:w-auto md:shrink">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Visitas</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{shown.visits}</CardContent>
            </Card>
            <Card className="w-[70%] shrink-0 md:w-auto md:shrink">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pedidos</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{shown.pedidos}</CardContent>
            </Card>
            <Card className="w-[70%] shrink-0 md:w-auto md:shrink">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ventas</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{money(shown.ventas)}</CardContent>
            </Card>
          </div>

          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Rendimiento por representante</CardTitle>
              <Badge variant="outline" className="text-[10px]">{rows.length} reps</Badge>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <Th k="rep_nombre" label="Representante" />
                    <Th k="visitas" label="Visitas" right />
                    <Th k="pedidos" label="Pedidos" right />
                    <Th k="ratio" label="Ratio V→P" right />
                    <Th k="clientes_unicos" label="Clientes" right />
                    <Th k="duracion_prom_min" label="Duración prom." right />
                    <Th k="ticket_prom" label="Ticket prom." right />
                    <Th k="ventas" label="Ventas" right />
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.rep_id}
                      onClick={() => setOpenRep(r.rep_id)}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">{r.rep_nombre}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.visitas}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.pedidos}</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.ratio * 100).toFixed(0)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{r.clientes_unicos}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.duracion_prom_min}m</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.ticket_prom)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(r.ventas)}</TableCell>
                      <TableCell className="w-8 text-right">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Sin datos en el período</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile card list */}
          <div className="space-y-2 md:hidden">
            <h2 className="text-sm font-semibold">Rendimiento por rep</h2>
            {rows.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Sin datos en el período
              </p>
            )}
            {rows.map((r) => (
              <Card
                key={r.rep_id}
                onClick={() => setOpenRep(r.rep_id)}
                className="cursor-pointer active:opacity-80"
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {r.rep_nombre}
                    </span>
                    <span className="shrink-0 text-base font-bold tabular-nums">
                      {money(r.ventas)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                    <span>Visitas: <b className="text-foreground">{r.visitas}</b></span>
                    <span>Pedidos: <b className="text-foreground">{r.pedidos}</b></span>
                    <span>Ratio V→P: <b className="text-foreground">{(r.ratio * 100).toFixed(0)}%</b></span>
                    <span>Clientes: <b className="text-foreground">{r.clientes_unicos}</b></span>
                    <span>Duración: <b className="text-foreground">{r.duracion_prom_min}m</b></span>
                    <span>Ticket: <b className="text-foreground">{money(r.ticket_prom)}</b></span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Rep360Drawer repId={openRep} onOpenChange={(v) => !v && setOpenRep(null)} />
    </div>
  );
}
