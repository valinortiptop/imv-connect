import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, X, Send } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { aiRepAskFn } from "@/lib/ai/ai.functions";
import { useAI } from "./AIProvider";
import { useRouterState } from "@tanstack/react-router";

type Msg = { role: "user" | "assistant"; text: string };

type ModuleId =
  | "rep-home"
  | "rep-clientes"
  | "rep-cliente-detalle"
  | "rep-ruta"
  | "rep-visitas"
  | "rep-inventario"
  | "rep-plan"
  | "rep-laboratorios"
  | "rep-coach"
  | "rep-supervisor";

const ROUTE_TO_MODULE: { match: string; module: ModuleId }[] = [
  { match: "/rep/clientes/", module: "rep-cliente-detalle" },
  { match: "/rep/clientes", module: "rep-clientes" },
  { match: "/rep/ruta", module: "rep-ruta" },
  { match: "/rep/visitas", module: "rep-visitas" },
  { match: "/rep/inventario", module: "rep-inventario" },
  { match: "/rep/plan", module: "rep-plan" },
  { match: "/rep/laboratorios", module: "rep-laboratorios" },
  { match: "/rep/coach", module: "rep-coach" },
  { match: "/rep/supervisor", module: "rep-supervisor" },
  { match: "/rep", module: "rep-home" },
];

const MODULE_LABEL: Record<ModuleId, string> = {
  "rep-home": "Inicio",
  "rep-clientes": "Clientes",
  "rep-cliente-detalle": "Ficha de cliente",
  "rep-ruta": "Ruta",
  "rep-visitas": "Visitas",
  "rep-inventario": "Inventario",
  "rep-plan": "Plan semanal",
  "rep-laboratorios": "Laboratorios",
  "rep-coach": "Coach IA",
  "rep-supervisor": "Supervisor",
};

const SUGGESTIONS: Record<ModuleId, string[]> = {
  "rep-home": ["¿Qué debo priorizar hoy?", "Clientes en riesgo", "Resumen de mi semana"],
  "rep-clientes": ["¿Qué clientes no visito hace más?", "Top clientes por ticket", "Clientes con riesgo de churn"],
  "rep-cliente-detalle": ["Perfil 360° de este cliente", "¿Cuándo debo reordenar?", "Qué productos ofrecerle"],
  "rep-ruta": ["Optimiza mi ruta de hoy", "¿Qué clientes agregar hoy?", "Zona con más oportunidad"],
  "rep-visitas": ["Resumen de mis visitas de la semana", "Visitas sin resultado", "Próximas acciones pendientes"],
  "rep-inventario": ["¿Qué productos tienen stock bajo?", "Sustitutos para un SKU", "Novedades del catálogo"],
  "rep-plan": ["¿Cómo va mi plan semanal?", "Ajustes recomendados", "Pendientes de la semana"],
  "rep-laboratorios": ["Laboratorios en riesgo", "Oportunidades por laboratorio", "Cumplimiento por línea"],
  "rep-coach": ["Feedback de mi desempeño", "Qué mejorar esta semana", "Cerrar más pedidos"],
  "rep-supervisor": ["¿Qué reps necesitan apoyo?", "Top desempeño", "Zonas con oportunidad"],
};

export function AICopilotDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { enabled } = useAI();
  const { location } = useRouterState();
  const ask = useServerFn(aiRepAskFn);

  const moduleId: ModuleId =
    ROUTE_TO_MODULE.find((r) => location.pathname.startsWith(r.match))?.module ?? "rep-home";

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([]);
  }, [moduleId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const m = useMutation({
    mutationFn: (question: string) =>
      ask({ data: { module: moduleId, question, path: location.pathname } }),
    onSuccess: (res) => setMessages((prev) => [...prev, { role: "assistant", text: res.text }]),
    onError: (e: Error) =>
      setMessages((prev) => [...prev, { role: "assistant", text: `Error: ${e.message}` }]),
  });

  const send = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    m.mutate(text);
  };

  if (!enabled) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-4 py-3 flex-row items-center gap-2 space-y-0">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <SheetTitle className="text-sm">Asistente IA</SheetTitle>
            <p className="text-[11px] text-muted-foreground">{MODULE_LABEL[moduleId]}</p>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-muted-foreground">
                Pregunta lo que quieras sobre <strong>{MODULE_LABEL[moduleId]}</strong>. Sólo lectura — no realizo cambios.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(SUGGESTIONS[moduleId] ?? []).map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="cursor-pointer hover:bg-secondary"
                    onClick={() => send(s)}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "flex justify-end" : ""}>
              {msg.role === "user" ? (
                <div className="rounded-2xl bg-primary text-primary-foreground px-3 py-2 max-w-[85%] text-sm">
                  {msg.text}
                </div>
              ) : (
                <div className="text-foreground whitespace-pre-wrap">{msg.text}</div>
              )}
            </div>
          ))}

          {m.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Pensando…
            </div>
          )}

          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t p-3 flex gap-2 items-end"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="Escribe tu pregunta…"
            className="resize-none min-h-[40px]"
          />
          <Button type="submit" size="icon" disabled={m.isPending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
