import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { pingProvidersFn } from "@/lib/valinor.functions";

export const Route = createFileRoute("/admin/estado-apis")({
  ssr: false,
  component: EstadoApisPage,
});

function EstadoApisPage() {
  const ping = useServerFn(pingProvidersFn);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["valinor-ping"],
    queryFn: () => ping({ data: undefined as never }),
    staleTime: 30_000,
  });

  return (
    <section className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Estado de APIs (Valinor)</h1>
          <p className="text-sm text-muted-foreground">
            Ping en vivo a cada proveedor enrutado por el gateway de Valinor.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
        >
          {isFetching ? "Probando…" : "Probar ahora"}
        </button>
      </header>

      {error && (
        <p className="text-sm text-destructive">
          Error: {(error as Error).message}
        </p>
      )}

      {data?.checked_at && (
        <p className="text-xs text-muted-foreground">
          Última verificación: {new Date(data.checked_at).toLocaleString()}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(data?.results ?? []).map((r) => (
          <div
            key={r.provider}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold capitalize">
                {r.provider}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                  r.ok
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    r.ok ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                {r.ok ? "OK" : "Error"}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>Latencia</span>
              <span className="text-right tabular-nums text-foreground">
                {r.ms} ms
              </span>
              <span>Status</span>
              <span className="text-right tabular-nums text-foreground">
                {r.status ?? "—"}
              </span>
            </div>
            {r.error && (
              <p
                title={r.error}
                className="mt-2 line-clamp-3 text-[11px] text-rose-600"
              >
                {r.error}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
