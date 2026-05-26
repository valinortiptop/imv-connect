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
import { Plus, Trash2, Filter, Receipt } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  mxn, parseDate, dateStr, EXPENSE_CATEGORIES, MAIN_CATEGORIES,
  PAYMENT_METHOD_OPTIONS, methodLabel,
} from "./pnlHelpers";
import { cn } from "@/lib/utils";

interface ExpenseRow {
  id: string; name: string; category: string; subcategory: string | null;
  amount: number; frequency: string; month: string; expense_date: string | null;
  notes: string | null; payment_method: string | null; vendor: string | null;
  is_recurring: boolean;
}

export function GastosTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data: expenses = [] } = useQuery<ExpenseRow[]>({
    queryKey: ["pnl-expenses-v2"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fixed_expenses").select("*").order("expense_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        expense_date: (r.expense_date as string) ?? (r.month as string),
      })) as ExpenseRow[];
    },
  });

  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);

  /* Filter expenses to selected period AND filters */
  const periodExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const d = e.expense_date ?? e.month;
      if (d < dateFrom) return false;
      if (d > dateTo) return false;
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      if (filterMethod !== "all" && (e.payment_method ?? "—") !== filterMethod) return false;
      return true;
    });
  }, [expenses, dateFrom, dateTo, filterCategory, filterMethod]);

  const totalPeriod = periodExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const recurringTotal = periodExpenses.filter((e) => e.is_recurring).reduce((s, e) => s + Number(e.amount), 0);
  const oneTimeTotal = totalPeriod - recurringTotal;
  const byMethod = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of periodExpenses) {
      const key = e.payment_method ?? "otro";
      m[key] = (m[key] ?? 0) + Number(e.amount);
    }
    return m;
  }, [periodExpenses]);
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of periodExpenses) m[e.category] = (m[e.category] ?? 0) + Number(e.amount);
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [periodExpenses]);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Receipt className="h-3 w-3" /> Total período</p>
          <p className="text-2xl font-bold tabular-nums">{mxn.format(totalPeriod)}</p>
          <p className="text-[11px] text-muted-foreground">{periodExpenses.length} gastos</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Recurrentes</p>
          <p className="text-lg font-semibold tabular-nums">{mxn.format(recurringTotal)}</p>
          <p className="text-[11px] text-muted-foreground">Gastos fijos</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Una sola vez</p>
          <p className="text-lg font-semibold tabular-nums">{mxn.format(oneTimeTotal)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Efectivo / Transferencia</p>
          <p className="text-sm tabular-nums">Ef: {mxn.format(byMethod["efectivo"] ?? 0)}</p>
          <p className="text-sm tabular-nums">Tr: {mxn.format(byMethod["transferencia"] ?? 0)}</p>
        </div>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <div className="rounded-xl border p-4">
          <p className="text-sm font-semibold mb-3">Por categoría</p>
          <div className="space-y-2">
            {byCategory.map(([cat, amt]) => {
              const pctOfTotal = totalPeriod > 0 ? (amt / totalPeriod) * 100 : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{cat}</span>
                    <span className="tabular-nums font-medium">{mxn.format(amt)} <span className="text-muted-foreground">({pctOfTotal.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${pctOfTotal}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Agregar gasto</Button>
          </DialogTrigger>
          <GastoDialog onClose={() => setShowAdd(false)} />
        </Dialog>
        <div className="flex items-center gap-2 ml-auto">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorías</SelectItem>
              {MAIN_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMethod} onValueChange={setFilterMethod}>
            <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos métodos</SelectItem>
              {PAYMENT_METHOD_OPTIONS.map((m) => <SelectItem key={m} value={m}>{methodLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Recurrente</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {periodExpenses.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin gastos en este período.</TableCell></TableRow>
            ) : periodExpenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs text-muted-foreground tabular-nums">{format(parseDate(e.expense_date ?? e.month), "dd MMM yy", { locale: es })}</TableCell>
                <TableCell className="font-medium">
                  {e.name}
                  {e.vendor && <span className="text-xs text-muted-foreground block">{e.vendor}</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">{e.category}</Badge>
                  {e.subcategory && <span className="text-[10px] text-muted-foreground ml-1">/ {e.subcategory}</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{methodLabel(e.payment_method)}</TableCell>
                <TableCell>
                  {e.is_recurring
                    ? <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-500">Recurrente</Badge>
                    : <Badge variant="outline" className="text-[10px]">Una vez</Badge>}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums font-medium", "text-red-400")}>{mxn.format(e.amount)}</TableCell>
                <TableCell><DeleteExpenseButton expenseId={e.id} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fixed_expenses").delete().eq("id", expenseId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pnl-expenses-v2"] });
      toast.success("Gasto eliminado");
    },
  });
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("¿Eliminar gasto?")) del.mutate(); }}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

function GastoDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("Oficina");
  const [subcategory, setSubcategory] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(dateStr(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<string>("transferencia");
  const [isRecurring, setIsRecurring] = useState(false);
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");

  const subcategories = EXPENSE_CATEGORIES[category] ?? [];

  const create = useMutation({
    mutationFn: async () => {
      const d = expenseDate;
      const { error } = await supabase.from("fixed_expenses").insert({
        name: name.trim(),
        category,
        subcategory: subcategory || null,
        amount: parseFloat(amount) || 0,
        frequency: isRecurring ? "Mensual" : "Una vez",
        month: d.slice(0, 7) + "-01",
        expense_date: d,
        payment_method: paymentMethod,
        is_recurring: isRecurring,
        vendor: vendor.trim() || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pnl-expenses-v2"] });
      toast.success("Gasto agregado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="w-[min(92vw,760px)] max-w-[760px]">
      <DialogHeader><DialogTitle>Agregar gasto</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Papelería oficina" /></div>
          <div><Label>Vendor / Proveedor</Label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Opcional" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Categoría</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MAIN_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Subcategoría</Label>
            <Select value={subcategory} onValueChange={setSubcategory}>
              <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>{subcategories.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><Label>Monto</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
          <div><Label>Fecha</Label><Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></div>
          <div><Label>Método</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHOD_OPTIONS.map((m) => <SelectItem key={m} value={m}>{methodLabel(m)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input id="recurring" type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="h-4 w-4 rounded border-input" />
          <Label htmlFor="recurring" className="text-sm cursor-pointer">Recurrente mensual</Label>
        </div>
        <div><Label>Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => create.mutate()} disabled={!name || !amount}>Guardar</Button>
      </DialogFooter>
    </DialogContent>
  );
}
