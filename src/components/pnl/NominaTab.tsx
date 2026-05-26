// @ts-nocheck
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Trash2, DollarSign, Calendar as CalendarIcon, User, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  mxn, parseDate, ROLE_OPTIONS, FREQUENCY_OPTIONS, PAYMENT_METHOD_OPTIONS, PAYMENT_TYPE_OPTIONS,
  freqLabel, roleLabel, methodLabel, typeLabel, dateStr,
} from "./pnlHelpers";
import { cn } from "@/lib/utils";

/* Data shapes */
interface Employee {
  id: string; name: string; role: string; payment_frequency: string;
  base_amount: number; payment_method: string | null;
  start_date: string | null; end_date: string | null;
  is_active: boolean; notes: string | null;
}
interface PayrollPayment {
  id: string; employee_id: string; payment_date: string;
  amount: number; payment_type: string; payment_method: string | null;
  days_worked: number | null; notes: string | null;
}

export function NominaTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const qc = useQueryClient();

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["pnl-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("is_active", { ascending: false }).order("name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const { data: payments = [] } = useQuery<PayrollPayment[]>({
    queryKey: ["pnl-payroll-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_payments").select("*").order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollPayment[];
    },
  });

  /* Filter payments to selected period for KPIs */
  const periodPayments = useMemo(
    () => payments.filter((p) => p.payment_date >= dateFrom && p.payment_date <= dateTo),
    [payments, dateFrom, dateTo],
  );

  const totalPeriod = periodPayments.reduce((s, p) => s + p.amount, 0);
  const byMethod = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of periodPayments) {
      const key = p.payment_method ?? "otro";
      m[key] = (m[key] ?? 0) + p.amount;
    }
    return m;
  }, [periodPayments]);

  const [showEmployeeDialog, setShowEmployeeDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Period KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Users className="h-3 w-3" /> Activos</p>
          <p className="text-2xl font-bold">{employees.filter((e) => e.is_active).length}</p>
          <p className="text-[11px] text-muted-foreground">de {employees.length} totales</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><DollarSign className="h-3 w-3" /> Nómina período</p>
          <p className="text-2xl font-bold">{mxn.format(totalPeriod)}</p>
          <p className="text-[11px] text-muted-foreground">{periodPayments.length} pagos</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Efectivo</p>
          <p className="text-lg font-semibold tabular-nums">{mxn.format(byMethod["efectivo"] ?? 0)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Transferencia</p>
          <p className="text-lg font-semibold tabular-nums">{mxn.format(byMethod["transferencia"] ?? 0)}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <Dialog open={showEmployeeDialog} onOpenChange={setShowEmployeeDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1"><Plus className="h-4 w-4" /> Nuevo empleado</Button>
          </DialogTrigger>
          <EmployeeDialog onClose={() => setShowEmployeeDialog(false)} />
        </Dialog>
        <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" disabled={employees.length === 0}><DollarSign className="h-4 w-4" /> Registrar pago</Button>
          </DialogTrigger>
          <PaymentDialog employees={employees} onClose={() => setShowPayDialog(false)} />
        </Dialog>
      </div>

      {/* Employees list */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Pago base</TableHead>
              <TableHead>Frecuencia</TableHead>
              <TableHead className="text-right">Pagado en período</TableHead>
              <TableHead className="text-right">Total histórico</TableHead>
              <TableHead className="w-[110px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin empleados. Agrega el primero con el botón de arriba.</TableCell></TableRow>
            ) : employees.map((e) => {
              const empPayments = payments.filter((p) => p.employee_id === e.id);
              const periodAmount = empPayments.filter((p) => p.payment_date >= dateFrom && p.payment_date <= dateTo).reduce((s, p) => s + p.amount, 0);
              const totalAmount = empPayments.reduce((s, p) => s + p.amount, 0);
              const isExpanded = expanded === e.id;
              return (
                <>
                  <TableRow key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setExpanded(isExpanded ? null : e.id)}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" /> {e.name}
                      {!e.is_active && <Badge variant="outline" className="text-[10px]">Inactivo</Badge>}
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{roleLabel(e.role)}</Badge></TableCell>
                    <TableCell className="tabular-nums">{mxn.format(e.base_amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{freqLabel(e.payment_frequency)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", periodAmount > 0 && "text-red-400")}>{mxn.format(periodAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground text-xs">{mxn.format(totalAmount)}</TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <EmployeeActions employee={e} hasPayments={empPayments.length > 0} />
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={e.id + "-exp"} className="bg-muted/30">
                      <TableCell colSpan={7} className="p-0">
                        <EmployeeHistory employee={e} payments={empPayments} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Payments log for period */}
      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-sm font-semibold">Pagos en período ({periodPayments.length})</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Empleado</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {periodPayments.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin pagos en este período.</TableCell></TableRow>
            ) : periodPayments.map((p) => {
              const emp = employees.find((e) => e.id === p.employee_id);
              return (
                <TableRow key={p.id}>
                  <TableCell className="tabular-nums text-xs">{format(parseDate(p.payment_date), "dd MMM yy", { locale: es })}</TableCell>
                  <TableCell className="font-medium">{emp?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{typeLabel(p.payment_type)}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{methodLabel(p.payment_method)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{mxn.format(p.amount)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{p.notes ?? "—"}</TableCell>
                  <TableCell><DeletePaymentButton paymentId={p.id} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EmployeeHistory({ employee, payments }: { employee: Employee; payments: PayrollPayment[] }) {
  const byType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of payments) m[p.payment_type] = (m[p.payment_type] ?? 0) + p.amount;
    return m;
  }, [payments]);
  const total = payments.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="px-6 py-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <div><p className="text-[11px] text-muted-foreground uppercase">Histórico</p><p className="font-semibold tabular-nums">{mxn.format(total)}</p></div>
        {Object.entries(byType).map(([t, a]) => (
          <div key={t}><p className="text-[11px] text-muted-foreground uppercase">{typeLabel(t)}</p><p className="tabular-nums">{mxn.format(a)}</p></div>
        ))}
      </div>
      {employee.notes && <p className="text-xs text-muted-foreground italic">{employee.notes}</p>}
    </div>
  );
}

function EmployeeDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("Logistica");
  const [frequency, setFrequency] = useState<string>("quincenal");
  const [baseAmount, setBaseAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("transferencia");
  const [startDate, setStartDate] = useState(dateStr(new Date()));
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employees").insert({
        name: name.trim(), role, payment_frequency: frequency,
        base_amount: parseFloat(baseAmount) || 0,
        payment_method: paymentMethod, start_date: startDate,
        notes: notes.trim() || null, is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pnl-employees"] });
      toast.success("Empleado agregado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="w-[min(92vw,720px)] max-w-[720px]">
      <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo" /></div>
          <div><Label>Fecha de inicio</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Rol</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Frecuencia</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FREQUENCY_OPTIONS.map((f) => <SelectItem key={f} value={f}>{freqLabel(f)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Monto base</Label><Input type="number" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} placeholder={frequency === "por_dia" ? "por día" : "por período"} /></div>
          <div><Label>Método de pago</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHOD_OPTIONS.map((m) => <SelectItem key={m} value={m}>{methodLabel(m)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => create.mutate()} disabled={!name || !baseAmount}>Guardar</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PaymentDialog({ employees, onClose }: { employees: Employee[]; onClose: () => void }) {
  const qc = useQueryClient();
  const activeEmps = employees.filter((e) => e.is_active);
  const [employeeId, setEmployeeId] = useState<string>(activeEmps[0]?.id ?? "");
  const [paymentDate, setPaymentDate] = useState(dateStr(new Date()));
  const [paymentType, setPaymentType] = useState<string>("sueldo");
  const [paymentMethod, setPaymentMethod] = useState<string>("transferencia");
  const [daysWorked, setDaysWorked] = useState("1");
  const [notes, setNotes] = useState("");

  const selectedEmp = employees.find((e) => e.id === employeeId);
  const isPorDia = selectedEmp?.payment_frequency === "por_dia";
  const suggestedAmount = useMemo(() => {
    if (!selectedEmp) return 0;
    if (isPorDia) return (selectedEmp.base_amount || 0) * (parseFloat(daysWorked) || 0);
    return selectedEmp.base_amount || 0;
  }, [selectedEmp, isPorDia, daysWorked]);

  const [amount, setAmount] = useState("");
  const effectiveAmount = amount ? parseFloat(amount) : suggestedAmount;

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payroll_payments").insert({
        employee_id: employeeId,
        payment_date: paymentDate,
        amount: effectiveAmount,
        payment_type: paymentType,
        payment_method: paymentMethod,
        days_worked: isPorDia ? parseFloat(daysWorked) || 1 : null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pnl-payroll-all"] });
      toast.success("Pago registrado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="w-[min(92vw,720px)] max-w-[720px]">
      <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Empleado</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Elegir empleado" /></SelectTrigger>
              <SelectContent>{activeEmps.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} — {roleLabel(e.role)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Fecha</Label><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Tipo</Label>
            <Select value={paymentType} onValueChange={setPaymentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Método de pago</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHOD_OPTIONS.map((m) => <SelectItem key={m} value={m}>{methodLabel(m)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {isPorDia && (
            <div><Label>Días trabajados</Label><Input type="number" step="0.5" value={daysWorked} onChange={(e) => setDaysWorked(e.target.value)} /></div>
          )}
          <div className={isPorDia ? "" : "col-span-2"}>
            <Label>Monto {amount === "" && <span className="text-xs text-muted-foreground">(sugerido: {mxn.format(suggestedAmount)})</span>}</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={mxn.format(suggestedAmount)} />
          </div>
        </div>
        <div><Label>Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => create.mutate()} disabled={!employeeId || (!amount && !suggestedAmount)}>Guardar pago</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EmployeeActions({ employee, hasPayments }: { employee: Employee; hasPayments: boolean }) {
  const qc = useQueryClient();
  const setActive = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase.from("employees")
        .update({ is_active: active, end_date: active ? null : dateStr(new Date()) })
        .eq("id", employee.id);
      if (error) throw error;
    },
    onSuccess: (_d, active) => {
      qc.invalidateQueries({ queryKey: ["pnl-employees"] });
      toast.success(`${employee.name} ${active ? "reactivado" : "marcado como inactivo"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hardDelete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employees").delete().eq("id", employee.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pnl-employees"] });
      toast.success(`${employee.name} eliminado`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (employee.is_active) {
    return (
      <Button
        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
        title="Marcar como inactivo"
        onClick={() => { if (confirm(`¿Marcar a ${employee.name} como inactivo?`)) setActive.mutate(false); }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    );
  }

  // Inactive — offer reactivate + hard-delete (hard-delete only if no payments tied)
  return (
    <div className="flex gap-1">
      <Button
        variant="ghost" size="icon" className="h-7 w-7 text-green-500"
        title="Reactivar"
        onClick={() => setActive.mutate(true)}
      >
        <UserCheck className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost" size="icon" className="h-7 w-7 text-destructive disabled:opacity-30"
        title={hasPayments ? "No se puede eliminar: tiene pagos registrados" : "Eliminar permanentemente"}
        disabled={hasPayments}
        onClick={() => {
          if (hasPayments) return;
          if (confirm(`Eliminar permanentemente a ${employee.name}? Esta acción no se puede deshacer.`)) hardDelete.mutate();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function DeletePaymentButton({ paymentId }: { paymentId: string }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payroll_payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pnl-payroll-all"] });
      toast.success("Pago eliminado");
    },
  });
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("¿Eliminar este pago?")) del.mutate(); }}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
