import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getRepCalendarEventsFn,
  listRepresentantesFn,
  type CalendarEvent,
} from "@/lib/rep-calendar.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import AIPageInsights from "@/components/ai/AIPageInsights";

type ViewMode = "month" | "week" | "day";

const TYPE_META: Record<
  CalendarEvent["type"],
  { label: string; color: string; dot: string }
> = {
  visita: {
    label: "Visita",
    color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    dot: "bg-blue-500",
  },
  acuerdo: {
    label: "Acuerdo",
    color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    dot: "bg-amber-500",
  },
  llamada: {
    label: "Llamada",
    color: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
    dot: "bg-violet-500",
  },
  pedido: {
    label: "Pedido",
    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  entrega: {
    label: "Entrega",
    color: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
    dot: "bg-orange-500",
  },
  ruta: {
    label: "Ruta",
    color: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    dot: "bg-sky-500",
  },
};

const ALL_TYPES: CalendarEvent["type"][] = ["visita", "acuerdo", "llamada", "pedido", "entrega", "ruta"];

function startOfDay(d: Date) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfMonthGrid(d: Date) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const dow = first.getDay(); // 0 sun
  return addDays(first, -dow);
}
function fmtISO(d: Date) {
  return d.toISOString();
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type CalendarViewProps = {
  repId?: string;
  clienteId?: string;
  embedded?: boolean;
};

export default function CalendarView({ repId, clienteId, embedded }: CalendarViewProps = {}) {
  const fetchEvents = useServerFn(getRepCalendarEventsFn);
  const fetchReps = useServerFn(listRepresentantesFn);

  // On mobile, default to day view (agenda-like); month grid is unusable at <640px.
  const initialView: ViewMode =
    typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "month";
  const [view, setView] = useState<ViewMode>(initialView);
  const [cursor, setCursor] = useState<Date>(startOfDay(new Date()));
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);
  const [activeTypes, setActiveTypes] = useState<CalendarEvent["type"][]>([...ALL_TYPES]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(startOfDay(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);


  const { from, to } = useMemo(() => {
    if (view === "month") {
      const start = startOfMonthGrid(cursor);
      const end = addDays(start, 42);
      return { from: fmtISO(start), to: fmtISO(end) };
    }
    if (view === "week") {
      const start = addDays(startOfDay(cursor), -cursor.getDay());
      return { from: fmtISO(start), to: fmtISO(addDays(start, 7)) };
    }
    const start = startOfDay(cursor);
    return { from: fmtISO(start), to: fmtISO(addDays(start, 1)) };
  }, [view, cursor]);

  const repsQuery = useQuery({
    queryKey: ["rep-calendar-reps"],
    queryFn: () => fetchReps(),
    enabled: !embedded,
  });

  const eventsQuery = useQuery({
    queryKey: ["rep-calendar-events", from, to, selectedRepIds.join(","), repId ?? "", clienteId ?? ""],
    queryFn: () =>
      fetchEvents({
        data: {
          from,
          to,
          repIds: !repId && selectedRepIds.length ? selectedRepIds : undefined,
          repId,
          clienteId,
        },
      }),
  });


  const filteredEvents = useMemo(() => {
    const evts = eventsQuery.data?.events ?? [];
    return evts.filter((e) => activeTypes.includes(e.type));
  }, [eventsQuery.data, activeTypes]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filteredEvents) {
      const key = e.start.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filteredEvents]);

  const monthGridDays = useMemo(() => {
    const start = startOfMonthGrid(cursor);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = addDays(startOfDay(cursor), -cursor.getDay());
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const dayLabel = cursor.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const step = (dir: 1 | -1) => {
    if (view === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    } else if (view === "week") {
      setCursor(addDays(cursor, 7 * dir));
    } else {
      setCursor(addDays(cursor, dir));
    }
  };

  const toggleType = (t: CalendarEvent["type"]) => {
    setActiveTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const toggleRep = (id: string) => {
    setSelectedRepIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const dayEvents = selectedDay
    ? filteredEvents.filter((e) => sameDay(new Date(e.start), selectedDay))
    : [];

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold md:text-2xl">
              <CalendarDays className="h-5 w-5 shrink-0 text-primary md:h-6 md:w-6" /> Calendario
            </h1>
            <p className="text-sm text-muted-foreground">
              Visitas, acuerdos, llamadas, pedidos y entregas.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 md:w-auto">
            <Button variant="outline" size="sm" onClick={() => step(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(startOfDay(new Date()))} className="flex-1 md:flex-none">
              Hoy
            </Button>
            <Button variant="outline" size="sm" onClick={() => step(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-auto flex rounded-md border md:ml-2">
              {(["month", "week", "day"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 text-xs capitalize",
                    view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {v === "month" ? "Mes" : v === "week" ? "Sem" : "Día"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {embedded && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(startOfDay(new Date()))}>
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-1 text-sm font-medium capitalize">
            {view === "month" ? monthLabel : view === "day" ? dayLabel : `Semana`}
          </span>
          <div className="ml-auto flex rounded-md border">
            {(["month", "week", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-2.5 py-1 text-xs capitalize",
                  view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {v === "month" ? "Mes" : v === "week" ? "Sem" : "Día"}
              </button>
            ))}
          </div>
        </div>
      )}

      {!embedded && <AIPageInsights module="rep-calendario" title="Análisis de agenda" />}


      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div>
            <div className="text-xs font-medium mb-1 text-muted-foreground">Tipo de evento</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TYPES.map((t) => {
                const active = activeTypes.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
                      active ? TYPE_META[t].color : "opacity-50 border-border",
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", TYPE_META[t].dot)} />
                    {TYPE_META[t].label}
                  </button>
                );
              })}
            </div>
          </div>
          {!embedded && (
            <div>
              <div className="text-xs font-medium mb-1 text-muted-foreground">Representantes</div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedRepIds([])}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    selectedRepIds.length === 0 ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  Todos
                </button>
                {(repsQuery.data?.representantes ?? []).map((r) => {
                  const active = selectedRepIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRep(r.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      {r.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Views */}
      {view === "month" && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base capitalize">{monthLabel}</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="grid grid-cols-7 gap-1 text-[10px] uppercase text-muted-foreground pb-1">
              {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
                <div key={d} className="text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGridDays.map((d) => {
                const isCurMonth = d.getMonth() === cursor.getMonth();
                const isToday = sameDay(d, new Date());
                const isSelected = selectedDay && sameDay(d, selectedDay);
                const key = d.toISOString().slice(0, 10);
                const evts = eventsByDay.get(key) ?? [];
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(d)}
                    className={cn(
                      "min-h-[56px] rounded-md border p-1 text-left text-xs transition md:min-h-[76px]",
                      isCurMonth ? "bg-card" : "bg-muted/30 text-muted-foreground",
                      isSelected && "ring-2 ring-primary",
                      isToday && "border-primary",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("font-medium", isToday && "text-primary")}>
                        {d.getDate()}
                      </span>
                      {evts.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">{evts.length}</span>
                      )}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {evts.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          role="button"
                          tabIndex={0}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedEvent(e);
                          }}
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-[10px] border cursor-pointer hover:opacity-80",
                            TYPE_META[e.type].color,
                          )}
                        >
                          {new Date(e.start).toLocaleTimeString("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          {e.title}
                        </div>
                      ))}
                      {evts.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">+{evts.length - 3} más</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {view === "week" && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">
              Semana del {weekDays[0].toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((d) => {
                const key = d.toISOString().slice(0, 10);
                const evts = eventsByDay.get(key) ?? [];
                const isToday = sameDay(d, new Date());
                return (
                  <div
                    key={key}
                    className={cn("rounded-md border p-2 min-h-[220px]", isToday && "border-primary")}
                  >
                    <div className="text-xs font-medium mb-2">
                      {d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" })}
                    </div>
                    <div className="space-y-1">
                      {evts.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setSelectedEvent(e)}
                          className={cn(
                            "w-full text-left rounded border px-1.5 py-1 text-[11px] hover:opacity-80 transition",
                            TYPE_META[e.type].color,
                          )}
                        >
                          <div className="font-medium truncate">{e.title}</div>
                          <div className="text-[10px] opacity-70">
                            {new Date(e.start).toLocaleTimeString("es-MX", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {e.representante_nombre ? ` · ${e.representante_nombre}` : ""}
                          </div>
                        </button>
                      ))}
                      {evts.length === 0 && (
                        <div className="text-[10px] text-muted-foreground">Sin eventos</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {view === "day" && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base capitalize">{dayLabel}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {(eventsByDay.get(cursor.toISOString().slice(0, 10)) ?? []).map((e) => (
              <EventRow key={e.id} e={e} onClick={() => setSelectedEvent(e)} />
            ))}
            {!(eventsByDay.get(cursor.toISOString().slice(0, 10)) ?? []).length && (
              <div className="text-sm text-muted-foreground">Sin eventos programados.</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Selected day detail (month/week view) */}
      {view !== "day" && selectedDay && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base capitalize">
              {selectedDay.toLocaleDateString("es-MX", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}{" "}
              — {dayEvents.length} eventos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {dayEvents.length === 0 && (
              <div className="text-sm text-muted-foreground">Sin eventos para este día.</div>
            )}
            {dayEvents.map((e) => (
              <EventRow key={e.id} e={e} onClick={() => setSelectedEvent(e)} />
            ))}
          </CardContent>
        </Card>
      )}

      {eventsQuery.isLoading && (
        <div className="text-xs text-muted-foreground">Cargando agenda…</div>
      )}
    </div>
  );
}

function EventRow({ e }: { e: CalendarEvent }) {
  const meta = TYPE_META[e.type];
  return (
    <div className="flex items-start gap-3 rounded-md border p-2">
      <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium truncate">{e.title}</span>
          <Badge variant="outline" className={cn("shrink-0 text-[10px]", meta.color)}>
            {meta.label}
          </Badge>
          {e.status && (
            <Badge variant="secondary" className="text-[10px]">
              {e.status}
            </Badge>
          )}
        </div>
        {e.subtitle && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{e.subtitle}</div>
        )}
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {new Date(e.start).toLocaleString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "short",
          })}
          {e.representante_nombre ? ` · ${e.representante_nombre}` : ""}
          {e.cliente_nombre ? ` · ${e.cliente_nombre}` : ""}
        </div>
      </div>
    </div>
  );
}
