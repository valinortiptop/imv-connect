import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/comisiones")({
  component: ComisionesPage,
});

type Estado = "todos" | "pendiente" | "confirmado" | "enviado" | "entregado" | "cancelado";

type PedidoRow = {
  id: string;
  folio: string;
  estado: Exclude<Estado, "todos">;
  subtotal: number;
  comision_pct: number | null;
  comision_monto: number | null;
  created_at: string;
  cliente: { razon_social: string; nombre_comercial: string | null } | null;
  representante: { id: string; nombre: string } | null;
};

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function ComisionesPage() {
  const [estado, setEstado] = useState<Estado>("confirmado");
  const [desde, setDesde] = useState(isoDaysAgo(30));
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10));
  const [repId, setRepId] = useState<string>("todos");

  const reps = useQuery({
    queryKey: ["representantes-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("representantes")
        .select("id, nombre")
        .order("nombre");
      if (error) throw error;
      return data as { id: string; nombre: string }[];
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["comisiones", estado, desde, hasta, repId],
    queryFn: async () => {
      let q = supabase
        .from("pedidos")
        .select("id, folio, estado, subtotal, comision_pct, comision_monto, created_at, cliente:clientes(razon_social, nombre_comercial), representante:representantes(id, nombre)")
        .not("representante_id", "is", null)
        .gte("created_at", `${desde}T00:00:00`)
        .lte("created_at", `${hasta}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (estado !== "todos") q = q.eq("estado", estado);
      if (repId !== "todos") q = q.eq("representante_id", repId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as PedidoRow[];
    },
  });

  const totales = useMemo(() => {
    const byRep = new Map<string, { nombre: string; pedidos: number; subtotal: number; comision: number }>();
    let totalSubtotal = 0, totalComision = 0, totalPedidos = 0;
    (data ?? []).forEach((p) => {
      const repName = p.representante?.nombre ?? "—";
      const key = p.representante?.id ?? "—";
      const cur = byRep.get(key) ?? { nombre: repName, pedidos: 0, subtotal: 0, comision: 0 };
      cur.pedidos += 1;
      cur.subtotal += Number(p.subtotal ?? 0);
      cur.comision += Number(p.comision_monto ?? 0);
      byRep.set(key, cur);
      totalSubtotal += Number(p.subtotal ?? 0);
      totalComision += Number(p.comision_monto ?? 0);
      totalPedidos += 1;
    });
    return { byRep: Array.from(byRep.values()), totalSubtotal, totalComision, totalPedidos };
  }, [data]);

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Comisiones</h1>
        <p className="text-sm text-muted-foreground">
          Calculadas sobre subtotal del pedido al momento de creación.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3">
        <div>
          <label className="block text-xs text-muted-foreground">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input mt-1" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input mt-1" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value as Estado)} className="input mt-1">
            {["todos","pendiente","confirmado","enviado","entregado","cancelado"].map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Representante</label>
          <select value={repId} onChange={(e) => setRepId(e.target.value)} className="input mt-1">
            <option value="todos">Todos</option>
            {(reps.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Pedidos" value={String(totales.totalPedidos)} />
        <Stat label="Subtotal" value={`$${totales.totalSubtotal.toFixed(2)}`} />
        <Stat label="Comisión total" value={`$${totales.totalComision.toFixed(2)}`} highlight />
      </div>

      {totales.byRep.length > 0 && (
        <>
          <div className="mb-6 hidden sm:block overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Representante</th>
                  <th className="px-3 py-2 text-right">Pedidos</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2 text-right">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {totales.byRep
                  .sort((a, b) => b.comision - a.comision)
                  .map((r) => (
                    <tr key={r.nombre} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{r.nombre}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.pedidos}</td>
                      <td className="px-3 py-2 text-right tabular-nums">${r.subtotal.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">${r.comision.toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="mb-6 sm:hidden space-y-2">
            {totales.byRep
              .sort((a, b) => b.comision - a.comision)
              .map((r) => (
                <div key={r.nombre} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-semibold truncate">{r.nombre}</div>
                    <div className="font-semibold tabular-nums">${r.comision.toFixed(2)}</div>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
                    <span>{r.pedidos} pedidos</span>
                    <span>${r.subtotal.toFixed(2)} subtotal</span>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {error && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <div className="hidden sm:block overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Folio</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Representante</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2 text-right">Comisión</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{p.folio}</td>
                    <td className="px-3 py-2">{p.cliente?.nombre_comercial ?? p.cliente?.razon_social ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.representante?.nombre ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{p.estado}</td>
                    <td className="px-3 py-2 text-right tabular-nums">${Number(p.subtotal ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.comision_pct != null ? `${Number(p.comision_pct).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">${Number(p.comision_monto ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("es-MX")}</td>
                    <td className="px-3 py-2 text-right">
                      <Link to="/admin/pedidos/$id" params={{ id: p.id }} className="text-xs text-primary hover:underline">Ver</Link>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-muted-foreground">Sin pedidos con representante en este rango.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden space-y-2">
            {data.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Sin pedidos con representante en este rango.
              </div>
            ) : data.map((p) => (
              <Link
                key={p.id}
                to="/admin/pedidos/$id"
                params={{ id: p.id }}
                className="block rounded-lg border border-border bg-card p-3 active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">{p.folio}</div>
                    <div className="text-sm font-semibold truncate">{p.cliente?.nombre_comercial ?? p.cliente?.razon_social ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.representante?.nombre ?? "—"} · {p.estado}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums">${Number(p.comision_monto ?? 0).toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {p.comision_pct != null ? `${Number(p.comision_pct).toFixed(2)}%` : "—"} · ${Number(p.subtotal ?? 0).toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("es-MX")}</div>
              </Link>
            ))}
          </div>
        </>
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
