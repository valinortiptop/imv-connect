import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/facturas")({
  component: FacturasPage,
});

type Estado = "todos" | "borrador" | "emitida" | "parcial" | "pagada" | "cancelada";

type Row = {
  id: string;
  folio: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  total: number;
  pagado: number;
  saldo: number;
  estado: Exclude<Estado, "todos">;
  cliente: { razon_social: string; nombre_comercial: string | null } | null;
};

const ESTADOS: Estado[] = ["todos", "borrador", "emitida", "parcial", "pagada", "cancelada"];

function FacturasPage() {
  const [estado, setEstado] = useState<Estado>("todos");
  const [q, setQ] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["facturas", estado],
    queryFn: async () => {
      let qb = supabase
        .from("facturas")
        .select(
          "id, folio, fecha_emision, fecha_vencimiento, total, pagado, saldo, estado, cliente:clientes(razon_social, nombre_comercial)",
        )
        .order("fecha_emision", { ascending: false })
        .limit(500);
      if (estado !== "todos") qb = qb.eq("estado", estado);
      const { data, error } = await qb;
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((r) => {
      const cli = (r.cliente?.nombre_comercial ?? r.cliente?.razon_social ?? "").toLowerCase();
      return r.folio.toLowerCase().includes(term) || cli.includes(term);
    });
  }, [data, q]);

  const totales = useMemo(() => {
    let total = 0, saldo = 0;
    filtered.forEach((r) => { total += Number(r.total); saldo += Number(r.saldo); });
    return { total, saldo, n: filtered.length };
  }, [filtered]);

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Facturas</h1>
          <p className="text-sm text-muted-foreground">
            Emisión, pagos y saldos pendientes.
          </p>
        </div>
        <Link to="/admin/cobranza" className="text-sm text-primary hover:underline">
          Ver cobranza →
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-muted-foreground">Buscar</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Folio o cliente…"
            className="input mt-1 w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Estado</label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as Estado)}
            className="input mt-1"
          >
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Facturas" value={String(totales.n)} />
        <Stat label="Total facturado" value={`$${totales.total.toFixed(2)}`} />
        <Stat label="Saldo pendiente" value={`$${totales.saldo.toFixed(2)}`} highlight />
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
                <th className="px-3 py-2">Folio</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Emisión</th>
                <th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Pagado</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const vencida = r.estado !== "pagada" && r.estado !== "cancelada"
                  && new Date(r.fecha_vencimiento) < new Date();
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{r.folio}</td>
                    <td className="px-3 py-2">
                      {r.cliente?.nombre_comercial ?? r.cliente?.razon_social ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.fecha_emision).toLocaleDateString("es-MX")}
                    </td>
                    <td className={`px-3 py-2 text-xs ${vencida ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {new Date(r.fecha_vencimiento).toLocaleDateString("es-MX")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">${Number(r.total).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">${Number(r.pagado).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">${Number(r.saldo).toFixed(2)}</td>
                    <td className="px-3 py-2"><EstadoBadge estado={r.estado} /></td>
                    <td className="px-3 py-2 text-right">
                      <Link to="/admin/facturas/$id" params={{ id: r.id }} className="text-xs text-primary hover:underline">
                        Ver
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-muted-foreground">Sin facturas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-4 ${highlight ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: Row["estado"] }) {
  const cls: Record<Row["estado"], string> = {
    borrador: "bg-muted text-muted-foreground",
    emitida: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    parcial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    pagada: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    cancelada: "bg-destructive/10 text-destructive",
  };
  return <span className={`rounded px-2 py-0.5 text-xs ${cls[estado]}`}>{estado}</span>;
}
