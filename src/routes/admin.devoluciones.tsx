import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/devoluciones")({
  component: DevolucionesPage,
});

type Row = {
  id: string;
  folio: string;
  fecha: string;
  estado: string;
  total: number;
  factura_folio: string;
  cliente: string;
  almacen: string;
  items: number;
  motivo: string | null;
};

const ESTADOS: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  aplicada: "bg-emerald-500/10 text-emerald-600",
  cancelada: "bg-rose-500/10 text-rose-600",
};

function DevolucionesPage() {
  const [filtro, setFiltro] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["devoluciones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_devoluciones")
        .select("*")
        .order("fecha", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as Row[];
    },
  });

  const rows = (data ?? []).filter((r) => !filtro || r.estado === filtro);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Devoluciones</h1>
          <p className="text-sm text-muted-foreground">
            Devoluciones de producto. Al aplicar se genera nota de crédito y reingreso a inventario.
          </p>
        </div>
        <Link to="/admin/facturas" className="btn-secondary">
          Ir a facturas
        </Link>
      </div>

      <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="input max-w-xs">
        <option value="">Todos los estados</option>
        <option value="borrador">Borrador</option>
        <option value="aplicada">Aplicada</option>
        <option value="cancelada">Cancelada</option>
      </select>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Folio</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Factura</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Almacén</th>
              <th className="px-3 py-2 text-right">Items</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{r.folio}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.fecha}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.factura_folio}</td>
                <td className="px-3 py-2">{r.cliente}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.almacen}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.items}</td>
                <td className="px-3 py-2 text-right tabular-nums">${Number(r.total).toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADOS[r.estado] ?? "bg-muted"}`}>
                    {r.estado}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <Link to="/admin/devoluciones/$id" params={{ id: r.id }} className="text-xs text-primary hover:underline">
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !isLoading && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">Sin devoluciones.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
