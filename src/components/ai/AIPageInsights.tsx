import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { aiRepAskFn } from "@/lib/ai/ai.functions";
import { useAI } from "./AIProvider";

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
  | "rep-supervisor"
  | "rep-calendario";

const DEFAULT_PROMPT: Record<ModuleId, string> = {
  "rep-home":
    "Analiza mi actividad reciente y dame 3 recomendaciones concretas para hoy. Prioriza clientes en riesgo y oportunidades.",
  "rep-clientes":
    "Analiza mi cartera de clientes: identifica riesgos, oportunidades y patrones de visita. Dame recomendaciones concretas.",
  "rep-cliente-detalle":
    "Haz un análisis 360° de este cliente: patrón de compra, riesgo, oportunidades y próxima acción sugerida.",
  "rep-ruta":
    "Analiza mi ruta del día: qué zonas priorizar, qué clientes agregar y qué oportunidades detectas.",
  "rep-visitas":
    "Analiza mis visitas recientes: efectividad, seguimientos pendientes y clientes sin contacto.",
  "rep-inventario":
    "Analiza el catálogo: SKUs con más movimiento, riesgos de stock y sustituciones útiles.",
  "rep-plan":
    "Analiza mi plan semanal: cumplimiento, ajustes recomendados y prioridades faltantes.",
  "rep-laboratorios":
    "Analiza laboratorios: cuáles están en riesgo, cuáles crecen y qué acciones sugieres.",
  "rep-coach":
    "Dame un feedback ejecutivo: fortalezas, áreas de mejora y 3 acciones concretas esta semana.",
  "rep-supervisor":
    "Analiza el desempeño del equipo: quién necesita apoyo, quién destaca y qué zonas tienen oportunidad.",
  "rep-calendario":
    "Analiza mi agenda: conflictos, huecos, seguimientos pendientes y recomendaciones para optimizar la semana.",
};

export function AIPageInsights({
  module,
  path,
  question,
  title = "Análisis IA",
  className,
}: {
  module: ModuleId;
  path?: string;
  question?: string;
  title?: string;
  className?: string;
}) {
  const { enabled } = useAI();
  const ask = useServerFn(aiRepAskFn);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState<string>("");

  const m = useMutation({
    mutationFn: () =>
      ask({
        data: {
          module,
          question: question ?? DEFAULT_PROMPT[module],
          path: path ?? (typeof window !== "undefined" ? window.location.pathname : "/rep"),
        },
      }),
    onSuccess: (res) => setText(res.text),
    onError: (e: Error) => setText(`No se pudo generar el análisis: ${e.message}`),
  });

  useEffect(() => {
    if (!enabled) return;
    if (text) return;
    m.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, module]);

  if (!enabled) return null;

  return (
    <Card className={"mb-4 border-primary/30 bg-primary/5 " + (className ?? "")}>
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">
              {title}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => m.mutate()}
                disabled={m.isPending}
                title="Regenerar"
              >
                {m.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setOpen((o) => !o)}
              >
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          {open && (
            <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {m.isPending && !text ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Generando análisis…
                </span>
              ) : (
                text || "Sin datos suficientes."
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default AIPageInsights;
