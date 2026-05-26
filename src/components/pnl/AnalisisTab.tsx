// @ts-nocheck
import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Sparkles, Target } from "lucide-react";
import { mxn, pct, parseDate, previousPeriod, deltaPct } from "./pnlHelpers";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/** Snapshot of a computed period — feeds What-If + Compare. */
export interface PnlSnapshot {
  ingresos: number;
  ingresosSinIva: number;
  cogs: number;
  cogsBonif: number;
  bonificacionRecibida: number;
  logistica: number;
  maniobraCentralOut: number;
  maniobraFactoryIn: number;
  nomina: number;
  gastosRecurrentes: number;
  gastosOneTime: number;
  utilidadBruta: number;
  utilidadNeta: number;
}

export function AnalisisTab({
  snapshot,
  previous,
  dateFrom, dateTo,
  fixedMonthlyBurn,
}: {
  snapshot: PnlSnapshot;
  previous: PnlSnapshot | null;
  dateFrom: string;
  dateTo: string;
  fixedMonthlyBurn: number;
}) {
  // Sliders
  const [logisticsPct, setLogisticsPct] = useState(100);
  const [nominaPct, setNominaPct] = useState(100);
  const [gastosPct, setGastosPct] = useState(100);
  const [ingresosPct, setIngresosPct] = useState(100);

  const whatIf = useMemo(() => {
    const ing = snapshot.ingresosSinIva * (ingresosPct / 100);
    // Scale COGS roughly proportional to revenue
    const cogs = snapshot.cogsBonif * (ingresosPct / 100);
    const log = snapshot.logistica * (logisticsPct / 100);
    const nom = snapshot.nomina * (nominaPct / 100);
    const gas = (snapshot.gastosRecurrentes + snapshot.gastosOneTime) * (gastosPct / 100);
    const util = ing - cogs - log - nom - gas;
    const margen = ing > 0 ? (util / ing) * 100 : 0;
    return { ingresos: ing, cogs, log, nom, gas, util, margen };
  }, [snapshot, ingresosPct, logisticsPct, nominaPct, gastosPct]);

  const baselineUtil = snapshot.utilidadNeta;
  const deltaUtil = whatIf.util - baselineUtil;

  /* Break-even: fixed monthly burn / gross margin %  → needed revenue */
  const grossMarginPct = snapshot.ingresosSinIva > 0
    ? (snapshot.ingresosSinIva - snapshot.cogsBonif) / snapshot.ingresosSinIva
    : 0;
  const breakEvenRevenue = grossMarginPct > 0 ? fixedMonthlyBurn / grossMarginPct : null;
  const breakEvenGap = breakEvenRevenue !== null ? snapshot.ingresosSinIva - breakEvenRevenue : null;

  return (
    <div className="space-y-6">
      {/* Break-even */}
      <div className="rounded-xl border p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-500" />
          <p className="text-sm font-semibold">Punto de equilibrio</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BreakEvenStat label="Burn fijo mensual" value={mxn.format(fixedMonthlyBurn)} hint="Renta + nómina recurrente" />
          <BreakEvenStat label="Margen bruto actual" value={pct(grossMarginPct * 100)} hint="Con bonificación" />
          <BreakEvenStat
            label="Ingresos para cubrir gastos"
            value={breakEvenRevenue === null ? "—" : mxn.format(breakEvenRevenue)}
            hint={breakEvenGap === null ? "Se necesita margen bruto > 0" : breakEvenGap >= 0 ? `Cubres +${mxn.format(breakEvenGap)}` : `Faltan ${mxn.format(Math.abs(breakEvenGap))}`}
            tone={breakEvenGap === null ? undefined : breakEvenGap >= 0 ? "positive" : "negative"}
          />
        </div>
      </div>

      {/* What-if */}
      <div className="rounded-xl border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <p className="text-sm font-semibold">What-if sliders</p>
          <p className="text-xs text-muted-foreground ml-auto">Mueve para ver impacto en utilidad neta</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <SliderRow label="Ingresos" pct={ingresosPct} onChange={setIngresosPct} baseline={snapshot.ingresosSinIva} />
          <SliderRow label="Logística" pct={logisticsPct} onChange={setLogisticsPct} baseline={snapshot.logistica} />
          <SliderRow label="Nómina" pct={nominaPct} onChange={setNominaPct} baseline={snapshot.nomina} />
          <SliderRow label="Gastos oficina" pct={gastosPct} onChange={setGastosPct} baseline={snapshot.gastosRecurrentes + snapshot.gastosOneTime} />
        </div>

        <div className="rounded-lg bg-muted/40 p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Utilidad neta simulada</p>
            <p className={cn("text-2xl font-bold tabular-nums", whatIf.util >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(whatIf.util)}</p>
            <p className="text-xs text-muted-foreground">Margen neto {pct(whatIf.margen)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Vs baseline</p>
            <p className={cn("text-xl font-semibold tabular-nums", deltaUtil >= 0 ? "text-green-500" : "text-red-500")}>
              {deltaUtil >= 0 ? "+" : ""}{mxn.format(deltaUtil)}
            </p>
            <p className="text-xs text-muted-foreground">Baseline: {mxn.format(baselineUtil)}</p>
          </div>
        </div>
      </div>

      {/* Compare to previous period */}
      {previous && (
        <div className="rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-semibold">Comparar con período anterior</p>
            <p className="text-xs text-muted-foreground ml-auto">
              {previousPeriodLabel(dateFrom, dateTo)}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Anterior</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead className="text-right">Δ %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <CompareRow label="Ingresos (sin IVA)" c={snapshot.ingresosSinIva} p={previous.ingresosSinIva} />
              <CompareRow label="COGS (con bonif)" c={snapshot.cogsBonif} p={previous.cogsBonif} invert />
              <CompareRow label="Bonificación recibida" c={snapshot.bonificacionRecibida} p={previous.bonificacionRecibida} />
              <CompareRow label="Logística" c={snapshot.logistica} p={previous.logistica} invert />
              <CompareRow label="Nómina" c={snapshot.nomina} p={previous.nomina} invert />
              <CompareRow label="Gastos fijos" c={snapshot.gastosRecurrentes} p={previous.gastosRecurrentes} invert />
              <CompareRow label="Utilidad bruta" c={snapshot.utilidadBruta} p={previous.utilidadBruta} isProfit />
              <CompareRow label="Utilidad neta" c={snapshot.utilidadNeta} p={previous.utilidadNeta} isProfit bold />
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function previousPeriodLabel(from: string, to: string): string {
  const { from: pf, to: pt } = previousPeriod(from, to);
  return `${format(parseDate(pf), "dd MMM", { locale: es })} – ${format(parseDate(pt), "dd MMM", { locale: es })}`;
}

function BreakEvenStat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "positive" | "negative" }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn("text-xl font-bold tabular-nums", tone === "positive" && "text-green-500", tone === "negative" && "text-red-500")}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function SliderRow({ label, pct: current, onChange, baseline }: { label: string; pct: number; onChange: (n: number) => void; baseline: number }) {
  const adjusted = baseline * (current / 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          <span className="tabular-nums">{current}%</span> · baseline {mxn.format(baseline)} → <span className="text-foreground tabular-nums font-medium">{mxn.format(adjusted)}</span>
        </span>
      </div>
      <Slider value={[current]} onValueChange={(v) => onChange(v[0])} min={0} max={200} step={5} />
    </div>
  );
}

function CompareRow({ label, c, p, invert, isProfit, bold }: {
  label: string; c: number; p: number; invert?: boolean; isProfit?: boolean; bold?: boolean;
}) {
  const delta = c - p;
  const dpct = deltaPct(c, p);
  // For cost metrics, an INCREASE is bad (red); for revenue/profit, increase is good (green).
  const isGood = invert ? delta <= 0 : delta >= 0;
  const color = isProfit || invert || label.toLowerCase().includes("ingreso")
    ? (isGood ? "text-green-500" : "text-red-500")
    : "text-muted-foreground";
  return (
    <TableRow>
      <TableCell className={cn(bold && "font-semibold")}>{label}</TableCell>
      <TableCell className={cn("text-right tabular-nums", bold && "font-semibold")}>{mxn.format(c)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{mxn.format(p)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", color)}>{delta >= 0 ? "+" : ""}{mxn.format(delta)}</TableCell>
      <TableCell className={cn("text-right tabular-nums text-xs", color)}>{dpct === null ? "—" : `${dpct >= 0 ? "+" : ""}${dpct.toFixed(1)}%`}</TableCell>
    </TableRow>
  );
}
