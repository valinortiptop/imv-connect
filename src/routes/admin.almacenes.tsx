import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/almacenes")({
  component: AlmacenesPage,
});

type Almacen = {
  id: string;
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  principal: boolean;
  activo: boolean;
};

function AlmacenesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Almacen> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["almacenes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("almacenes")
        .select("id, nombre, codigo, direccion, principal, activo")
        .order("nombre");
      if (error) throw error;
      return data as Almacen[];
    },
  });

  const save = useMutation({
    mutationFn: async (a: Partial<Almacen>) => {
      const payload = {
        nombre: a.nombre,
        codigo: a.codigo || null,
        direccion: a.direccion || null,
        principal: a.principal ?? false,
        activo: a.activo ?? true,
      };
      // Si marca principal, desmarcar otros
      if (payload.principal) {
        await supabase.from("almacenes").update({ principal: false }).neq("id", a.id ?? "00000000-0000-0000-0000-000000000000");
      }
      if (a.id) {
        const { error } = await supabase.from("almacenes").update(payload).eq("id", a.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("almacenes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Almacén guardado");
      qc.invalidateQueries({ queryKey: ["almacenes"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("almacenes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["almacenes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Almacenes</h1>
          <p className="text-sm text-muted-foreground">
            El almacén marcado como principal recibe los descuentos automáticos al confirmar pedidos.
          </p>
        </div>
        <button onClick={() => setEditing({ activo: true, principal: false })} className="btn-primary">
          Nuevo almacén
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
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Dirección</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{a.nombre}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.codigo ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{a.direccion ?? "—"}</td>
                  <td className="px-3 py-2">
                    {a.principal && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">principal</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={a.activo
                      ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600"
                      : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"}>
                      {a.activo ? "activo" : "inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(a)} className="mr-2 text-xs text-primary hover:underline">
                      Editar
                    </button>
                    <button
                      onClick={() => { if (confirm(`¿Eliminar ${a.nombre}?`)) remove.mutate(a.id); }}
                      className="text-xs text-destructive hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin almacenes.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <AlmacenModal
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
          saving={save.isPending}
        />
      )}
    </section>
  );
}

function AlmacenModal({ value, onClose, onSave, saving }: {
  value: Partial<Almacen>;
  onClose: () => void;
  onSave: (v: Partial<Almacen>) => void;
  saving: boolean;
}) {
  const [v, setV] = useState<Partial<Almacen>>(value);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">
          {value.id ? "Editar almacén" : "Nuevo almacén"}
        </h2>
        <form onSubmit={(e) => { e.preventDefault(); onSave(v); }} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-sm font-medium">Nombre *</label>
            <input required maxLength={120} value={v.nombre ?? ""}
              onChange={(e) => setV({ ...v, nombre: e.target.value })} className="input mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Código</label>
            <input maxLength={20} value={v.codigo ?? ""}
              onChange={(e) => setV({ ...v, codigo: e.target.value })} className="input mt-1" />
          </div>
          <div className="flex items-center gap-4 pt-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.principal ?? false}
                onChange={(e) => setV({ ...v, principal: e.target.checked })} />
              Principal
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.activo ?? true}
                onChange={(e) => setV({ ...v, activo: e.target.checked })} />
              Activo
            </label>
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Dirección</label>
            <textarea rows={2} maxLength={300} value={v.direccion ?? ""}
              onChange={(e) => setV({ ...v, direccion: e.target.value })} className="input mt-1" />
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
