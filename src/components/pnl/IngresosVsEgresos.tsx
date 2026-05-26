// @ts-nocheck
import { useState } from "react";
import { mxn } from "./pnlHelpers";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, TrendingUp, TrendingDown } from "lucide-react";

export interface IngresoRow {
  label: string;
  amount: number; // positive = inflow
  hint?: string;
}
export interface EgresoRow {
  label: string;
  amount: number; // positive magnitude (outflow)
  hint?: string;
}

interface Props {
  ingresos: IngresoRow[];   // e.g. Ventas s/IVA, Bonif real, Reembolso fábrica
  egresos: EgresoRow[];     // e.g. COGS bruto, Logística, Maniobra central, Nómina, Gastos fijos
}

const IN_SHADES = ["bg-emerald-500", "bg-emerald-400", "bg-emerald-300"];
const OUT_SHADES = ["bg-red-500", "bg-red-400", "bg-red-300", "bg-red-600", "bg-rose-400", "bg-rose-300"];

/**
 * Simple two-column summary: everything that ENTERS the business vs everything
 * that LEAVES it, with a single utilidad neta card below that literally shows
 * the subtraction. Hovering any segment/row cross-highlights both the bar and
 * the breakdown line, and shows a floating detail card.
 */
export function IngresosVsEgresos({ ingresos, egresos }: Props) {
  const totalIn = ingresos.reduce((s, r) => s + r.amount, 0);
  const totalOut = egresos.reduce((s, r) => s + r.amount, 0);
  const neto = totalIn - totalOut;
  const margin = totalIn > 0 ? (neto / totalIn) * 100 : 0;

  // Scale both stacks to the larger of the two so bar widths are comparable
  const scaleMax = Math.max(totalIn, totalOut, 1);

  return (
    <div className="w-full space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StackColumn
          title="Ingresos"
          subtitle="Todo lo que entra al negocio"
          total={totalIn}
          rows={ingresos}
          scaleMax={scaleMax}
          tone="in"
        />
        <StackColumn
          title="Egresos"
          subtitle="Todo lo que sale del negocio"
          total={totalOut}
          rows={egresos}
          scaleMax={scaleMax}
          tone="out"
        />
      </div>

      {/* Net card: explicit subtraction */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-sm tabular-nums">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Ingresos</span>
              <span className="font-semibold text-emerald-500">{mxn.format(totalIn)}</span>
            </div>
            <span className="text-2xl text-muted-foreground font-light">−</span>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Egresos</span>
              <span className="font-semibold text-red-500">{mxn.format(totalOut)}</span>
            </div>
            <span className="text-2xl text-muted-foreground font-light">=</span>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Utilidad neta</span>
              <span className={cn("font-bold text-lg", neto >= 0 ? "text-emerald-500" : "text-red-500")}>
                {mxn.format(neto)}
              </span>
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
            neto >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500",
          )}>
            {neto >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            Margen {margin.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function StackColumn({
  title, subtitle, total, rows, scaleMax, tone,
}: {
  title: string;
  subtitle: string;
  total: number;
  rows: { label: string; amount: number; hint?: string }[];
  scaleMax: number;
  tone: "in" | "out";
}) {
  const isIn = tone === "in";
  const shades = isIn ? IN_SHADES : OUT_SHADES;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hovered = hoverIdx !== null ? rows[hoverIdx] : null;
  const hoveredPct = hovered && total > 0 ? (hovered.amount / total) * 100 : 0;

  return (
    <div className={cn(
      "rounded-xl border p-5 transition-colors",
      isIn ? "bg-emerald-500/[0.03] border-emerald-500/20" : "bg-red-500/[0.03] border-red-500/20",
    )}>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={cn(
              "rounded-md p-1.5",
              isIn ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500",
            )}>
              {isIn ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            </div>
            <p className="text-sm font-semibold">{title}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {hovered ? hovered.hint ?? `${hovered.label} · ${hoveredPct.toFixed(1)}% del total` : subtitle}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn(
            "text-xl font-bold tabular-nums transition-all",
            isIn ? "text-emerald-500" : "text-red-500",
          )}>
            {mxn.format(hovered ? hovered.amount : total)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {hovered ? hovered.label : "Total"}
          </p>
        </div>
      </div>

      {/* Stacked horizontal bar that shows proportions */}
      <div className="space-y-3">
        <div
          className="w-full h-10 rounded-md overflow-hidden flex bg-muted/50"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {rows.map((r, i) => {
            const widthPct = (r.amount / scaleMax) * 100;
            if (widthPct < 0.1) return null;
            const shade = shades[i % shades.length];
            const isHovered = hoverIdx === i;
            const dimmed = hoverIdx !== null && !isHovered;
            return (
              <button
                key={r.label}
                type="button"
                className={cn(
                  shade,
                  "h-full border-r border-background/40 last:border-r-0 transition-all cursor-pointer",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-foreground/30",
                  isHovered && "brightness-125 shadow-inner",
                  dimmed && "opacity-40",
                )}
                style={{ width: `${widthPct}%` }}
                onMouseEnter={() => setHoverIdx(i)}
                onFocus={() => setHoverIdx(i)}
                onBlur={() => setHoverIdx(null)}
                aria-label={`${r.label}: ${mxn.format(r.amount)}`}
              />
            );
          })}
        </div>

        {/* Line-item breakdown */}
        <div className="space-y-0.5" onMouseLeave={() => setHoverIdx(null)}>
          {rows.map((r, i) => {
            const pctOfTotal = total > 0 ? (r.amount / total) * 100 : 0;
            const shade = shades[i % shades.length];
            const isHovered = hoverIdx === i;
            const dimmed = hoverIdx !== null && !isHovered;
            return (
              <div
                key={r.label}
                className={cn(
                  "flex items-center gap-3 text-sm rounded-md px-2 py-1.5 -mx-2 cursor-pointer transition-all",
                  isHovered && (isIn ? "bg-emerald-500/10" : "bg-red-500/10"),
                  dimmed && "opacity-50",
                )}
                onMouseEnter={() => setHoverIdx(i)}
              >
                <span className={cn(
                  "h-3 w-3 rounded-sm shrink-0 transition-transform",
                  shade,
                  isHovered && "scale-125",
                )} />
                <div className="flex-1 min-w-0">
                  <p className={cn("truncate", isHovered && "font-medium")}>{r.label}</p>
                  {r.hint && <p className="text-[11px] text-muted-foreground truncate">{r.hint}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold tabular-nums">{mxn.format(r.amount)}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{pctOfTotal.toFixed(1)}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
