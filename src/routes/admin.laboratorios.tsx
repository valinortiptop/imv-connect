import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/laboratorios")({
  component: LaboratoriosPage,
});

type Lab = {
  id: string;
  nombre: string;
  logo_url: string | null;
  orden: number;
  activo: boolean;
};

function LaboratoriosPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Lab> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["laboratorios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laboratorios")
        .select("id, nombre, logo_url, orden, activo")
        .order("orden")
        .order("nombre");
      if (error) throw error;
      return data as unknown as Lab[];
    },
  });

  const save = useMutation({
    mutationFn: async (l: Partial<Lab>) => {
      const payload = {
        nombre: l.nombre,
        logo_url: l.logo_url || null,
        orden: l.orden ?? 0,
        activo: l.activo ?? true,
      };
      if (l.id) {
        const { error } = await supabase.from("laboratorios").update(payload).eq("id", l.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("laboratorios").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Laboratorio guardado");
      qc.invalidateQueries({ queryKey: ["laboratorios"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("laboratorios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["laboratorios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Laboratorios</h1>
          <p className="text-sm text-muted-foreground">Marcas/fabricantes del catálogo IMV.</p>
        </div>
        <button
          onClick={() => setEditing({ orden: 0, activo: true })}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Nuevo
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
                <th className="px-4 py-2 w-16">Orden</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Logo URL</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-2 tabular-nums">{l.orden}</td>
                  <td className="px-4 py-2 font-medium">{l.nombre}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-xs">
                    {l.logo_url ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        l.activo
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {l.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => setEditing(l)}
                      className="mr-2 text-xs text-primary hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar ${l.nombre}?`)) remove.mutate(l.id);
                      }}
                      className="text-xs text-destructive hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Sin laboratorios todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <LabModal
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
          saving={save.isPending}
        />
      )}
    </section>
  );
}

function LabModal({
  value,
  onClose,
  onSave,
  saving,
}: {
  value: Partial<Lab>;
  onClose: () => void;
  onSave: (v: Partial<Lab>) => void;
  saving: boolean;
}) {
  const [v, setV] = useState<Partial<Lab>>(value);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">
          {value.id ? "Editar laboratorio" : "Nuevo laboratorio"}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(v);
          }}
          className="space-y-3"
        >
          <Field label="Nombre">
            <input
              required
              value={v.nombre ?? ""}
              onChange={(e) => setV({ ...v, nombre: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Logo URL (opcional)">
            <input
              type="url"
              value={v.logo_url ?? ""}
              onChange={(e) => setV({ ...v, logo_url: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Orden">
            <input
              type="number"
              value={v.orden ?? 0}
              onChange={(e) => setV({ ...v, orden: Number(e.target.value) })}
              className="input"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.activo ?? true}
              onChange={(e) => setV({ ...v, activo: e.target.checked })}
            />
            Activo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
