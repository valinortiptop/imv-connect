import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/pedidos")({
  component: PedidosPage,
});

type EstadoFiltro = "todos" | "pendiente" | "confirmado" | "enviado" | "entregado" | "cancelado";

type PedidoRow = {
  id: string;
  folio: string;
  estado: EstadoFiltro;
  total: number;
  created_at: string;
  contacto_nombre: string | null;
  cliente: { razon_social: string; nombre_comercial: string | null } | null;
};

const ESTADOS: EstadoFiltro[] = ["todos", "pendiente", "confirmado", "enviado", "entregado", "cancelado"];

function badge(estado: string) {
  const map: Record<string, string> = {
    pendiente: "bg-amber-500/10 text-amber-600",
    confirmado: "bg-sky-500/10 text-sky-600",
    enviado: "bg-indigo-500/10 text-indigo-600",
    entregado: "bg-emerald-500/10 text-emerald-600",
    cancelado: "bg-destructive/10 text-destructive",
  };
  return `rounded-full px-2 py-0.5 text-xs ${map[estado] ?? "bg-muted text-muted-foreground"}`;
}

function PedidosPage() {
  const [estado, setEstado] = useState<EstadoFiltro>("todos");

  const { data, isLoading, error } = useQuery({
    queryKey: ["pedidos", estado],
    queryFn: async () => {
      let q = supabase
        .from("pedidos")
        .select("id, folio, estado, total, created_at, contacto_nombre, cliente:clientes(razon_social, nombre_comercial)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (estado !== "todos") q = q.eq("estado", estado);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as PedidoRow[];
    },
  });

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <p className="text-sm text-muted-foreground">Pedidos recibidos desde los portales.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {ESTADOS.map((e) => (
          <button
            key={e}
            onClick={() => setEstado(e)}
            className={
              estado === e
                ? "rounded-md border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                : "rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
            }
          >
            {e}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {error && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {data && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Folio</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Contacto</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{p.folio}</td>
                  <td className="px-3 py-2 font-medium">
                    {p.cliente?.nombre_comercial ?? p.cliente?.razon_social ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.contacto_nombre ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={badge(p.estado)}>{p.estado}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ${Number(p.total).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleString("es-MX")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/admin/pedidos/$id"
                      params={{ id: p.id }}
                      className="text-xs text-primary hover:underline"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Sin pedidos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
