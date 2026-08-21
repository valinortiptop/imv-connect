import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSupervisorDashboardFn } from "@/lib/rep-analytics.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DailyRoutesSummary from "./DailyRoutesSummary";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-MX");

export default function SupervisorDashboard() {
  const [days, setDays] = useState(30);
  const fetchDash = useServerFn(getSupervisorDashboardFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["supervisor-dashboard", days],
    queryFn: () => fetchDash({ data: { days } }),
  });

  if (error) return <p className="text-sm text-destructive">Error: {(error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold md:text-2xl">Panel supervisor</h1>
        <div className="ml-auto flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {/* Resumen diario de rutas y eficiencia */}
      <DailyRoutesSummary />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {/* KPI stat rail: horizontal scroll on mobile, 3-col grid desktop */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 [&>*]:snap-start">
            <Card className="w-[70%] shrink-0 md:w-auto md:shrink">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Visitas</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{data?.totals.visits ?? 0}</CardContent>
            </Card>
            <Card className="w-[70%] shrink-0 md:w-auto md:shrink">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pedidos</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{data?.totals.pedidos ?? 0}</CardContent>
            </Card>
            <Card className="w-[70%] shrink-0 md:w-auto md:shrink">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ventas</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{money(data?.totals.ventas ?? 0)}</CardContent>
            </Card>
          </div>

          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardHeader><CardTitle>Rendimiento por representante</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Representante</TableHead>
                    <TableHead className="text-right">Visitas</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Ratio V→P</TableHead>
                    <TableHead className="text-right">Clientes</TableHead>
                    <TableHead className="text-right">Duración prom.</TableHead>
                    <TableHead className="text-right">Ticket prom.</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).map((r) => (
                    <TableRow key={r.rep_id}>
                      <TableCell className="font-medium">{r.rep_nombre}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.visitas}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.pedidos}</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.ratio * 100).toFixed(0)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{r.clientes_unicos}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.duracion_prom_min}m</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.ticket_prom)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(r.ventas)}</TableCell>
                    </TableRow>
                  ))}
                  {(data?.rows ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Sin datos en el período</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile card list */}
          <div className="space-y-2 md:hidden">
            <h2 className="text-sm font-semibold">Rendimiento por rep</h2>
            {(data?.rows ?? []).length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Sin datos en el período
              </p>
            )}
            {(data?.rows ?? []).map((r) => (
              <Card key={r.rep_id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {r.rep_nombre}
                    </span>
                    <span className="shrink-0 text-base font-bold tabular-nums">
                      {money(r.ventas)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                    <span>Visitas: <b className="text-foreground">{r.visitas}</b></span>
                    <span>Pedidos: <b className="text-foreground">{r.pedidos}</b></span>
                    <span>Ratio V→P: <b className="text-foreground">{(r.ratio * 100).toFixed(0)}%</b></span>
                    <span>Clientes: <b className="text-foreground">{r.clientes_unicos}</b></span>
                    <span>Duración: <b className="text-foreground">{r.duracion_prom_min}m</b></span>
                    <span>Ticket: <b className="text-foreground">{money(r.ticket_prom)}</b></span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
