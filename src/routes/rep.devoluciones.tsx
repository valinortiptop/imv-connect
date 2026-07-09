import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listRepDevolucionesFn } from "@/lib/rep-sales.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw } from "lucide-react";
import AIPageInsights from "@/components/ai/AIPageInsights";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const badgeVariant = (estado: string) =>
  estado === "aplicada" ? "default" : estado === "cancelada" ? "secondary" : "outline";

function Page() {
  const fetchDevs = useServerFn(listRepDevolucionesFn);
  const q = useQuery({ queryKey: ["rep-devs"], queryFn: () => fetchDevs() });

  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-devoluciones" />
      <div>
        <h1 className="text-xl font-semibold md:text-2xl">Devoluciones</h1>
        <p className="text-sm text-muted-foreground">
          Historial de devoluciones registradas por tus clientes.
        </p>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : q.data?.devoluciones.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay devoluciones. Inicia una desde la ficha de un cliente.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {q.data?.devoluciones.map((d: any) => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    {d.client_name}
                  </span>
                  <Badge variant={badgeVariant(d.estado)}>{d.estado}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">
                    {d.folio ?? "—"} · {new Date(d.fecha).toLocaleDateString("es-MX")}
                  </span>
                  <span className="font-semibold">{fmtMXN(Number(d.total ?? 0))}</span>
                </div>
                {d.motivo && (
                  <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {d.motivo}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/rep/devoluciones")({ component: Page });
