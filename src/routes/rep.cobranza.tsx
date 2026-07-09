import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listOpenInvoicesFn, registerPaymentFn } from "@/lib/rep-sales.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Banknote, AlertTriangle } from "lucide-react";
import AIPageInsights from "@/components/ai/AIPageInsights";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

function Page() {
  const qc = useQueryClient();
  const fetchInv = useServerFn(listOpenInvoicesFn);
  const registerPayment = useServerFn(registerPaymentFn);
  const q = useQuery({ queryKey: ["rep-cobranza"], queryFn: () => fetchInv() });

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
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al registrar pago"),
  });

  const totalOverdue = (q.data?.facturas ?? [])
    .filter((f: any) => f.overdue_days > 0)
    .reduce((s: number, f: any) => s + f.saldo, 0);

  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-cobranza" />
      <div>
        <h1 className="text-2xl font-semibold">Cobranza en ruta</h1>
        <p className="text-sm text-muted-foreground">
          Registra pagos contra facturas abiertas de tus clientes.
        </p>
      </div>

      {totalOverdue > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <div className="text-sm font-medium">Saldo vencido</div>
              <div className="text-xs text-muted-foreground">
                {fmtMXN(totalOverdue)} en facturas con vencimiento pasado
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {q.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : q.data?.facturas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay facturas abiertas.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {q.data?.facturas.map((f: any) => (
            <Card key={f.id} className={f.overdue_days > 0 ? "border-destructive/40" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{f.client_name}</span>
                  <Badge variant={f.overdue_days > 0 ? "destructive" : "secondary"}>
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
