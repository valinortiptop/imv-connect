import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Upload, Trash2, Download, Plus, Calendar } from "lucide-react";
import {
  listDocumentosClienteFn,
  upsertDocumentoClienteFn,
  deleteDocumentoClienteFn,
  signedUrlDocumentoFn,
} from "@/lib/cobranza-alertas.functions";

export const Route = createFileRoute("/admin/credito-cobranza/clientes/$id/expediente")({
  head: () => ({ meta: [{ title: "Expediente digital" }] }),
  component: ExpedientePage,
});

const TIPOS = [
  { value: "rfc", label: "RFC / Constancia fiscal" },
  { value: "contrato", label: "Contrato" },
  { value: "pagare", label: "Pagaré" },
  { value: "autorizacion", label: "Autorización de crédito" },
  { value: "evidencia", label: "Evidencia de cobranza" },
  { value: "otro", label: "Otro" },
];

function ExpedientePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listDocumentosClienteFn);
  const upsertFn = useServerFn(upsertDocumentoClienteFn);
  const deleteFn = useServerFn(deleteDocumentoClienteFn);
  const signedFn = useServerFn(signedUrlDocumentoFn);

  const { data: docs = [] } = useQuery({
    queryKey: ["cliente-documentos", id],
    queryFn: () => listFn({ data: { clienteId: id } }),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    tipo: "otro", nombre: "", fecha_emision: "", fecha_vencimiento: "", notas: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    if (!form.nombre) { toast.error("Nombre requerido"); return; }
    setUploading(true);
    try {
      let storage_path: string | null = null;
      if (file) {
        const path = `${id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("cliente-documentos").upload(path, file);
        if (error) throw error;
        storage_path = path;
      }
      await upsertFn({
        data: {
          cliente_id: id,
          tipo: form.tipo,
          nombre: form.nombre,
          storage_path,
          fecha_emision: form.fecha_emision || null,
          fecha_vencimiento: form.fecha_vencimiento || null,
          notas: form.notas || null,
        },
      });
      toast.success("Documento guardado");
      qc.invalidateQueries({ queryKey: ["cliente-documentos", id] });
      setOpen(false);
      setForm({ tipo: "otro", nombre: "", fecha_emision: "", fecha_vencimiento: "", notas: "" });
      setFile(null);
    } catch (e: any) {
      toast.error(e?.message || "Error");
    } finally {
      setUploading(false);
    }
  };

  const remove = useMutation({
    mutationFn: (docId: string) => deleteFn({ data: { id: docId } }),
    onSuccess: () => {
      toast.success("Documento eliminado");
      qc.invalidateQueries({ queryKey: ["cliente-documentos", id] });
    },
  });

  const download = async (storage_path: string) => {
    try {
      const { url } = await signedFn({ data: { storage_path } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message || "Error");
    }
  };

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Expediente digital</h2>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo documento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Agregar documento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nombre</label>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Fecha emisión</label>
                  <Input type="date" value={form.fecha_emision} onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Vencimiento</label>
                  <Input type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Archivo</label>
                <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notas</label>
                <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={uploading}>{uploading ? "Guardando…" : "Guardar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {docs.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin documentos</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {docs.map((d: any) => {
            const vencido = d.fecha_vencimiento && d.fecha_vencimiento < hoy;
            return (
              <Card key={d.id}>
                <CardContent className="py-3 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{d.nombre}</span>
                      <Badge variant="outline">{d.tipo}</Badge>
                      {vencido && <Badge className="bg-red-500/15 text-red-600 border-red-500/30" variant="outline">Vencido</Badge>}
                    </div>
                    {(d.fecha_emision || d.fecha_vencimiento) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        {d.fecha_emision && <>Emitido: {d.fecha_emision}</>}
                        {d.fecha_vencimiento && <> · Vence: {d.fecha_vencimiento}</>}
                      </p>
                    )}
                    {d.notas && <p className="text-xs text-muted-foreground mt-0.5">{d.notas}</p>}
                  </div>
                  {d.storage_path && (
                    <Button size="sm" variant="outline" onClick={() => download(d.storage_path)}>
                      <Download className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(d.id)}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
