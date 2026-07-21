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
  to?: string;
  /** optional live count/badge */
  count?: number | string | null;
  /** highlight the node */
  accent?: "primary" | "muted" | "success" | "warning" | "danger";
  /** render as disabled (no navigation, greyed) */
  disabled?: boolean;
};

export type FlowEdge = {
  from: string;
  to: string;
  /** L-shape: "vh" = vertical then horizontal (default), "hv" = horizontal then vertical */
  bend?: "hv" | "vh";
  /** arrows on both endpoints */
  bidirectional?: boolean;
};

type Props = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  cols: number;
  rows: number;
};

const accentClass: Record<NonNullable<FlowNode["accent"]>, string> = {
  primary: "border-primary/50 hover:border-primary",
  muted: "border-border hover:border-primary/40",
  success: "border-emerald-500/50 hover:border-emerald-500",
  warning: "border-amber-500/50 hover:border-amber-500",
  danger: "border-destructive/50 hover:border-destructive",
};

const iconAccentClass: Record<NonNullable<FlowNode["accent"]>, string> = {
  primary: "text-primary",
  muted: "text-muted-foreground",
  success: "text-emerald-500",
  warning: "text-amber-500",
  danger: "text-destructive",
};

/**
 * Interactive process-flow diagram matching the accountant's ALPHA ERP
 * reference sketches. Nodes are placed on a CSS grid (col/row) and arrows
 * are drawn as orthogonal (elbow) SVG polylines between grid-cell centres.
 */
export default function FlowDiagram({ nodes, edges, cols, rows }: Props) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const cellW = 100 / cols;
  const cellH = 100 / rows;
  const centre = (col: number, row: number) => ({
    x: (col - 0.5) * cellW,
    y: (row - 0.5) * cellH,
  });

  // Trim endpoints so arrows land at node border, not inside it.
  const pad = { x: cellW * 0.32, y: cellH * 0.34 };

  const buildPath = (
    a: FlowNode,
    b: FlowNode,
    bend: "hv" | "vh" = "vh",
  ): { d: string; midDir: "h" | "v" } => {
    const p1 = centre(a.col, a.row);
    const p2 = centre(b.col, b.row);

    // Same row → straight horizontal
    if (a.row === b.row) {
      const dx = p2.x > p1.x ? -pad.x : pad.x;
      return {
        d: `M ${p1.x + (p2.x > p1.x ? pad.x : -pad.x)} ${p1.y} L ${p2.x + dx} ${p2.y}`,
        midDir: "h",
      };
    }
    // Same col → straight vertical
    if (a.col === b.col) {
      const dy = p2.y > p1.y ? -pad.y : pad.y;
      return {
        d: `M ${p1.x} ${p1.y + (p2.y > p1.y ? pad.y : -pad.y)} L ${p2.x} ${p2.y + dy}`,
        midDir: "v",
      };
    }

    if (bend === "hv") {
      // horizontal first, then vertical → arrow enters b from top/bottom
      const startX = p1.x + (p2.x > p1.x ? pad.x : -pad.x);
      const endY = p2.y + (p2.y > p1.y ? -pad.y : pad.y);
      return {
        d: `M ${startX} ${p1.y} L ${p2.x} ${p1.y} L ${p2.x} ${endY}`,
        midDir: "v",
      };
    }
    // vh: vertical first, then horizontal → arrow enters b from left/right
    const startY = p1.y + (p2.y > p1.y ? pad.y : -pad.y);
    const endX = p2.x + (p2.x > p1.x ? -pad.x : pad.x);
    return {
      d: `M ${p1.x} ${startY} L ${p1.x} ${p2.y} L ${endX} ${p2.y}`,
      midDir: "h",
    };
  };

  return (
    <div
      className="relative w-full overflow-x-auto rounded-xl border bg-card/50 p-3 md:p-5"
    >
      <div
        className="relative"
        style={{
          aspectRatio: `${cols * 1.15} / ${rows}`,
          minWidth: cols * 110,
        }}
      >
        {/* Arrows layer */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <marker
              id="flow-arrow-end"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--muted-foreground))" />
            </marker>
            <marker
              id="flow-arrow-start"
              viewBox="0 0 10 10"
              refX="1"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--muted-foreground))" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = nodeById.get(e.from);
            const b = nodeById.get(e.to);
            if (!a || !b) return null;
            const { d } = buildPath(a, b, e.bend ?? "vh");
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="0.45"
                strokeOpacity="0.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#flow-arrow-end)"
                markerStart={e.bidirectional ? "url(#flow-arrow-start)" : undefined}
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
            const inner = (
              <>
                {n.count != null && n.count !== "" && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                    {n.count}
                  </span>
                )}
                <Icon className={cn("h-6 w-6 md:h-7 md:w-7", iconAccentClass[accent])} />
                <div className="text-[11px] font-medium leading-tight md:text-xs">
                  {n.label}
                </div>
                {n.sublabel && (
                  <div className="text-[10px] leading-tight text-muted-foreground">
                    {n.sublabel}
                  </div>
                )}
              </>
            );

            const base = cn(
              "group relative flex flex-col items-center justify-center gap-1 rounded-lg border bg-background/80 p-2 text-center transition-all",
              "hover:-translate-y-0.5 hover:shadow-md",
              accentClass[accent],
              n.disabled && "opacity-60 pointer-events-none",
            );

            if (!n.to || n.disabled) {
              return (
                <div
                  key={n.id}
                  className={base}
                  style={{ gridColumn: n.col, gridRow: n.row }}
                  title={n.disabled ? "Próximamente" : undefined}
                >
                  {inner}
                </div>
              );
            }
            return (
              <Link
                key={n.id}
                to={n.to}
                className={base}
                style={{ gridColumn: n.col, gridRow: n.row }}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
