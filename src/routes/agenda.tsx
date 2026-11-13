import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { AlertTriangle, CalendarCheck, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AvailabilityGrid, businessDays, isoToSlot, slotLabel } from "@/components/launch/SessionsHub";
import { db, roleLabel, type Disp } from "@/components/launch/hub-data";
import { listAgendaSesionesFn } from "@/lib/launch-agenda.functions";
import { nowSlot } from "@/lib/availability";

export const Route = createFileRoute("/agenda")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login", search: { redirect: location.pathname } });
  },
  head: () => ({
    meta: [
      { title: "Agenda de sesiones · Salida de NetSuite IMV" },
      { name: "description", content: "Pinta tus horas libres para agendar las sesiones de implementación de IMV." },
      { property: "og:title", content: "Agenda de sesiones · Salida de NetSuite IMV" },
      { property: "og:description", content: "Marca cuándo estás libre y el sistema propone el mejor horario para cada sesión." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaPage,
});

function AgendaPage() {
  const qc = useQueryClient();
  const listSesiones = useServerFn(listAgendaSesionesFn);
  const q = useQuery({
    queryKey: ["launch-agenda"],
    queryFn: async () => {
      const [{ data: u }, disp, sesiones] = await Promise.all([
        supabase.auth.getUser(),
        db.from("onboarding_disponibilidad").select("id,persona,rol,slots"),
        listSesiones(),
      ]);
      if (disp.error) throw new Error(disp.error.message);
      return { uid: u.user?.id ?? null, disponibilidad: disp.data as Disp[], sesiones };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["launch-agenda"] });
  const days = useMemo(() => businessDays(nowSlot().slice(0, 10), 15), []);

  return (
    <main className="launch-hub min-h-screen bg-background px-3 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="relative overflow-clip rounded-[2rem] bg-hub-hero p-6 text-primary-foreground sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-hub-glow/20 blur-3xl" aria-hidden />
          <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-hub-glow">Salida de NetSuite · IMV</p>
          <h1 className="relative mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Agenda de sesiones</h1>
          <p className="relative mt-2 max-w-xl text-sm opacity-80">Escribe tu nombre, elige tu área y pinta las horas en que puedes asistir. Con eso agendamos cada sesión.</p>
        </header>

        {q.isLoading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : q.error ? (
          <div className="rounded-3xl border bg-card p-8 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-hub-bad" />
            <p className="mt-2 font-medium">No se pudo cargar la agenda</p>
            <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>
            <Button className="mt-4" onClick={refresh}>Reintentar</Button>
          </div>
        ) : q.data ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <AvailabilityGrid data={q.data} days={days} refresh={refresh} />
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sesiones</h2>
              {q.data.sesiones.length === 0 && <p className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">Aún no hay sesiones.</p>}
              {q.data.sesiones.map((s) => (
                <article key={s.id} className="flex items-start gap-3 rounded-3xl border bg-card p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-hub-ink font-mono text-xs font-bold text-hub-glow">{String(s.orden).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">{s.titulo}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.duracion ?? "1 h"}</span>
                      {s.fecha_hora
                        ? <span className="flex items-center gap-1 font-medium capitalize text-foreground"><CalendarCheck className="h-3 w-3" />{slotLabel(isoToSlot(s.fecha_hora))}</span>
                        : <span>{s.estado === "realizada" ? "Realizada" : "Por agendar"}</span>}
                    </p>
                    {s.responsables.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{s.responsables.map(roleLabel).join(" · ")}</p>}
                  </div>
                </article>
              ))}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
