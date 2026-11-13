import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  UploadCloud, FileText, FileSpreadsheet, FileImage, Star, AlertTriangle, CheckCircle2, Sparkles,
  Loader2, Search, Download, Trash2, ShieldCheck, RefreshCw, X, Inbox, LayoutGrid, List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { reviewOnboardingFileFn } from "@/lib/onboarding-review.functions";
import { AREAS, BUCKET, db, fmtBytes, fmtDate, reqState, type Doc, type DocState, type HubData, type Req } from "./hub-data";
import { cn } from "@/lib/utils";

const STATE_UI: Record<DocState, { label: string; cls: string }> = {
  falta: { label: "Falta", cls: "bg-muted text-muted-foreground" },
  subido: { label: "Subido", cls: "bg-hub-violet/15 text-hub-violet" },
  revisar: { label: "Revisar", cls: "bg-hub-warn/20 text-foreground" },
  ok: { label: "IA: bien", cls: "bg-hub-ok/15 text-hub-ok" },
  validado: { label: "Validado", cls: "bg-hub-ink text-primary-foreground" },
};

type Upload = { id: string; name: string; status: "subiendo" | "revisando" | "listo" | "error"; msg?: string };

function fileIcon(name: string, mime: string | null) {
  if (mime?.startsWith("image/")) return FileImage;
  if (/sheet|excel|csv/.test(mime ?? "") || /\.(xlsx|xls|csv)$/i.test(name)) return FileSpreadsheet;
  return FileText;
}

export function DocumentsHub({ data, refresh }: { data: HubData; refresh: () => void }) {
  const review = useServerFn(reviewOnboardingFileFn);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"todos" | "falta" | "revisar" | "listos">("todos");
  const [area, setArea] = useState<string>("todas");
  const [dragging, setDragging] = useState(false);
  const [overReq, setOverReq] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [openReq, setOpenReq] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "list">("cards");
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => { const v = localStorage.getItem("launch-hub-docs-view"); if (v === "list" || v === "cards") setView(v); }, []);
  const changeView = (v: "cards" | "list") => { setView(v); localStorage.setItem("launch-hub-docs-view", v); };
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<string | null>(null);
  const depth = useRef(0);

  const docsByReq = useMemo(() => {
    const m = new Map<string, Doc[]>();
    for (const d of data.docs) { const k = d.item_id ?? "_otros"; m.set(k, [...(m.get(k) ?? []), d]); }
    return m;
  }, [data.docs]);

  const reqs = useMemo(() => data.reqs.filter((r) => {
    const st = reqState(r, docsByReq.get(r.id) ?? []);
    if (area !== "todas" && (r.area ?? "configuracion") !== area) return false;
    if (filter === "falta" && st !== "falta") return false;
    if (filter === "revisar" && st !== "revisar" && !(docsByReq.get(r.id) ?? []).some((d) => d.atencion)) return false;
    if (filter === "listos" && st !== "ok" && st !== "validado") return false;
    if (q && !`${r.titulo} ${r.descripcion ?? ""} ${(docsByReq.get(r.id) ?? []).map((d) => d.nombre_original).join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [data.reqs, docsByReq, area, filter, q]);

  const otros = docsByReq.get("_otros") ?? [];

  async function uploadFiles(files: File[], itemId: string | null) {
    for (const f of files) {
      const uid = crypto.randomUUID();
      setUploads((u) => [{ id: uid, name: f.name, status: "subiendo" }, ...u]);
      const set = (p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.id === uid ? { ...x, ...p } : x)));
      if (f.size > 50 * 1024 * 1024) { set({ status: "error", msg: "Máximo 50 MB" }); continue; }
      const safe = f.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `hub/${itemId ?? "otros"}/${Date.now()}-${safe}`;
      const up = await db.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
      if (up.error) { set({ status: "error", msg: up.error.message }); continue; }
      const ins = await db.from("onboarding_archivos").insert({
        item_id: itemId, storage_path: path, nombre_original: f.name, size_bytes: f.size,
        mime_type: f.type || null, uploaded_by: data.uid, ai_estado: "analizando",
      }).select("id").single();
      if (ins.error) { set({ status: "error", msg: ins.error.message }); continue; }
      refresh();
      set({ status: "revisando" });
      try {
        const r = await review({ data: { archivoId: ins.data.id } });
        set(r.ok ? { status: "listo" } : { status: "error", msg: r.error });
      } catch (e) {
        set({ status: "error", msg: e instanceof Error ? e.message : "La revisión falló" });
      }
      refresh();
    }
    setTimeout(() => setUploads((u) => u.filter((x) => x.status !== "listo")), 4000);
  }

  // Whole-tab drop zone.
  useEffect(() => {
    const enter = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { depth.current++; setDragging(true); } };
    const leave = () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault(); depth.current = 0; setDragging(false); setOverReq(null);
      if ((e.target as HTMLElement)?.closest?.("[data-req-drop]")) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) uploadFiles(files, null);
    };
    window.addEventListener("dragenter", enter); window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over); window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter); window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over); window.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.uid]);

  const pick = (itemId: string | null) => { targetRef.current = itemId; inputRef.current?.click(); };
  const counts = useMemo(() => {
    const c = { falta: 0, revisar: 0, listos: 0 };
    for (const r of data.reqs) { const s = reqState(r, docsByReq.get(r.id) ?? []); if (s === "falta") c.falta++; else if (s === "revisar") c.revisar++; else if (s === "ok" || s === "validado") c.listos++; }
    return c;
  }, [data.reqs, docsByReq]);

  const pendientes = data.docs.filter((d) => d.ai_estado === "pendiente" || d.ai_estado === "error");
  async function reviewPending() {
    const list = pendientes.slice();
    setBulk({ done: 0, total: list.length });
    let fails = 0;
    for (let i = 0; i < list.length; i++) {
      try { const r = await review({ data: { archivoId: list[i].id } }); if (!r.ok) fails++; } catch { fails++; }
      setBulk({ done: i + 1, total: list.length });
      if ((i + 1) % 3 === 0) refresh();
    }
    setBulk(null); refresh();
    if (fails) toast.error(`${fails} archivo${fails > 1 ? "s" : ""} no se pudieron revisar`); else toast.success("Revisión terminada");
  }

  const grouped = AREAS.map((a) => ({ ...a, reqs: reqs.filter((r) => (r.area ?? "configuracion") === a.key) })).filter((g) => g.reqs.length);
  const selected = data.reqs.find((r) => r.id === openReq) ?? null;
  const openOtros = openReq === "_otros";

  return (
    <div className="space-y-6">
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => {
        const files = Array.from(e.target.files ?? []); e.target.value = "";
        if (files.length) uploadFiles(files, targetRef.current);
      }} />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-hub-ink/60 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in">
          <div className="rounded-3xl border-2 border-dashed border-hub-glow bg-hub-ink/80 px-10 py-8 text-center text-primary-foreground">
            <UploadCloud className="mx-auto h-12 w-12 text-hub-glow" />
            <p className="mt-3 text-xl font-semibold">Suelta aquí para subir</p>
            <p className="text-sm opacity-80">Sobre una tarjeta se asigna a ese documento; en cualquier otro lugar la IA lo acomoda.</p>
          </div>
        </div>
      )}

      <button type="button" onClick={() => pick(null)}
        className="group relative flex w-full flex-col items-center gap-2 overflow-hidden rounded-3xl border-2 border-dashed border-hub-violet/40 bg-hub-surface px-6 py-10 text-center transition hover:border-hub-violet hover:bg-hub-violet/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-hub-ink text-hub-glow shadow-lg transition group-hover:scale-105 motion-reduce:transition-none">
          <UploadCloud className="h-7 w-7" />
        </span>
        <span className="text-lg font-semibold">Arrastra archivos a cualquier parte de esta pantalla</span>
        <span className="text-sm text-muted-foreground">o haz clic para elegir · PDF, Excel, CSV, imágenes · varios a la vez · la IA revisa cada uno</span>
      </button>

      {uploads.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {uploads.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-2 text-sm">
              {u.status === "error" ? <AlertTriangle className="h-4 w-4 text-hub-bad" /> : u.status === "listo" ? <CheckCircle2 className="h-4 w-4 text-hub-ok" /> : <Loader2 className="h-4 w-4 animate-spin text-hub-violet" />}
              <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
              <span className="shrink-0 text-muted-foreground">{u.status === "subiendo" ? "Subiendo…" : u.status === "revisando" ? "IA revisando…" : u.status === "listo" ? "Listo" : u.msg}</span>
              {u.status === "error" && <button aria-label="Quitar" onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))}><X className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar documentos" placeholder="Buscar documento o archivo…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 rounded-2xl pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          {([["todos", "Todos", data.reqs.length], ["falta", "Faltan", counts.falta], ["revisar", "Con observaciones", counts.revisar], ["listos", "Listos", counts.listos]] as const).map(([k, l, n]) => (
            <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full border px-4 py-2 text-sm transition", filter === k ? "border-hub-ink bg-hub-ink text-primary-foreground" : "bg-card hover:bg-muted")}>
              {l} <span className="ml-1 opacity-70">{n}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1">
          {[{ key: "todas", label: "Todas las áreas" }, ...AREAS].map((a) => (
            <button key={a.key} onClick={() => setArea(a.key)} className={cn("shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition", area === a.key ? "bg-hub-glow text-hub-ink" : "text-muted-foreground hover:bg-muted")}>{a.label}</button>
          ))}
        </div>
        <div className="flex shrink-0 rounded-xl border bg-card p-0.5" role="group" aria-label="Vista de documentos">
          {([["cards", "Tarjetas", LayoutGrid], ["list", "Lista", List]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => changeView(k)} aria-pressed={view === k} title={l}
              className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === k ? "bg-hub-ink text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              <I className="h-3.5 w-3.5" /><span className="hidden sm:inline">{l}</span>
            </button>
          ))}
        </div>
      </div>

      {pendientes.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-hub-violet/30 bg-hub-violet/5 px-4 py-3 text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-hub-violet" />
          <span className="min-w-0 flex-1">{pendientes.length} archivo{pendientes.length > 1 ? "s" : ""} subido{pendientes.length > 1 ? "s" : ""} aún sin revisar por la IA. Cuentan como subidos, no como listos.</span>
          <Button size="sm" className="rounded-xl" disabled={!!bulk} onClick={reviewPending}>
            {bulk ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Revisando {bulk.done}/{bulk.total}</> : "Revisar con IA"}
          </Button>
        </div>
      )}

      {grouped.length === 0 && otros.length === 0 && (
        <div className="rounded-3xl border bg-card p-10 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8" />Nada coincide con este filtro.</div>
      )}

      {grouped.map((g) => (
        <section key={g.key} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{g.label}<span className="h-px flex-1 bg-border" /></h3>
          {view === "list" ? (
            <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
              {g.reqs.map((r) => {
                const docs = docsByReq.get(r.id) ?? [];
                const st = reqState(r, docs);
                const latest = docs[0];
                const Icon = latest ? fileIcon(latest.nombre_original, latest.mime_type) : FileText;
                return (
                  <li key={r.id} data-req-drop
                    onDragOver={(e) => { e.preventDefault(); setOverReq(r.id); }}
                    onDragLeave={() => setOverReq((x) => (x === r.id ? null : x))}
                    onDrop={(e) => { e.preventDefault(); setOverReq(null); const f = Array.from(e.dataTransfer.files); if (f.length) uploadFiles(f, r.id); }}
                    className={cn("relative flex items-center gap-3 px-4 py-2.5 transition hover:bg-muted/40", overReq === r.id && "bg-hub-violet/10 ring-2 ring-inset ring-hub-violet")}>
                    <button className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`Abrir ${r.titulo}`} onClick={() => setOpenReq(r.id)} />
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", st === "falta" ? "bg-muted text-muted-foreground" : "bg-hub-ink text-hub-glow")}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.titulo}{latest?.destacado && <Star className="ml-1 inline h-3.5 w-3.5 fill-hub-warn text-hub-warn" aria-label="Importante" />}</p>
                      <p className="truncate text-xs text-muted-foreground">{latest ? `${latest.nombre_original} · ${fmtDate(latest.uploaded_at)}` : r.descripcion ?? "Sin descripción"}</p>
                    </div>
                    {docs.some((d) => d.atencion) && <AlertTriangle className="h-4 w-4 shrink-0 text-hub-bad" aria-label="Requiere atención" />}
                    {latest?.ai_estado === "analizando" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-hub-violet" aria-label="IA revisando" />}
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{docs.length ? `${docs.length} archivo${docs.length > 1 ? "s" : ""}` : ""}</span>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", STATE_UI[st].cls)}>{STATE_UI[st].label}</span>
                    <Button size="icon" variant="ghost" className="relative h-8 w-8 shrink-0 rounded-xl" aria-label={`Subir archivo para ${r.titulo}`} onClick={() => pick(r.id)}><UploadCloud className="h-4 w-4" /></Button>
                  </li>
                );
              })}
            </ul>
          ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.reqs.map((r) => {
              const docs = docsByReq.get(r.id) ?? [];
              const st = reqState(r, docs);
              const latest = docs[0];
              const Icon = latest ? fileIcon(latest.nombre_original, latest.mime_type) : FileText;
              return (
                <div key={r.id} data-req-drop
                  onDragOver={(e) => { e.preventDefault(); setOverReq(r.id); }}
                  onDragLeave={() => setOverReq((x) => (x === r.id ? null : x))}
                  onDrop={(e) => { e.preventDefault(); setOverReq(null); const f = Array.from(e.dataTransfer.files); if (f.length) uploadFiles(f, r.id); }}
                  className={cn("group relative flex flex-col rounded-3xl border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none",
                    overReq === r.id && "border-hub-violet ring-4 ring-hub-violet/20", st === "falta" && r.requerido && "border-dashed")}>
                  <button className="absolute inset-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Abrir ${r.titulo}`} onClick={() => setOpenReq(r.id)} />
                  <div className="flex items-start gap-3">
                    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", st === "falta" ? "bg-muted text-muted-foreground" : "bg-hub-ink text-hub-glow")}><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight">{r.titulo}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.descripcion ?? "Sin descripción"}</p>
                    </div>
                    {latest?.destacado && <Star className="h-4 w-4 shrink-0 fill-hub-warn text-hub-warn" aria-label="Importante" />}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn("rounded-full px-2.5 py-1 font-medium", STATE_UI[st].cls)}>{STATE_UI[st].label}</span>
                    {latest?.ai_estado === "analizando" && <span className="flex items-center gap-1 text-hub-violet"><Loader2 className="h-3 w-3 animate-spin" />IA revisando</span>}
                    {docs.some((d) => d.atencion) && <span className="flex items-center gap-1 rounded-full bg-hub-bad/10 px-2 py-1 text-hub-bad"><AlertTriangle className="h-3 w-3" />Atención</span>}
                    {docs.length > 0 && <span className="text-muted-foreground">{docs.length} archivo{docs.length > 1 ? "s" : ""}</span>}
                  </div>
                  {latest?.ai_resumen && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground"><Sparkles className="mr-1 inline h-3 w-3 text-hub-violet" />{latest.ai_resumen}</p>}
                  <div className="relative mt-auto pt-3">
                    <Button size="sm" variant="outline" className="h-8 rounded-xl" onClick={() => pick(r.id)}><UploadCloud className="mr-1 h-3.5 w-3.5" />{docs.length ? "Nueva versión" : "Subir"}</Button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </section>
      ))}

      {otros.length > 0 && (
        <button onClick={() => setOpenReq("_otros")} className="flex w-full items-center gap-3 rounded-3xl border bg-card p-4 text-left hover:bg-muted/50">
          <Inbox className="h-5 w-5 text-hub-violet" /><span className="flex-1 font-semibold">Otros archivos sin asignar</span><span className="text-sm text-muted-foreground">{otros.length}</span>
        </button>
      )}

      <Sheet open={!!openReq} onOpenChange={(o) => !o && setOpenReq(null)}>
        <SheetContent className="launch-hub w-full overflow-y-auto sm:max-w-2xl">
          {(selected || openOtros) && (
            <DocDetail req={selected} docs={openOtros ? otros : docsByReq.get(selected!.id) ?? []} reqs={data.reqs}
              canValidate={data.canValidate} isAdmin={data.isAdmin} uid={data.uid} refresh={refresh}
              onUpload={() => pick(selected?.id ?? null)} onReview={async (id) => { const r = await review({ data: { archivoId: id } }); if (!r.ok) toast.error(r.error); refresh(); }} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DocDetail({ req, docs, reqs, canValidate, isAdmin, uid, refresh, onUpload, onReview }: {
  req: Req | null; docs: Doc[]; reqs: Req[]; canValidate: boolean; isAdmin: boolean; uid: string | null;
  refresh: () => void; onUpload: () => void; onReview: (id: string) => Promise<void>;
}) {
  const [active, setActive] = useState<string | null>(docs[0]?.id ?? null);
  const doc = docs.find((d) => d.id === active) ?? docs[0] ?? null;
  const [url, setUrl] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(null); setTable(null);
    if (!doc) return;
    let cancel = false;
    (async () => {
      const s = await db.storage.from(BUCKET).createSignedUrl(doc.storage_path, 600);
      if (cancel || s.error) return;
      setUrl(s.data.signedUrl);
      if (/sheet|excel|csv/.test(doc.mime_type ?? "") || /\.(xlsx|xls|csv)$/i.test(doc.nombre_original)) {
        const buf = await (await fetch(s.data.signedUrl)).arrayBuffer();
        const XLSX = await import("xlsx");
        const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
        const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }).slice(0, 30);
        if (!cancel) setTable(rows.map((r) => r.slice(0, 12).map(String)));
      }
    })();
    return () => { cancel = true; };
  }, [doc?.id]);

  const patchDoc = async (p: Partial<Doc>) => { await db.from("onboarding_archivos").update(p).eq("id", doc!.id); refresh(); };
  const validate = async (on: boolean) => {
    if (!req) return;
    const { error } = await db.from("onboarding_items").update({ validado_at: on ? new Date().toISOString() : null, validado_por: on ? uid : null, estado: on ? "entregado" : req.estado }).eq("id", req.id);
    if (error) toast.error(error.message); else { toast.success(on ? "Documento validado" : "Validación retirada"); refresh(); }
  };
  const remove = async () => {
    if (!doc || !confirm(`¿Borrar "${doc.nombre_original}"?`)) return;
    await db.storage.from(BUCKET).remove([doc.storage_path]);
    const { error } = await db.from("onboarding_archivos").delete().eq("id", doc.id);
    if (error) toast.error(error.message); else { setActive(null); refresh(); }
  };
  const isImg = doc?.mime_type?.startsWith("image/");
  const isPdf = doc?.mime_type === "application/pdf" || /\.pdf$/i.test(doc?.nombre_original ?? "");
  const verdict = doc?.ai_veredicto;

  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle className="text-2xl">{req?.titulo ?? "Otros archivos"}</SheetTitle>
        <SheetDescription>{req?.descripcion ?? "Archivos que la IA no pudo asignar. Muévelos al documento correcto."}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onUpload}><UploadCloud className="mr-1 h-4 w-4" />Subir {docs.length ? "nueva versión" : "archivo"}</Button>
        {req && canValidate && (req.validado_at
          ? <Button size="sm" variant="outline" onClick={() => validate(false)}>Quitar validación</Button>
          : <Button size="sm" variant="outline" disabled={!docs.length} onClick={() => validate(true)}><ShieldCheck className="mr-1 h-4 w-4" />Validar documento</Button>)}
      </div>

      {docs.length === 0 ? (
        <div className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Aún no se ha subido nada.</div>
      ) : (
        <>
          {doc && (
            <div className={cn("rounded-3xl p-4", verdict === "bien" ? "bg-hub-ok/10" : verdict ? "bg-hub-warn/15" : "bg-muted")}>
              <div className="flex items-center gap-2 font-semibold">
                {doc.ai_estado === "analizando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-hub-violet" />}
                {doc.ai_estado === "analizando" ? "La IA está revisando…" : doc.ai_estado === "error" ? "No se pudo revisar" : verdict === "bien" ? "Todo bien según la IA" : verdict === "incorrecto" ? "Parece el documento equivocado" : verdict === "revisar" ? "Revisar observaciones" : "Sin revisión"}
                <button className="ml-auto text-xs font-normal underline-offset-2 hover:underline" disabled={busy} onClick={async () => { setBusy(true); await onReview(doc.id); setBusy(false); }}>
                  <RefreshCw className={cn("mr-1 inline h-3 w-3", busy && "animate-spin")} />Revisar de nuevo
                </button>
              </div>
              {doc.ai_resumen && <p className="mt-1 text-sm">{doc.ai_resumen}</p>}
              {doc.ai_observaciones.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{doc.ai_observaciones.map((o, i) => <li key={i}>{o}</li>)}</ul>}
            </div>
          )}

          <div className="overflow-hidden rounded-3xl border bg-muted/40">
            {!url ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
              : isImg ? <img src={url} alt={doc!.nombre_original} className="max-h-[60vh] w-full object-contain" />
              : isPdf ? <iframe src={url} title={doc!.nombre_original} className="h-[60vh] w-full bg-card" />
              : table ? (
                <div className="max-h-[60vh] overflow-auto"><table className="w-full text-xs">
                  <tbody>{table.map((r, i) => <tr key={i} className={i === 0 ? "sticky top-0 bg-card font-semibold" : "border-t"}>{r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{c}</td>)}</tr>)}</tbody>
                </table></div>)
              : <div className="p-10 text-center text-sm text-muted-foreground">Vista previa no disponible. Descárgalo para verlo.</div>}
          </div>

          {doc && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild disabled={!url}><a href={url ?? "#"} target="_blank" rel="noreferrer" download={doc.nombre_original}><Download className="mr-1 h-4 w-4" />Descargar</a></Button>
              <Button size="sm" variant={doc.destacado ? "default" : "outline"} onClick={() => patchDoc({ destacado: !doc.destacado })}><Star className="mr-1 h-4 w-4" />Importante</Button>
              <Button size="sm" variant={doc.atencion ? "default" : "outline"} onClick={() => patchDoc({ atencion: !doc.atencion })}><AlertTriangle className="mr-1 h-4 w-4" />Requiere atención</Button>
              {isAdmin && <Button size="sm" variant="ghost" className="text-hub-bad" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Borrar</Button>}
              <select aria-label="Mover a documento" className="h-9 rounded-md border bg-card px-2 text-sm" value={doc.item_id ?? ""}
                onChange={(e) => patchDoc({ item_id: e.target.value || null } as Partial<Doc>)}>
                <option value="">Otros (sin asignar)</option>
                {reqs.map((r) => <option key={r.id} value={r.id}>{r.titulo}</option>)}
              </select>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold">Versiones</p>
            <ul className="space-y-1">
              {docs.map((d, i) => {
                const I = fileIcon(d.nombre_original, d.mime_type);
                return (
                  <li key={d.id}><button onClick={() => setActive(d.id)} className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm hover:bg-muted", d.id === doc?.id && "bg-muted")}>
                    <I className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{d.nombre_original}</span>
                    {i === 0 && <span className="rounded-full bg-hub-glow px-2 text-[10px] font-semibold text-hub-ink">ACTUAL</span>}
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtBytes(d.size_bytes)} · {fmtDate(d.uploaded_at)}</span>
                  </button></li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
