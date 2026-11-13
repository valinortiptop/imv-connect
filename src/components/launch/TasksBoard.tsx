import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bug, CheckSquare, Plus, ImagePlus, Trash2, Loader2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BUCKET, TASK_COLS, db, taskCol, type HubData, type Task } from "./hub-data";
import { cn } from "@/lib/utils";

const PRIO: Record<string, string> = { alta: "bg-hub-bad/15 text-hub-bad", media: "bg-hub-warn/20 text-foreground", baja: "bg-muted text-muted-foreground" };
const MODULOS = ["Ventas", "Representantes", "Clientes", "Inventario", "Compras", "Facturación", "Cobranza", "Contabilidad", "Bancos", "Otro"];

export function TasksBoard({ data, refresh }: { data: HubData; refresh: () => void }) {
  const [tipo, setTipo] = useState<"todo" | "tarea" | "bug">("todo");
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const tasks = useMemo(() => data.tasks.filter((t) => tipo === "todo" || t.tipo === tipo), [data.tasks, tipo]);

  const move = async (id: string, estado: string) => {
    const { error } = await db.from("onboarding_tareas_dev").update({ estado }).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([["todo", "Todo"], ["tarea", "Tareas"], ["bug", "Bugs"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTipo(k)} className={cn("rounded-full border px-4 py-2 text-sm", tipo === k ? "border-hub-ink bg-hub-ink text-primary-foreground" : "bg-card hover:bg-muted")}>
            {l} <span className="opacity-70">{k === "todo" ? data.tasks.length : data.tasks.filter((t) => t.tipo === k).length}</span>
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setEdit({ tipo: "tarea", prioridad: "media", estado: "pendiente" })}><CheckSquare className="mr-1 h-4 w-4" />Nueva tarea</Button>
          <Button onClick={() => setEdit({ tipo: "bug", prioridad: "alta", estado: "pendiente" })}><Bug className="mr-1 h-4 w-4" />Reportar bug</Button>
        </div>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {TASK_COLS.map((c) => {
          const list = tasks.filter((t) => taskCol(t.estado) === c.key);
          return (
            <div key={c.key} onDragOver={(e) => { e.preventDefault(); setOverCol(c.key); }} onDragLeave={() => setOverCol(null)}
              onDrop={(e) => { e.preventDefault(); setOverCol(null); const id = e.dataTransfer.getData("text/task"); if (id) move(id, c.key); }}
              className={cn("flex w-72 shrink-0 flex-col gap-2 rounded-3xl bg-hub-surface p-3 lg:w-auto", overCol === c.key && "ring-2 ring-hub-violet")}>
              <div className="flex items-center justify-between px-1"><span className="text-sm font-semibold">{c.label}</span><span className="rounded-full bg-card px-2 text-xs">{list.length}</span></div>
              {list.length === 0 && <p className="rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">Arrastra aquí</p>}
              {list.map((t) => (
                <button key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)} onClick={() => setEdit(t)}
                  className="rounded-2xl border bg-card p-3 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-start gap-2">
                    {t.tipo === "bug" ? <Bug className="mt-0.5 h-4 w-4 shrink-0 text-hub-bad" /> : <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-hub-violet" />}
                    <p className="text-sm font-medium leading-snug">{t.titulo}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className={cn("rounded-full px-2 py-0.5", PRIO[t.prioridad] ?? PRIO.media)}>{t.prioridad}</span>
                    {t.modulo && <span className="rounded-full bg-muted px-2 py-0.5">{t.modulo}</span>}
                    {t.responsable && <span className="rounded-full bg-muted px-2 py-0.5">{t.responsable}</span>}
                    {t.fecha_compromiso && <span className="flex items-center gap-1 text-muted-foreground"><Calendar className="h-3 w-3" />{t.fecha_compromiso}</span>}
                    {t.adjunto_path && <ImagePlus className="h-3 w-3 text-muted-foreground" aria-label="Con captura" />}
                  </div>
                  <select aria-label="Mover a" className="mt-2 w-full rounded-lg border bg-card px-1 py-0.5 text-xs lg:hidden" value={taskCol(t.estado)}
                    onClick={(e) => e.stopPropagation()} onChange={(e) => move(t.id, e.target.value)}>
                    {TASK_COLS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <TaskDialog task={edit} data={data} onClose={() => setEdit(null)} refresh={refresh} />
    </div>
  );
}

function TaskDialog({ task, data, onClose, refresh }: { task: Partial<Task> | null; data: HubData; onClose: () => void; refresh: () => void }) {
  const [f, setF] = useState<Partial<Task>>({});
  const [img, setImg] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setF(task ?? {}); setImg(null); setImgUrl(null);
    if (task?.adjunto_path) db.storage.from(BUCKET).createSignedUrl(task.adjunto_path, 600).then((r: any) => r.data && setImgUrl(r.data.signedUrl));
  }, [task]);
  const onPaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/"));
    if (file) { setImg(file); setImgUrl(URL.createObjectURL(file)); }
  };
  const save = async () => {
    const titulo = (f.titulo ?? "").trim();
    if (!titulo) return toast.error("Escribe un título");
    setSaving(true);
    let adjunto_path = f.adjunto_path ?? null;
    if (img) {
      const p = `tareas/${Date.now()}-${img.name.replace(/[^\w.-]+/g, "_")}`;
      const up = await db.storage.from(BUCKET).upload(p, img, { contentType: img.type });
      if (up.error) { setSaving(false); return toast.error(up.error.message); }
      adjunto_path = p;
    }
    const row = {
      titulo: titulo.slice(0, 200), descripcion: f.descripcion?.slice(0, 5000) || null, tipo: f.tipo ?? "tarea",
      prioridad: f.prioridad ?? "media", modulo: f.modulo || null, responsable: f.responsable?.slice(0, 80) || null,
      fecha_compromiso: f.fecha_compromiso || null, sesion_id: f.sesion_id || null, estado: f.estado ?? "pendiente", adjunto_path,
    };
    const res = f.id
      ? await db.from("onboarding_tareas_dev").update(row).eq("id", f.id)
      : await db.from("onboarding_tareas_dev").insert({ ...row, orden: Math.max(0, ...data.tasks.map((t) => t.orden)) + 1, created_by: data.uid });
    setSaving(false);
    if (res.error) toast.error(res.error.message); else { onClose(); refresh(); }
  };
  const remove = async () => {
    if (!f.id || !confirm("¿Borrar esta tarjeta?")) return;
    const { error } = await db.from("onboarding_tareas_dev").delete().eq("id", f.id);
    if (error) toast.error(error.message); else { onClose(); refresh(); }
  };
  const set = (p: Partial<Task>) => setF((x) => ({ ...x, ...p }));

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="launch-hub max-h-[90vh] overflow-y-auto sm:max-w-lg" onPaste={onPaste}>
        <DialogHeader><DialogTitle>{f.id ? "Editar" : f.tipo === "bug" ? "Reportar bug" : "Nueva tarea"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["tarea", "bug"] as const).map((k) => <button key={k} onClick={() => set({ tipo: k })} className={cn("flex-1 rounded-xl border py-2 text-sm", f.tipo === k && "border-hub-ink bg-hub-ink text-primary-foreground")}>{k === "bug" ? "Bug" : "Tarea"}</button>)}
          </div>
          <Input aria-label="Título" placeholder="¿Qué pasa o qué hay que hacer?" value={f.titulo ?? ""} onChange={(e) => set({ titulo: e.target.value })} />
          <Textarea aria-label="Descripción" placeholder="Detalles, pasos para reproducir…" rows={4} value={f.descripcion ?? ""} onChange={(e) => set({ descripcion: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Prioridad" className="h-10 rounded-md border bg-card px-2 text-sm" value={f.prioridad ?? "media"} onChange={(e) => set({ prioridad: e.target.value })}>
              <option value="alta">Prioridad alta</option><option value="media">Prioridad media</option><option value="baja">Prioridad baja</option>
            </select>
            <select aria-label="Módulo" className="h-10 rounded-md border bg-card px-2 text-sm" value={f.modulo ?? ""} onChange={(e) => set({ modulo: e.target.value })}>
              <option value="">Módulo…</option>{MODULOS.map((m) => <option key={m}>{m}</option>)}
            </select>
            <Input aria-label="Responsable" placeholder="Responsable" value={f.responsable ?? ""} onChange={(e) => set({ responsable: e.target.value })} />
            <Input aria-label="Fecha compromiso" type="date" value={f.fecha_compromiso ?? ""} onChange={(e) => set({ fecha_compromiso: e.target.value })} />
          </div>
          <select aria-label="Sesión relacionada" className="h-10 w-full rounded-md border bg-card px-2 text-sm" value={f.sesion_id ?? ""} onChange={(e) => set({ sesion_id: e.target.value })}>
            <option value="">Sin sesión relacionada</option>{data.sesiones.map((s) => <option key={s.id} value={s.id}>{s.orden}. {s.titulo}</option>)}
          </select>
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground hover:bg-muted/50">
            {imgUrl ? <img src={imgUrl} alt="Captura adjunta" className="max-h-48 rounded-lg" /> : <><ImagePlus className="h-5 w-5" />Pega una captura (Ctrl+V) o haz clic para elegir</>}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) { setImg(x); setImgUrl(URL.createObjectURL(x)); } }} />
          </label>
        </div>
        <DialogFooter className="gap-2">
          {f.id && data.isAdmin && <Button variant="ghost" className="mr-auto text-hub-bad" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Borrar</Button>}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" />Guardar</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
