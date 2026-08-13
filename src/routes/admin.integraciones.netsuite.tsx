import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw, Plug, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  netsuitePingFn,
  netsuiteSyncFn,
  netsuiteRunsFn,
} from "@/lib/netsuite.functions";

export const Route = createFileRoute("/admin/integraciones/netsuite")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Integración NetSuite | IMV Catálogo Digital" },
      {
        name: "description",
        content:
          "Sincroniza ventas, clientes, productos e inventario desde Oracle NetSuite hacia el portal IMV.",
      },
      { property: "og:title", content: "Integración NetSuite | IMV Catálogo Digital" },
      {
        property: "og:description",
        content:
          "Sincroniza ventas, clientes, productos e inventario desde Oracle NetSuite hacia el portal IMV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NetsuitePage,
});

type Entity = "ventas" | "clientes" | "productos" | "inventario";

const ENTITIES: { key: Entity; label: string; desc: string }[] = [
  { key: "ventas", label: "Ventas / facturas", desc: "Líneas de factura → historial de ventas" },
  { key: "clientes", label: "Clientes", desc: "Catálogo de clientes de NetSuite" },
  { key: "productos", label: "Productos y precios", desc: "Artículos y precio de lista" },
  { key: "inventario", label: "Inventario y lotes", desc: "Existencias por almacén y lote" },
];

type RunRow = {
  id: string;
  entity: string;
  status: string;
  trigger_source: string;
  date_from: string | null;
  date_to: string | null;
  rows_read: number;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  errors: string[];
  unmatched: string[];
  started_at: string;
  duration_ms: number | null;
};

function NetsuitePage() {
  const ping = useServerFn(netsuitePingFn);
  const sync = useServerFn(netsuiteSyncFn);
  const runs = useServerFn(netsuiteRunsFn);

  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<Entity | null>(null);

  const conn = useQuery({
    queryKey: ["netsuite-ping"],
    queryFn: () => ping({ data: undefined as never }),
    staleTime: 60_000,
  });

  const runsQ = useQuery<RunRow[]>({
    queryKey: ["netsuite-runs"],
    queryFn: () => runs({ data: { limit: 30 } }) as Promise<RunRow[]>,
  });

  const lastByEntity = new Map<string, RunRow>();
  for (const r of runsQ.data ?? []) {
    if (!lastByEntity.has(r.entity)) lastByEntity.set(r.entity, r);
  }

  async function runSync(entity: Entity) {
    setBusy(entity);
    try {
      const res = await sync({
        data: entity === "ventas" ? { entity, from, to } : { entity },
      });
      const msg = `Leídas ${res.rows_read} · nuevas ${res.rows_inserted} · actualizadas ${res.rows_updated} · omitidas ${res.rows_skipped}`;
      if (res.status === "error" || res.errors.length) toast.warning(msg);
      else toast.success(msg);
      void runsQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const connected = Boolean(conn.data?.ok);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Integración NetSuite</h1>
          <p className="text-sm text-muted-foreground">
            Trae ventas, clientes, productos e inventario desde Oracle NetSuite (solo lectura).
          </p>
        </div>
        <Button variant="outline" onClick={() => conn.refetch()} disabled={conn.isFetching}>
          {conn.isFetching ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plug className="h-4 w-4 mr-2" />
          )}
          Probar conexión
        </Button>
      </header>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "bg-emerald-500" : "bg-destructive"
            }`}
          />
          <span className="text-sm font-medium">
            {conn.isPending
              ? "Verificando…"
              : connected
                ? `Conectado a la cuenta ${conn.data?.account ?? ""}${
                    conn.data?.companyName ? ` · ${conn.data.companyName}` : ""
                  }`
                : "Sin conexión"}
          </span>
        </div>
        {!connected && conn.data?.error && (
          <p className="mt-2 text-xs text-destructive break-words">{conn.data.error}</p>
        )}
        {!connected && (
          <p className="mt-2 text-xs text-muted-foreground">
            Se requieren los secretos NETSUITE_ACCOUNT_ID, NETSUITE_CONSUMER_KEY,
            NETSUITE_CONSUMER_SECRET, NETSUITE_TOKEN_ID y NETSUITE_TOKEN_SECRET,
            generados en NetSuite (Integración + Token de acceso).
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <div>
          <label className="block text-xs text-muted-foreground">Desde (ventas)</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Hasta (ventas)</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ENTITIES.map((e) => {
          const last = lastByEntity.get(e.key);
          return (
            <div key={e.key} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{e.label}</h2>
                  <p className="text-xs text-muted-foreground">{e.desc}</p>
                </div>
                <Button size="sm" onClick={() => runSync(e.key)} disabled={busy != null}>
                  {busy === e.key ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Sincronizar ahora
                </Button>
              </div>
              {last ? (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>
                    Última: {new Date(last.started_at).toLocaleString()} ·{" "}
                    <Badge variant={last.status === "ok" ? "secondary" : "destructive"}>
                      {last.status}
                    </Badge>
                  </div>
                  <div>
                    Leídas {last.rows_read} · nuevas {last.rows_inserted} · actualizadas{" "}
                    {last.rows_updated} · omitidas {last.rows_skipped}
                  </div>
                  {last.errors?.length > 0 && (
                    <div className="text-destructive">{last.errors.length} error(es)</div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sin ejecuciones aún.</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">Bitácora de sincronizaciones</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => runsQ.refetch()}
            disabled={runsQ.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${runsQ.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/20">
              <tr>
                <th className="px-2 py-1 text-left">Inicio</th>
                <th className="px-2 py-1 text-left">Entidad</th>
                <th className="px-2 py-1 text-left">Origen</th>
                <th className="px-2 py-1 text-left">Rango</th>
                <th className="px-2 py-1 text-right">Leídas</th>
                <th className="px-2 py-1 text-right">Nuevas</th>
                <th className="px-2 py-1 text-right">Act.</th>
                <th className="px-2 py-1 text-right">Omit.</th>
                <th className="px-2 py-1 text-left">Estado</th>
                <th className="px-2 py-1 text-left">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {(runsQ.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border/50 align-top">
                  <td className="px-2 py-1">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-2 py-1">{r.entity}</td>
                  <td className="px-2 py-1">{r.trigger_source}</td>
                  <td className="px-2 py-1">
                    {r.date_from ? `${r.date_from} → ${r.date_to}` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">{r.rows_read}</td>
                  <td className="px-2 py-1 text-right">{r.rows_inserted}</td>
                  <td className="px-2 py-1 text-right">{r.rows_updated}</td>
                  <td className="px-2 py-1 text-right">{r.rows_skipped}</td>
                  <td className="px-2 py-1">{r.status}</td>
                  <td className="px-2 py-1 max-w-[36ch]">
                    {(r.errors ?? []).slice(0, 2).map((x, i) => (
                      <div key={`e${i}`} className="text-destructive truncate">
                        {x}
                      </div>
                    ))}
                    {(r.unmatched ?? []).slice(0, 3).map((x, i) => (
                      <div key={`u${i}`} className="text-muted-foreground truncate">
                        {x}
                      </div>
                    ))}
                    {(r.unmatched?.length ?? 0) > 3 && (
                      <div className="text-muted-foreground">
                        +{(r.unmatched?.length ?? 0) - 3} sin emparejar
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {(runsQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={10} className="px-2 py-6 text-center text-muted-foreground">
                    Sin registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
