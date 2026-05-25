import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/productos")({
  component: ProductosPage,
});

type Producto = {
  id: string;
  laboratorio_id: string | null;
  sku: string | null;
  nombre: string;
  descripcion: string | null;
  presentacion: string | null;
  especie: string[] | null;
  categoria: string | null;
  imagen_url: string | null;
  precio_lista: number;
  unidad: string;
  iva_pct: number;
  activo: boolean;
  laboratorios?: { nombre: string } | null;
};

type Lab = { id: string; nombre: string };

function ProductosPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Producto> | null>(null);
  const [search, setSearch] = useState("");

  const labsQ = useQuery({
    queryKey: ["labs-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laboratorios")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return data as unknown as Lab[];
    },
  });

  const productosQ = useQuery({
    queryKey: ["productos", search],
    queryFn: async () => {
      let q = supabase
        .from("productos")
        .select(
          "id, laboratorio_id, sku, nombre, descripcion, presentacion, especie, categoria, imagen_url, precio_lista, unidad, iva_pct, activo, laboratorios(nombre)",
        )
        .order("nombre");
      if (search.trim()) q = q.ilike("nombre", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Producto[];
    },
  });

  const save = useMutation({
    mutationFn: async (p: Partial<Producto>) => {
      const payload = {
        laboratorio_id: p.laboratorio_id || null,
        sku: p.sku || null,
        nombre: p.nombre,
        descripcion: p.descripcion || null,
        presentacion: p.presentacion || null,
        especie: p.especie?.length ? p.especie : null,
        categoria: p.categoria || null,
        imagen_url: p.imagen_url || null,
        precio_lista: p.precio_lista ?? 0,
        unidad: p.unidad || "pieza",
        iva_pct: p.iva_pct ?? 16,
        activo: p.activo ?? true,
      };
      if (p.id) {
        const { error } = await supabase.from("productos").update(payload).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("productos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Producto guardado");
      qc.invalidateQueries({ queryKey: ["productos"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("productos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="text-sm text-muted-foreground">Catálogo IMV.</p>
        </div>
        <div className="flex gap-2">
          <input
            placeholder="Buscar por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-64"
          />
          <button
            onClick={() =>
              setEditing({ activo: true, unidad: "pieza", iva_pct: 16, precio_lista: 0 })
            }
            className="btn-primary"
          >
            Nuevo
          </button>
        </div>
      </div>

      {productosQ.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {productosQ.error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {(productosQ.error as Error).message}
          <p className="mt-1 text-xs opacity-80">
            ¿Ya corriste <code>db/migrations/0001_modulo_1_catalogo.sql</code>?
          </p>
        </div>
      )}

      {productosQ.data && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 w-16"></th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Laboratorio</th>
                <th className="px-3 py-2">Presentación</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosQ.data.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    {p.imagen_url ? (
                      <img
                        src={p.imagen_url}
                        alt=""
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted" />
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.sku ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">{p.nombre}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p.laboratorios?.nombre ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.presentacion ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ${Number(p.precio_lista).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        p.activo
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setEditing(p)}
                      className="mr-2 text-xs text-primary hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar ${p.nombre}?`)) remove.mutate(p.id);
                      }}
                      className="text-xs text-destructive hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {productosQ.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Sin productos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductoModal
          value={editing}
          labs={labsQ.data ?? []}
          onClose={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
          saving={save.isPending}
        />
      )}
    </section>
  );
}

function ProductoModal({
  value,
  labs,
  onClose,
  onSave,
  saving,
}: {
  value: Partial<Producto>;
  labs: Lab[];
  onClose: () => void;
  onSave: (v: Partial<Producto>) => void;
  saving: boolean;
}) {
  const [v, setV] = useState<Partial<Producto>>(value);
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `productos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("productos")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("productos").getPublicUrl(path);
      setV({ ...v, imagen_url: data.publicUrl });
      toast.success("Imagen subida");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-2xl rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">
          {value.id ? "Editar producto" : "Nuevo producto"}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(v);
          }}
          className="grid grid-cols-2 gap-3"
        >
          <Field label="Nombre *" full>
            <input
              required
              value={v.nombre ?? ""}
              onChange={(e) => setV({ ...v, nombre: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="SKU">
            <input
              value={v.sku ?? ""}
              onChange={(e) => setV({ ...v, sku: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Laboratorio *">
            <select
              required
              value={v.laboratorio_id ?? ""}
              onChange={(e) => setV({ ...v, laboratorio_id: e.target.value })}
              className="input"
            >
              <option value="">— Selecciona —</option>
              {labs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Presentación">
            <input
              placeholder="ej. Frasco 100 ml"
              value={v.presentacion ?? ""}
              onChange={(e) => setV({ ...v, presentacion: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Categoría">
            <input
              placeholder="ej. Antiparasitario"
              value={v.categoria ?? ""}
              onChange={(e) => setV({ ...v, categoria: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Especies (coma)" full>
            <input
              placeholder="canino, felino"
              value={v.especie?.join(", ") ?? ""}
              onChange={(e) =>
                setV({
                  ...v,
                  especie: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="input"
            />
          </Field>
          <Field label="Precio lista *">
            <input
              type="number"
              step="0.01"
              required
              value={v.precio_lista ?? 0}
              onChange={(e) => setV({ ...v, precio_lista: Number(e.target.value) })}
              className="input"
            />
          </Field>
          <Field label="Unidad">
            <input
              value={v.unidad ?? "pieza"}
              onChange={(e) => setV({ ...v, unidad: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="IVA %">
            <input
              type="number"
              step="0.01"
              value={v.iva_pct ?? 16}
              onChange={(e) => setV({ ...v, iva_pct: Number(e.target.value) })}
              className="input"
            />
          </Field>
          <Field label="Activo">
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={v.activo ?? true}
                onChange={(e) => setV({ ...v, activo: e.target.checked })}
              />
              Producto activo
            </label>
          </Field>
          <Field label="Descripción" full>
            <textarea
              rows={3}
              value={v.descripcion ?? ""}
              onChange={(e) => setV({ ...v, descripcion: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Imagen" full>
            <div className="flex items-center gap-3">
              {v.imagen_url && (
                <img
                  src={v.imagen_url}
                  alt=""
                  className="h-16 w-16 rounded border border-border object-cover"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f);
                }}
                disabled={uploading}
                className="text-xs"
              />
              {uploading && <span className="text-xs text-muted-foreground">Subiendo…</span>}
            </div>
          </Field>

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={saving || uploading} className="btn-primary">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
