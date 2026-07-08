import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Wallet2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";
import { createPayrollPaymentFn } from "@/lib/bancos.functions";

export const Route = createFileRoute("/admin/bancos/nomina")({
  head: () => ({
    meta: [
      { title: "Pago de nómina — Bancos" },
      {
        name: "description",
        content: "Registra pagos de nómina desde tus cuentas bancarias.",
      },
    ],
  }),
  component: NominaPage,
});

type BankAccount = { id: string; banco: string; alias: string; moneda: string };
type Employee = {
  id: string;
  name: string;
  role: string | null;
  base_amount: number | null;
  payment_frequency: string | null;
  is_active: boolean;
};
type Payment = {
  id: string;
  employee_id: string;
  payment_date: string;
  amount: number;
  payment_type: string;
  payment_method: string;
  days_worked: number | null;
  notes: string | null;
};

function NominaPage() {
  const qc = useQueryClient();
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    cuenta_id: string;
    employee_id: string;
    payment_date: string;
    amount: number;
    payment_type: string;
    payment_method: string;
    days_worked: number | null;
    notes: string;
  }>({
    cuenta_id: "",
    employee_id: "",
    payment_date: new Date().toISOString().slice(0, 10),
    amount: 0,
    payment_type: "sueldo",
    payment_method: "transferencia",
    days_worked: null,
    notes: "",
  });

  const createFn = useServerFn(createPayrollPaymentFn);

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank_accounts", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts" as any)
        .select("id, banco, alias, moneda")
        .eq("empresa_id", empresaId!)
        .eq("activa", true)
        .order("banco");
      if (error) throw error;
      return (data ?? []) as unknown as BankAccount[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees" as any)
        .select("id, name, role, base_amount, payment_frequency, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Employee[];
    },
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payroll_payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_payments" as any)
        .select("*")
        .order("payment_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Payment[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Elige empresa");
      return await createFn({
        data: {
          empresa_id: empresaId,
          cuenta_id: form.cuenta_id,
          employee_id: form.employee_id,
          payment_date: form.payment_date,
          amount: Number(form.amount),
          payment_type: form.payment_type,
          payment_method: form.payment_method,
          days_worked: form.days_worked ?? undefined,
          notes: form.notes || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Pago registrado");
      qc.invalidateQueries({ queryKey: ["payroll_payments"] });
      qc.invalidateQueries({ queryKey: ["bank_movements"] });
      qc.invalidateQueries({ queryKey: ["bank_saldos"] });
      setOpen(false);
      setForm({
        cuenta_id: form.cuenta_id, // remember the account
        employee_id: "",
        payment_date: new Date().toISOString().slice(0, 10),
        amount: 0,
        payment_type: "sueldo",
        payment_method: "transferencia",
        days_worked: null,
        notes: "",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Remove linked bank movement first (no FK cascade)
      await supabase
        .from("bank_movements" as any)
        .delete()
        .eq("payroll_payment_id", id);
      const { error } = await supabase
        .from("payroll_payments" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pago eliminado");
      qc.invalidateQueries({ queryKey: ["payroll_payments"] });
      qc.invalidateQueries({ queryKey: ["bank_movements"] });
      qc.invalidateQueries({ queryKey: ["bank_saldos"] });
    },
  });

  const empMap = new Map(employees.map((e) => [e.id, e] as const));
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(n);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Wallet2 className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Pago de nómina</h1>
            <p className="text-sm text-muted-foreground">
              Registra pagos a empleados desde tus cuentas bancarias.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EmpresaSelector />
          <Button
            onClick={() => setOpen(true)}
            disabled={
              !empresaId || accounts.length === 0 || employees.length === 0
            }
          >
            <Plus className="h-4 w-4 mr-1" /> Nuevo pago
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Empleado</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Método</th>
              <th className="p-3 text-right">Monto</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading && payments.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Aún no hay pagos registrados.
                </td>
              </tr>
            )}
            {payments.map((p) => {
              const emp = empMap.get(p.employee_id);
              return (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 whitespace-nowrap">{p.payment_date}</td>
                  <td className="p-3">
                    <div className="font-medium">{emp?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {emp?.role ?? ""}
                    </div>
                  </td>
                  <td className="p-3">{p.payment_type}</td>
                  <td className="p-3">{p.payment_method}</td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {fmtMoney(Number(p.amount))}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("¿Eliminar este pago y su movimiento?"))
                          deleteMutation.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar pago de nómina</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Cuenta bancaria</Label>
              <Select
                value={form.cuenta_id}
                onValueChange={(v) => setForm({ ...form, cuenta_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elige la cuenta que paga…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.alias} — {a.banco}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Empleado</Label>
              <Select
                value={form.employee_id}
                onValueChange={(v) => {
                  const emp = employees.find((e) => e.id === v);
                  setForm({
                    ...form,
                    employee_id: v,
                    amount:
                      emp?.base_amount != null && form.amount === 0
                        ? Number(emp.base_amount)
                        : form.amount,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elige empleado…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} {e.role ? `— ${e.role}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={form.payment_date}
                onChange={(e) =>
                  setForm({ ...form, payment_date: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Monto</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) =>
                  setForm({ ...form, amount: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.payment_type}
                onValueChange={(v) => setForm({ ...form, payment_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sueldo">Sueldo</SelectItem>
                  <SelectItem value="aguinaldo">Aguinaldo</SelectItem>
                  <SelectItem value="bono">Bono</SelectItem>
                  <SelectItem value="finiquito">Finiquito</SelectItem>
                  <SelectItem value="prestamo">Préstamo</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Método</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) => setForm({ ...form, payment_method: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notas</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !form.cuenta_id ||
                !form.employee_id ||
                !form.amount
              }
            >
              {createMutation.isPending ? "Registrando…" : "Registrar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
