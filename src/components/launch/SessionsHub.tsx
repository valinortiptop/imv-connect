import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, ChevronLeft, ChevronRight, Download, Users, Plus, X, Check, Clock, Sparkles, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { daySlots, icsFor, nowSlot, planSchedule, slotToUtcIso, windowDays } from "@/lib/availability";
import { ROLES, db, durationMinutes, roleLabel, type Disp, type HubData, type Sesion } from "./hub-data";
import { cn } from "@/lib/utils";

export const START_H = 8, END_H = 19;
export const slotLabel = (s: string) => new Date(`${s}:00-06:00`).toLocaleString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
export const isoToSlot = (iso: string) => {
  const t = new Date(iso).getTime() - 6 * 3600000; const r = Math.round(t / 1800000) * 1800000;
  return new Date(r).toISOString().slice(0, 16);
};

export function businessDays(from: string, n: number) {
  return windowDays(from, n * 2).filter((d) => { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return w !== 0 && w !== 6; }).slice(0, n);
}

const ESTADOS: Record<string, { l: string; c: string }> = {
  por_agendar: { l: "Por agendar", c: "bg-muted text-muted-foreground" },
  agendada: { l: "Agendada", c: "bg-hub-violet/15 text-hub-violet" },
  realizada: { l: "Realizada", c: "bg-hub-ok/15 text-hub-ok" },
};

export function SessionsHub({ data, refresh }: { data: HubData; refresh: () => void }) {
  const today = nowSlot().slice(0, 10);
  const days = useMemo(() => businessDays(today, 15), [today]);
  const people = useMemo(() => data.disponibilidad.map((d) => ({ person_name: d.persona, role_key: d.rol, slots: d.slots })), [data.disponibilidad]);
  const confirmed = useMemo(() => Object.fromEntries(data.sesiones.filter((s) => s.fecha_hora).map((s) => [s.id, isoToSlot(s.fecha_hora!)])), [data.sesiones]);
  const plan = useMemo(() => planSchedule(people,
    data.sesiones.filter((s) => s.estado !== "realizada" || confirmed[s.id]).map((s) => ({ key: s.id, roles: s.responsables, minutes: durationMinutes(s.duracion) })),
    days, START_H, END_H, confirmed, { altCount: 2, notBefore: nowSlot() }), [people, data.sesiones, days, confirmed]);
  const [open, setOpen] = useState<string | null>(null);

  const confirm = async (s: Sesion, slot: string | null) => {
    const { error } = await db.from("onboarding_sesiones").update({
      fecha_hora: slot ? slotToUtcIso(slot) : null,
      estado: slot ? (s.estado === "realizada" ? "realizada" : "agendada") : s.estado === "agendada" ? "por_agendar" : s.estado,
    }).eq("id", s.id);
    if (error) toast.error(error.message.includes("row-level") ? "Solo un admin puede confirmar horarios" : error.message);
    else { toast.success(slot ? "Horario confirmado" : "Horario liberado"); refresh(); }
  };
  const ics = (s: Sesion, slot: string) => {
    const blob = new Blob([icsFor(`IMV · ${s.titulo}`, slot, durationMinutes(s.duracion), s.objetivo ?? "")], { type: "text/calendar" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `sesion-${s.orden}.ics`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sesiones del plan</h3>
        {data.sesiones.map((s) => {
          const entry = plan[s.id]; const conf = confirmed[s.id]; const att = data.asistentes.filter((a) => a.sesion_id === s.id);
          const st = ESTADOS[s.estado] ?? ESTADOS.por_agendar; const isOpen = open === s.id;
          return (
            <article key={s.id} className={cn("rounded-3xl border bg-card transition", isOpen && "shadow-lg ring-1 ring-hub-violet/30")}>
              <button className="flex w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-3xl" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-hub-ink font-mono text-sm font-bold text-hub-glow">{String(s.orden).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{s.titulo}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.duracion ?? "1 h"}</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{att.length || s.responsables.length} asistentes</span>
                    {conf ? <span className="font-medium capitalize text-foreground">{slotLabel(conf)}</span>
                      : entry?.pick ? <span className="flex items-center gap-1 text-hub-violet"><Sparkles className="h-3 w-3" />Propuesta: <span className="capitalize">{slotLabel(entry.pick.start)}</span></span>
                      : <span>Esperando disponibilidad</span>}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", st.c)}>{st.l}</span>
              </button>
              {isOpen && <SessionDetail s={s} data={data} conf={conf} entry={entry} onConfirm={confirm} onIcs={ics} refresh={refresh} />}
            </article>
          );
        })}
      </div>
      <AvailabilityGrid data={data} days={days} refresh={refresh} shareLink />
    </div>
  );
}

function SessionDetail({ s, data, conf, entry, onConfirm, onIcs, refresh }: {
  s: Sesion; data: HubData; conf?: string; entry?: ReturnType<typeof planSchedule>[string];
  onConfirm: (s: Sesion, slot: string | null) => void; onIcs: (s: Sesion, slot: string) => void; refresh: () => void;
}) {
  const att = data.asistentes.filter((a) => a.sesion_id === s.id);
  const [n, setN] = useState(""); const [r, setR] = useState(s.responsables[0] ?? "direccion"); const [e, setE] = useState("");
  const [acuerdos, setAcuerdos] = useState(s.acuerdos ?? "");
  const add = async () => {
    if (!n.trim()) return;
    const email = e.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Correo no válido");
    const { error } = await db.from("onboarding_asistentes").insert({ sesion_id: s.id, nombre: n.trim().slice(0, 120), rol: r, email: email || null });
    if (error) toast.error(error.message); else { setN(""); setE(""); refresh(); }
  };
  const options = [...(entry?.pick ? [{ ...entry.pick, outOfOrder: false }] : []), ...(entry?.alts ?? [])];
  return (
    <div className="space-y-4 border-t px-4 pb-4 pt-3 text-sm">
      {s.objetivo && <p className="text-muted-foreground">{s.objetivo}</p>}
      <div className="flex flex-wrap gap-1.5">{s.responsables.map((k) => <span key={k} className="rounded-full bg-muted px-2.5 py-1 text-xs">{roleLabel(k)}</span>)}</div>

      <div className="space-y-2">
        <p className="font-semibold">Horario</p>
        {conf ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-hub-glow-soft p-3">
            <CalendarCheck className="h-4 w-4" /><span className="flex-1 font-medium capitalize">{slotLabel(conf)}</span>
            <Button size="sm" variant="outline" onClick={() => onIcs(s, conf)}><Download className="mr-1 h-3.5 w-3.5" />.ics</Button>
            {data.isAdmin && <Button size="sm" variant="ghost" onClick={() => onConfirm(s, null)}>Liberar</Button>}
          </div>
        ) : options.length === 0 ? (
          <p className="text-muted-foreground">Aún nadie de estas áreas ha pintado horas libres. Pide que llenen la agenda de la derecha.</p>
        ) : options.map((o, i) => (
          <div key={o.start} className={cn("flex flex-wrap items-center gap-2 rounded-2xl border p-3", i === 0 && "border-hub-violet bg-hub-violet/5")}>
            <div className="min-w-0 flex-1">
              <p className="font-medium capitalize">{i === 0 && <Sparkles className="mr-1 inline h-3.5 w-3.5 text-hub-violet" />}{slotLabel(o.start)}</p>
              <p className="text-xs text-muted-foreground">{o.people.join(", ")}{o.rolesMissing.length > 0 && ` · falta: ${o.rolesMissing.map(roleLabel).join(", ")}`}{o.outOfOrder && " · fuera de orden"}</p>
            </div>
            {data.isAdmin && <Button size="sm" onClick={() => onConfirm(s, o.start)}><Check className="mr-1 h-3.5 w-3.5" />Confirmar</Button>}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="font-semibold">Asistentes</p>
        {att.length === 0 && <p className="text-muted-foreground">Sin asistentes registrados.</p>}
        <ul className="space-y-1">
          {att.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-hub-ink text-xs font-semibold text-primary-foreground">{a.nombre.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate">{a.nombre} <span className="text-xs text-muted-foreground">· {roleLabel(a.rol ?? "")}{a.email ? ` · ${a.email}` : ""}</span></span>
              <button className={cn("rounded-full px-2 py-0.5 text-xs", a.asistio ? "bg-hub-ok/15 text-hub-ok" : "bg-card text-muted-foreground")}
                onClick={async () => { await db.from("onboarding_asistentes").update({ asistio: !a.asistio }).eq("id", a.id); refresh(); }}>{a.asistio ? "Asistió" : "¿Asistió?"}</button>
              <button aria-label={`Quitar ${a.nombre}`} onClick={async () => { await db.from("onboarding_asistentes").delete().eq("id", a.id); refresh(); }}><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
          <Input aria-label="Nombre del asistente" placeholder="Nombre" value={n} onChange={(x) => setN(x.target.value)} />
          <select aria-label="Rol" className="h-10 rounded-md border bg-card px-2" value={r} onChange={(x) => setR(x.target.value)}>{ROLES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
          <Input aria-label="Correo" placeholder="Correo (opcional)" value={e} onChange={(x) => setE(x.target.value)} />
          <Button onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-semibold">Notas y acuerdos</p>
        <Textarea value={acuerdos} onChange={(x) => setAcuerdos(x.target.value)} placeholder="Qué se acordó, pendientes…" disabled={!data.isAdmin} />
        {data.isAdmin && acuerdos !== (s.acuerdos ?? "") && (
          <div className="flex gap-2">
            <Button size="sm" onClick={async () => { const { error } = await db.from("onboarding_sesiones").update({ acuerdos: acuerdos.slice(0, 5000) }).eq("id", s.id); if (error) toast.error(error.message); else refresh(); }}>Guardar</Button>
            {s.estado !== "realizada" && <Button size="sm" variant="outline" onClick={async () => { await db.from("onboarding_sesiones").update({ acuerdos, estado: "realizada" }).eq("id", s.id); refresh(); }}>Guardar y marcar realizada</Button>}
          </div>
        )}
      </div>
    </div>
  );
}

export type AgendaData = { disponibilidad: Disp[]; sesiones: Pick<Sesion, "titulo" | "fecha_hora" | "duracion">[]; uid: string | null };

export function AvailabilityGrid({ data, days, refresh, shareLink }: { data: AgendaData; days: string[]; refresh: () => void; shareLink?: boolean }) {
  const [name, setName] = useState(""); const [role, setRole] = useState("");
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0); const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false);
  const paint = useRef<boolean | null>(null);
  const perPage = 5; const shown = days.slice(page * perPage, page * perPage + perPage);
  const hours = daySlots(days[0] ?? "2026-01-01", START_H, END_H).map((s) => s.slice(11));
  const now = nowSlot();

  useEffect(() => { setName(localStorage.getItem("launch-hub-name") ?? ""); setRole(localStorage.getItem("launch-hub-role") ?? ""); }, []);
  useEffect(() => {
    const me = data.disponibilidad.find((d) => d.persona.toLowerCase() === name.trim().toLowerCase() && d.rol === role);
    setMine(new Set(me?.slots ?? [])); setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, data.disponibilidad.length]);

  const others = useMemo(() => {
    const m = new Map<string, string[]>();
    data.disponibilidad.forEach((p) => { if (p.persona.toLowerCase() === name.trim().toLowerCase() && p.rol === role) return; p.slots.forEach((s) => m.set(s, [...(m.get(s) ?? []), p.persona])); });
    return m;
  }, [data.disponibilidad, name, role]);
  const max = Math.max(1, ...[...others.values()].map((v) => v.length));
  const confirmedAt = useMemo(() => {
    const m = new Map<string, string>();
    data.sesiones.forEach((s) => { if (!s.fecha_hora) return; const st = isoToSlot(s.fecha_hora); daySlots(st.slice(0, 10), 0, 24).filter((x) => x >= st).slice(0, durationMinutes(s.duracion) / 30).forEach((x) => m.set(x, s.titulo)); });
    return m;
  }, [data.sesiones]);
  const ready = name.trim().length > 1 && !!role;
  const toggle = (slot: string, v: boolean) => { setDirty(true); setMine((p) => { const n = new Set(p); v ? n.add(slot) : n.delete(slot); return n; }); };

  const save = async () => {
    setSaving(true);
    localStorage.setItem("launch-hub-name", name.trim()); localStorage.setItem("launch-hub-role", role);
    const { error } = await db.from("onboarding_disponibilidad").upsert({ persona: name.trim().slice(0, 80), rol: role, slots: [...mine].sort(), updated_by: data.uid }, { onConflict: "persona,rol" });
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Disponibilidad guardada"); setDirty(false); refresh(); }
  };

  return (
    <section className="rounded-3xl border bg-card p-4 sm:p-5 xl:sticky xl:top-4 xl:self-start">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Agenda: pinta tus horas libres</h3>
          <p className="text-sm text-muted-foreground">Arrastra sobre la cuadrícula. El sistema propone el mejor horario de cada sesión con base en quién coincide. Hora de CDMX.</p>
        </div>
        {shareLink && (
          <Button size="sm" variant="outline" className="shrink-0 rounded-xl" onClick={async () => {
            const url = `${window.location.origin}/agenda`;
            try { await navigator.clipboard.writeText(url); toast.success("Enlace copiado", { description: url }); }
            catch { toast.message("Comparte este enlace", { description: url }); }
          }}><Link2 className="mr-1 h-3.5 w-3.5" />Copiar enlace</Button>
        )}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input aria-label="Tu nombre" placeholder="Tu nombre (p. ej. Doris)" value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => { const me = data.disponibilidad.find((d) => d.persona.toLowerCase() === name.trim().toLowerCase() && d.rol === role); if (me) setMine(new Set(me.slots)); }} />
        <select aria-label="Tu área" className="h-10 rounded-md border bg-card px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">¿Qué área representas?</option>{ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <Button onClick={save} disabled={!ready || saving || !dirty}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}</Button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button size="icon" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Días anteriores"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-sm font-medium capitalize">{dayLabel(shown[0])} – {dayLabel(shown[shown.length - 1])}</span>
        <Button size="icon" variant="ghost" disabled={(page + 1) * perPage >= days.length} onClick={() => setPage(page + 1)} aria-label="Días siguientes"><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <div className={cn("mt-2 select-none touch-none", !ready && "opacity-60")} onPointerUp={() => (paint.current = null)} onPointerLeave={() => (paint.current = null)}>
        <div className="grid gap-px" style={{ gridTemplateColumns: `3rem repeat(${shown.length}, minmax(0,1fr))` }}>
          <span />
          {shown.map((d) => <span key={d} className="pb-1 text-center text-[11px] font-semibold capitalize text-muted-foreground">{dayLabel(d)}</span>)}
          {hours.map((h) => (
            <div key={h} className="contents">
              <span className="pr-1 text-right text-[10px] leading-6 text-muted-foreground">{h.endsWith("00") ? h : ""}</span>
              {shown.map((d) => {
                const slot = `${d}T${h}`; const on = mine.has(slot); const o = others.get(slot) ?? []; const conf = confirmedAt.get(slot); const past = slot < now;
                return (
                  <button key={slot} type="button" disabled={!ready || past}
                    title={[conf && `Sesión: ${conf}`, o.length && `Libres: ${o.join(", ")}`].filter(Boolean).join(" · ") || undefined}
                    aria-label={`${dayLabel(d)} ${h}${on ? ", libre" : ""}`} aria-pressed={on}
                    onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); paint.current = !on; toggle(slot, !on); }}
                    onPointerEnter={() => { if (paint.current !== null) toggle(slot, paint.current); }}
                    onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(slot, !on); } }}
                    className={cn("relative h-6 rounded-[4px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      past ? "bg-muted/40" : on ? "bg-hub-glow" : "bg-muted hover:bg-hub-glow-soft", h.endsWith("00") && "mt-px")}
                    style={!on && o.length && !past ? { backgroundColor: `color-mix(in oklab, var(--hub-violet) ${15 + (o.length / max) * 55}%, transparent)` } : undefined}>
                    {conf && <span className="absolute inset-0 rounded-[4px] ring-2 ring-inset ring-hub-ink" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-hub-glow" />Tú libre</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-hub-violet/60" />Otros libres (más oscuro = más gente)</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded ring-2 ring-inset ring-hub-ink" />Sesión confirmada</span>
      </div>
      {data.disponibilidad.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Ya respondieron: {data.disponibilidad.map((d) => `${d.persona} (${roleLabel(d.rol)})`).join(", ")}</p>
      )}
    </section>
  );
}
