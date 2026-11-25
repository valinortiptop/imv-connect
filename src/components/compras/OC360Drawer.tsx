import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel360 } from "@/components/shared/Panel360";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OCDetailView } from "./OCDetailView";

const fmtCdmx = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });
const mxn = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

const CAMPOS: Record<string, string> = {
  creada: "Orden creada",
  estado: "Estado",
  fecha_esperada: "Fecha esperada",
  fecha_recepcion: "Fecha de recepción",
  total: "Total",
  notas: "Notas",
  factura_proveedor: "Factura proveedor",
  laboratorio_id: "Laboratorio",
  almacen_id: "Almacén",
};

export function OC360Drawer({ ocId, onClose }: { ocId: string | null; onClose: () => void }) {
  return (
    <Panel360
      open={!!ocId}
      onOpenChange={(o) => !o && onClose()}
      title="Orden de compra 360"
      description="Detalle, recepciones, archivos e historial"
      actions={
        ocId ? (
          <Link to="/admin/compras/$id" params={{ id: ocId }} className="rounded-sm p-1 opacity-70 hover:opacity-100" aria-label="Abrir página completa" title="Abrir página completa">
            <ExternalLink className="h-4 w-4" />
          </Link>
        ) : null
      }
    >
      {ocId && <OC360Body ocId={ocId} embedded />}
    </Panel360>
  );
}

export function OC360Body({ ocId, embedded = false }: { ocId: string; embedded?: boolean }) {
  return (
    <Tabs defaultValue="detalle">
      <TabsList className="flex w-full flex-wrap justify-start">
        <TabsTrigger value="detalle">Detalle</TabsTrigger>
        <TabsTrigger value="recepciones">Recepciones</TabsTrigger>
        <TabsTrigger value="archivos">Archivos</TabsTrigger>
        <TabsTrigger value="historial">Historial</TabsTrigger>
      </TabsList>
      <TabsContent value="detalle" className="pt-4"><OCDetailView id={ocId} embedded={embedded} /></TabsContent>
      <TabsContent value="recepciones" className="pt-4"><Recepciones ocId={ocId} /></TabsContent>
      <TabsContent value="archivos" className="pt-4"><Archivos ocId={ocId} /></TabsContent>
      <TabsContent value="historial" className="pt-4"><Historial ocId={ocId} /></TabsContent>
    </Tabs>
  );
}

function Estado({ q, empty }: { q: { isLoading: boolean; error: unknown }; empty: boolean }) {
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (q.error) return <p className="text-sm text-destructive">No se pudo cargar: {(q.error as Error).message}</p>;
  if (empty) return <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sin registros.</p>;
  return null;
}

function Recepciones({ ocId }: { ocId: string }) {
  const entradasQ = useQuery({
    queryKey: ["oc-entradas", ocId],
    queryFn: async () => {
      const { data, error } = await supabase.from("entradas_recepcion").select("id, folio, fecha, estado, factura_proveedor, notas, created_at").eq("oc_id", ocId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const lotesQ = useQuery({
    queryKey: ["oc-lotes", ocId],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_batches").select("id, lote, caducidad, cantidad, costo_unitario, created_at, productos(nombre, sku)").eq("oc_id", ocId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; lote: string | null; caducidad: string | null; cantidad: number; costo_unitario: number | null; created_at: string; productos: { nombre: string; sku: string | null } | null }>;
    },
  });
  const entradas = entradasQ.data ?? [];
  const lotes = lotesQ.data ?? [];
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Entradas de recepción</h3>
        <Estado q={entradasQ} empty={entradas.length === 0} />
        <ul className="space-y-2">
          {entradas.map((e) => (
            <li key={e.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><span className="font-mono text-xs">{e.folio ?? "—"}</span><span className="text-xs text-muted-foreground">{e.fecha} · {e.estado}</span></div>
              {e.factura_proveedor && <div className="text-xs text-muted-foreground">Factura: {e.factura_proveedor}</div>}
              {e.notas && <div className="text-xs">{e.notas}</div>}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Lotes generados</h3>
        <Estado q={lotesQ} empty={lotes.length === 0} />
        {lotes.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Lote</th><th className="px-3 py-2">Caducidad</th><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2 text-right">Costo</th></tr>
              </thead>
              <tbody>
                {lotes.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-2">{l.productos?.nombre ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.lote ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{l.caducidad ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(l.cantidad)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{mxn(l.costo_unitario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Archivos({ ocId }: { ocId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const docsQ = useQuery({
    queryKey: ["oc-docs", ocId],
    queryFn: async () => {
      const { data, error } = await supabase.from("oc_documents").select("*").eq("oc_id", ocId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    for (const f of list) {
      const id = crypto.randomUUID();
      const ext = f.name.includes(".") ? f.name.split(".").pop() : "bin";
      const path = `${ocId}/${id}.${ext}`;
      const up = await supabase.storage.from("oc-documentos").upload(path, f, { contentType: f.type || undefined });
      if (up.error) { toast.error(`${f.name}: ${up.error.message}`); continue; }
      const ins = await supabase.from("oc_documents").insert({ oc_id: ocId, nombre: f.name, storage_path: path, mime_type: f.type || null, size_bytes: f.size, uploaded_by: u.user?.id ?? null });
      if (ins.error) toast.error(`${f.name}: ${ins.error.message}`);
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["oc-docs", ocId] });
    toast.success("Archivos guardados");
  };
  const open = async (path: string) => {
    const { data, error } = await supabase.storage.from("oc-documentos").createSignedUrl(path, 300);
    if (error || !data) return toast.error(error?.message ?? "No se pudo abrir");
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const remove = async (id: string, path: string) => {
    if (!confirm("¿Eliminar archivo?")) return;
    const { error } = await supabase.from("oc_documents").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.storage.from("oc-documentos").remove([path]);
    qc.invalidateQueries({ queryKey: ["oc-docs", ocId] });
  };
  const docs = docsQ.data ?? [];
  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed p-6 text-center text-sm focus-within:ring-2 focus-within:ring-ring ${drag ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <span>{busy ? "Subiendo…" : "Arrastra archivos o haz clic para subir"}</span>
        <span className="text-xs text-muted-foreground">Facturas, remisiones, cotizaciones (máx. 20 MB)</span>
        <input type="file" multiple className="sr-only" disabled={busy} onChange={(e) => e.target.files && void upload(e.target.files)} />
      </label>
      <Estado q={docsQ} empty={docs.length === 0} />
      <ul className="space-y-2">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <button onClick={() => open(d.storage_path)} className="min-w-0 flex-1 truncate text-left hover:underline">{d.nombre}</button>
            <span className="hidden text-xs text-muted-foreground sm:inline">{fmtCdmx(d.created_at)}</span>
            <button onClick={() => remove(d.id, d.storage_path)} aria-label={`Eliminar ${d.nombre}`} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Historial({ ocId }: { ocId: string }) {
  const chQ = useQuery({
    queryKey: ["oc-changes", ocId],
    queryFn: async () => {
      const { data, error } = await supabase.from("oc_changes").select("*").eq("oc_id", ocId).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const costQ = useQuery({
    queryKey: ["oc-costos", ocId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_history").select("id, costo_anterior, costo_unitario, variacion_pct, created_at, productos(nombre)").eq("oc_id", ocId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; costo_anterior: number | null; costo_unitario: number; variacion_pct: number | null; created_at: string; productos: { nombre: string } | null }>;
    },
  });
  const ch = chQ.data ?? [];
  const costs = costQ.data ?? [];
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Cambios de la orden</h3>
        <Estado q={chQ} empty={ch.length === 0} />
        {ch.length === 0 && !chQ.isLoading && <p className="mt-1 text-xs text-muted-foreground">El historial se registra a partir de hoy; cambios anteriores no quedaron guardados.</p>}
        <ol className="space-y-2 border-l border-border pl-4">
          {ch.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="text-xs text-muted-foreground">{fmtCdmx(c.created_at)}</div>
              <div><span className="font-medium">{CAMPOS[c.campo] ?? c.campo}</span>{c.campo !== "creada" && <>: {c.valor_anterior ?? "—"} → {c.valor_nuevo ?? "—"}</>}</div>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Cambios de costo</h3>
        <Estado q={costQ} empty={costs.length === 0} />
        <ul className="space-y-1 text-sm">
          {costs.map((c) => (
            <li key={c.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-1">
              <span>{c.productos?.nombre ?? "—"}</span>
              <span className="tabular-nums text-xs">{mxn(c.costo_anterior)} → {mxn(c.costo_unitario)}{c.variacion_pct != null && ` (${Number(c.variacion_pct).toFixed(1)}%)`}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
