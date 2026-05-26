import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getUsageReportFn } from "@/lib/valinor.functions";

export const Route = createFileRoute("/admin/uso-apis")({
  ssr: false,
  component: UsoApisPage,
});

function UsoApisPage() {
  const fetchUsage = useServerFn(getUsageReportFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["valinor-usage"],
    queryFn: () => fetchUsage({ data: { limit: 200 } }),
  });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Uso de APIs (Valinor)</h1>
        <p className="text-sm text-muted-foreground">
          Consumo de servicios externos (OpenAI, Resend, Google Maps, etc.)
          enrutados por el gateway de Valinor Studio.
        </p>
      </div>

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
            Valinor aún no expone <code className="rounded bg-muted px-1">usage-report</code>.
            Mientras tanto el consumo se sigue registrando en
            <code className="rounded bg-muted px-1">api_usage_logs</code> del
            proyecto de Valinor; pídele al equipo de Valinor que habilite el
            edge function de reporte para que esta página muestre datos.
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
