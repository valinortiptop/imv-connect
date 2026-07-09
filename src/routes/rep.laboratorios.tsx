import { createFileRoute } from "@tanstack/react-router";
import LabRiskPanel from "@/components/rep/LabRiskPanel";
import ReorderPredictions from "@/components/rep/ReorderPredictions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { generateRepAlertsFn } from "@/lib/rep.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/rep/laboratorios")({
  head: () => ({
    meta: [{ title: "Laboratorios en riesgo · Panel Rep" }],
  }),
  component: LabRiskRoute,
});

function LabRiskRoute() {
  const runAlerts = useServerFn(generateRepAlertsFn);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => runAlerts(),
    onSuccess: (r: any) => {
      toast.success(r?.created ? `${r.created} alerta(s) enviada(s)` : "Sin nuevas alertas");
      qc.invalidateQueries({ queryKey: ["rep-lab-risk"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inteligencia comercial</h1>
          <p className="text-sm text-muted-foreground">
            Migración de laboratorios y predicción de recompra por cliente
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${m.isPending ? "animate-spin" : ""}`} />
          Correr análisis
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Laboratorios con caída de participación</CardTitle>
          <p className="text-xs text-muted-foreground">
            Compara últimos 60 días vs 60 días previos. Caídas &gt;60% indican migración probable.
          </p>
        </CardHeader>
        <CardContent>
          <LabRiskPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recompras probables · próximos 14 días</CardTitle>
          <p className="text-xs text-muted-foreground">
            Predicción determinística por cadencia histórica (media móvil).
          </p>
        </CardHeader>
        <CardContent>
          <ReorderPredictions withinDays={14} />
        </CardContent>
      </Card>
    </div>
  );
}
