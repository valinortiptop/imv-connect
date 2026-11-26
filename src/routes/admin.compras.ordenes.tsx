import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarraHerramientas } from "@/components/barra-herramientas";
import { OC360Drawer } from "@/components/compras/OC360Drawer";
import { rowClickProps } from "@/components/shared/Panel360";
import { NuevaOCWizard } from "@/components/compras/NuevaOCWizard";
import { fmtFecha, fmtMXN, fmtNum } from "@/lib/oc-suggestions";

export const Route = createFileRoute("/admin/compras/ordenes")({
  component: ComprasPage,
});

type OC = {
  id: string;
  folio: string;
  estado: string;
  fecha_emision: string;
  fecha_esperada: string | null;
  fecha_recepcion: string | null;
  subtotal: number;
  total: number;
  laboratorio: string;
  almacen: string;
  items: number;
  pendiente_unidades: number;
};

const ESTADOS: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  enviada: "bg-blue-500/10 text-blue-600",
  parcial: "bg-amber-500/10 text-amber-600",
  recibida: "bg-emerald-500/10 text-emerald-600",
  cancelada: "bg-rose-500/10 text-rose-600",
};

function ComprasPage() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<string>("");
  const [q, setQ] = useState("");
  const [nueva, setNueva] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ordenes_compra"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ordenes_compra")
        .select("*")
        .order("fecha_emision", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as OC[];
    },
  });

  const filtered = (data ?? []).filter((o) => {
    if (filtro && o.estado !== filtro) return false;
    const t = q.trim().toLowerCase();
    if (t && ![o.folio, o.laboratorio, o.almacen].some((v) => (v ?? "").toLowerCase().includes(t))) return false;
    return true;
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Compras a proveedores</h1>
          <p className="text-sm text-muted-foreground">
            Órdenes de compra a laboratorios. Al recibir se generan entradas a inventario.
          </p>
        </div>
        <button onClick={() => setNueva(true)} className="btn-primary shrink-0">
          + Nueva OC
        </button>
      </div>

      <BarraHerramientas
        className="mb-0"
        busqueda={{ valor: q, onChange: setQ, placeholder: "Buscar folio, laboratorio o almacén…" }}
        filtros={[{ id: "estado", etiqueta: "Estado", valor: filtro, onChange: setFiltro, opciones: [["", "Todos los estados"], ["borrador", "Borrador"], ["enviada", "Enviada"], ["parcial", "Parcial"], ["recibida", "Recibida"], ["cancelada", "Cancelada"]] }]}
        resumen={isLoading ? undefined : <>{filtered.length.toLocaleString("es-MX")} de {(data ?? []).length.toLocaleString("es-MX")} órdenes recientes</>}
      />

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {/* Table view: sm+ */}
      <div className="hidden sm:block overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Folio</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Laboratorio</th>
              <th className="px-3 py-2">Almacén</th>
              <th className="px-3 py-2 text-right">Items</th>
              <th className="px-3 py-2 text-right">Pend.</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} {...rowClickProps(() => setAbierta(o.id))} className="border-t border-border cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/60" aria-label={`Abrir ${o.folio}`}>
                <td className="px-3 py-2 font-mono text-xs">{o.folio}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{fmtFecha(o.fecha_emision)}</td>
                <td className="px-3 py-2">{o.laboratorio}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{o.almacen}</td>
                <td className="px-3 py-2 text-right tabular-nums">{o.items}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNum(Number(o.pendiente_unidades))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMXN(Number(o.total))}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADOS[o.estado] ?? "bg-muted"}`}>
                    {o.estado}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => setAbierta(o.id)} className="text-xs text-primary hover:underline">
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !isLoading && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">Sin órdenes.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Card view: mobile */}
      <div className="sm:hidden space-y-2">
        {filtered.map((o) => (
          <button
            type="button"
            key={o.id}
            onClick={() => setAbierta(o.id)}
            className="block w-full text-left rounded-lg border border-border bg-card p-3 active:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-xs text-muted-foreground">{o.folio}</div>
                <div className="text-sm font-semibold truncate">{o.laboratorio}</div>
                <div className="text-xs text-muted-foreground truncate">{o.almacen}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${ESTADOS[o.estado] ?? "bg-muted"}`}>
                {o.estado}
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">{fmtFecha(o.fecha_emision)}</span>
              <span className="tabular-nums">
                {o.items} it. · pend {fmtNum(Number(o.pendiente_unidades))} ·{" "}
                <span className="font-semibold">{fmtMXN(Number(o.total))}</span>
              </span>
            </div>
          </button>
        ))}
        {filtered.length === 0 && !isLoading && (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Sin órdenes.
          </div>
        )}
      </div>


      {nueva && (
        <NuevaOCWizard
          onClose={() => setNueva(false)}
          onSaved={(id) => {
            qc.invalidateQueries({ queryKey: ["ordenes_compra"] });
            setNueva(false);
            setAbierta(id);
          }}
        />
      )}
      <OC360Drawer ocId={abierta} onClose={() => setAbierta(null)} />
    </section>
  );
}

