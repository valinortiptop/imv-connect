import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      z.c    += Number(r.saldo_corriente);
      z.b1   += Number(r.saldo_1_30);
      z.b2   += Number(r.saldo_31_60);
      z.b3   += Number(r.saldo_61_90);
      z.b4   += Number(r.saldo_mas_90);
    });
    return z;
  }, [filtered]);

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cobranza</h1>
          <p className="text-sm text-muted-foreground">
            Antigüedad de saldos por cliente.
          </p>
        </div>
        <Link to="/admin/facturas" className="text-sm text-primary hover:underline">
          Ver facturas →
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-muted-foreground">Buscar cliente</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input mt-1 w-full" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloDeudores} onChange={(e) => setSoloDeudores(e.target.checked)} />
          Solo deudores
        </label>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Saldo total" value={`$${tot.saldo.toFixed(2)}`} highlight />
        <Stat label="Corriente" value={`$${tot.c.toFixed(2)}`} />
        <Stat label="1-30 días" value={`$${tot.b1.toFixed(2)}`} />
        <Stat label="31-60" value={`$${tot.b2.toFixed(2)}`} />
        <Stat label="+60 días" value={`$${(tot.b3 + tot.b4).toFixed(2)}`} danger={tot.b3 + tot.b4 > 0} />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {error && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {!isLoading && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2 text-right">Fact.</th>
                <th className="px-3 py-2 text-right">Corriente</th>
                <th className="px-3 py-2 text-right">1-30</th>
                <th className="px-3 py-2 text-right">31-60</th>
                <th className="px-3 py-2 text-right">61-90</th>
                <th className="px-3 py-2 text-right">+90</th>
                <th className="px-3 py-2 text-right">Saldo total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.cliente_id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">
                    {r.nombre_comercial ?? r.razon_social}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.facturas_abiertas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${Number(r.saldo_corriente).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${Number(r.saldo_1_30).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${Number(r.saldo_31_60).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">
                    ${Number(r.saldo_61_90).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-destructive">
                    ${Number(r.saldo_mas_90).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">${Number(r.saldo_total).toFixed(2)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">Sin clientes con saldo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, highlight, danger }: { label: string; value: string; highlight?: boolean; danger?: boolean }) {
  const border = danger ? "border-destructive bg-destructive/5"
    : highlight ? "border-primary bg-primary/5"
    : "border-border bg-card";
  return (
    <div className={`rounded-md border p-3 ${border}`}>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
