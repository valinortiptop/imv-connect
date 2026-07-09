import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRepQuotesFn, convertQuoteToPedidoFn } from "@/lib/rep-sales.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FileText, ArrowRight, Plus } from "lucide-react";
import AIPageInsights from "@/components/ai/AIPageInsights";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

function Page() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const fetchQuotes = useServerFn(listRepQuotesFn);
  const convert = useServerFn(convertQuoteToPedidoFn);

  const q = useQuery({ queryKey: ["rep-quotes"], queryFn: () => fetchQuotes() });

  const mutate = useMutation({
    mutationFn: (quoteId: string) => convert({ data: { quoteId } }),
    onSuccess: (r) => {
      toast.success(r.alreadyConverted ? "Ya estaba convertida" : `Pedido creado ${r.folio ?? ""}`);
      qc.invalidateQueries({ queryKey: ["rep-quotes"] });
      if (r.pedidoId) nav({ to: "/admin/pedidos/$id", params: { id: r.pedidoId } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al convertir"),
  });

  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-cotizaciones" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">Propuestas enviadas y su conversión a pedido</p>
        </div>
        <Button asChild size="sm">
          <Link to="/rep/clientes">
            <Plus className="mr-2 h-4 w-4" /> Nueva desde cliente
          </Link>
        </Button>
      </div>

      {q.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : q.data?.quotes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay cotizaciones todavía.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data?.quotes.map((c: any) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {c.client_name}
                  </span>
                  <Badge variant={c.converted_to_order_id ? "secondary" : "default"}>
                    {c.converted_to_order_id ? "convertida" : c.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-lg font-semibold">{fmtMXN(Number(c.total ?? 0))}</span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>{new Date(c.created_at).toLocaleDateString("es-MX")}</span>
                  <span>{c.delivery_date ? `Entrega: ${c.delivery_date}` : "Sin fecha"}</span>
                </div>
                {!c.converted_to_order_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={mutate.isPending}
                    onClick={() => mutate.mutate(c.id)}
                  >
                    Convertir a pedido <ArrowRight className="ml-2 h-3 w-3" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/rep/cotizaciones")({ component: Page });
