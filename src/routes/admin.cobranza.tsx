import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ui/responsive-table";

export const Route = createFileRoute("/admin/cobranza")({
  component: CobranzaPage,
});

type Row = {
  cliente_id: string;
  razon_social: string;
  nombre_comercial: string | null;
  facturas_abiertas: number;
  saldo_total: number;
  saldo_corriente: number;
  saldo_1_30: number;
  saldo_31_60: number;
  saldo_61_90: number;
  saldo_mas_90: number;
};

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(n);

function CobranzaPage() {
  const [q, setQ] = useState("");
  const [soloDeudores, setSoloDeudores] = useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cobranza"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_saldos_clientes")
        .select("*")
        .order("saldo_total", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (soloDeudores && Number(r.saldo_total) <= 0) return false;
      if (!term) return true;
      return (
        r.razon_social.toLowerCase().includes(term) ||
        (r.nombre_comercial ?? "").toLowerCase().includes(term)
      );
    });
  }, [data, q, soloDeudores]);

  const tot = useMemo(() => {
    const z = { saldo: 0, c: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    filtered.forEach((r) => {
      z.saldo += Number(r.saldo_total);
      z.c += Number(r.saldo_corriente);
      z.b1 += Number(r.saldo_1_30);
      z.b2 += Number(r.saldo_31_60);
      z.b3 += Number(r.saldo_61_90);
      z.b4 += Number(r.saldo_mas_90);
    });
    return z;
  }, [filtered]);

  const columns: ResponsiveColumn<Row>[] = [
    {
      key: "cliente",
      label: "Cliente",
      primary: true,
      render: (r) => (
        <span className="font-medium">{r.nombre_comercial ?? r.razon_social}</span>
      ),
    },
    { key: "fact", label: "Fact.", className: "text-right tabular-nums", render: (r) => r.facturas_abiertas },
    { key: "corriente", label: "Corriente", className: "text-right tabular-nums", render: (r) => mxn(Number(r.saldo_corriente)) },
    { key: "b1", label: "1-30", className: "text-right tabular-nums", render: (r) => mxn(Number(r.saldo_1_30)) },
    { key: "b2", label: "31-60", className: "text-right tabular-nums", render: (r) => mxn(Number(r.saldo_31_60)) },
    {
      key: "b3",
      label: "61-90",
      className: "text-right tabular-nums text-amber-600 dark:text-amber-400",
      render: (r) => mxn(Number(r.saldo_61_90)),
    },
    {
      key: "b4",
      label: "+90",
      className: "text-right tabular-nums text-destructive",
      render: (r) => mxn(Number(r.saldo_mas_90)),
    },
    {
      key: "total",
      label: "Saldo total",
      className: "text-right font-bold tabular-nums",
      render: (r) => mxn(Number(r.saldo_total)),
    },
  ];

  return (
    <section>
      <PageHeader
        title="Cobranza"
        description="Antigüedad de saldos por cliente."
        actions={
          <Link to="/admin/facturas" className="text-sm text-primary hover:underline">
            Ver facturas →
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-end">
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-muted-foreground">Buscar cliente</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input mt-1 w-full" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloDeudores} onChange={(e) => setSoloDeudores(e.target.checked)} />
          Solo deudores
        </label>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        <Stat label="Saldo total" value={mxn(tot.saldo)} highlight />
        <Stat label="Corriente" value={mxn(tot.c)} />
        <Stat label="1-30 días" value={mxn(tot.b1)} />
        <Stat label="31-60" value={mxn(tot.b2)} />
        <Stat label="+60 días" value={mxn(tot.b3 + tot.b4)} danger={tot.b3 + tot.b4 > 0} />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {error && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {!isLoading && (
        <ResponsiveTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.cliente_id}
          empty="Sin clientes con saldo."
        />
      )}
    </section>
  );
}

function Stat({ label, value, highlight, danger }: { label: string; value: string; highlight?: boolean; danger?: boolean }) {
  const border = danger
    ? "border-destructive bg-destructive/5"
    : highlight
      ? "border-primary bg-primary/5"
      : "border-border bg-card";
  return (
    <div className={`rounded-md border p-3 ${border}`}>
      <p className="text-[10px] uppercase text-muted-foreground sm:text-xs">{label}</p>
      <p className="mt-1 text-base font-bold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}
