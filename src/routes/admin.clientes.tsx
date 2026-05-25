import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/clientes")({
  component: ClientesPage,
});

type Cliente = {
  id: string;
  razon_social: string;
  nombre_comercial: string | null;
  rfc: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  token_portal: string;
  portal_activo: boolean;
  notas: string | null;
};

function ClientesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Cliente> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select(
          "id, razon_social, nombre_comercial, rfc, email, telefono, direccion, token_portal, portal_activo, notas",
        )
        .order("razon_social");
      if (error) throw error;
      return data as unknown as Cliente[];
    },
  });

  const save = useMutation({
    mutationFn: async (c: Partial<Cliente>) => {
      const payload = {
        razon_social: c.razon_social,
        nombre_comercial: c.nombre_comercial || null,
        rfc: c.rfc || null,
        email: c.email || null,
        telefono: c.telefono || null,
        direccion: c.direccion || null,
        portal_activo: c.portal_activo ?? true,
        notas: c.notas || null,
      };
      if (c.id) {
        const { error } = await supabase.from("clientes").update(payload).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clientes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Cliente guardado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenToken = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("clientes")
        .update({ token_portal: crypto.randomUUID() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Token regenerado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/portal/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cada cliente recibe su link de portal.</p>
        </div>
        <button onClick={() => setEditing({ portal_activo: true })} className="btn-primary">
          Nuevo cliente
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
                <th className="px-3 py-2">Razón social</th>
                <th className="px-3 py-2">Comercial</th>
                <th className="px-3 py-2">RFC</th>
                <th className="px-3 py-2">Contacto</th>
                <th className="px-3 py-2">Portal</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{c.razon_social}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.nombre_comercial ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.rfc ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {c.email ?? "—"}
                    {c.telefono ? ` · ${c.telefono}` : ""}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          c.portal_activo
                            ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        }
                      >
                        {c.portal_activo ? "activo" : "inactivo"}
                      </span>
                      <button
                        onClick={() => copyLink(c.token_portal)}
                        className="text-xs text-primary hover:underline"
                      >
                        Copiar link
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/admin/clientes/$id/precios"
                      params={{ id: c.id }}
                      className="mr-2 text-xs text-primary hover:underline"
                    >
                      Precios
                    </Link>
                    <button
                      onClick={() => setEditing(c)}
                      className="mr-2 text-xs text-primary hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("¿Regenerar token? El link anterior dejará de funcionar."))
                          regenToken.mutate(c.id);
                      }}
                      className="mr-2 text-xs text-amber-600 hover:underline"
                    >
                      Regenerar token
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar ${c.razon_social}?`)) remove.mutate(c.id);
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
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Sin clientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ClienteModal
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
          saving={save.isPending}
        />
      )}
    </section>
  );
}

function ClienteModal({
  value,
  onClose,
  onSave,
  saving,
}: {
  value: Partial<Cliente>;
  onClose: () => void;
  onSave: (v: Partial<Cliente>) => void;
  saving: boolean;
}) {
  const [v, setV] = useState<Partial<Cliente>>(value);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-xl rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">
          {value.id ? "Editar cliente" : "Nuevo cliente"}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(v);
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2">
            <label className="text-sm font-medium">Razón social *</label>
            <input
              required
              value={v.razon_social ?? ""}
              onChange={(e) => setV({ ...v, razon_social: e.target.value })}
              className="input mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Nombre comercial</label>
            <input
              value={v.nombre_comercial ?? ""}
              onChange={(e) => setV({ ...v, nombre_comercial: e.target.value })}
              className="input mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">RFC</label>
            <input
              value={v.rfc ?? ""}
              onChange={(e) => setV({ ...v, rfc: e.target.value.toUpperCase() })}
              className="input mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={v.email ?? ""}
              onChange={(e) => setV({ ...v, email: e.target.value })}
              className="input mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Teléfono</label>
            <input
              value={v.telefono ?? ""}
              onChange={(e) => setV({ ...v, telefono: e.target.value })}
              className="input mt-1"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Dirección</label>
            <input
              value={v.direccion ?? ""}
              onChange={(e) => setV({ ...v, direccion: e.target.value })}
              className="input mt-1"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Notas</label>
            <textarea
              rows={2}
              value={v.notas ?? ""}
              onChange={(e) => setV({ ...v, notas: e.target.value })}
              className="input mt-1"
            />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.portal_activo ?? true}
              onChange={(e) => setV({ ...v, portal_activo: e.target.checked })}
            />
            Portal activo
          </label>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
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
