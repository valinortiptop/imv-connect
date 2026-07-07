import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Building2, Plus, Star, Pencil, Trash2, Check, X,
  Mail, Phone, Globe, MapPin, Receipt, Warehouse,
  Upload, FileText, Sparkles, Image as ImageIcon, Type,
  FileSignature, Loader2, Download, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  parseCsfDocumentFn,
  uploadEmpresaDocFn,
  listEmpresaDocsFn,
  deleteEmpresaDocFn,
} from "@/lib/empresa-docs.functions";


export const Route = createFileRoute("/admin/empresas")({
  head: () => ({
    meta: [
      { title: "Empresas — Configuración" },
      { name: "description", content: "Administra las empresas que emiten facturas y documentos." },
    ],
  }),
  component: EmpresasPage,
});

export type Empresa = {
  id: string;
  razon_social: string;
  nombre_comercial: string | null;
  rfc: string;
  regimen_fiscal: string | null;
  uso_cfdi_default: string | null;
  cp_fiscal: string | null;
  direccion_fiscal: string | null;
  lugar_expedicion: string | null;
  telefono: string | null;
  email_contacto: string | null;
  sitio_web: string | null;
  representante_legal: string | null;
  logo_url: string | null;
  serie_factura_default: string | null;
  folio_next: number;
  moneda_default: string;
  iva_default: number;
  is_default: boolean;
  active: boolean;
};

const EMPTY: Partial<Empresa> = {
  razon_social: "",
  rfc: "",
  moneda_default: "MXN",
  iva_default: 16,
  folio_next: 1,
  is_default: false,
  active: true,
};

function EmpresasPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Empresa> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas" as any)
        .select("*")
        .order("is_default", { ascending: false })
        .order("razon_social");
      if (error) throw error;
      return (data ?? []) as unknown as Empresa[];
    },
  });

  const save = useMutation({
    mutationFn: async (e: Partial<Empresa>) => {
      const payload: any = {
        razon_social: (e.razon_social ?? "").trim(),
        nombre_comercial: e.nombre_comercial?.trim() || null,
        rfc: (e.rfc ?? "").trim().toUpperCase(),
        regimen_fiscal: e.regimen_fiscal?.trim() || null,
        uso_cfdi_default: e.uso_cfdi_default?.trim() || null,
        cp_fiscal: e.cp_fiscal?.trim() || null,
        direccion_fiscal: e.direccion_fiscal?.trim() || null,
        lugar_expedicion: e.lugar_expedicion?.trim() || null,
        telefono: e.telefono?.trim() || null,
        email_contacto: e.email_contacto?.trim() || null,
        sitio_web: e.sitio_web?.trim() || null,
        representante_legal: e.representante_legal?.trim() || null,
        logo_url: e.logo_url?.trim() || null,
        serie_factura_default: e.serie_factura_default?.trim() || null,
        folio_next: Number(e.folio_next ?? 1) || 1,
        moneda_default: e.moneda_default?.trim() || "MXN",
        iva_default: Number(e.iva_default ?? 16),
        is_default: e.is_default ?? false,
        active: e.active ?? true,
      };
      if (!payload.razon_social) throw new Error("Razón social requerida");
      if (!payload.rfc) throw new Error("RFC requerido");

      // If marking as default, clear other defaults first
      if (payload.is_default) {
        await supabase
          .from("empresas" as any)
          .update({ is_default: false })
          .neq("id", e.id ?? "00000000-0000-0000-0000-000000000000");
      }

      if (e.id) {
        const { error } = await supabase.from("empresas" as any).update(payload).eq("id", e.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("empresas" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Empresa guardada");
      qc.invalidateQueries({ queryKey: ["empresas"] });
      qc.invalidateQueries({ queryKey: ["billing-entities"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("empresas" as any).update({ is_default: false }).neq("id", id);
      const { error } = await supabase.from("empresas" as any).update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Predeterminada actualizada");
      qc.invalidateQueries({ queryKey: ["empresas"] });
      qc.invalidateQueries({ queryKey: ["billing-entities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("empresas" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa eliminada");
      qc.invalidateQueries({ queryKey: ["empresas"] });
      qc.invalidateQueries({ queryKey: ["billing-entities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Empresas
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Administra las empresas que emiten facturas y documentos. La empresa marcada como
            <strong className="text-foreground"> predeterminada </strong>
            se selecciona automáticamente al crear una factura.
          </p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="h-4 w-4 mr-2" /> Nueva empresa
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {error && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {data && data.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            Aún no tienes empresas registradas. Agrega la primera para poder facturar.
          </p>
          <Button onClick={() => setEditing({ ...EMPTY, is_default: true })}>
            <Plus className="h-4 w-4 mr-2" /> Registrar empresa
          </Button>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.map((e) => (
            <div
              key={e.id}
              className="rounded-lg border border-border bg-card p-5 space-y-3 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base truncate">
                      {e.nombre_comercial || e.razon_social}
                    </h3>
                    {e.is_default && (
                      <Badge className="bg-primary/15 text-primary border-primary/30 gap-1">
                        <Star className="h-3 w-3 fill-current" /> Predeterminada
                      </Badge>
                    )}
                    {!e.active && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactiva
                      </Badge>
                    )}
                  </div>
                  {e.nombre_comercial && (
                    <p className="text-xs text-muted-foreground truncate">{e.razon_social}</p>
                  )}
                  <p className="text-xs font-mono text-muted-foreground mt-1">{e.rfc}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!e.is_default && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Marcar como predeterminada"
                      onClick={() => setDefault.mutate(e.id)}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(e)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm(`¿Eliminar ${e.razon_social}?`)) remove.mutate(e.id);
                    }}
                    disabled={e.is_default}
                    title={e.is_default ? "No puedes eliminar la predeterminada" : "Eliminar"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {e.regimen_fiscal && (
                  <InfoRow icon={<Receipt className="h-3.5 w-3.5" />} label="Régimen" value={e.regimen_fiscal} />
                )}
                {e.cp_fiscal && (
                  <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="C.P." value={e.cp_fiscal} />
                )}
                {e.direccion_fiscal && (
                  <div className="col-span-2">
                    <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Dirección" value={e.direccion_fiscal} />
                  </div>
                )}
                {e.telefono && (
                  <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Teléfono" value={e.telefono} />
                )}
                {e.email_contacto && (
                  <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={e.email_contacto} />
                )}
                {e.sitio_web && (
                  <div className="col-span-2">
                    <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label="Web" value={e.sitio_web} />
                  </div>
                )}
              </div>

              <EmpresaAlmacenes empresaId={e.id} />
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EmpresaDialog
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
          saving={save.isPending}
        />
      )}
    </section>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-muted-foreground">
      <span className="mt-0.5 text-muted-foreground/70">{icon}</span>
      <div className="min-w-0">
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
        <p className="text-xs text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

function EmpresaDialog({
  value, onClose, onSave, saving,
}: {
  value: Partial<Empresa>;
  onClose: () => void;
  onSave: (v: Partial<Empresa>) => void;
  saving: boolean;
}) {
  const [v, setV] = useState<Partial<Empresa>>(value);
  const [tab, setTab] = useState<string>("datos");
  const set = <K extends keyof Empresa>(k: K, val: Empresa[K] | null) =>
    setV((prev) => ({ ...prev, [k]: val as any }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{v.id ? "Editar empresa" : "Nueva empresa"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="pt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="datos">Datos</TabsTrigger>
            <TabsTrigger value="documentos" disabled={!v.id}>
              Documentos
              {!v.id && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  (guarda primero)
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="datos" className="mt-4">
            <CsfImportRow
              onExtracted={(x) => {
                setV((prev) => ({
                  ...prev,
                  razon_social: x.razon_social ?? prev.razon_social,
                  nombre_comercial: x.nombre_comercial ?? prev.nombre_comercial,
                  rfc: x.rfc ?? prev.rfc,
                  regimen_fiscal: x.regimen_fiscal ?? prev.regimen_fiscal,
                  cp_fiscal: x.cp_fiscal ?? prev.cp_fiscal,
                  direccion_fiscal: x.direccion_fiscal ?? prev.direccion_fiscal,
                  representante_legal:
                    x.representante_legal ?? prev.representante_legal,
                  telefono: x.telefono ?? prev.telefono,
                  email_contacto: x.email_contacto ?? prev.email_contacto,
                }));
              }}
            />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSave(v);
              }}
              className="space-y-6 pt-4"
            >
              <Section title="Datos fiscales">
                <Field label="Razón social *" className="sm:col-span-2">
                  <Input
                    required
                    value={v.razon_social ?? ""}
                    onChange={(e) => set("razon_social", e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="Nombre comercial">
                  <Input
                    value={v.nombre_comercial ?? ""}
                    onChange={(e) => set("nombre_comercial", e.target.value)}
                  />
                </Field>
                <Field label="RFC *">
                  <Input
                    required
                    className="font-mono"
                    value={v.rfc ?? ""}
                    onChange={(e) => set("rfc", e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="Régimen fiscal">
                  <Input
                    placeholder="Ej: 601 General de Ley Personas Morales"
                    value={v.regimen_fiscal ?? ""}
                    onChange={(e) => set("regimen_fiscal", e.target.value)}
                  />
                </Field>
                <Field label="Uso CFDI predeterminado">
                  <Input
                    placeholder="Ej: G03 Gastos en general"
                    value={v.uso_cfdi_default ?? ""}
                    onChange={(e) => set("uso_cfdi_default", e.target.value)}
                  />
                </Field>
                <Field label="C.P. fiscal">
                  <Input
                    value={v.cp_fiscal ?? ""}
                    onChange={(e) => set("cp_fiscal", e.target.value)}
                  />
                </Field>
                <Field label="Lugar de expedición">
                  <Input
                    value={v.lugar_expedicion ?? ""}
                    onChange={(e) => set("lugar_expedicion", e.target.value)}
                  />
                </Field>
                <Field label="Dirección fiscal" className="sm:col-span-2">
                  <Textarea
                    rows={2}
                    value={v.direccion_fiscal ?? ""}
                    onChange={(e) => set("direccion_fiscal", e.target.value)}
                  />
                </Field>
                <Field label="Representante legal" className="sm:col-span-2">
                  <Input
                    value={v.representante_legal ?? ""}
                    onChange={(e) => set("representante_legal", e.target.value)}
                  />
                </Field>
              </Section>

              <Section title="Contacto">
                <Field label="Teléfono">
                  <Input value={v.telefono ?? ""} onChange={(e) => set("telefono", e.target.value)} />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={v.email_contacto ?? ""}
                    onChange={(e) => set("email_contacto", e.target.value)}
                  />
                </Field>
                <Field label="Sitio web" className="sm:col-span-2">
                  <Input
                    placeholder="https://…"
                    value={v.sitio_web ?? ""}
                    onChange={(e) => set("sitio_web", e.target.value)}
                  />
                </Field>
              </Section>

              <Section title="Facturación">
                <Field label="Serie factura (default)">
                  <Input
                    value={v.serie_factura_default ?? ""}
                    onChange={(e) => set("serie_factura_default", e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="Próximo folio">
                  <Input
                    type="number"
                    min={1}
                    value={v.folio_next ?? 1}
                    onChange={(e) => set("folio_next", Number(e.target.value) as any)}
                  />
                </Field>
                <Field label="Moneda">
                  <Input
                    value={v.moneda_default ?? "MXN"}
                    onChange={(e) => set("moneda_default", e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="IVA %">
                  <Input
                    type="number"
                    step="0.01"
                    value={v.iva_default ?? 16}
                    onChange={(e) => set("iva_default", Number(e.target.value) as any)}
                  />
                </Field>
              </Section>

              <Section title="Branding">
                <Field label="Logo (URL)" className="sm:col-span-2">
                  <Input
                    placeholder="https://…/logo.png"
                    value={v.logo_url ?? ""}
                    onChange={(e) => set("logo_url", e.target.value)}
                  />
                  {v.logo_url && (
                    <img
                      src={v.logo_url}
                      alt="Logo preview"
                      className="mt-2 max-h-16 rounded border border-border object-contain bg-muted p-1"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                    />
                  )}
                </Field>
              </Section>

              <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-muted/30 p-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Switch
                    checked={v.is_default ?? false}
                    onCheckedChange={(c) => set("is_default", c)}
                  />
                  Predeterminada para facturar
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Switch checked={v.active ?? true} onCheckedChange={(c) => set("active", c)} />
                  Activa
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-1">
                <Button type="button" variant="outline" onClick={onClose}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  <Check className="h-4 w-4 mr-1" />
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="documentos" className="mt-4">
            {v.id ? (
              <EmpresaDocumentos empresaId={v.id} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Guarda la empresa para poder subir documentos.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Almacenes per empresa — inline CRUD panel
// ─────────────────────────────────────────────────────────────

type Almacen = {
  id: string;
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  principal: boolean;
  activo: boolean;
  empresa_id: string | null;
};

function EmpresaAlmacenes({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ nombre: string; codigo: string; direccion: string }>({
    nombre: "", codigo: "", direccion: "",
  });

  const { data: almacenes = [], isLoading } = useQuery({
    queryKey: ["almacenes-por-empresa", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("almacenes")
        .select("id, nombre, codigo, direccion, principal, activo, empresa_id")
        .eq("empresa_id", empresaId)
        .order("principal", { ascending: false })
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as unknown as Almacen[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["almacenes-por-empresa", empresaId] });
    qc.invalidateQueries({ queryKey: ["almacenes"] });
    qc.invalidateQueries({ queryKey: ["dashboard-almacenes"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const nombre = draft.nombre.trim();
      if (!nombre) throw new Error("Nombre requerido");
      const payload: any = {
        empresa_id: empresaId,
        nombre,
        codigo: draft.codigo.trim() || null,
        direccion: draft.direccion.trim() || null,
        activo: true,
        principal: almacenes.length === 0,
      };
      const { error } = await supabase.from("almacenes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft({ nombre: "", codigo: "", direccion: "" });
      setAdding(false);
      toast.success("Almacén agregado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("almacenes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Almacén eliminado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPrincipal = useMutation({
    mutationFn: async (id: string) => {
      // clear other principals for this empresa
      await supabase.from("almacenes").update({ principal: false } as any).eq("empresa_id", empresaId);
      const { error } = await supabase.from("almacenes").update({ principal: true } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Warehouse className="h-3.5 w-3.5" /> Almacenes
        </div>
        {!adding && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : almacenes.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">Sin almacenes. Agrega el primero para esta empresa.</p>
      ) : (
        <ul className="space-y-1.5">
          {almacenes.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded border border-border/50 bg-background/60 px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium truncate">{a.nombre}</span>
                  {a.codigo && (
                    <span className="text-[10px] font-mono text-muted-foreground">{a.codigo}</span>
                  )}
                  {a.principal && (
                    <Badge className="bg-primary/15 text-primary border-primary/30 h-4 px-1.5 text-[10px]">
                      Principal
                    </Badge>
                  )}
                </div>
                {a.direccion && (
                  <p className="text-[11px] text-muted-foreground truncate">{a.direccion}</p>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {!a.principal && (
                  <Button
                    size="icon" variant="ghost" className="h-6 w-6"
                    title="Marcar como principal"
                    onClick={() => setPrincipal.mutate(a.id)}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  onClick={() => { if (confirm(`¿Eliminar ${a.nombre}?`)) remove.mutate(a.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-2 space-y-2 rounded border border-dashed border-border p-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Nombre *"
              value={draft.nombre}
              onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
              className="h-8 text-sm"
            />
            <Input
              placeholder="Código"
              value={draft.codigo}
              onChange={(e) => setDraft({ ...draft, codigo: e.target.value })}
              className="h-8 text-sm font-mono"
            />
          </div>
          <Input
            placeholder="Dirección"
            value={draft.direccion}
            onChange={(e) => setDraft({ ...draft, direccion: e.target.value })}
            className="h-8 text-sm"
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAdding(false); setDraft({ nombre: "", codigo: "", direccion: "" }); }}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => create.mutate()} disabled={create.isPending || !draft.nombre.trim()}>
              <Check className="h-3.5 w-3.5 mr-1" /> Guardar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CSF import row (autofill Datos tab from a Constancia)
// ─────────────────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    );
  }
  return btoa(binary);
}

function CsfImportRow({
  onExtracted,
}: {
  onExtracted: (x: any) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const parseCsf = useServerFn(parseCsfDocumentFn);

  const handle = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("El archivo excede 15 MB.");
      return;
    }
    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await parseCsf({
        data: { filename: file.name, mime: file.type || "application/pdf", base64 },
      });
      if (!res.extracted) {
        toast.error("No pude extraer datos del documento.");
        return;
      }
      onExtracted(res.extracted);
      toast.success(
        `Datos extraídos${
          res.extracted.confianza
            ? ` (confianza ${Math.round(res.extracted.confianza * 100)}%)`
            : ""
        }. Revisa antes de guardar.`,
      );
    } catch (e) {
      toast.error((e as Error).message || "Error al analizar el documento.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Importar desde Constancia de Situación Fiscal</p>
          <p className="text-xs text-muted-foreground">
            Sube el PDF (o foto) de la CSF y la IA autocompleta RFC, razón social,
            régimen fiscal, dirección y más.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handle(f);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analizando…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-1" /> Subir CSF
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Documentos tab
// ─────────────────────────────────────────────────────────────

type EmpresaDoc = {
  id: string;
  empresa_id: string;
  storage_path: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  categoria: string;
  etiquetas: string[];
  resumen: string | null;
  ai_analyzed: boolean;
  created_at: string;
  signed_url: string | null;
};

const CAT_LABEL: Record<string, string> = {
  logo: "Logo",
  fuente: "Fuente",
  csf: "CSF",
  fiscal: "Fiscal",
  legal: "Legal",
  contrato: "Contrato",
  branding: "Branding",
  comprobante: "Comprobante",
  general: "General",
  otro: "Otro",
};

function CategoriaIcon({ categoria }: { categoria: string }) {
  const cls = "h-4 w-4";
  switch (categoria) {
    case "logo": return <ImageIcon className={cls} />;
    case "fuente": return <Type className={cls} />;
    case "csf":
    case "fiscal": return <Receipt className={cls} />;
    case "legal":
    case "contrato": return <FileSignature className={cls} />;
    default: return <FileText className={cls} />;
  }
}

function formatBytes(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function EmpresaDocumentos({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const uploadDoc = useServerFn(uploadEmpresaDocFn);
  const listDocs = useServerFn(listEmpresaDocsFn);
  const deleteDoc = useServerFn(deleteEmpresaDocFn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["empresa-docs", empresaId],
    queryFn: async () => {
      const res = await listDocs({ data: { empresa_id: empresaId } });
      return res.documents as EmpresaDoc[];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["empresa-docs", empresaId] });

  const handleUpload = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("El archivo excede 20 MB.");
      return;
    }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await uploadDoc({
        data: {
          empresa_id: empresaId,
          filename: file.name,
          mime: file.type || "application/octet-stream",
          base64,
          size_bytes: file.size,
        },
      });
      const cat = (res.document as any)?.categoria ?? "general";
      toast.success(
        `Documento subido${
          (res.document as any)?.ai_analyzed
            ? ` — categorizado como “${CAT_LABEL[cat] ?? cat}”`
            : ""
        }.`,
      );
      invalidate();
    } catch (e) {
      toast.error((e as Error).message || "Error al subir.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDelete = async (d: EmpresaDoc) => {
    if (!confirm(`¿Eliminar ${d.filename}?`)) return;
    try {
      await deleteDoc({ data: { id: d.id } });
      toast.success("Documento eliminado");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const groups = (data ?? []).reduce<Record<string, EmpresaDoc[]>>((acc, d) => {
    (acc[d.categoria] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Sube documentos de la empresa</p>
          <p className="text-xs text-muted-foreground">
            La IA los clasifica en logo, fuente, CSF, fiscal, legal, contrato,
            branding, etc.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Subiendo…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-1" /> Subir
            </>
          )}
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Cargando documentos…</p>
      )}
      {error && (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      )}
      {data && data.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-6">
          Aún no hay documentos.
        </p>
      )}

      {Object.entries(groups).map(([cat, docs]) => (
        <div key={cat} className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <CategoriaIcon categoria={cat} />
            {CAT_LABEL[cat] ?? cat}
            <span className="text-muted-foreground/60">({docs.length})</span>
          </div>
          <ul className="space-y-1.5">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-start gap-3 rounded border border-border bg-card p-2.5"
              >
                {d.mime?.startsWith("image/") && d.signed_url ? (
                  <img
                    src={d.signed_url}
                    alt={d.filename}
                    className="h-12 w-12 rounded object-contain bg-muted shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted grid place-items-center shrink-0">
                    <CategoriaIcon categoria={d.categoria} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{d.filename}</span>
                    {d.ai_analyzed && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] gap-1">
                        <Sparkles className="h-2.5 w-2.5" /> IA
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{formatBytes(d.size_bytes)}</span>
                    <span>·</span>
                    <span>{new Date(d.created_at).toLocaleDateString()}</span>
                  </div>
                  {d.resumen && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {d.resumen}
                    </p>
                  )}
                  {d.etiquetas?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {d.etiquetas.slice(0, 6).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {d.signed_url && (
                    <a
                      href={d.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      title="Abrir"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {d.signed_url && (
                    <a
                      href={d.signed_url}
                      download={d.filename}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      title="Descargar"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                    onClick={() => onDelete(d)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
