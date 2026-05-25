import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/compras")({
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
  const [nueva, setNueva] = useState(false);

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
    return true;
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Compras a proveedores</h1>
          <p className="text-sm text-muted-foreground">
            Órdenes de compra a laboratorios. Al recibir se generan entradas a inventario.
          </p>
        </div>
        <button onClick={() => setNueva(true)} className="btn-primary">
          + Nueva OC
        </button>
      </div>

      <div className="flex items-center gap-3">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="input max-w-xs">
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="enviada">Enviada</option>
          <option value="parcial">Parcial</option>
          <option value="recibida">Recibida</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="overflow-x-auto rounded-md border border-border">
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
              <tr key={o.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{o.folio}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{o.fecha_emision}</td>
                <td className="px-3 py-2">{o.laboratorio}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{o.almacen}</td>
                <td className="px-3 py-2 text-right tabular-nums">{o.items}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(o.pendiente_unidades)}</td>
                <td className="px-3 py-2 text-right tabular-nums">${Number(o.total).toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADOS[o.estado] ?? "bg-muted"}`}>
                    {o.estado}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <Link to="/admin/compras/$id" params={{ id: o.id }} className="text-xs text-primary hover:underline">
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !isLoading && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">Sin órdenes.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {nueva && (
        <NuevaOCModal
          onClose={() => setNueva(false)}
          onSaved={(id) => {
            qc.invalidateQueries({ queryKey: ["ordenes_compra"] });
            setNueva(false);
            window.location.href = `/admin/compras/${id}`;
          }}
        />
      )}
    </section>
  );
}

function NuevaOCModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [labId, setLabId] = useState("");
  const [almId, setAlmId] = useState("");
  const [fechaEsperada, setFechaEsperada] = useState("");
  const [notas, setNotas] = useState("");

  const { data: labs } = useQuery({
    queryKey: ["labs-activos"],
    queryFn: async () => {
      const { data } = await supabase.from("laboratorios").select("id, nombre").eq("activo", true).order("nombre");
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  const { data: alms } = useQuery({
    queryKey: ["almacenes-activos-oc"],
    queryFn: async () => {
      const { data } = await supabase.from("almacenes").select("id, nombre, principal").eq("activo", true).order("principal", { ascending: false });
      return (data ?? []) as { id: string; nombre: string; principal: boolean }[];
    },
  });

  const crear = useMutation({
    mutationFn: async () => {
      if (!labId) throw new Error("Selecciona laboratorio");
      if (!almId) throw new Error("Selecciona almacén");
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("ordenes_compra")
        .insert({
          laboratorio_id: labId,
          almacen_id: almId,
          fecha_esperada: fechaEsperada || null,
          notas: notas || null,
          created_by: u.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("OC creada");
      onSaved(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 text-lg font-semibold">Nueva orden de compra</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Laboratorio</label>
            <select value={labId} onChange={(e) => setLabId(e.target.value)} className="input mt-1">
              <option value="">— Selecciona —</option>
              {labs?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Almacén destino</label>
            <select value={almId} onChange={(e) => setAlmId(e.target.value)} className="input mt-1">
              <option value="">— Selecciona —</option>
              {alms?.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.principal ? " (principal)" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Fecha esperada</label>
            <input type="date" value={fechaEsperada} onChange={(e) => setFechaEsperada(e.target.value)} className="input mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Notas</label>
            <textarea rows={2} maxLength={500} value={notas} onChange={(e) => setNotas(e.target.value)} className="input mt-1" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={() => crear.mutate()} disabled={crear.isPending} className="btn-primary">
            {crear.isPending ? "Creando…" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
