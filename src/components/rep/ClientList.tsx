import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getMyClientsFn } from "@/lib/rep.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, Phone, Search, Plus, User } from "lucide-react";

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
        <h1 className="text-xl font-bold md:text-2xl">Mis clientes</h1>
        <p className="text-sm text-muted-foreground">
          {data?.clients.length ?? 0} asignados
        </p>
      </div>

      {/* Sticky filter bar on mobile */}
      <div className="sticky top-14 z-20 -mx-4 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
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
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
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
                className="shrink-0"
              >
                {label}
              </Button>
            ))}
          </div>
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
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40 active:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {c.nombre_comercial ?? c.razon_social}
                  </span>
                  {c.churn_risk_score != null && c.churn_risk_score >= 0.6 && (
                    <Badge variant="destructive" className="shrink-0 gap-1">
                      <AlertTriangle className="h-3 w-3" /> Riesgo
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">{fmtMXN(c.total_12m ?? 0)} • 12m</span>
                  <span className="tabular-nums">{c.orders_12m} pedidos</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
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
                  {c.representante_nombre && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {c.representante_nombre}
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

      {/* FAB — new prospect (mobile only, admin has its own button on desktop) */}
      <Link
        to="/rep/prospectos"
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:hidden"
        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
        aria-label="Nuevo prospecto"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  );
}
