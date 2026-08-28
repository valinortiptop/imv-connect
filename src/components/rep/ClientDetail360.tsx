import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  getClientDashboardFn,
  getClientInventoryOfferFn,
  generateClientInsightsFn,
  listMyVisitsFn,
} from "@/lib/rep.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkles, RefreshCw, Phone, MessageCircle, MapPin, AlertTriangle,
  TrendingDown, PackageSearch,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as ReTooltip,
} from "recharts";
import CheckInDialog from "./CheckInDialog";
import OrderQuickCreate from "./OrderQuickCreate";
import ClientBehaviorPanel from "./ClientBehaviorPanel";
import MissedOpportunitiesList from "./MissedOpportunitiesList";
import CompetitorCaptureDialog from "./CompetitorCaptureDialog";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

export default function ClientDetail360({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const fetchDash = useServerFn(getClientDashboardFn);
  const fetchInv = useServerFn(getClientInventoryOfferFn);
  const fetchInsights = useServerFn(generateClientInsightsFn);
  const fetchVisits = useServerFn(listMyVisitsFn);

  const dashQ = useQuery({
    queryKey: ["client-dash", clienteId],
    queryFn: () => fetchDash({ data: { clienteId } }),
  });
  const insightsQ = useQuery({
    queryKey: ["client-insights", clienteId],
    queryFn: () => fetchInsights({ data: { clienteId } }),
  });
  const invQ = useQuery({
    queryKey: ["client-inv", clienteId],
    queryFn: () => fetchInv({ data: { clienteId } }),
  });
  const visitsQ = useQuery({
    queryKey: ["client-visits", clienteId],
    queryFn: () => fetchVisits({ data: { limit: 20 } }),
    select: (d) => d.visits.filter((v: any) => v.cliente_id === clienteId),
  });

  const regen = useMutation({
    mutationFn: () => fetchInsights({ data: { clienteId, force: true } }),
    onSuccess: () => {
      toast.success("Insights actualizados");
      qc.invalidateQueries({ queryKey: ["client-insights", clienteId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error IA"),
  });

  const [checkInOpen, setCheckInOpen] = useState(false);

  if (dashQ.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (dashQ.isError) {
    return (
      <div className="rounded-lg border p-6 text-sm">
        <p>No se pudo cargar el cliente.</p>
        <p className="mt-1 text-muted-foreground">{(dashQ.error as any)?.message}</p>
      </div>
    );
  }

  const c = dashQ.data!.cliente as any;
  const metrics = dashQ.data!.metrics;
  const monthly = dashQ.data!.monthly;
  const topProducts = dashQ.data!.topProducts;
  const abandoned = dashQ.data!.abandoned;
  const labs = dashQ.data!.laboratorioBreakdown;
  const ins = insightsQ.data?.insights as any;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link to="/rep/clientes" className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold md:text-2xl">
            {c.nombre_comercial ?? c.razon_social}
          </h1>
          <p className="text-xs text-muted-foreground">
            {c.razon_social} · {c.rfc}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {c.telefono && (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${c.telefono}`}>
                  <Phone className="mr-1 h-3.5 w-3.5" />
                  Llamar
                </a>
              </Button>
            )}
            {c.telefono && (
              <Button size="sm" variant="outline" asChild>
                <a href={`https://wa.me/${c.telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-1 h-3.5 w-3.5" />
                  WhatsApp
                </a>
              </Button>
            )}
            {(c.lat && c.lng) ? (
              <Button size="sm" variant="outline" asChild>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">
                  <MapPin className="mr-1 h-3.5 w-3.5" /> Ir
                </a>
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setCheckInOpen(true)}>Iniciar visita</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Ventas 12m" value={fmtMXN(metrics.total_12m)} />
        <MiniStat label="Ticket prom." value={fmtMXN(metrics.avg_ticket)} />
        <MiniStat label="Pedidos 12m" value={String(metrics.orders_12m)} />
      </div>

      <Tabs defaultValue="ia" className="w-full">
        {/* Horizontal scroll on mobile so all 9 tabs fit; grid on md+ */}
        <div className="-mx-4 overflow-x-auto md:mx-0">
          <TabsList className="inline-flex w-max min-w-full gap-1 px-4 md:grid md:w-full md:grid-cols-9 md:gap-0 md:px-0">
            <TabsTrigger value="ia">IA</TabsTrigger>
            <TabsTrigger value="pedido">Pedido</TabsTrigger>
            <TabsTrigger value="historial">Hist.</TabsTrigger>
            <TabsTrigger value="sku">SKU</TabsTrigger>
            <TabsTrigger value="oportunidades">Oport.</TabsTrigger>
            <TabsTrigger value="inventario">Inv.</TabsTrigger>
            <TabsTrigger value="visitas">Visitas</TabsTrigger>
            <TabsTrigger value="labs">Labs</TabsTrigger>
            <TabsTrigger value="competencia">Comp.</TabsTrigger>
          </TabsList>
        </div>

        {/* Pedido rápido */}
        <TabsContent value="pedido">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Levantar pedido</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderQuickCreate clienteId={clienteId} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* IA */}
        <TabsContent value="ia" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">Resumen IA</span>
              </CardTitle>

              <Button
                size="sm"
                variant="ghost"
                disabled={regen.isPending}
                onClick={() => regen.mutate()}
              >
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${regen.isPending ? "animate-spin" : ""}`} />
                Regenerar
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {insightsQ.isLoading && <Skeleton className="h-24 w-full" />}
              {ins && (
                <>
                  <div className="flex items-center gap-3">
                    <ChurnBadge score={Number(ins.churn_risk_score ?? 0)} />
                    <span className="text-xs text-muted-foreground">
                      {ins.model === "fallback" ? "Análisis heurístico" : `IA: ${ins.model}`}
                    </span>
                  </div>
                  <p className="text-sm">{ins.summary}</p>
                  {ins.churn_reasons?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Motivos de riesgo</div>
                      <ul className="mt-1 list-disc pl-4 text-sm">
                        {ins.churn_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Historial */}
        <TabsContent value="historial" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ventas por mes (12m)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly}>
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                    <ReTooltip formatter={(v: number) => fmtMXN(v)} />
                    <Bar dataKey="importe" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Top productos</CardTitle></CardHeader>
            <CardContent className="max-h-96 overflow-auto p-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Producto</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p: any) => (
                    <tr key={p.producto_id ?? p.nombre} className="border-t border-border">
                      <td className="p-2">
                        <div className="font-medium">{p.nombre}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.sku} · {p.laboratorio_nombre ?? "—"}
                        </div>
                      </td>
                      <td className="p-2 text-right">{p.qty}</td>
                      <td className="p-2 text-right">{fmtMXN(p.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="h-4 w-4 text-amber-500" /> Productos abandonados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {abandoned.length === 0 && <p className="text-muted-foreground">Ninguno detectado.</p>}
              {abandoned.map((a: any) => (
                <div key={a.producto_id ?? a.nombre} className="flex justify-between">
                  <span className="truncate">{a.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    últ. {a.last_purchase?.slice(0, 10)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SKU behavior */}
        <TabsContent value="sku">
          <ClientBehaviorPanel clienteId={clienteId} />
        </TabsContent>

        {/* Oportunidades */}
        <TabsContent value="oportunidades" className="space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Oportunidades perdidas</CardTitle></CardHeader>
            <CardContent>
              <MissedOpportunitiesList clienteId={clienteId} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Recompra probable</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(ins?.reorder_predictions ?? []).length === 0 && (
                <p className="text-muted-foreground">Sin predicciones.</p>
              )}
              {(ins?.reorder_predictions ?? []).map((r: any, i: number) => (
                <div key={i} className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
                  <div className="min-w-0">
                    <div className="font-medium">{r.producto_nombre}</div>
                    <div className="text-xs text-muted-foreground">{r.reason}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs">≈ {r.qty}</div>
                    <div className="text-[10px] text-muted-foreground">{r.probable_date}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Cross-sell / Up-sell</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(ins?.cross_sell ?? []).length === 0 && (
                <p className="text-muted-foreground">Sin sugerencias.</p>
              )}
              {(ins?.cross_sell ?? []).map((r: any, i: number) => (
                <div key={i} className="rounded-md border border-border p-2">
                  <div className="font-medium">{r.producto_nombre}</div>
                  <div className="text-xs text-muted-foreground">{r.reason}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventario */}
        <TabsContent value="inventario">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageSearch className="h-4 w-4" /> Productos frecuentes
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-auto p-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Producto</th>
                    <th className="p-2 text-right">Disp.</th>
                    <th className="p-2 text-right">Compr.</th>
                    <th className="p-2 text-right">Tránsito</th>
                  </tr>
                </thead>
                <tbody>
                  {(invQ.data?.productos ?? []).map((p: any) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="p-2">
                        <div className="font-medium">{p.nombre}</div>
                        <div className="text-[10px] text-muted-foreground">{p.sku}</div>
                      </td>
                      <td className={`p-2 text-right ${p.stock_disponible <= 0 ? "text-red-600" : ""}`}>
                        {p.stock_disponible ?? 0}
                      </td>
                      <td className="p-2 text-right">{p.stock_comprometido ?? 0}</td>
                      <td className="p-2 text-right">
                        {p.transit_qty > 0 ? (
                          <>
                            {p.transit_qty}
                            {p.transit_eta && (
                              <div className="text-[10px] text-muted-foreground">
                                ETA {p.transit_eta.slice(0, 10)}
                              </div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Visitas */}
        <TabsContent value="visitas" className="space-y-2">
          {(visitsQ.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Sin visitas registradas.</p>
          )}
          {(visitsQ.data ?? []).map((v: any) => (
            <Card key={v.id}>
              <CardContent className="p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {new Date(v.check_in_at).toLocaleString("es-MX")}
                  </span>
                  {v.outcome && <Badge variant="outline">{v.outcome}</Badge>}
                </div>
                {v.notes && <p className="mt-1 text-xs text-muted-foreground">{v.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Labs */}
        <TabsContent value="labs">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ventas por laboratorio (12m)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {labs.map((l: any) => (
                <div key={l.laboratorio_id} className="flex justify-between">
                  <span>{l.nombre}</span>
                  <span>{fmtMXN(l.importe)}</span>
                </div>
              ))}
              {(ins?.lost_labs ?? []).length > 0 && (
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                  <div className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> Posible pérdida
                  </div>
                  {ins.lost_labs.map((l: any, i: number) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium">{l.laboratorio_nombre}</span>
                      {l.drop_pct != null && ` · caída ${Math.round(l.drop_pct)}%`}
                      {l.suspected_competitor && ` · posible: ${l.suspected_competitor}`}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Competencia */}
        <TabsContent value="competencia" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-col items-stretch gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="truncate text-base">Migraciones a competencia</CardTitle>
              <CompetitorCaptureDialog clienteId={clienteId} />
            </CardHeader>

            <CardContent className="space-y-2 text-sm">
              {(ins?.lost_labs ?? []).length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                  Detectado por IA: caída en {(ins?.lost_labs ?? []).map((l: any) => l.laboratorio_nombre).join(", ")}.
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Registra a qué competidor migró cada laboratorio para construir inteligencia competitiva.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>


      <CheckInDialog
        open={checkInOpen}
        onOpenChange={setCheckInOpen}
        clienteId={clienteId}
        clienteNombre={c.nombre_comercial ?? c.razon_social}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2 text-center">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ChurnBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tone =
    score >= 0.6
      ? "bg-red-500/15 text-red-600 border-red-500/30"
      : score >= 0.3
        ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
        : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  return (
    <Badge variant="outline" className={tone}>
      Riesgo pérdida: {pct}%
    </Badge>
  );
}
