// @ts-nocheck
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listShortageReasons,
  logShortageEvent,
  listShortageEvents,
  shortageStats,
} from "@/lib/compras.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertOctagon, ListChecks, Settings2 } from "lucide-react";

export const Route = createFileRoute("/admin/compras/faltantes")({
  head: () => ({ meta: [{ title: "Faltantes — Compras" }] }),
  component: FaltantesPage,
});

function FaltantesPage() {
  const [tab, setTab] = useState<"registrar" | "estadisticas" | "historial">("registrar");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <AlertOctagon className="h-6 w-6 text-amber-600" /> Control de faltantes
          </h1>
          <p className="text-sm text-muted-foreground">
            Registra el motivo cuando un producto no pueda surtirse y analiza las causas.
          </p>
        </div>
        <Link
          to="/admin/compras/faltantes/motivos"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Settings2 className="h-4 w-4" /> Catálogo de motivos
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="registrar">Registrar</TabsTrigger>
          <TabsTrigger value="estadisticas">Estadísticas</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="registrar" className="mt-4">
          <RegistrarFaltante />
        </TabsContent>

        <TabsContent value="estadisticas" className="mt-4">
          <Estadisticas />
        </TabsContent>

        <TabsContent value="historial" className="mt-4">
          <Historial />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RegistrarFaltante() {
  const qc = useQueryClient();
  const fnMotivos = useServerFn(listShortageReasons);
  const fnLog = useServerFn(logShortageEvent);

  const motivos = useQuery({
    queryKey: ["shortage-reasons"],
    queryFn: () => fnMotivos(),
  });

  const [productoQuery, setProductoQuery] = useState("");
  const [productoId, setProductoId] = useState<string | null>(null);
  const [productoLabel, setProductoLabel] = useState("");
  const [motivoId, setMotivoId] = useState<string>("");
  const [cantidad, setCantidad] = useState<string>("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteLabel, setClienteLabel] = useState("");
  const [notas, setNotas] = useState("");

  const productos = useQuery({
    queryKey: ["productos-search", productoQuery],
    enabled: productoQuery.trim().length >= 2,
    queryFn: async () => {
      const term = `%${productoQuery}%`;
      const { data, error } = await supabase
        .from("productos")
        .select("id, sku, nombre, marca")
        .or(`nombre.ilike.${term},sku.ilike.${term}`)
        .eq("activo", true)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientes = useQuery({
    queryKey: ["clientes-search", clienteQuery],
    enabled: clienteQuery.trim().length >= 2,
    queryFn: async () => {
      const term = `%${clienteQuery}%`;
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razon_social, nombre_comercial")
        .or(`razon_social.ilike.${term},nombre_comercial.ilike.${term}`)
        .eq("active", true)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeReasons = useMemo(
    () => (motivos.data?.motivos ?? []).filter((m: any) => m.activo),
    [motivos.data],
  );

  const mLog = useMutation({
    mutationFn: async () => {
      if (!productoId) throw new Error("Selecciona un producto");
      if (!motivoId) throw new Error("Selecciona un motivo");
      const qty = Number(cantidad);
      if (!qty || qty <= 0) throw new Error("Cantidad inválida");
      return fnLog({
        data: {
          producto_id: productoId,
          motivo_id: motivoId,
          cantidad: qty,
          cliente_id: clienteId,
          notas: notas.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Faltante registrado");
      setProductoId(null);
      setProductoLabel("");
      setProductoQuery("");
      setMotivoId("");
      setCantidad("");
      setClienteId(null);
      setClienteLabel("");
      setClienteQuery("");
      setNotas("");
      qc.invalidateQueries({ queryKey: ["shortage-events"] });
      qc.invalidateQueries({ queryKey: ["shortage-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1.5">
        <Label>Producto *</Label>
        {productoId ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span>{productoLabel}</span>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setProductoId(null); setProductoLabel(""); setProductoQuery(""); }}
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <Input
              value={productoQuery}
              onChange={(e) => setProductoQuery(e.target.value)}
              placeholder="Buscar por nombre o SKU…"
            />
            {productoQuery.length >= 2 && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                {(productos.data ?? []).map((p: any) => (
                  <button
                    key={p.id}
                    className="flex w-full items-center justify-between border-b border-border/50 px-3 py-1.5 text-left text-sm last:border-0 hover:bg-muted"
                    onClick={() => {
                      setProductoId(p.id);
                      setProductoLabel(`${p.nombre} · ${p.sku}`);
                    }}
                  >
                    <span>{p.nombre}</span>
                    <span className="text-xs text-muted-foreground">{p.sku}</span>
                  </button>
                ))}
                {productos.data && productos.data.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Sin resultados.</div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Motivo *</Label>
          <Select value={motivoId} onValueChange={setMotivoId}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>
              {activeReasons.map((m: any) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Cantidad no surtida *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Cliente (opcional)</Label>
        {clienteId ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span>{clienteLabel}</span>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setClienteId(null); setClienteLabel(""); setClienteQuery(""); }}
            >
              Quitar
            </button>
          </div>
        ) : (
          <>
            <Input
              value={clienteQuery}
              onChange={(e) => setClienteQuery(e.target.value)}
              placeholder="Buscar cliente…"
            />
            {clienteQuery.length >= 2 && (
              <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                {(clientes.data ?? []).map((c: any) => {
                  const label = c.nombre_comercial || c.razon_social;
                  return (
                    <button
                      key={c.id}
                      className="block w-full border-b border-border/50 px-3 py-1.5 text-left text-sm last:border-0 hover:bg-muted"
                      onClick={() => { setClienteId(c.id); setClienteLabel(label); }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Notas</Label>
        <Textarea
          rows={3}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Detalles adicionales del faltante…"
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mLog.mutate()} disabled={mLog.isPending}>
          {mLog.isPending ? "Guardando…" : "Registrar faltante"}
        </Button>
      </div>
    </div>
  );
}

function Estadisticas() {
  const fnStats = useServerFn(shortageStats);
  const [days, setDays] = useState(90);
  const { data, isLoading } = useQuery({
    queryKey: ["shortage-stats", days],
    queryFn: () => fnStats({ data: { days } }),
  });

  const motivos = data?.motivos ?? [];
  const productos = data?.productos ?? [];
  const totalEvt = data?.totalEventos ?? 0;
  const totalU = data?.totalUnidades ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[30, 60, 90, 180].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-md border px-3 py-1 text-sm ${days === d ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
          >
            {d} días
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KPI label="Eventos" value={totalEvt.toString()} />
        <KPI label="Unidades faltantes" value={totalU.toFixed(0)} />
        <KPI label="Motivos distintos" value={motivos.length.toString()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <ListChecks className="h-4 w-4" /> Motivos más frecuentes
          </h3>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : motivos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos en el periodo.</p>
          ) : (
            <div className="space-y-2">
              {motivos.map((m: any) => {
                const pct = totalEvt > 0 ? (m.eventos / totalEvt) * 100 : 0;
                return (
                  <div key={m.label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{m.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {m.eventos} · {m.unidades.toFixed(0)}u ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-muted">
                      <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 font-semibold">Top productos afectados</h3>
          {productos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos.</p>
          ) : (
            <div className="space-y-1.5">
              {productos.map((p: any) => (
                <div key={p.sku} className="flex justify-between text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{p.nombre}</div>
                    <div className="text-xs text-muted-foreground">{p.sku}</div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div>{p.unidades.toFixed(0)} u</div>
                    <div className="text-xs text-muted-foreground">{p.eventos} evt</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Historial() {
  const fnList = useServerFn(listShortageEvents);
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ["shortage-events", days],
    queryFn: () => fnList({ data: { days } }),
  });
  const eventos = data?.eventos ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-md border px-3 py-1 text-sm ${days === d ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
          >
            Últimos {d}d
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Motivo</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2">Notas</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Cargando…</td></tr>
            ) : eventos.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin registros.</td></tr>
            ) : eventos.map((e: any) => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">{e.fecha}</td>
                <td className="px-3 py-2">
                  <div>{e.producto?.nombre ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{e.producto?.sku ?? ""}</div>
                </td>
                <td className="px-3 py-2">{e.motivo?.label ?? "—"}</td>
                <td className="px-3 py-2">{e.cliente?.nombre_comercial ?? e.cliente?.razon_social ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(e.cantidad ?? 0).toFixed(0)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{e.notas ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
