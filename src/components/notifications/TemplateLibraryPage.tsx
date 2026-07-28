import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Mail,
  MessageSquare,
  Bell,
  Plus,
  Search,
  Copy,
  Trash2,
  Send,
  Eye,
  Pencil,
  Lock,
  Smartphone,
  Monitor,
} from "lucide-react";
import {
  listTemplatesFn,
  saveTemplateFn,
  toggleTemplateFn,
  deleteTemplateFn,
  duplicateTemplateFn,
  sendTestTemplateFn,
} from "@/lib/message-templates.functions";
import { NOTIFICATION_CATEGORIES, CATEGORY_LABEL } from "@/lib/notification-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tpl = {
  id: string;
  key: string;
  name: string;
  channel: "email" | "sms" | "whatsapp" | "in_app";
  category: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  variables: string[] | null;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  updated_at: string;
};

const CHANNELS = [
  { key: "email", label: "Email", icon: Mail },
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "whatsapp", label: "WhatsApp", icon: Smartphone },
  { key: "in_app", label: "Sistema", icon: Bell },
] as const;

const EMPTY: Partial<Tpl> = {
  key: "",
  name: "",
  channel: "email",
  category: "sistema",
  subject: "",
  body_html: "",
  body_text: "",
  description: "",
  is_active: true,
};

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default function TemplateLibraryPage() {
  const qc = useQueryClient();
  const list = useServerFn(listTemplatesFn);
  const save = useServerFn(saveTemplateFn);
  const toggle = useServerFn(toggleTemplateFn);
  const remove = useServerFn(deleteTemplateFn);
  const duplicate = useServerFn(duplicateTemplateFn);
  const sendTest = useServerFn(sendTestTemplateFn);

  const { data, isLoading } = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => list(),
  });

  const [channel, setChannel] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Tpl> | null>(null);
  const [previewing, setPreviewing] = useState<Tpl | null>(null);
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});
  const [testTo, setTestTo] = useState("");

  const templates: Tpl[] = (data?.templates ?? []) as Tpl[];
  const isAdmin = !!data?.isAdmin;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return templates.filter((t) => {
      if (channel !== "all" && t.channel !== channel) return false;
      if (category !== "all" && t.category !== category) return false;
      if (!term) return true;
      return (
        t.name.toLowerCase().includes(term) ||
        t.key.toLowerCase().includes(term) ||
        (t.subject ?? "").toLowerCase().includes(term)
      );
    });
  }, [templates, channel, category, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: templates.length };
    for (const t of templates) c[t.channel] = (c[t.channel] ?? 0) + 1;
    return c;
  }, [templates]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["message-templates"] });

  const saveMut = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: () => {
      toast.success("Plantilla guardada");
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });

  const openPreview = (t: Tpl) => {
    const vars: Record<string, string> = {};
    (t.variables ?? []).forEach((v) => (vars[v] = `«${v}»`));
    setPreviewVars(vars);
    setTestTo("");
    setPreviewing(t);
  };

  const rendered = (tpl: string | null | undefined) =>
    (tpl ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => previewVars[k] ?? "");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Librería de plantillas</h1>
          <p className="text-sm text-muted-foreground">
            Crea y edita las plantillas de Email, SMS, WhatsApp y avisos del sistema que usa la plataforma.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="mr-2 h-4 w-4" /> Nueva plantilla
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {CHANNELS.map((c) => (
          <Card key={c.key}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <c.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-lg font-semibold leading-none">{counts[c.key] ?? 0}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={channel} onValueChange={setChannel}>
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            {CHANNELS.map((c) => (
              <TabsTrigger key={c.key} value={c.key}>
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {NOTIFICATION_CATEGORIES.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, clave o asunto…"
            className="pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No hay plantillas que coincidan.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const Icon = CHANNELS.find((c) => c.key === t.channel)?.icon ?? Mail;
            return (
              <Card key={t.id} className={cn(!t.is_active && "opacity-60")}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{highlight(t.name, q)}</span>
                      {t.is_system && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    </CardTitle>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {highlight(t.key, q)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {CATEGORY_LABEL[t.category] ?? t.category}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {t.subject && (
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Asunto: </span>
                      {highlight(t.subject, q)}
                    </p>
                  )}
                  {t.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {(t.variables ?? []).slice(0, 5).map((v) => (
                      <span
                        key={v}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {`{{${v}}}`}
                      </span>
                    ))}
                    {(t.variables ?? []).length > 5 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{(t.variables ?? []).length - 5}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
                    <Button size="sm" variant="ghost" onClick={() => openPreview(t)}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> Ver
                    </Button>
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await duplicate({ data: { id: t.id } });
                            toast.success("Plantilla duplicada");
                            invalidate();
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {!t.is_system && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={async () => {
                              if (!confirm(`¿Eliminar la plantilla "${t.name}"?`)) return;
                              await remove({ data: { id: t.id } });
                              toast.success("Plantilla eliminada");
                              invalidate();
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <div className="ml-auto flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">
                            {t.is_active ? "Activa" : "Inactiva"}
                          </span>
                          <Switch
                            checked={t.is_active}
                            onCheckedChange={async (v) => {
                              await toggle({ data: { id: t.id, active: v } });
                              invalidate();
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Editor */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
            <DialogDescription>
              Usa <code className="font-mono">{"{{variable}}"}</code> para insertar datos dinámicos.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Clave</Label>
                <Input
                  value={editing.key ?? ""}
                  disabled={!!editing.is_system}
                  onChange={(e) =>
                    setEditing({ ...editing, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })
                  }
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select
                  value={editing.channel ?? "email"}
                  onValueChange={(v) => setEditing({ ...editing, channel: v as Tpl["channel"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select
                  value={editing.category ?? "sistema"}
                  onValueChange={(v) => setEditing({ ...editing, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editing.channel === "email" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Asunto</Label>
                  <Input
                    value={editing.subject ?? ""}
                    onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                  />
                </div>
              )}
              {editing.channel === "email" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Contenido HTML</Label>
                  <Textarea
                    rows={10}
                    className="font-mono text-xs"
                    value={editing.body_html ?? ""}
                    onChange={(e) => setEditing({ ...editing, body_html: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>
                  {editing.channel === "email" ? "Versión de texto plano" : "Contenido del mensaje"}
                </Label>
                <Textarea
                  rows={editing.channel === "email" ? 3 : 6}
                  value={editing.body_text ?? ""}
                  onChange={(e) => setEditing({ ...editing, body_text: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Descripción interna</Label>
                <Input
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              disabled={saveMut.isPending || !editing?.name || !editing?.key}
              onClick={() =>
                saveMut.mutate({
                  id: editing?.id,
                  key: editing?.key,
                  name: editing?.name,
                  channel: editing?.channel ?? "email",
                  category: editing?.category ?? "sistema",
                  subject: editing?.subject || null,
                  body_html: editing?.body_html || null,
                  body_text: editing?.body_text || null,
                  description: editing?.description || null,
                  is_active: editing?.is_active ?? true,
                })
              }
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vista previa */}
      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-4 w-4" /> {previewing?.name}
            </DialogTitle>
            <DialogDescription>
              Prueba la plantilla con valores de ejemplo antes de usarla.
            </DialogDescription>
          </DialogHeader>
          {previewing && (
            <div className="space-y-4">
              {(previewing.variables ?? []).length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(previewing.variables ?? []).map((v) => (
                    <div key={v} className="space-y-1">
                      <Label className="font-mono text-[11px]">{`{{${v}}}`}</Label>
                      <Input
                        value={previewVars[v] ?? ""}
                        onChange={(e) => setPreviewVars({ ...previewVars, [v]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              )}
              {previewing.subject && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Asunto: </span>
                  {rendered(previewing.subject)}
                </div>
              )}
              {previewing.body_html ? (
                <iframe
                  title="preview"
                  className="h-80 w-full rounded-md border border-border bg-white"
                  srcDoc={rendered(previewing.body_html)}
                />
              ) : (
                <pre className="whitespace-pre-wrap rounded-md border border-border p-3 text-sm">
                  {rendered(previewing.body_text)}
                </pre>
              )}
              {isAdmin && previewing.channel === "email" && (
                <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                  <div className="min-w-56 flex-1 space-y-1">
                    <Label>Enviar prueba a</Label>
                    <Input
                      placeholder="tu@correo.com"
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={async () => {
                      try {
                        const r: any = await sendTest({
                          data: {
                            id: previewing.id,
                            to: testTo || undefined,
                            vars: previewVars,
                          },
                        });
                        r?.ok ? toast.success(r.message) : toast.error(r?.message ?? "No enviado");
                      } catch (e: any) {
                        toast.error(e?.message ?? "No se pudo enviar");
                      }
                    }}
                  >
                    <Send className="mr-2 h-4 w-4" /> Enviar prueba
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
