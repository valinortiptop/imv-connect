import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, ExternalLink, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { listAlertasCobranzaFn, resolverAlertaFn } from "@/lib/cobranza-alertas.functions";
import { generarKanbanDesdeAlertaFn } from "@/lib/cobranza-config.functions";

export const Route = createFileRoute("/admin/credito-cobranza/alertas")({
  head: () => ({ meta: [{ title: "Alertas · Crédito y Cobranza" }] }),
  component: AlertasPage,
});

const nivelColor: Record<string, string> = {
  critico: "bg-red-500/15 text-red-600 border-red-500/30",
  alto: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  medio: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  bajo: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
};

function AlertasPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAlertasCobranzaFn);
  const resolveFn = useServerFn(resolverAlertaFn);
  const kanbanFn = useServerFn(generarKanbanDesdeAlertaFn);

  const { data: alertas = [], isLoading } = useQuery({
    queryKey: ["cobranza-alertas", "pendientes"],
    queryFn: () => listFn({ data: { soloPendientes: true } }),
  });

  const resolver = useMutation({
    mutationFn: (id: string) => resolveFn({ data: { alertaId: id } }),
    onSuccess: () => {
      toast.success("Alerta resuelta");
      qc.invalidateQueries({ queryKey: ["cobranza-alertas"] });
    },
    onError: (e: any) => toast.error(e?.message || "Error"),
  });

  const toKanban = useMutation({
    mutationFn: (id: string) => kanbanFn({ data: { alertaId: id } }),
    onSuccess: (r: any) => {
      toast.success(r?.existing ? "Ya existía tarjeta Kanban" : "Tarjeta Kanban creada");
      qc.invalidateQueries({ queryKey: ["cobranza-alertas"] });
    },
    onError: (e: any) => toast.error(e?.message || "Error"),
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-orange-500" />
        <h2 className="text-lg font-semibold">Alertas tempranas</h2>
        <Badge variant="outline">{alertas.length} pendientes</Badge>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : alertas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay alertas pendientes. El sistema analiza automáticamente cada noche.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {alertas.map((a: any) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={nivelColor[a.nivel] || ""}>{a.nivel}</Badge>
                      <CardTitle className="text-base">{a.titulo}</CardTitle>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {a.clientes?.nombre_comercial || a.clientes?.razon_social} · {new Date(a.created_at).toLocaleString("es-MX")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/admin/credito-cobranza/clientes/$id" params={{ id: a.cliente_id }}>
                        <ExternalLink className="h-3 w-3 mr-1" /> Abrir
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toKanban.mutate(a.id)}
                      disabled={toKanban.isPending || !!a.kanban_card_id}
                      title={a.kanban_card_id ? "Ya tiene tarjeta" : "Enviar a Kanban"}
                    >
                      <ListPlus className="h-3 w-3 mr-1" /> Kanban
                    </Button>
                    <Button size="sm" onClick={() => resolver.mutate(a.id)} disabled={resolver.isPending}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Resolver
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm">{a.descripcion}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
