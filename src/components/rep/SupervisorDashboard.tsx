import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSupervisorDashboardFn } from "@/lib/rep.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
        <h1 className="text-2xl font-semibold">Panel supervisor</h1>
        <div className="ml-auto flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Visitas</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{data?.totals.visits ?? 0}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pedidos</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{data?.totals.pedidos ?? 0}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ventas</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{money(data?.totals.ventas ?? 0)}</CardContent>
            </Card>
          </div>

          <Card>
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
                      <TableCell className="text-right">{r.visitas}</TableCell>
                      <TableCell className="text-right">{r.pedidos}</TableCell>
                      <TableCell className="text-right">{(r.ratio * 100).toFixed(0)}%</TableCell>
                      <TableCell className="text-right">{r.clientes_unicos}</TableCell>
                      <TableCell className="text-right">{r.duracion_prom_min}m</TableCell>
                      <TableCell className="text-right">{money(r.ticket_prom)}</TableCell>
                      <TableCell className="text-right font-semibold">{money(r.ventas)}</TableCell>
                    </TableRow>
                  ))}
                  {(data?.rows ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Sin datos en el período</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
