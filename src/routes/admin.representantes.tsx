import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/representantes")({
  component: RepresentantesPage,
});

type Rep = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  comision_default_pct: number;
  activo: boolean;
  notas: string | null;
  clientes_count?: number;
};

function RepresentantesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Rep> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["representantes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("representantes")
        .select("id, nombre, email, telefono, comision_default_pct, activo, notas, clientes(count)")
        .order("nombre");
      if (error) throw error;
      return (data as unknown as (Rep & { clientes: { count: number }[] })[]).map((r) => ({
        ...r, clientes_count: r.clientes?.[0]?.count ?? 0,
      }));
    },
  });

  const save = useMutation({
    mutationFn: async (r: Partial<Rep>) => {
      const payload = {
        nombre: r.nombre,
        email: r.email || null,
        telefono: r.telefono || null,
        comision_default_pct: r.comision_default_pct ?? 0,
        activo: r.activo ?? true,
        notas: r.notas || null,
      };
      if (r.id) {
        const { error } = await supabase.from("representantes").update(payload).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("representantes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Representante guardado");
      qc.invalidateQueries({ queryKey: ["representantes"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("representantes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["representantes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Representantes</h1>
          <p className="text-sm text-muted-foreground">
            Comisión por defecto se aplica a nuevos pedidos del cliente asignado.
          </p>
        </div>
        <button onClick={() => setEditing({ activo: true, comision_default_pct: 5 })} className="btn-primary">
          Nuevo representante
        </button>
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
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Contacto</th>
                <th className="px-3 py-2 text-right">% Comisión</th>
                <th className="px-3 py-2 text-right">Clientes</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{r.nombre}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.email ?? "—"}{r.telefono ? ` · ${r.telefono}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(r.comision_default_pct).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.clientes_count}</td>
                  <td className="px-3 py-2">
                    <span className={r.activo
                      ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600"
                      : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"}>
                      {r.activo ? "activo" : "inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(r)} className="mr-2 text-xs text-primary hover:underline">
                      Editar
                    </button>
                    <button
                      onClick={() => { if (confirm(`¿Eliminar ${r.nombre}?`)) remove.mutate(r.id); }}
                      className="text-xs text-destructive hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin representantes.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RepModal
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
          saving={save.isPending}
        />
      )}
    </section>
  );
}

function RepModal({ value, onClose, onSave, saving }: {
  value: Partial<Rep>;
  onClose: () => void;
  onSave: (v: Partial<Rep>) => void;
  saving: boolean;
}) {
  const [v, setV] = useState<Partial<Rep>>(value);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">
          {value.id ? "Editar representante" : "Nuevo representante"}
        </h2>
        <form onSubmit={(e) => { e.preventDefault(); onSave(v); }} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-sm font-medium">Nombre *</label>
            <input required maxLength={120} value={v.nombre ?? ""}
              onChange={(e) => setV({ ...v, nombre: e.target.value })} className="input mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input type="email" maxLength={200} value={v.email ?? ""}
              onChange={(e) => setV({ ...v, email: e.target.value })} className="input mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Teléfono</label>
            <input maxLength={32} value={v.telefono ?? ""}
              onChange={(e) => setV({ ...v, telefono: e.target.value })} className="input mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">% Comisión por defecto</label>
            <input type="number" step="0.1" min={0} max={100}
              value={v.comision_default_pct ?? 0}
              onChange={(e) => setV({ ...v, comision_default_pct: Number(e.target.value) })}
              className="input mt-1" />
          </div>
          <label className="flex items-center gap-2 text-sm pt-6">
            <input type="checkbox" checked={v.activo ?? true}
              onChange={(e) => setV({ ...v, activo: e.target.checked })} />
            Activo
          </label>
          <div className="col-span-2">
            <label className="text-sm font-medium">Notas</label>
            <textarea rows={2} maxLength={500} value={v.notas ?? ""}
              onChange={(e) => setV({ ...v, notas: e.target.value })} className="input mt-1" />
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
