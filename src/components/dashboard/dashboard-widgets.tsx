import * as React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, type LucideIcon } from "lucide-react";

/* ── Sparkline / mini area chart ───────────────────────────── */
export function Sparkline({
  data,
  className,
  stroke = "var(--primary)",
  height = 48,
}: {
  data: number[];
  className?: string;
  stroke?: string;
  height?: number;
}) {
  const pts = data.length > 1 ? data : [...data, ...data, 0];
  const max = Math.max(...pts, 1);
  const w = 100;
  const step = w / (pts.length - 1);
  const y = (v: number) => 100 - (v / max) * 92 - 4;
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L${w},100 L0,100 Z`;
  const gid = React.useId();
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Mini bar chart ────────────────────────────────────────── */
export function MiniBars({ data, className }: { data: number[]; className?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className={cn("flex items-end gap-[3px] h-12", className)}>
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-primary/70 min-h-[2px] transition-all"
          style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/* ── Donut chart ───────────────────────────────────────────── */
export function Donut({
  segments,
  size = 132,
  thickness = 14,
  center,
  label,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
  label?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={thickness} opacity={0.5} />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
    </div>
  );
}

/* ── Progress bar row ──────────────────────────────────────── */
export function RankRow({
  rank,
  name,
  meta,
  value,
  pct,
  gradient = "from-primary to-primary/60",
}: {
  rank: number;
  name: string;
  meta?: string;
  value: string;
  pct: number;
  gradient?: string;
}) {
  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
          {rank}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{name}</span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="ml-7 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", gradient)}
          style={{ width: `${Math.max(3, Math.min(100, pct))}%` }}
        />
      </div>
      {meta && <p className="ml-7 mt-1 truncate text-[10px] text-muted-foreground">{meta}</p>}
    </div>
  );
}

/* ── Panel shell ───────────────────────────────────────────── */
export function Panel({
  icon: Icon,
  title,
  hint,
  onClick,
  children,
  className,
  accent = "text-primary",
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur-sm sm:p-5",
        onClick && "cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30",
        className,
      )}
      onClick={onClick}
    >
      <header className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:mb-4">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className={cn("h-4 w-4 shrink-0", accent)} />}
          <h2 className="truncate text-[13px] font-semibold tracking-tight text-foreground sm:text-sm">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hint && <span className="hidden text-[11px] text-muted-foreground sm:inline">{hint}</span>}
          {onClick && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

/* ── Empty / loading helpers ───────────────────────────────── */
export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function PanelLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full bg-muted" />
      ))}
    </div>
  );
}

/* ── Quick action pill ─────────────────────────────────────── */
export function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="whitespace-nowrap text-xs font-medium text-foreground">{label}</span>
    </button>
  );
}
