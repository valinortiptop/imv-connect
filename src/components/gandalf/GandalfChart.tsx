import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface ChartData {
  type: "bar" | "line" | "pie" | "horizontal_bar";
  title?: string;
  data: Array<Record<string, any>>;
  xKey?: string;
  yKey?: string;
  series?: Array<{ key: string; label?: string; color?: string }>;
  nameKey?: string;
  valueKey?: string;
  format?: "currency" | "number" | "percent";
}

const COLORS = [
  "#06b6d4", // cyan-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
  "#ef4444", // red-500
  "#3b82f6", // blue-500
  "#ec4899", // pink-500
  "#f97316", // orange-500
];

function formatValue(v: any, format?: string): string {
  if (v == null) return "";
  const num = typeof v === "number" ? v : parseFloat(v);
  if (isNaN(num)) return String(v);
  if (format === "currency") return `$${num.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (format === "percent") return `${num.toFixed(1)}%`;
  return num.toLocaleString("es-MX");
}

function CustomTooltip({ active, payload, label, format }: any) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-xs shadow-lg",
        isDark ? "bg-zinc-900 border-white/10 text-white" : "bg-white border-slate-200 text-slate-800"
      )}
    >
      {label && <div className="font-medium mb-1">{label}</div>}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className={isDark ? "text-white/60" : "text-slate-500"}>{entry.name || entry.dataKey}:</span>
          <span className="font-medium">{formatValue(entry.value, format)}</span>
        </div>
      ))}
    </div>
  );
}

export function GandalfChart({ chart }: { chart: ChartData }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const axisStyle = {
    fontSize: 11,
    fill: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
  };

  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";

  const series = useMemo(() => {
    if (chart.series?.length) return chart.series;
    if (chart.yKey) return [{ key: chart.yKey, label: chart.yKey }];
    // Auto-detect numeric keys from first data item
    if (chart.data?.[0]) {
      const xKey = chart.xKey || "name";
      return Object.keys(chart.data[0])
        .filter((k) => k !== xKey && typeof chart.data[0][k] === "number")
        .slice(0, 4)
        .map((k) => ({ key: k, label: k }));
    }
    return [];
  }, [chart]);

  if (!chart.data?.length) return null;

  return (
    <div className={cn("my-3 rounded-xl border p-4", isDark ? "bg-white/[0.02] border-white/[0.08]" : "bg-slate-50 border-slate-200")}>
      {chart.title && (
        <div className={cn("text-sm font-semibold mb-3", isDark ? "text-white/80" : "text-slate-700")}>
          {chart.title}
        </div>
      )}
      <div className="w-full" style={{ height: chart.type === "pie" ? 280 : 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "pie" ? (
            <PieChart>
              <Pie
                data={chart.data}
                dataKey={chart.valueKey || "value"}
                nameKey={chart.nameKey || "name"}
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={45}
                paddingAngle={2}
                strokeWidth={0}
                label={({ name, value }) => `${name}: ${formatValue(value, chart.format)}`}
                labelLine={{ stroke: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)" }}
              >
                {chart.data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip format={chart.format} />} />
            </PieChart>
          ) : chart.type === "horizontal_bar" ? (
            <BarChart data={chart.data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis type="number" tick={axisStyle} tickFormatter={(v) => formatValue(v, chart.format)} />
              <YAxis type="category" dataKey={chart.xKey || "name"} tick={axisStyle} width={90} />
              <Tooltip content={<CustomTooltip format={chart.format} />} />
              {series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={s.color || COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} />
              ))}
            </BarChart>
          ) : chart.type === "line" ? (
            <LineChart data={chart.data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey={chart.xKey || "name"} tick={axisStyle} />
              <YAxis tick={axisStyle} tickFormatter={(v) => formatValue(v, chart.format)} />
              <Tooltip content={<CustomTooltip format={chart.format} />} />
              {series.length > 1 && <Legend />}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label || s.key}
                  stroke={s.color || COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3, fill: s.color || COLORS[i % COLORS.length] }}
                />
              ))}
            </LineChart>
          ) : (
            // Default: bar chart
            <BarChart data={chart.data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey={chart.xKey || "name"} tick={axisStyle} />
              <YAxis tick={axisStyle} tickFormatter={(v) => formatValue(v, chart.format)} />
              <Tooltip content={<CustomTooltip format={chart.format} />} />
              {series.length > 1 && <Legend />}
              {series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={s.color || COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
