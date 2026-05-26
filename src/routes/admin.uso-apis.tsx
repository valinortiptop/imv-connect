import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getUsageReportFn } from "@/lib/valinor.functions";

export const Route = createFileRoute("/admin/uso-apis")({
  ssr: false,
  component: UsoApisPage,
});

type Range = "24h" | "7d" | "30d" | "all";

function rangeToFrom(r: Range): string | undefined {
  if (r === "all") return undefined;
  const ms =
    r === "24h" ? 24 * 3600 * 1000 : r === "7d" ? 7 * 86400_000 : 30 * 86400_000;
  return new Date(Date.now() - ms).toISOString();
}

function UsoApisPage() {
  const fetchUsage = useServerFn(getUsageReportFn);
  const [range, setRange] = useState<Range>("7d");

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } =
    useQuery({
      queryKey: ["valinor-usage", range],
      queryFn: () =>
        fetchUsage({ data: { limit: 500, from: rangeToFrom(range) } }),
      staleTime: 30_000,
    });

  const byProvider = useMemo(() => {
    if (!data?.items?.length) return [];
    const map = new Map<
      string,
      { provider: string; calls: number; tokens: number; cost: number }
    >();
    for (const r of data.items) {
      const cur = map.get(r.provider) ?? {
        provider: r.provider,
        calls: 0,
        tokens: 0,
        cost: 0,
      };
      cur.calls += 1;
      cur.tokens += r.total_tokens || 0;
      cur.cost += r.estimated_cost || 0;
      map.set(r.provider, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.calls - a.calls);
  }, [data]);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Uso de APIs (Valinor)</h1>
          <p className="text-sm text-muted-foreground">
            Consumo de servicios externos enrutados por el gateway de Valinor Studio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5 text-xs">
            {(["24h", "7d", "30d", "all"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded px-2.5 py-1 ${
                  range === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {r === "all" ? "Todo" : r}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            {isFetching ? "…" : "Actualizar"}
          </button>
        </div>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {error && (
        <p className="text-sm text-destructive">
          Error al cargar: {(error as Error).message}
        </p>
      )}

      {data && !data.available && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm">
          <p className="font-medium">Endpoint de reporte no disponible.</p>
          <p className="mt-2 text-muted-foreground">
            Valinor aún no expone <code className="rounded bg-muted px-1">usage-report</code>{" "}
            o el token no es válido.
          </p>
        </div>
      )}

      {data?.available && (
        <>
          {data.totals && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Stat label="Llamadas" value={data.totals.calls.toLocaleString()} />
              <Stat
                label="Tokens"
                value={data.totals.total_tokens.toLocaleString()}
              />
              <Stat
                label="Costo estimado"
                value={`$${data.totals.estimated_cost.toFixed(4)}`}
              />
            </div>
          )}

          {byProvider.length > 0 && (
            <div className="rounded-md border border-border">
              <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                Por proveedor
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-3 py-2 text-right">Llamadas</th>
                    <th className="px-3 py-2 text-right">Tokens</th>
                    <th className="px-3 py-2 text-right">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {byProvider.map((p) => (
                    <tr key={p.provider} className="border-t border-border">
                      <td className="px-3 py-2 capitalize">{p.provider}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.calls.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.tokens.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ${p.cost.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {dataUpdatedAt
                ? `Actualizado: ${new Date(dataUpdatedAt).toLocaleTimeString()}`
                : null}
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2">Modelo</th>
                  <th className="px-3 py-2 text-right">Tokens</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                  <th className="px-3 py-2 text-right">ms</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-6 text-center text-xs text-muted-foreground"
                    >
                      Sin uso registrado en el periodo.
                    </td>
                  </tr>
                )}
                {data.items.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{row.provider}</td>
                    <td className="px-3 py-2 text-xs">{row.model ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.total_tokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      ${row.estimated_cost.toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.duration_ms}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={
                          row.status === "success"
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
