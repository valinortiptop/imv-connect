import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { AiUploader } from "@/components/onboarding/AiUploader";
import {
  AREAS, FASES, RESPONSABLES, estadoDoc, isDone, diasHasta, toLocalInput, fromLocalInput,
  type Item, type Archivo, type EstadoDoc,
} from "@/components/onboarding/types";
import { downloadTemplate, hasTemplate } from "@/components/onboarding/templates";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/onboarding")({
  head: () => ({
    meta: [
      { title: "Salida de NetSuite · Onboarding IMV" },
      { name: "description", content: "Seguimiento de documentos, sesiones y responsables para operar IMV sin NetSuite." },
      { property: "og:title", content: "Salida de NetSuite · Onboarding IMV" },
      { property: "og:description", content: "Documentos, sesiones y responsables para el arranque oficial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingPage,
});

type Programa = {
  id: number; fecha_corte: string | null; fase: string; decision_netsuite: string;
  nota_decision: string | null; apagado_aprobado_at: string | null;
};
type Sesion = {
  id: string; orden: number; titulo: string; participantes: string | null; duracion: string | null;
  objetivo: string | null; fecha_hora: string | null; estado: string; acuerdos: string | null;
  pendientes: string | null; responsables: string[];
};
type Tarea = { id: string; orden: number; titulo: string; descripcion: string | null; estado: string; fecha_compromiso: string | null };
type Semana = {
  id: string; semana_inicio: string; moneda: string; comentario: string | null;
  ventas_app: number | null; ventas_netsuite: number | null; cartera_app: number | null;
  cartera_netsuite: number | null; inventario_app: number | null; inventario_netsuite: number | null;
};

const db = supabase as any;

async function loadAll() {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  const [items, archivos, programa, sesiones, tareas, semanas, admin, conta] = await Promise.all([
    db.from("onboarding_items").select("*").order("orden"),
    db.from("onboarding_archivos").select("*").order("uploaded_at", { ascending: false }),
    db.from("onboarding_programa").select("*").eq("id", 1).maybeSingle(),
    db.from("onboarding_sesiones").select("*").order("orden"),
    db.from("onboarding_tareas_dev").select("*").order("orden"),
    db.from("onboarding_paralelo_semanas").select("*").order("semana_inicio"),
    uid ? supabase.rpc("has_role", { _user_id: uid, _role: "admin" }) : { data: false },
    uid ? supabase.rpc("has_role", { _user_id: uid, _role: "contabilidad" }) : { data: false },
  ]);
  const err = [items, archivos, programa, sesiones, tareas, semanas].find((r: any) => r.error);
  if (err) throw new Error(err.error.message);
  return {
    uid: uid ?? null,
    items: items.data as Item[],
    archivos: archivos.data as Archivo[],
    programa: programa.data as Programa | null,
    sesiones: sesiones.data as Sesion[],
    tareas: tareas.data as Tarea[],
    semanas: semanas.data as Semana[],
    isAdmin: !!admin.data,
    canValidate: !!admin.data || !!conta.data,
  };
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente", en_proceso: "En proceso", entregado: "Entregado", validado: "Validado", no_aplica: "No aplica",
  por_agendar: "Por agendar", agendada: "Agendada", realizada: "Realizada", listo: "Listo",
};
const ESTADO_CLS: Record<string, string> = {
  pendiente: "bg-muted text-muted-foreground",
  por_agendar: "bg-muted text-muted-foreground",
  en_proceso: "bg-accent text-accent-foreground",
  agendada: "bg-accent text-accent-foreground",
  entregado: "bg-primary/15 text-primary",
  realizada: "bg-primary/15 text-primary",
  listo: "bg-primary/15 text-primary",
  validado: "bg-primary text-primary-foreground",
  no_aplica: "bg-muted text-muted-foreground line-through",
};
function Pill({ e }: { e: string }) {
  return <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${ESTADO_CLS[e] ?? ""}`}>{ESTADO_LABEL[e] ?? e}</span>;
}

function OnboardingPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["onboarding-netsuite"], queryFn: loadAll });
  const refresh = () => qc.invalidateQueries({ queryKey: ["onboarding-netsuite"] });

  if (q.isLoading) return <p className="p-6 text-muted-foreground">Cargando tablero…</p>;
  if (q.error || !q.data)
    return (
      <div className="space-y-3 p-6">
        <p className="text-destructive">No se pudo cargar el tablero: {(q.error as Error)?.message}</p>
        <Button variant="outline" onClick={() => q.refetch()}>Reintentar</Button>
      </div>
    );
  const d = q.data;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Header d={d} refresh={refresh} />
      <Tabs defaultValue="documentos">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="sesiones">Sesiones</TabsTrigger>
          <TabsTrigger value="responsables">Responsables</TabsTrigger>
          <TabsTrigger value="desarrollo">Desarrollo pendiente</TabsTrigger>
          <TabsTrigger value="paralelo">Paralelo</TabsTrigger>
        </TabsList>
        <TabsContent value="documentos"><Documentos d={d} refresh={refresh} /></TabsContent>
        <TabsContent value="sesiones"><Sesiones d={d} refresh={refresh} /></TabsContent>
        <TabsContent value="responsables"><Responsables d={d} /></TabsContent>
        <TabsContent value="desarrollo"><Desarrollo d={d} refresh={refresh} /></TabsContent>
        <TabsContent value="paralelo"><Paralelo d={d} refresh={refresh} /></TabsContent>
      </Tabs>
    </div>
  );
}

type D = Awaited<ReturnType<typeof loadAll>>;
type P = { d: D; refresh: () => void };

async function save(table: string, match: Record<string, unknown>, patch: Record<string, unknown>, refresh: () => void) {
  let qb = db.from(table).update(patch);
  for (const [k, v] of Object.entries(match)) qb = qb.eq(k, v);
  const { data, error } = await qb.select("id");
  if (error || !data?.length) toast.error(error?.message ?? "Sin permisos para guardar");
  refresh();
}

/* ───────── Encabezado ───────── */
function Header({ d, refresh }: P) {
  const p = d.programa;
  const docs = d.items.filter((i) => i.requerido && i.area !== "configuracion" && i.estado !== "no_aplica");
  const done = docs.filter((i) => isDone(estadoDoc(i, d.archivos))).length;
  const ses = d.sesiones.filter((s) => s.estado === "realizada").length;
  const dev = d.tareas.filter((t) => t.estado === "listo").length;
  const total = docs.length + d.sesiones.length + d.tareas.length;
  const pct = total ? Math.round(((done + ses + dev) / total) * 100) : 0;
  const faseIdx = FASES.findIndex((f) => f.key === p?.fase);
  const dias = p?.fecha_corte ? diasHasta(p.fecha_corte) : null;
  const upd = (patch: Partial<Programa>) => save("onboarding_programa", { id: 1 }, patch, refresh);

  return (
    <header className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Salida de NetSuite</h1>
        <p className="text-sm text-muted-foreground">
          Documentos, sesiones y responsables para empezar a operar oficialmente en la app.
        </p>
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {FASES.map((f, i) => (
          <li key={f.key}>
            <button
              disabled={!d.isAdmin}
              onClick={() => upd({ fase: f.key })}
              className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                i === faseIdx ? "border-primary bg-primary text-primary-foreground" : i < faseIdx ? "border-primary/40 bg-primary/10" : "border-border text-muted-foreground"
              }`}
            >
              <span className="block text-[10px] opacity-70">Fase {i + 1}</span>
              {f.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground">Avance general</div>
          <div className="text-3xl font-bold">{pct}%</div>
          <Progress value={pct} className="mt-2" />
          <div className="mt-2 text-xs text-muted-foreground">
            Documentos {done}/{docs.length} · Sesiones {ses}/{d.sesiones.length} · Desarrollo {dev}/{d.tareas.length}
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <label htmlFor="fecha-corte" className="text-xs text-muted-foreground">Fecha de corte</label>
          <Input
            id="fecha-corte" type="date" className="mt-1" disabled={!d.isAdmin}
            defaultValue={p?.fecha_corte ?? ""}
            onBlur={(e) => e.target.value !== (p?.fecha_corte ?? "") && upd({ fecha_corte: e.target.value || null })}
          />
          <div className="mt-2 text-sm">
            {dias == null ? <span className="text-muted-foreground">Por definir en la sesión de arranque</span>
              : dias >= 0 ? <b>Faltan {dias} días</b> : <b>Hace {-dias} días</b>}
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <label htmlFor="decision" className="text-xs text-muted-foreground">Decisión NetSuite</label>
          <select
            id="decision" disabled={!d.isAdmin} value={p?.decision_netsuite ?? "manual"}
            onChange={(e) => upd({ decision_netsuite: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
          >
            <option value="manual">Cargas manuales al corte (recomendado)</option>
            <option value="api_paralelo">API durante el paralelo</option>
          </select>
          <Textarea
            aria-label="Nota de la decisión" placeholder="Nota" rows={2} className="mt-2 text-xs" disabled={!d.isAdmin}
            defaultValue={p?.nota_decision ?? ""}
            onBlur={(e) => e.target.value !== (p?.nota_decision ?? "") && upd({ nota_decision: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {AREAS.filter((a) => a.key !== "configuracion").map((a) => {
          const l = docs.filter((i) => i.area === a.key);
          const n = l.filter((i) => isDone(estadoDoc(i, d.archivos))).length;
          return (
            <div key={a.key} className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{a.label}</div>
              <div className="font-semibold">{n}/{l.length}</div>
              <Progress value={l.length ? (n / l.length) * 100 : 0} className="mt-1 h-1.5" />
            </div>
          );
        })}
      </div>
    </header>
  );
}

/* ───────── Documentos ───────── */
function Documentos({ d, refresh }: P) {
  const [area, setArea] = useState("all");
  const [soloPend, setSoloPend] = useState(false);
  const list = d.items.filter((i) => (area === "all" || i.area === area) && (!soloPend || !isDone(estadoDoc(i, d.archivos))));

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap gap-2">
        {[{ key: "all", label: "Todas" }, ...AREAS].map((a) => (
          <Button key={a.key} size="sm" variant={area === a.key ? "default" : "outline"} onClick={() => setArea(a.key)}>{a.label}</Button>
        ))}
        <Button size="sm" variant={soloPend ? "default" : "ghost"} onClick={() => setSoloPend(!soloPend)}>Solo pendientes</Button>
      </div>
      {(area === "all" || area === "configuracion") && <AiUploader items={d.items as any} onCommitted={refresh} />}
      {AREAS.filter((a) => area === "all" || a.key === area).map((a) => {
        const l = list.filter((i) => (i.area ?? "configuracion") === a.key);
        if (!l.length) return null;
        return (
          <section key={a.key} className="overflow-hidden rounded-xl border border-border">
            <h2 className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">{a.label}</h2>
            <div className="divide-y divide-border">
              {l.map((it) => <DocRow key={it.id} it={it} d={d} refresh={refresh} />)}
            </div>
          </section>
        );
      })}
      {!list.length && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No hay documentos en este filtro.</p>}
    </div>
  );
}

function DocRow({ it, d, refresh }: { it: Item } & P) {
  const files = d.archivos.filter((a) => a.item_id === it.id);
  const eff: EstadoDoc = estadoDoc(it, d.archivos);
  const isImg = it.clave === "imagenes_productos";
  const upd = (patch: Partial<Item>) => save("onboarding_items", { id: it.id }, patch, refresh);

  const upload = async (fl: FileList) => {
    for (const f of Array.from(fl)) {
      const path = `${it.clave}/${Date.now()}_${f.name.replace(/[^\w.\-]/g, "_")}`;
      const up = await supabase.storage.from("onboarding").upload(path, f);
      if (up.error) { toast.error("Error al subir: " + up.error.message); return; }
      await db.from("onboarding_archivos").insert({
        item_id: it.id, storage_path: path, nombre_original: f.name, mime_type: f.type, size_bytes: f.size, uploaded_by: d.uid,
      });
    }
    if (it.estado === "pendiente" || it.estado === "en_proceso") await db.from("onboarding_items").update({ estado: "entregado" }).eq("id", it.id);
    toast.success("Archivo subido");
    refresh();
  };
  const ver = async (a: Archivo) => {
    const { data, error } = await supabase.storage.from("onboarding").createSignedUrl(a.storage_path, 60);
    if (error || !data) return toast.error(error?.message ?? "Error");
    window.open(data.signedUrl, "_blank");
  };
  const borrar = async (a: Archivo) => {
    if (!confirm("¿Eliminar archivo?")) return;
    await supabase.storage.from("onboarding").remove([a.storage_path]);
    await db.from("onboarding_archivos").delete().eq("id", a.id);
    refresh();
  };

  return (
    <div className={`space-y-3 p-4 ${eff === "validado" ? "bg-primary/5" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{it.titulo}</span>
            {it.requerido && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive">Requerido</span>}
            <Pill e={eff} />
          </div>
          {it.descripcion && <p className="mt-1 text-xs text-muted-foreground">{it.descripcion}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasTemplate(it.plantilla_clave) && (
            <Button size="sm" variant="outline" onClick={() => downloadTemplate(it.plantilla_clave!)}>Plantilla Excel</Button>
          )}
          {it.requiere_archivo && (
            <label className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
              Subir archivo
              <input type="file" className="sr-only" multiple={isImg} accept={isImg ? "image/*" : undefined}
                onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
            </label>
          )}
          <select
            aria-label="Estado" value={it.estado}
            onChange={(e) => upd({ estado: e.target.value as Item["estado"] })}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          >
            <option value="pendiente">Pendiente</option>
            <option value="en_proceso">En proceso</option>
            <option value="entregado">Entregado</option>
            <option value="no_aplica">No aplica</option>
          </select>
          {d.canValidate && isDone(eff) && (
            eff === "validado"
              ? <Button size="sm" variant="ghost" onClick={() => upd({ validado_at: null, validado_por: null })}>Quitar validación</Button>
              : <Button size="sm" onClick={() => upd({ validado_at: new Date().toISOString(), validado_por: d.uid })}>Validar</Button>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className="text-[11px] text-muted-foreground" htmlFor={`r-${it.id}`}>Responsable</label>
          <select id={`r-${it.id}`} value={it.responsable_rol ?? ""} onChange={(e) => upd({ responsable_rol: e.target.value || null })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs">
            <option value="">Sin asignar</option>
            {RESPONSABLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground" htmlFor={`n-${it.id}`}>Persona</label>
          <Input id={`n-${it.id}`} className="h-8 text-xs" placeholder="Nombre" defaultValue={it.responsable_nombre ?? ""}
            onBlur={(e) => e.target.value !== (it.responsable_nombre ?? "") && upd({ responsable_nombre: e.target.value || null })} />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground" htmlFor={`f-${it.id}`}>Fecha compromiso</label>
          <Input id={`f-${it.id}`} type="date" className="h-8 text-xs" defaultValue={it.fecha_compromiso ?? ""}
            onBlur={(e) => e.target.value !== (it.fecha_compromiso ?? "") && upd({ fecha_compromiso: e.target.value || null })} />
        </div>
      </div>

      {!it.requiere_archivo && (
        <Input placeholder="Valor / dato" defaultValue={it.valor_texto ?? ""} className="text-sm"
          onBlur={(e) => {
            const v = e.target.value;
            if (v === (it.valor_texto ?? "")) return;
            upd({ valor_texto: v, ...(v.trim() && it.estado === "pendiente" ? { estado: "entregado" as const } : {}) });
          }} />
      )}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.slice(0, isImg ? 5 : 50).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-xs">
              <span className="truncate">{a.nombre_original}</span>
              <span className="flex shrink-0 gap-3">
                <button className="text-primary hover:underline" onClick={() => ver(a)}>Ver</button>
                <button className="text-destructive hover:underline" onClick={() => borrar(a)}>Eliminar</button>
              </span>
            </li>
          ))}
          {isImg && files.length > 5 && <li className="text-xs text-muted-foreground">+{files.length - 5} imágenes más</li>}
        </ul>
      )}
      <Textarea placeholder="Notas" rows={1} className="text-xs" defaultValue={it.notas ?? ""}
        onBlur={(e) => e.target.value !== (it.notas ?? "") && upd({ notas: e.target.value })} />
    </div>
  );
}

/* ───────── Sesiones ───────── */
function Sesiones({ d, refresh }: P) {
  if (!d.sesiones.length) return <Empty text="No hay sesiones registradas." />;
  return (
    <div className="grid gap-3 pt-4 md:grid-cols-2">
      {d.sesiones.map((s) => {
        const upd = (patch: Partial<Sesion>) => save("onboarding_sesiones", { id: s.id }, patch, refresh);
        return (
          <article key={s.id} className="space-y-2 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] text-muted-foreground">Sesión {s.orden} · {s.duracion}</div>
                <h3 className="font-semibold">{s.titulo}</h3>
              </div>
              <Pill e={s.estado} />
            </div>
            <p className="text-xs text-muted-foreground">{s.objetivo}</p>
            <p className="text-xs"><b>Participantes:</b> {s.participantes}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="datetime-local" aria-label="Fecha y hora (CDMX)" className="h-8 text-xs" disabled={!d.isAdmin}
                defaultValue={toLocalInput(s.fecha_hora)}
                onBlur={(e) => {
                  const iso = fromLocalInput(e.target.value);
                  if (iso !== s.fecha_hora) upd({ fecha_hora: iso, ...(iso && s.estado === "por_agendar" ? { estado: "agendada" } : {}) });
                }} />
              <select aria-label="Estado de la sesión" value={s.estado} disabled={!d.isAdmin} onChange={(e) => upd({ estado: e.target.value })}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">
                <option value="por_agendar">Por agendar</option>
                <option value="agendada">Agendada</option>
                <option value="realizada">Realizada</option>
              </select>
            </div>
            <Textarea placeholder="Acuerdos" rows={2} className="text-xs" disabled={!d.isAdmin} defaultValue={s.acuerdos ?? ""}
              onBlur={(e) => e.target.value !== (s.acuerdos ?? "") && upd({ acuerdos: e.target.value })} />
            <Textarea placeholder="Pendientes que surgieron" rows={2} className="text-xs" disabled={!d.isAdmin} defaultValue={s.pendientes ?? ""}
              onBlur={(e) => e.target.value !== (s.pendientes ?? "") && upd({ pendientes: e.target.value })} />
          </article>
        );
      })}
    </div>
  );
}

/* ───────── Responsables ───────── */
function Responsables({ d }: { d: D }) {
  const rows = useMemo(() => RESPONSABLES.map((r) => {
    const docs = d.items.filter((i) => i.responsable_rol === r.key && i.estado !== "no_aplica");
    const pend = docs.filter((i) => !isDone(estadoDoc(i, d.archivos)));
    const ses = d.sesiones.filter((s) => s.responsables?.includes(r.key) && s.estado !== "realizada");
    const tareas = r.key === "valinor" ? d.tareas.filter((t) => t.estado !== "listo") : [];
    return { ...r, docs, pend, ses, tareas };
  }), [d]);
  return (
    <div className="grid gap-3 pt-4 md:grid-cols-2">
      {rows.map((r) => {
        const pct = r.docs.length ? Math.round(((r.docs.length - r.pend.length) / r.docs.length) * 100) : null;
        return (
          <article key={r.key} className="space-y-2 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{r.label}</h3>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </div>
              <span className="text-sm font-semibold">{pct == null ? "—" : `${pct}%`}</span>
            </div>
            {pct != null && <Progress value={pct} className="h-1.5" />}
            <Lista titulo={`Documentos pendientes (${r.pend.length})`} items={r.pend.map((i) => i.titulo)} />
            <Lista titulo={`Sesiones por realizar (${r.ses.length})`} items={r.ses.map((s) => s.titulo)} />
            {r.key === "valinor" && <Lista titulo={`Desarrollo abierto (${r.tareas.length})`} items={r.tareas.map((t) => t.titulo)} />}
          </article>
        );
      })}
    </div>
  );
}
function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-medium">{titulo}</div>
      {items.length ? (
        <ul className="ml-4 list-disc text-xs text-muted-foreground">{items.map((t) => <li key={t}>{t}</li>)}</ul>
      ) : <p className="text-xs text-muted-foreground">Nada pendiente</p>}
    </div>
  );
}

/* ───────── Desarrollo ───────── */
function Desarrollo({ d, refresh }: P) {
  if (!d.tareas.length) return <Empty text="No hay tareas de desarrollo." />;
  return (
    <div className="space-y-2 pt-4">
      {d.tareas.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="font-medium">{t.titulo}</span><Pill e={t.estado} /></div>
            <p className="text-xs text-muted-foreground">{t.descripcion}</p>
          </div>
          <div className="flex gap-2">
            <Input type="date" aria-label="Fecha compromiso" className="h-8 w-36 text-xs" disabled={!d.isAdmin} defaultValue={t.fecha_compromiso ?? ""}
              onBlur={(e) => e.target.value !== (t.fecha_compromiso ?? "") && save("onboarding_tareas_dev", { id: t.id }, { fecha_compromiso: e.target.value || null }, refresh)} />
            <select aria-label="Estado" value={t.estado} disabled={!d.isAdmin}
              onChange={(e) => save("onboarding_tareas_dev", { id: t.id }, { estado: e.target.value }, refresh)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="listo">Listo</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────── Paralelo ───────── */
const fmt = (v: number | null) => v == null ? "No reportado" : v.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
function Diff({ a, b }: { a: number | null; b: number | null }) {
  if (a == null || b == null) return <span className="text-muted-foreground">—</span>;
  const diff = a - b;
  return <span className={Math.abs(diff) < 1 ? "text-primary" : "text-destructive"}>{fmt(diff)}</span>;
}
function Paralelo({ d, refresh }: P) {
  const p = d.programa;
  const activo = p?.fase === "paralelo" || p?.fase === "apagado";
  const [semana, setSemana] = useState("");
  if (!activo)
    return <Empty text="Esta sección se activa cuando el programa pasa a la fase Paralelo." />;

  const add = async () => {
    if (!semana) return;
    const { error } = await db.from("onboarding_paralelo_semanas").insert({ semana_inicio: semana });
    if (error) toast.error(error.message); else { setSemana(""); refresh(); }
  };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const aprobar = async () => {
    if (!confirm("¿Aprobar el apagado de NetSuite? Esto cierra el programa.")) return;
    await save("onboarding_programa", { id: 1 }, { fase: "apagado", apagado_aprobado_at: new Date().toISOString(), apagado_aprobado_por: d.uid }, refresh);
  };
  const campos: [keyof Semana, keyof Semana, string][] = [
    ["ventas_app", "ventas_netsuite", "Ventas"],
    ["cartera_app", "cartera_netsuite", "Cartera"],
    ["inventario_app", "inventario_netsuite", "Inventario"],
  ];

  return (
    <div className="space-y-4 pt-4">
      {d.isAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="sem" className="text-xs text-muted-foreground">Inicio de semana</label>
            <Input id="sem" type="date" value={semana} onChange={(e) => setSemana(e.target.value)} className="h-9" />
          </div>
          <Button onClick={add} disabled={!semana}>Agregar revisión</Button>
        </div>
      )}
      {!d.semanas.length && <Empty text="Aún no hay revisiones semanales." />}
      {d.semanas.map((s) => (
        <article key={s.id} className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="font-semibold">Semana del {s.semana_inicio} <span className="text-xs text-muted-foreground">({s.moneda})</span></h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {campos.map(([a, b, label]) => (
              <div key={label} className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs">
                <div className="font-medium">{label}</div>
                <Input type="number" step="0.01" aria-label={`${label} app`} placeholder="App" disabled={!d.isAdmin} className="h-8 text-xs"
                  defaultValue={(s[a] as number | null) ?? ""} onBlur={(e) => save("onboarding_paralelo_semanas", { id: s.id }, { [a]: num(e.target.value) }, refresh)} />
                <Input type="number" step="0.01" aria-label={`${label} NetSuite`} placeholder="NetSuite" disabled={!d.isAdmin} className="h-8 text-xs"
                  defaultValue={(s[b] as number | null) ?? ""} onBlur={(e) => save("onboarding_paralelo_semanas", { id: s.id }, { [b]: num(e.target.value) }, refresh)} />
                <div>Diferencia: <Diff a={s[a] as number | null} b={s[b] as number | null} /></div>
              </div>
            ))}
          </div>
          <Textarea placeholder="Comentario" rows={2} className="text-xs" disabled={!d.isAdmin} defaultValue={s.comentario ?? ""}
            onBlur={(e) => e.target.value !== (s.comentario ?? "") && save("onboarding_paralelo_semanas", { id: s.id }, { comentario: e.target.value }, refresh)} />
        </article>
      ))}
      {p?.apagado_aprobado_at ? (
        <p className="rounded-lg bg-primary/10 p-4 text-sm font-medium text-primary">
          Apagado de NetSuite aprobado el {new Date(p.apagado_aprobado_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}.
        </p>
      ) : d.isAdmin && d.semanas.length > 0 && (
        <Button variant="destructive" onClick={aprobar}>Aprobar apagado de NetSuite</Button>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text}</p>;
}
