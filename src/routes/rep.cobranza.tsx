import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listOpenInvoicesFn, registerPaymentFn, getRepCobranzaSummaryFn } from "@/lib/rep-sales.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Banknote, AlertTriangle, Target, Flame, CalendarClock, CalendarDays, TrendingUp } from "lucide-react";
import AIPageInsights from "@/components/ai/AIPageInsights";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

type Bucket = "vencidas" | "hoy" | "semana" | "mes" | "despues";

const bucketMeta: Record<Bucket, { label: string; icon: any; className: string; badge: any }> = {
  vencidas: { label: "Vencidas", icon: Flame, className: "border-destructive/50 bg-destructive/5", badge: "destructive" },
  hoy: { label: "Vencen hoy", icon: AlertTriangle, className: "border-orange-500/40 bg-orange-500/5", badge: "destructive" },
  semana: { label: "Próximos 7 días", icon: CalendarClock, className: "border-amber-500/40 bg-amber-500/5", badge: "secondary" },
  mes: { label: "Este mes", icon: CalendarDays, className: "", badge: "secondary" },
  despues: { label: "Más adelante", icon: CalendarDays, className: "", badge: "outline" },
};

function bucketOf(f: any): Bucket {
  if (f.overdue_days > 0) return "vencidas";
  if (!f.fecha_vencimiento) return "despues";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(f.fecha_vencimiento); due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days <= 7) return "semana";
  if (days <= 30) return "mes";
  return "despues";
}

// Priority: vencidas y saldo grande primero. Score = overdue*1000 + saldo/1000
function priorityScore(f: any) {
  return (f.overdue_days || 0) * 1000 + Number(f.saldo || 0) / 1000;
}

function Page() {
  const qc = useQueryClient();
  const fetchInv = useServerFn(listOpenInvoicesFn);
  const fetchSummary = useServerFn(getRepCobranzaSummaryFn);
  const registerPayment = useServerFn(registerPaymentFn);
  const q = useQuery({ queryKey: ["rep-cobranza"], queryFn: () => fetchInv() });
  const s = useQuery({ queryKey: ["rep-cobranza-summary"], queryFn: () => fetchSummary() });

  const [openFac, setOpenFac] = useState<any | null>(null);
  const [form, setForm] = useState({ monto: "", metodo: "efectivo", referencia: "", notas: "" });

  const pay = useMutation({
    mutationFn: () =>
      registerPayment({
        data: {
          facturaId: openFac.id,
          monto: parseFloat(form.monto),
          metodo: form.metodo as any,
          referencia: form.referencia || null,
          notas: form.notas || null,
        },
      }),
    onSuccess: () => {
      toast.success("Pago registrado");
      setOpenFac(null);
      setForm({ monto: "", metodo: "efectivo", referencia: "", notas: "" });
      qc.invalidateQueries({ queryKey: ["rep-cobranza"] });
      qc.invalidateQueries({ queryKey: ["rep-cobranza-summary"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al registrar pago"),
  });

  const facturas = q.data?.facturas ?? [];

  const grouped = useMemo(() => {
    const g: Record<Bucket, any[]> = { vencidas: [], hoy: [], semana: [], mes: [], despues: [] };
    for (const f of facturas) g[bucketOf(f)].push(f);
    for (const k of Object.keys(g) as Bucket[]) {
      g[k].sort((a, b) => priorityScore(b) - priorityScore(a));
    }
    return g;
  }, [facturas]);

  const totalOverdue = grouped.vencidas.reduce((s, f) => s + Number(f.saldo || 0), 0);
  const totalOpen = facturas.reduce((s: number, f: any) => s + Number(f.saldo || 0), 0);
  const top3 = [...facturas].sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, 3);

  const collected = Number(s.data?.collected_month ?? 0);
  const target = Number(s.data?.target_amount ?? 0);
  const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;

  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-cobranza" />

      <div>
        <h1 className="text-xl font-semibold md:text-2xl">Cobranza en ruta</h1>
        <p className="text-sm text-muted-foreground">
          Prioriza cobros por vencimiento y avanza tu meta mensual.
        </p>
      </div>

      {/* Meta + cobrado */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4" /> Meta mensual
            <Link to="/rep/metas" className="ml-auto text-xs font-normal text-primary hover:underline">
              Ver metas
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Cobrado este mes</span>
            <span className="font-semibold">{fmtMXN(collected)} {target > 0 && <span className="text-muted-foreground font-normal">/ {fmtMXN(target)}</span>}</span>
          </div>
          {target > 0 ? (
            <>
              <Progress value={pct} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{pct}% de la meta</span>
                <span>Faltan {fmtMXN(Math.max(0, target - collected))}</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No tienes meta mensual capturada. <Link to="/rep/metas" className="text-primary hover:underline">Configurar</Link>.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Saldo total abierto</div>
              <div className="font-semibold text-sm">{fmtMXN(totalOpen)}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Vencido</div>
              <div className={"font-semibold text-sm " + (totalOverdue > 0 ? "text-destructive" : "")}>
                {fmtMXN(totalOverdue)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prioridades del día */}
      {top3.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" /> Prioridades de hoy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {top3.map((f: any, i: number) => (
              <button
                key={f.id}
                onClick={() => { setOpenFac(f); setForm(fs => ({ ...fs, monto: String(f.saldo) })); }}
                className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{f.client_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {f.folio} · {f.overdue_days > 0 ? `${f.overdue_days}d vencido` : `vence ${f.fecha_vencimiento ?? "—"}`}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold">{fmtMXN(f.saldo)}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Grupos por vencimiento */}
      {q.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : facturas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay facturas abiertas.
          </CardContent>
        </Card>
      ) : (
        (["vencidas", "hoy", "semana", "mes", "despues"] as Bucket[]).map((k) => {
          const items = grouped[k];
          if (!items.length) return null;
          const meta = bucketMeta[k];
          const Icon = meta.icon;
          const total = items.reduce((s, f) => s + Number(f.saldo || 0), 0);
          return (
            <section key={k} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="h-4 w-4" />
                  {meta.label}
                  <Badge variant="outline" className="ml-1">{items.length}</Badge>
                </h2>
                <span className="text-xs text-muted-foreground">{fmtMXN(total)}</span>
              </div>
              <div className="space-y-2">
                {items.map((f: any) => (
                  <Card key={f.id} className={meta.className}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="truncate">{f.client_name}</span>
                        <Badge variant={meta.badge as any}>
                          {f.overdue_days > 0 ? `${f.overdue_days}d vencido` : f.estado}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-muted-foreground">
                          {f.folio} · Vence {f.fecha_vencimiento ?? "—"}
                        </span>
                        <span className="font-semibold">{fmtMXN(f.saldo)}</span>
                      </div>
                      <Button size="sm" className="w-full" onClick={() => { setOpenFac(f); setForm(fs => ({ ...fs, monto: String(f.saldo) })); }}>
                        <Banknote className="mr-2 h-4 w-4" /> Registrar pago
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          );
        })
      )}

      <Dialog open={!!openFac} onOpenChange={(o) => !o && setOpenFac(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago · {openFac?.folio}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Monto</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
              />
              <div className="mt-1 text-xs text-muted-foreground">
                Saldo: {fmtMXN(openFac?.saldo ?? 0)}
              </div>
            </div>
            <div>
              <Label>Método</Label>
              <Select value={form.metodo} onValueChange={(v) => setForm({ ...form, metodo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Referencia</Label>
              <Input
                value={form.referencia}
                onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                placeholder="No. transferencia, cheque, etc."
              />
            </div>
            <div>
              <Label>Notas</Label>
              <Input
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenFac(null)}>Cancelar</Button>
            <Button
              onClick={() => pay.mutate()}
              disabled={pay.isPending || !form.monto || parseFloat(form.monto) <= 0}
            >
              {pay.isPending ? "Guardando…" : "Guardar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/rep/cobranza")({ component: Page });
