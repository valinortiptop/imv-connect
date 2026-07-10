// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listPurchaseBudgets, upsertPurchaseBudget } from "@/lib/compras.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/compras/presupuesto")({
  head: () => ({ meta: [{ title: "Presupuesto de compras" }] }),
  component: PresupuestoPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function firstOfMonth(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function labelMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

function PresupuestoPage() {
  const qc = useQueryClient();
  const fnList = useServerFn(listPurchaseBudgets);
  const fnUpsert = useServerFn(upsertPurchaseBudget);

  const empresas = useQuery({
    queryKey: ["empresas-select"],
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("id, razon_social").order("razon_social");
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-budgets"],
    queryFn: () => fnList(),
  });
  const budgets = data?.budgets ?? [];

  // Also load compras del mes for each budget month
  const gastadoQ = useQuery({
    queryKey: ["purchase-actual-per-month"],
    queryFn: async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 12);
      since.setDate(1);
      const { data } = await supabase
        .from("v_ordenes_compra")
        .select("total, fecha_creacion, estado")
        .gte("fecha_creacion", since.toISOString().slice(0, 10))
        .not("estado", "eq", "cancelada")
        .limit(2000);
      const byMonth = new Map<string, number>();
      for (const r of (data ?? []) as any[]) {
        if (!r.fecha_creacion) continue;
        const key = r.fecha_creacion.slice(0, 7) + "-01";
        byMonth.set(key, (byMonth.get(key) ?? 0) + Number(r.total ?? 0));
      }
      return byMonth;
    },
  });
  const gastado = gastadoQ.data;

  const [form, setForm] = useState<{ empresa_id: string; mes: string; monto: string; notas: string }>({
    empresa_id: "",
    mes: firstOfMonth(0),
    monto: "",
    notas: "",
  });

  const mSave = useMutation({
    mutationFn: async () => {
      const monto = Number(form.monto);
      if (!monto || monto < 0) throw new Error("Monto inválido");
      return fnUpsert({
        data: {
          empresa_id: form.empresa_id || null,
          mes: form.mes,
          monto_mxn: monto,
          notas: form.notas.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Presupuesto guardado");
      setForm({ ...form, monto: "", notas: "" });
      qc.invalidateQueries({ queryKey: ["purchase-budgets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="h-6 w-6 text-primary" /> Presupuesto de compras
        </h1>
        <p className="text-sm text-muted-foreground">Presupuesto mensual por empresa para comparar contra ejecución.</p>
      </div>

      <div className="max-w-2xl space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={form.empresa_id} onValueChange={(v) => setForm({ ...form, empresa_id: v })}>
              <SelectTrigger><SelectValue placeholder="Todas / Global" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Global (sin empresa)</SelectItem>
                {(empresas.data ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.razon_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mes</Label>
            <Select value={form.mes} onValueChange={(v) => setForm({ ...form, mes: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => firstOfMonth(-6 + i)).map((m) => (
                  <SelectItem key={m} value={m}>{labelMonth(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Monto MXN</Label>
            <Input
              type="number"
              min="0"
              step="1000"
              value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
              placeholder="0"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notas</Label>
          <Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Opcional" />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => mSave.mutate()} disabled={mSave.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Guardar presupuesto
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Mes</th>
              <th className="px-3 py-2 text-right">Presupuesto</th>
              <th className="px-3 py-2 text-right">Comprometido</th>
              <th className="px-3 py-2 text-right">Utilización</th>
              <th className="px-3 py-2">Notas</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Cargando…</td></tr>
            ) : budgets.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Sin presupuestos capturados.</td></tr>
            ) : budgets.map((b: any) => {
              const spent = Number(gastado?.get(b.mes) ?? 0);
              const budget = Number(b.monto_mxn);
              const pct = budget > 0 ? (spent / budget) * 100 : 0;
              const color = pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
              return (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap capitalize">{labelMonth(b.mes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{mxn.format(budget)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{mxn.format(spent)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded bg-muted">
                        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="w-12 text-right tabular-nums text-xs">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{b.notas ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
