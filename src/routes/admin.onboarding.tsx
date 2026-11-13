import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FolderUp, CalendarRange, KanbanSquare, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentsHub } from "@/components/launch/DocumentsHub";
import { SessionsHub } from "@/components/launch/SessionsHub";
import { TasksBoard } from "@/components/launch/TasksBoard";
import { loadHub, reqState, taskCol } from "@/components/launch/hub-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/onboarding")({
  head: () => ({
    meta: [
      { title: "Salida de NetSuite · Hub de implementación IMV" },
      { name: "description", content: "Documentos, sesiones con agenda compartida y tareas/bugs para terminar la salida de NetSuite." },
      { property: "og:title", content: "Salida de NetSuite · Hub de implementación IMV" },
      { property: "og:description", content: "Un solo lugar para subir documentos, coordinar sesiones y seguir tareas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LaunchHubPage,
});

const TABS = [
  { key: "docs", label: "Documentos", icon: FolderUp },
  { key: "sesiones", label: "Sesiones y agenda", icon: CalendarRange },
  { key: "tareas", label: "Tareas y bugs", icon: KanbanSquare },
] as const;

function Ring({ pct }: { pct: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90" aria-hidden>
      <circle cx="40" cy="40" r={r} strokeWidth="8" className="fill-none stroke-primary-foreground/15" />
      <circle cx="40" cy="40" r={r} strokeWidth="8" strokeLinecap="round" className="fill-none stroke-hub-glow transition-all duration-700 motion-reduce:transition-none"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
    </svg>
  );
}

function LaunchHubPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["launch-hub"], queryFn: loadHub, refetchInterval: (query) => query.state.data?.docs.some((d) => d.ai_estado === "analizando") ? 4000 : false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["launch-hub"] });
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("docs");

  const stats = useMemo(() => {
    if (!q.data) return null;
    const d = q.data;
    const listos = d.reqs.filter((r) => { const s = reqState(r, d.docs.filter((x) => x.item_id === r.id)); return s === "ok" || s === "validado"; }).length;
    const subidos = d.reqs.filter((r) => d.docs.some((x) => x.item_id === r.id)).length;
    const ses = d.sesiones.filter((s) => s.estado === "realizada").length;
    const agend = d.sesiones.filter((s) => s.fecha_hora).length;
    const abiertas = d.tasks.filter((t) => taskCol(t.estado) !== "hecho").length;
    const bugs = d.tasks.filter((t) => t.tipo === "bug" && taskCol(t.estado) !== "hecho").length;
    const total = d.reqs.length + d.sesiones.length + d.tasks.length;
    const done = listos + ses + (d.tasks.length - abiertas);
    const corte = d.programa?.fecha_corte ? Math.ceil((new Date(`${d.programa.fecha_corte}T00:00:00-06:00`).getTime() - Date.now()) / 86400000) : null;
    return { listos, subidos, ses, agend, abiertas, bugs, pct: total ? Math.round((done / total) * 100) : 0, corte };
  }, [q.data]);

  return (
    <div className="launch-hub -m-2 space-y-6 sm:m-0">
      <header className="relative overflow-clip rounded-[2rem] bg-hub-hero p-6 text-primary-foreground sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-hub-glow/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hub-glow">Hub de implementación</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Salida de NetSuite</h1>
            <p className="mt-2 max-w-xl text-sm opacity-80">Sube documentos, coordina las sesiones y sigue cada tarea hasta operar 100% en la app.</p>
            {stats && (
              <p className="mt-4 inline-flex rounded-full bg-primary-foreground/10 px-3 py-1 text-sm">
                {stats.corte == null ? "Fecha de corte por definir" : stats.corte > 0 ? `Faltan ${stats.corte} días para el corte` : stats.corte === 0 ? "El corte es hoy" : `Corte hace ${-stats.corte} días`}
              </p>
            )}
          </div>
          {stats ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative"><Ring pct={stats.pct} /><span className="absolute inset-0 flex items-center justify-center text-xl font-bold">{stats.pct}%</span></div>
              <div className="grid grid-cols-3 gap-2">
                {[["Documentos", `${stats.subidos}/${q.data!.reqs.length}`, `subidos · ${stats.listos} listos`], ["Sesiones", `${stats.ses}/${q.data!.sesiones.length}`, `${stats.agend} agendadas`], ["Abiertas", String(stats.abiertas), `${stats.bugs} bugs`]].map(([l, v, s]) => (
                  <div key={l} className="rounded-2xl bg-primary-foreground/10 px-3 py-2 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-wider opacity-70">{l}</p>
                    <p className="text-2xl font-bold">{v}</p>
                    <p className="text-[11px] opacity-70">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <nav className="relative mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-primary-foreground/10 p-1" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={cn("flex shrink-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition",
                tab === t.key ? "bg-hub-glow text-hub-ink shadow" : "hover:bg-primary-foreground/10")}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </nav>
      </header>

      {q.isLoading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : q.error ? (
        <div className="rounded-3xl border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-hub-bad" />
          <p className="mt-2 font-medium">No se pudo cargar el hub</p>
          <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>
          <Button className="mt-4" onClick={refresh}>Reintentar</Button>
        </div>
      ) : q.data ? (
        tab === "docs" ? <DocumentsHub data={q.data} refresh={refresh} />
          : tab === "sesiones" ? <SessionsHub data={q.data} refresh={refresh} />
          : <TasksBoard data={q.data} refresh={refresh} />
      ) : null}
    </div>
  );
}
