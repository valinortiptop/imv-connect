// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Users, X } from "lucide-react";

export const Route = createFileRoute("/admin/compras/caducidades")({
  component: CaducidadesPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function CaducidadesPage() {
  const [tab, setTab] = useState<"rojo" | "amarillo" | "verde">("rojo");
  const [recFor, setRecFor] = useState<{ producto_id: string; nombre: string; sku: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["v_caducidades", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_caducidades")
        .select("*")
        .eq("semaforo", tab)
        .order("dias_restantes", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalValor = (data ?? []).reduce((s: number, r: any) => s + Number(r.valor_economico || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["rojo", "amarillo", "verde"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm capitalize",
              tab === t ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
            )}
          >
            <span className={cn("mr-1.5 inline-block size-2 rounded-full",
              t === "rojo" ? "bg-rose-500" : t === "amarillo" ? "bg-amber-500" : "bg-emerald-500")} />
            {t === "rojo" ? "≤ 30 días" : t === "amarillo" ? "31–90 días" : "> 90 días"}
          </button>
        ))}
        <div className="ml-auto rounded-md border border-border bg-muted px-3 py-1.5 text-sm tabular-nums">
          Total: {mxn.format(totalValor)}
        </div>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Lote</th>
                  <th className="px-3 py-2">Almacén</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Caducidad</th>
                  <th className="px-3 py-2 text-right">Días</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((r: any) => (
                  <tr key={r.batch_id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.nombre}</div>
                      <div className="text-xs text-muted-foreground">{r.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.lote ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.almacen ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(r.cantidad).toFixed(0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{mxn.format(Number(r.valor_economico))}</td>
                    <td className="px-3 py-2 text-right text-xs">{r.caducidad ?? "—"}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums font-medium",
                      r.dias_restantes <= 30 ? "text-rose-600" : r.dias_restantes <= 90 ? "text-amber-600" : "text-emerald-600")}>
                      {r.dias_restantes}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => setRecFor({ producto_id: r.producto_id, nombre: r.nombre, sku: r.sku })}>
                        <Users className="mr-1 size-3.5" /> Clientes
                      </Button>
                    </td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Sin lotes en este rango.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {(data ?? []).map((r: any) => (
              <div key={r.batch_id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.nombre}</p>
                    <p className="text-xs text-muted-foreground">{r.sku} · Lote {r.lote ?? "—"}</p>
                  </div>
                  <span className={cn("shrink-0 rounded px-2 py-0.5 text-xs font-medium tabular-nums",
                    r.dias_restantes <= 30 ? "bg-rose-500/10 text-rose-600" : r.dias_restantes <= 90 ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600")}>
                    {r.dias_restantes}d
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{Number(r.cantidad).toFixed(0)} u</span>
                  <span className="tabular-nums">{mxn.format(Number(r.valor_economico))}</span>
                  <span>{r.caducidad ?? "—"}</span>
                </div>
                <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setRecFor({ producto_id: r.producto_id, nombre: r.nombre, sku: r.sku })}>
                  <Users className="mr-1 size-3.5" /> Ver clientes recomendados
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
      {recFor && <ClientesRecomendadosDialog producto={recFor} onClose={() => setRecFor(null)} />}
    </div>
  );
}

function ClientesRecomendadosDialog({ producto, onClose }: any) {
  const { data, isLoading } = useQuery({
    queryKey: ["v_caducidades_clientes", producto.producto_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_caducidades_clientes")
        .select("*")
        .eq("producto_id", producto.producto_id)
        .order("total_comprado", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Clientes recomendados</h2>
            <p className="text-xs text-muted-foreground">{producto.nombre} · {producto.sku}</p>
          </div>
          <button onClick={onClose}><X className="size-5" /></button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin historial de compras en los últimos 12 meses.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-border rounded-md border border-border">
            {(data ?? []).map((c: any) => (
              <div key={c.cliente_id} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{c.nombre_comercial || c.cliente}</p>
                  <span className="tabular-nums text-xs">{Number(c.total_comprado).toFixed(0)} u</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.pedidos_count} pedido(s) · última {c.ultima_compra ? new Date(c.ultima_compra).toLocaleDateString("es-MX") : "—"}
                  {c.representante && ` · ${c.representante}`}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
  );
}
