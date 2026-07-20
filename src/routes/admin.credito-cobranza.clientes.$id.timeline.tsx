import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Phone, HandCoins, Mail, AlertTriangle, ShieldCheck } from "lucide-react";
import { listClienteTimelineFn } from "@/lib/cobranza-config.functions";

export const Route = createFileRoute("/admin/credito-cobranza/clientes/$id/timeline")({
  head: () => ({ meta: [{ title: "Timeline · Cliente" }] }),
  component: TimelinePage,
});

const mxn = (n: number | null) =>
  n == null ? "" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n));

const ICONS: Record<string, any> = {
  gestion: Phone,
  promesa: HandCoins,
  comunicacion: Mail,
  alerta: AlertTriangle,
  autorizacion: ShieldCheck,
};

const TONES: Record<string, string> = {
  gestion: "text-blue-600 bg-blue-500/10",
  promesa: "text-emerald-600 bg-emerald-500/10",
  comunicacion: "text-purple-600 bg-purple-500/10",
  alerta: "text-orange-600 bg-orange-500/10",
  autorizacion: "text-amber-600 bg-amber-500/10",
};

function TimelinePage() {
  const { id } = Route.useParams();
  const listFn = useServerFn(listClienteTimelineFn);

  const { data: cliente } = useQuery({
    queryKey: ["cliente-min", id],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("razon_social, nombre_comercial").eq("id", id).maybeSingle();
      return data;
    },
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["cliente-timeline", id],
    queryFn: () => listFn({ data: { clienteId: id } }),
  });

  return (
    <div className="space-y-4 p-4">
      <Link
        to="/admin/credito-cobranza/clientes/$id"
        params={{ id }}
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Cliente 360
      </Link>

      <div>
        <h2 className="text-xl font-bold">Historial unificado</h2>
        <p className="text-sm text-muted-foreground">{cliente?.nombre_comercial || cliente?.razon_social}</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Interacciones</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
          ) : (
            <ol className="relative border-l border-border ml-3 space-y-4">
              {events.map((e: any) => {
                const Icon = ICONS[e.tipo] || Mail;
                const tone = TONES[e.tipo] || "text-muted-foreground bg-muted";
                return (
                  <li key={`${e.tipo}-${e.id}`} className="ml-6">
                    <span className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ${tone}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Badge variant="outline" className="capitalize">{e.tipo}</Badge>
                      <span className="text-sm font-medium">{e.titulo}</span>
                      {e.monto != null && <span className="text-xs font-mono text-muted-foreground">{mxn(e.monto)}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(e.fecha).toLocaleString("es-MX")}
                      {e.detalle && <> · {e.detalle}</>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
