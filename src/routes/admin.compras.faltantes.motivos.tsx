// @ts-nocheck
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listShortageReasons,
  upsertShortageReason,
  deleteShortageReason,
} from "@/lib/compras.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Trash2, Pencil } from "lucide-react";

export const Route = createFileRoute("/admin/compras/faltantes/motivos")({
  head: () => ({ meta: [{ title: "Motivos de faltante — Compras" }] }),
  component: MotivosPage,
});

function MotivosPage() {
  const qc = useQueryClient();
  const fnList = useServerFn(listShortageReasons);
  const fnUpsert = useServerFn(upsertShortageReason);
  const fnDelete = useServerFn(deleteShortageReason);

  const { data, isLoading } = useQuery({
    queryKey: ["shortage-reasons"],
    queryFn: () => fnList(),
  });

  const motivos = data?.motivos ?? [];

  const [editing, setEditing] = useState<{ id?: string; codigo: string; label: string; activo: boolean } | null>(null);

  const mSave = useMutation({
    mutationFn: async (payload: any) => fnUpsert({ data: payload }),
    onSuccess: () => {
      toast.success("Motivo guardado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["shortage-reasons"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDelete = useMutation({
    mutationFn: async (id: string) => fnDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Motivo eliminado");
      qc.invalidateQueries({ queryKey: ["shortage-reasons"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/admin/compras/faltantes"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> Faltantes
        </Link>
        <h1 className="text-2xl font-bold">Catálogo de motivos</h1>
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={() => setEditing({ codigo: "", label: "", activo: true })}
          >
            <Plus className="mr-1 h-4 w-4" /> Nuevo motivo
          </Button>
        </div>
      </div>

      {editing && (
        <div className="max-w-lg space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label>Código</Label>
            <Input
              value={editing.codigo}
              onChange={(e) => setEditing({ ...editing, codigo: e.target.value.replace(/\s/g, "_").toLowerCase() })}
              placeholder="prov_sin_stock"
              disabled={!!editing.id}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Etiqueta</Label>
            <Input
              value={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              placeholder="Proveedor sin stock"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={editing.activo}
              onCheckedChange={(v) => setEditing({ ...editing, activo: v })}
            />
            <span className="text-sm">Activo</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => mSave.mutate(editing)}
              disabled={mSave.isPending || !editing.codigo || !editing.label}
            >
              Guardar
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Etiqueta</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Cargando…</td></tr>
            ) : motivos.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Sin motivos configurados.</td></tr>
            ) : motivos.map((m: any) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{m.codigo}</td>
                <td className="px-3 py-2">{m.label}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${m.activo ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                    {m.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditing({ id: m.id, codigo: m.codigo, label: m.label, activo: m.activo })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-600"
                      onClick={() => {
                        if (confirm(`¿Eliminar "${m.label}"?`)) mDelete.mutate(m.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
