import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type FlowNode = {
  id: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  /** grid col (1-based) */
  col: number;
  /** grid row (1-based) */
  row: number;
  to: string;
  /** optional live count/badge */
  count?: number | string | null;
  /** highlight the node */
  accent?: "primary" | "muted" | "success" | "warning" | "danger";
};

export type FlowEdge = {
  from: string;
  to: string;
  /** optional label above the arrow */
  label?: string;
};

type Props = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  cols: number;
  rows: number;
};

const accentClass: Record<NonNullable<FlowNode["accent"]>, string> = {
  primary: "border-primary/40 hover:border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]",
  muted: "border-border hover:border-primary/40",
  success: "border-emerald-500/40 hover:border-emerald-500",
  warning: "border-amber-500/40 hover:border-amber-500",
  danger: "border-destructive/40 hover:border-destructive",
};

const iconAccentClass: Record<NonNullable<FlowNode["accent"]>, string> = {
  primary: "text-primary",
  muted: "text-muted-foreground",
  success: "text-emerald-500",
  warning: "text-amber-500",
  danger: "text-destructive",
};

/**
 * Interactive process-flow diagram matching the accountant's reference sketches.
 * Nodes are placed on a CSS grid (col/row). Arrows render as a single SVG
 * overlay computed from each node's grid cell centre.
 */
export default function FlowDiagram({ nodes, edges, cols, rows }: Props) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const cellW = 100 / cols;
  const cellH = 100 / rows;
  const centre = (col: number, row: number) => ({
    x: (col - 0.5) * cellW,
    y: (row - 0.5) * cellH,
  });

  return (
    <div
      className="relative w-full rounded-xl border bg-card/50 p-4 md:p-6"
      style={{ aspectRatio: `${cols * 1.15} / ${rows}` }}
    >
      {/* Arrows layer */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id="flow-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b) return null;
          const p1 = centre(a.col, a.row);
          const p2 = centre(b.col, b.row);
          return (
            <line
              key={i}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="0.35"
              strokeOpacity="0.5"
              markerEnd="url(#flow-arrow)"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {/* Nodes layer */}
      <div
        className="relative grid h-full w-full gap-2"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0,1fr))`,
        }}
      >
        {nodes.map((n) => {
          const Icon = n.icon;
          const accent = n.accent ?? "muted";
          return (
            <Link
              key={n.id}
              to={n.to}
              className={cn(
                "group relative flex flex-col items-center justify-center gap-1 rounded-lg border bg-background/80 p-2 text-center transition-all",
                "hover:-translate-y-0.5 hover:shadow-md",
                accentClass[accent],
              )}
              style={{ gridColumn: n.col, gridRow: n.row }}
            >
              {n.count != null && n.count !== "" && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                  {n.count}
                </span>
              )}
              <Icon className={cn("h-6 w-6 md:h-8 md:w-8", iconAccentClass[accent])} />
              <div className="text-[11px] font-medium leading-tight md:text-xs">
                {n.label}
              </div>
              {n.sublabel && (
                <div className="text-[10px] leading-tight text-muted-foreground">
                  {n.sublabel}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
