import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getMissedOpportunitiesFn } from "@/lib/rep-behavior.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Gift, ShoppingCart } from "lucide-react";

const sevColor: Record<string, string> = {
  alto: "bg-red-500/15 text-red-600 border-red-500/30",
  medio: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  bajo: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

const typeIcon: Record<string, any> = {
  reorder_overdue: ShoppingCart,
  visit_no_order: AlertCircle,
  promo_not_offered: Gift,
};

export default function MissedOpportunitiesList({
  clienteId,
  compact,
}: {
  clienteId?: string;
  compact?: boolean;
}) {
  const fn = useServerFn(getMissedOpportunitiesFn);
  const q = useQuery({
    queryKey: ["rep-missed-opps", clienteId ?? "all"],
    queryFn: () => fn({ data: { clienteId } }),
  });

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  const opps = q.data?.opportunities ?? [];
  if (opps.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Sin oportunidades perdidas detectadas.
      </p>
    );

  const shown = compact ? opps.slice(0, 5) : opps;

  return (
    <div className="space-y-2">
      {shown.map((o: any, i: number) => {
        const Icon = typeIcon[o.type] ?? AlertCircle;
        return (
          <Card key={i}>
            <CardContent className="flex items-start gap-3 p-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{o.title}</span>
                  <Badge variant="outline" className={sevColor[o.severity]}>
                    {o.severity}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{o.detail}</div>
                {!clienteId && (
                  <Link
                    to="/rep/clientes/$id"
                    params={{ id: o.cliente_id }}
                    className="text-xs text-primary hover:underline"
                  >
                    {o.cliente} →
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {compact && opps.length > shown.length && (
        <p className="text-center text-xs text-muted-foreground">
          +{opps.length - shown.length} más
        </p>
      )}
    </div>
  );
}
