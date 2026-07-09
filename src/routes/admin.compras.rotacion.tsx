// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/compras/rotacion")({
  component: RotacionPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function RotacionPage() {
  const [tab, setTab] = useState<"60d" | "90d" | "180d" | "sin_venta">("90d");

  const { data, isLoading } = useQuery({
    queryKey: ["v_baja_rotacion", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_baja_rotacion")
        .select("*")
        .eq("clasificacion", tab)
        .order("valor_inmovilizado", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = (data ?? []).reduce((s: number, r: any) => s + Number(r.valor_inmovilizado || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["60d", "90d", "180d", "sin_venta"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("rounded-md border px-3 py-1.5 text-sm",
              tab === t ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}
          >
            {t === "sin_venta" ? "Nunca vendido" : `> ${t.replace("d", " días")}`}
          </button>
        ))}
        <div className="ml-auto rounded-md border border-border bg-muted px-3 py-1.5 text-sm tabular-nums">
          Valor inmovilizado: {mxn.format(total)}
        </div>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2 text-right">Existencia</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                  <th className="px-3 py-2 text-right">Valor inmovilizado</th>
                  <th className="px-3 py-2 text-right">Días sin venta</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((r: any) => (
                  <tr key={r.producto_id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.nombre}</div>
                      <div className="text-xs text-muted-foreground">{r.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.laboratorio ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(r.stock_fisico).toFixed(0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{mxn.format(Number(r.costo))}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{mxn.format(Number(r.valor_inmovilizado))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.dias_sin_venta}</td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin productos en este segmento.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {(data ?? []).map((r: any) => (
              <div key={r.producto_id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.nombre}</p>
                    <p className="text-xs text-muted-foreground">{r.sku} · {r.laboratorio ?? "—"}</p>
                  </div>
                  <span className="shrink-0 tabular-nums text-sm font-semibold">{mxn.format(Number(r.valor_inmovilizado))}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground tabular-nums">
                  <span>{Number(r.stock_fisico).toFixed(0)} u</span>
                  <span>{r.dias_sin_venta}d sin venta</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
