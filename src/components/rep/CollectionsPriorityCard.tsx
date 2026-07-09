import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getCollectionsPriorityFn } from "@/lib/rep-behavior.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Banknote } from "lucide-react";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const sevColor: Record<string, string> = {
  alto: "bg-red-500/15 text-red-600 border-red-500/30",
  medio: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  bajo: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

export default function CollectionsPriorityCard({ max }: { max?: number }) {
  const fn = useServerFn(getCollectionsPriorityFn);
  const q = useQuery({ queryKey: ["rep-collections-priority"], queryFn: () => fn() });

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        <Banknote className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Cobranza sugerida</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (q.data?.rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin saldos vencidos.</p>
        ) : (
          <div className="space-y-1.5">
            {(q.data?.rows ?? []).slice(0, max ?? 8).map((r: any) => (
              <div
                key={r.cliente_id}
                className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to="/rep/clientes/$id"
                    params={{ id: r.cliente_id }}
                    className="truncate font-medium text-primary hover:underline"
                  >
                    {r.cliente}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {fmtMXN(r.saldo_vencido)} · {r.dias_vencido}d vencido · {r.facturas_vencidas} facturas
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={sevColor[r.severity]}>
                    {r.severity}
                  </Badge>
                  {r.telefono && (
                    <a
                      href={`tel:${r.telefono}`}
                      className="rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
