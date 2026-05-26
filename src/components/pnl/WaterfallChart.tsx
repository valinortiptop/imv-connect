// @ts-nocheck
import { useMemo, useState } from "react";
import { mxn } from "./pnlHelpers";
import { cn } from "@/lib/utils";

export interface WaterfallBar {
  label: string;
  value: number;        // signed: positive = inflow, negative = outflow
  isTotal?: boolean;    // if true, bar shows absolute total value (not a delta)
  accent?: "revenue" | "cost" | "offset" | "profit" | "loss";
}

interface Segment extends WaterfallBar {
  start: number;  // running total at step start (or 0 for totals)
  end: number;    // running total at step end (or absolute value for totals)
  idx: number;
}

/**
 * CSS-based waterfall chart. Deltas float on the running total; totals
 * are anchored to zero. The bar area is scaled to 80% of the container
 * so value labels sit above without clipping, and every bar gets at
 * least 3px of visible height so $0 rows remain readable.
 *
 * Hovering a column highlights it and reveals a tooltip with the
 * running-total context (before → after), so the user can reconstruct
 * the math at any step.
 */
export function WaterfallChart({ bars }: { bars: WaterfallBar[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { segments, minVal, maxVal } = useMemo(() => {
    let running = 0;
    const segs: Segment[] = bars.map((b, i) => {
      const start = b.isTotal ? 0 : running;
      const end = b.isTotal ? b.value : running + b.value;
      running = b.isTotal ? b.value : end;
      return { ...b, start, end, idx: i };
    });
    const all = segs.flatMap((s) => [s.start, s.end, 0]);
    // Add a small headroom so tall bars don't touch the ceiling
    const rawMax = Math.max(...all, 0);
    const rawMin = Math.min(...all, 0);
    const pad = (rawMax - rawMin) * 0.05 || 1;
    return { segments: segs, minVal: rawMin - pad, maxVal: rawMax + pad };
  }, [bars]);

  const range = maxVal - minVal || 1;
  // Bar area takes 82% of the vertical space; the rest is reserved for
  // floating value labels. This prevents the label-clipping we had before.
  const BAR_AREA = 0.82;

  const pctOf = (v: number) => ((v - minVal) / range) * 100 * BAR_AREA;
  const zeroPct = pctOf(0);

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <div className="min-w-[880px] relative">
          {/* Chart canvas */}
          <div className="relative h-[320px] px-3">
            {/* Zero baseline */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/40 pointer-events-none"
              style={{ bottom: `${zeroPct}%` }}
            >
              <span className="absolute -left-1 -translate-x-full -translate-y-1/2 top-0 text-[10px] text-muted-foreground/60 pr-1">0</span>
            </div>

            <div className="flex items-end h-full gap-3">
              {segments.map((s) => {
                const top = Math.max(s.start, s.end);
                const bottom = Math.min(s.start, s.end);
                const topPct = pctOf(top);
                const bottomPct = pctOf(bottom);
                const rawHeight = topPct - bottomPct;
                const heightPct = Math.max(rawHeight, 0.8);  // min ~2.5px at 320px so zeros are visible
                const color = classFor(s.accent ?? (s.isTotal ? (s.value >= 0 ? "profit" : "loss") : s.value >= 0 ? "revenue" : "cost"));
                const isZero = Math.abs(s.end - s.start) < 0.5;
                const hovered = hoverIdx === s.idx;

                // Value label: for tall bars (>60% of scaled area), drop the label INSIDE at the top
                // so it never clips; for shorter bars, float it above the bar.
                const insideLabel = rawHeight > 60;
                const labelBottom = insideLabel
                  ? `calc(${topPct}% - 18px)`
                  : `calc(${topPct}% + 4px)`;

                // Formatted value string with correct sign
                const rounded = Math.abs(s.value) < 0.5 ? 0 : s.value;
                const valueStr = rounded === 0
                  ? "$0"
                  : (!s.isTotal && rounded > 0 ? "+" : "") + mxn.format(rounded);

                return (
                  <div
                    key={s.idx}
                    className="flex-1 min-w-[78px] h-full relative cursor-default"
                    onMouseEnter={() => setHoverIdx(s.idx)}
                    onMouseLeave={() => setHoverIdx(null)}
                  >
                    {/* Hover column highlight */}
                    {hovered && <div className="absolute inset-0 rounded-md bg-foreground/[0.04] pointer-events-none" />}

                    {/* Bar */}
                    <div
                      className={cn(
                        "absolute left-1/2 -translate-x-1/2 rounded-sm transition-all",
                        hovered ? "w-14 opacity-100" : "w-12 opacity-95",
                        isZero && "opacity-50",
                        color.bar,
                      )}
                      style={{ bottom: `${bottomPct}%`, height: `${heightPct}%` }}
                    />

                    {/* Value label */}
                    <div
                      className={cn(
                        "absolute left-1/2 -translate-x-1/2 text-xs tabular-nums font-semibold whitespace-nowrap",
                        insideLabel ? "text-white drop-shadow" : color.text,
                      )}
                      style={{ bottom: labelBottom }}
                    >
                      {valueStr}
                    </div>

                    {/* Hover tooltip */}
                    {hovered && (
                      <div
                        className="absolute left-1/2 -translate-x-1/2 z-10 rounded-lg border bg-popover shadow-lg p-3 text-xs whitespace-nowrap pointer-events-none"
                        style={{ bottom: `calc(${Math.max(topPct, 40)}% + 28px)` }}
                      >
                        <p className="font-semibold text-sm mb-1">{s.label}</p>
                        {s.isTotal ? (
                          <p className="tabular-nums">
                            Subtotal: <span className={cn("font-semibold", color.text)}>{mxn.format(s.value)}</span>
                          </p>
                        ) : (
                          <>
                            <div className="flex justify-between gap-4 tabular-nums">
                              <span className="text-muted-foreground">Antes</span>
                              <span>{mxn.format(s.start)}</span>
                            </div>
                            <div className="flex justify-between gap-4 tabular-nums">
                              <span className="text-muted-foreground">Cambio</span>
                              <span className={cn("font-semibold", color.text)}>{valueStr}</span>
                            </div>
                            <div className="flex justify-between gap-4 tabular-nums border-t mt-1 pt-1">
                              <span className="text-muted-foreground">Después</span>
                              <span className="font-semibold">{mxn.format(s.end)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* X axis labels (fixed zone so they never overlap the chart) */}
          <div className="flex gap-3 px-3 pt-2 border-t border-border/40">
            {segments.map((s) => (
              <div
                key={s.idx}
                className={cn(
                  "flex-1 min-w-[78px] text-[11px] text-center leading-tight py-2",
                  s.isTotal ? "font-semibold text-foreground" : "text-muted-foreground",
                  hoverIdx === s.idx && "text-foreground",
                )}
              >
                {s.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function classFor(k: WaterfallBar["accent"] | undefined): { bar: string; text: string } {
  switch (k) {
    case "revenue": return { bar: "bg-green-500/80", text: "text-green-500" };
    case "cost":    return { bar: "bg-red-500/80",   text: "text-red-400" };
    case "offset":  return { bar: "bg-blue-500/80",  text: "text-blue-400" };
    case "profit":  return { bar: "bg-emerald-500",  text: "text-emerald-400" };
    case "loss":    return { bar: "bg-red-600",      text: "text-red-500" };
    default:        return { bar: "bg-muted-foreground/50", text: "text-foreground" };
  }
}
