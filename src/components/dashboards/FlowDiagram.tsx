import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type FlowIcon = LucideIcon | { src: string; alt?: string };

export type FlowNode = {
  id: string;
  label: string;
  sublabel?: string;
  icon: FlowIcon;
  col: number;
  row: number;
  to?: string;
  count?: number | string | null;
  accent?: "primary" | "muted" | "success" | "warning" | "danger";
  disabled?: boolean;
};

export type FlowEdge = {
  from: string;
  to: string;
  bend?: "hv" | "vh";
  bidirectional?: boolean;
};

type Props = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  cols: number;
  rows: number;
};

// Fixed pixel geometry — tight, reference-matching layout.
const CELL_W = 200;
const CELL_H = 190;
const ICON = 120;
const PAD = ICON / 2 + 4;
const ARROW_COLOR = "#4b5563"; // slate-600

export default function FlowDiagram({ nodes, edges, cols, rows }: Props) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const width = cols * CELL_W;
  const height = rows * CELL_H;

  const centre = (col: number, row: number) => ({
    x: (col - 0.5) * CELL_W,
    y: (row - 0.5) * CELL_H,
  });

  const buildPath = (a: FlowNode, b: FlowNode, bend: "hv" | "vh" = "vh") => {
    const p1 = centre(a.col, a.row);
    const p2 = centre(b.col, b.row);

    if (a.row === b.row) {
      const sx = p2.x > p1.x ? PAD : -PAD;
      const ex = p2.x > p1.x ? -PAD : PAD;
      return `M ${p1.x + sx} ${p1.y} L ${p2.x + ex} ${p1.y}`;
    }
    if (a.col === b.col) {
      const sy = p2.y > p1.y ? PAD : -PAD;
      const ey = p2.y > p1.y ? -PAD : PAD;
      return `M ${p1.x} ${p1.y + sy} L ${p1.x} ${p2.y + ey}`;
    }
    if (bend === "hv") {
      const sx = p2.x > p1.x ? PAD : -PAD;
      const ey = p2.y > p1.y ? -PAD : PAD;
      return `M ${p1.x + sx} ${p1.y} L ${p2.x} ${p1.y} L ${p2.x} ${p2.y + ey}`;
    }
    const sy = p2.y > p1.y ? PAD : -PAD;
    const ex = p2.x > p1.x ? -PAD : PAD;
    return `M ${p1.x} ${p1.y + sy} L ${p1.x} ${p2.y} L ${p2.x + ex} ${p2.y}`;
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="relative mx-auto" style={{ width, height }}>
        {/* Arrows layer */}
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <marker
              id="fd-arrow-end"
              viewBox="0 0 12 12"
              refX="9"
              refY="6"
              markerWidth="10"
              markerHeight="10"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L12,6 L0,12 z" fill={ARROW_COLOR} />
            </marker>
            <marker
              id="fd-arrow-start"
              viewBox="0 0 12 12"
              refX="3"
              refY="6"
              markerWidth="10"
              markerHeight="10"
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L12,6 L0,12 z" fill={ARROW_COLOR} />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = nodeById.get(e.from);
            const b = nodeById.get(e.to);
            if (!a || !b) return null;
            const d = buildPath(a, b, e.bend ?? "vh");
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={ARROW_COLOR}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#fd-arrow-end)"
                markerStart={e.bidirectional ? "url(#fd-arrow-start)" : undefined}
              />
            );
          })}
        </svg>

        {/* Nodes layer */}
        {nodes.map((n) => {
          const isImageIcon = typeof n.icon === "object" && "src" in n.icon;
          const c = centre(n.col, n.row);

          const inner = (
            <>
              <div className="relative" style={{ width: ICON, height: ICON }}>
                {n.count != null && n.count !== "" && (
                  <span className="absolute -right-1 -top-1 z-10 min-w-[18px] rounded-full bg-foreground/90 px-1.5 py-0.5 text-center text-[9px] font-bold leading-none text-background shadow">
                    {n.count}
                  </span>
                )}
                {isImageIcon ? (
                  <img
                    src={(n.icon as { src: string; alt?: string }).src}
                    alt={(n.icon as { src: string; alt?: string }).alt ?? n.label}
                    loading="lazy"
                    className="h-full w-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.15)] transition-transform group-hover:scale-110"
                  />
                ) : (
                  (() => {
                    const Icon = n.icon as LucideIcon;
                    return (
                      <Icon className="h-full w-full text-primary transition-transform group-hover:scale-110" />
                    );
                  })()
                )}
              </div>
              <div className="mt-1 max-w-[180px] text-center text-[13px] font-medium leading-tight text-foreground">
                {n.label}
              </div>
              {n.sublabel && (
                <div className="max-w-[180px] text-center text-[11px] leading-tight text-muted-foreground">
                  {n.sublabel}
                </div>
              )}
              {!n.disabled && (
                <div className="mt-0.5 flex h-3.5 w-7 items-center justify-center rounded-[3px] border border-emerald-500/70 bg-emerald-500/15">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                    <path d="M1 1 L5 5 L9 1" stroke="rgb(16 185 129)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </>
          );

          const base = cn(
            "group absolute flex flex-col items-center",
            n.disabled && "opacity-45 pointer-events-none",
            !n.disabled && n.to && "cursor-pointer",
          );

          const style = {
            left: c.x,
            top: c.y,
            transform: "translate(-50%, -50%)",
            width: CELL_W - 8,
          } as const;

          if (!n.to || n.disabled) {
            return (
              <div
                key={n.id}
                className={base}
                style={style}
                title={n.disabled ? "Próximamente" : undefined}
              >
                {inner}
              </div>
            );
          }
          return (
            <Link key={n.id} to={n.to} className={base} style={style}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
