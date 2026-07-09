import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { supervisorReportFn } from "@/lib/rep-performance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Filter } from "lucide-react";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

function toCsv(rows: any[]) {
  const headers = ["rep_name", "visits", "orders", "amount"];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

export default function SupervisorReport() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400_000);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [repId, setRepId] = useState("");

  const fn = useServerFn(supervisorReportFn);
  const run = useMutation({
    mutationFn: () =>
      fn({
        data: { from, to, rep_id: repId ? repId : undefined },
      }),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const rows = run.data?.rows ?? [];

  const download = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_reps_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="h-4 w-4" /> Reporte filtrable
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Rep ID (opcional)</Label>
            <Input placeholder="uuid" value={repId} onChange={(e) => setRepId(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
              Aplicar
            </Button>
            <Button size="sm" variant="outline" onClick={download} disabled={!rows.length}>
              <Download className="mr-1 h-3 w-3" /> CSV
            </Button>
          </div>
        </div>

        {run.data && (
          <>
            <div className="grid gap-2 sm:grid-cols-3 rounded border bg-muted/40 p-2 text-sm">
              <div>Visitas: <span className="font-semibold">{run.data.totals.visits}</span></div>
              <div>Pedidos: <span className="font-semibold">{run.data.totals.orders}</span></div>
              <div>Monto: <span className="font-semibold">{fmtMXN(run.data.totals.amount)}</span></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-1 text-left">Representante</th>
                    <th className="py-1 text-right">Visitas</th>
                    <th className="py-1 text-right">Pedidos</th>
                    <th className="py-1 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.rep_id} className="border-b last:border-none">
                      <td className="py-1">{r.rep_name}</td>
                      <td className="py-1 text-right">{r.visits}</td>
                      <td className="py-1 text-right">{r.orders}</td>
                      <td className="py-1 text-right">{fmtMXN(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
