import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/")({
  component: DashboardPage,
});

const currency = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DashboardPage() {
  const resumen = useQuery({
    queryKey: ["dash", "resumen"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_dashboard_resumen").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ventasMes = useQuery({
    queryKey: ["dash", "ventas_mes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_ventas_por_mes").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const topProductos = useQuery({
    queryKey: ["dash", "top_productos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_top_productos").select("*").limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const topClientes = useQuery({
    queryKey: ["dash", "top_clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_top_clientes").select("*").limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const comReps = useQuery({
    queryKey: ["dash", "com_reps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_comisiones_representante").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stockBajo = useQuery({
    queryKey: ["dash", "stock_bajo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_stock_bajo").select("*").limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const r = resumen.data as
    | {
        pedidos_abiertos: number;
        facturas_pendientes: number;
        saldo_pendiente: number;
        ventas_mes: number;
        comisiones_mes: number;
        productos_stock_bajo: number;
      }
    | null
    | undefined;

  const maxVenta = Math.max(1, ...((ventasMes.data ?? []) as { total: number }[]).map((v) => Number(v.total) || 0));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumen ejecutivo del negocio</p>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Ventas del mes" value={currency(r?.ventas_mes ?? 0)} />
        <KpiCard label="Comisiones del mes" value={currency(r?.comisiones_mes ?? 0)} />
        <KpiCard label="Saldo por cobrar" value={currency(r?.saldo_pendiente ?? 0)} accent />
        <KpiCard label="Pedidos abiertos" value={String(r?.pedidos_abiertos ?? 0)} />
        <KpiCard label="Facturas pendientes" value={String(r?.facturas_pendientes ?? 0)} />
        <KpiCard label="Productos en stock bajo" value={String(r?.productos_stock_bajo ?? 0)} accent />
      </section>

      {/* Ventas por mes */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ventas por mes</h2>
            <p className="text-xs text-muted-foreground">Últimos 12 meses (facturas no canceladas)</p>
          </div>
          <button
            onClick={() => downloadCSV("ventas_por_mes.csv", (ventasMes.data ?? []) as Record<string, unknown>[])}
            className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
          >
            Exportar CSV
          </button>
        </div>
        {ventasMes.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (ventasMes.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos aún.</p>
        ) : (
          <div className="space-y-2">
            {(ventasMes.data as { mes: string; total: number; facturas: number }[]).map((v) => {
              const pct = (Number(v.total) / maxVenta) * 100;
              return (
                <div key={v.mes} className="grid grid-cols-[80px_1fr_120px] items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{v.mes}</span>
                  <div className="h-6 rounded bg-muted">
                    <div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-right tabular-nums">{currency(Number(v.total))}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Two-col: Top productos / Top clientes */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Top productos (90 días)"
          actions={
            <button
              onClick={() => downloadCSV("top_productos.csv", (topProductos.data ?? []) as Record<string, unknown>[])}
              className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
            >
              CSV
            </button>
          }
        >
          <Table
            head={["SKU", "Producto", "Unid.", "Ingreso"]}
            rows={((topProductos.data ?? []) as { sku: string; nombre: string; unidades: number; ingreso: number }[]).map(
              (p) => [p.sku ?? "—", p.nombre, Number(p.unidades).toFixed(0), currency(Number(p.ingreso))],
            )}
          />
        </Card>

        <Card
          title="Top clientes (90 días)"
          actions={
            <button
              onClick={() => downloadCSV("top_clientes.csv", (topClientes.data ?? []) as Record<string, unknown>[])}
              className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
            >
              CSV
            </button>
          }
        >
          <Table
            head={["Cliente", "Pedidos", "Ventas"]}
            rows={((topClientes.data ?? []) as { razon_social: string; pedidos: number; ventas: number }[]).map((c) => [
              c.razon_social,
              String(c.pedidos),
              currency(Number(c.ventas)),
            ])}
          />
        </Card>
      </section>

      {/* Comisiones por rep */}
      <Card
        title="Comisiones por representante"
        actions={
          <div className="flex items-center gap-2">
            <Link to="/admin/comisiones" className="text-xs text-primary hover:underline">
              Ver detalle →
            </Link>
            <button
              onClick={() => downloadCSV("comisiones_rep.csv", (comReps.data ?? []) as Record<string, unknown>[])}
              className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
            >
              CSV
            </button>
          </div>
        }
      >
        <Table
          head={["Representante", "Pedidos", "Últimos 30 días", "Acumulado"]}
          rows={(
            (comReps.data ?? []) as {
              nombre: string;
              pedidos_total: number;
              comisiones_30d: number;
              comisiones_total: number;
            }[]
          ).map((c) => [
            c.nombre,
            String(c.pedidos_total),
            currency(Number(c.comisiones_30d)),
            currency(Number(c.comisiones_total)),
          ])}
        />
      </Card>

      {/* Stock bajo */}
      <Card
        title="Productos con stock bajo"
        actions={
          <div className="flex items-center gap-2">
            <Link to="/admin/inventario" className="text-xs text-primary hover:underline">
              Ir a inventario →
            </Link>
            <button
              onClick={() => downloadCSV("stock_bajo.csv", (stockBajo.data ?? []) as Record<string, unknown>[])}
              className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
            >
              CSV
            </button>
          </div>
        }
      >
        <Table
          head={["SKU", "Producto", "Stock total", "Mínimo"]}
          rows={(
            (stockBajo.data ?? []) as {
              sku: string;
              nombre: string;
              stock_total: number;
              stock_minimo: number;
            }[]
          ).map((p) => [p.sku ?? "—", p.nombre, Number(p.stock_total).toFixed(0), Number(p.stock_minimo).toFixed(0)])}
        />
      </Card>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Card({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Sin datos.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-3 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
