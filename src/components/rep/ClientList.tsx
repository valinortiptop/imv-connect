import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getMyClientsFn } from "@/lib/rep.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, Phone, Search } from "lucide-react";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

type Filter = "todos" | "urgente" | "oportunidad" | "sin_visita";

export default function ClientList() {
  const fetch = useServerFn(getMyClientsFn);
  const { data, isLoading } = useQuery({
    queryKey: ["rep-clients"],
    queryFn: () => fetch(),
  });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");

  const filtered = useMemo(() => {
    let list = data?.clients ?? [];
    if (filter === "urgente")
      list = list.filter((c: any) => (c.churn_risk_score ?? 0) >= 0.6);
    if (filter === "oportunidad")
      list = list.filter(
        (c: any) => (c.days_since_last ?? 999) > 30 && (c.total_12m ?? 0) > 0,
      );
    if (filter === "sin_visita")
      list = list.filter((c: any) => (c.days_since_last ?? 999) > 60);
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter((c: any) =>
        [c.razon_social, c.nombre_comercial, c.nickname, c.rfc]
          .filter(Boolean)
          .some((v: string) => v.toLowerCase().includes(term)),
      );
    }
    return list;
  }, [data, q, filter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mis clientes</h1>
        <p className="text-sm text-muted-foreground">
          {data?.clients.length ?? 0} asignados
        </p>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por nombre, RFC…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["todos", "Todos"],
              ["urgente", "Riesgo"],
              ["oportunidad", "Oportunidad"],
              ["sin_visita", "Sin pedido 60d"],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={filter === k ? "default" : "outline"}
              onClick={() => setFilter(k)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map((c: any) => (
          <li key={c.id}>
            <Link
              to="/rep/clientes/$id"
              params={{ id: c.id }}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">
                    {c.nombre_comercial ?? c.razon_social}
                  </span>
                  {c.churn_risk_score != null && c.churn_risk_score >= 0.6 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> Riesgo
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{fmtMXN(c.total_12m ?? 0)} • 12m</span>
                  <span>{c.orders_12m} pedidos</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {c.days_since_last != null
                      ? `${c.days_since_last} d sin pedido`
                      : "sin historia"}
                  </span>
                  {(c.telefono || c.phone) && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {c.telefono ?? c.phone}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
        {!isLoading && filtered.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Sin clientes que coincidan.
          </li>
        )}
      </ul>
    </div>
  );
}
