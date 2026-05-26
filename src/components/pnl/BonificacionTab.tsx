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
import { Plus, Trash2, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { mxnFull, mxn, pct, parseDate, dateStr, monthKey } from "./pnlHelpers";
import { cn } from "@/lib/utils";

interface BonificacionRow {
  id: string; month: string; product_id: string | null;
  amount: number; received_date: string | null; notes: string | null;
}
interface Product { id: string; name: string; brand: string }

/**
 * Bonificación tab.
 *
 * Shows the reconciliation between what the platform *expected* to earn in bonificación
 * (sum of `margins.bonificacion_pct * cost * quantity` for delivered orders in the period)
 * vs what the factory actually paid (`bonifications_received`).
 *
 * Supports two entry modes: single lump sum per month (`product_id = NULL`),
 * or per-product breakdowns (one row per SKU).
 */
export function BonificacionTab({ dateFrom, dateTo, expectedBonifPeriod }: {
  dateFrom: string;
  dateTo: string;
  expectedBonifPeriod: number;
}) {
  const { data: bonifRows = [] } = useQuery<BonificacionRow[]>({
    queryKey: ["pnl-bonifications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bonifications_received").select("*").order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BonificacionRow[];
    },
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["pnl-products-minimal"],
    queryFn: async () => {
      // Don't filter by active — bonificación reports must include products
      // that were sold in the period, even if they've since been deactivated.
      const { data, error } = await supabase.from("products").select("id, name, brand").order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  /* Filter bonif rows to selected period */
  const periodRows = useMemo(() => {
    const from = monthKey(dateFrom);
    const to = monthKey(dateTo);
    return bonifRows.filter((r) => {
      const mk = monthKey(r.month);
      return mk >= from && mk <= to;
    });
  }, [bonifRows, dateFrom, dateTo]);

  const receivedTotal = periodRows.reduce((s, r) => s + r.amount, 0);
  const variance = receivedTotal - expectedBonifPeriod;
  const variancePct = expectedBonifPeriod > 0 ? (variance / expectedBonifPeriod) * 100 : null;

  const [showDialog, setShowDialog] = useState(false);

  /* Group received rows by month for display */
  const byMonth = useMemo(() => {
    const m = new Map<string, { lump: number; perProduct: number; rows: BonificacionRow[] }>();
    for (const r of bonifRows) {
      const mk = monthKey(r.month);
      const entry = m.get(mk) ?? { lump: 0, perProduct: 0, rows: [] };
      if (r.product_id == null) entry.lump += r.amount;
      else entry.perProduct += r.amount;
      entry.rows.push(r);
      m.set(mk, entry);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [bonifRows]);

  return (
    <div className="space-y-6">
      {/* Reconciliation card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Esperado (cálculo plataforma)</p>
          <p className="text-2xl font-bold tabular-nums">{mxn.format(expectedBonifPeriod)}</p>
          <p className="text-[11px] text-muted-foreground">Según margins.bonificacion_pct</p>
        </div>
        <div className="rounded-xl border p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Recibido (real)</p>
          <p className="text-2xl font-bold tabular-nums text-green-500">{mxn.format(receivedTotal)}</p>
          <p className="text-[11px] text-muted-foreground">{periodRows.length} entradas</p>
        </div>
        <div className={cn("rounded-xl border p-4 space-y-1",
          variance >= 0 ? "border-green-500/30 bg-green-500/5" : "border-orange-500/30 bg-orange-500/5")}>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Diferencia
          </p>
          <p className={cn("text-2xl font-bold tabular-nums", variance >= 0 ? "text-green-500" : "text-orange-500")}>
            {variance >= 0 ? "+" : ""}{mxn.format(variance)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {variancePct === null ? "—" : `${variance >= 0 ? "+" : ""}${variancePct.toFixed(1)}% vs esperado`}
          </p>
        </div>
      </div>

      {/* Hint */}
      {variance > expectedBonifPeriod * 0.1 && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 text-xs text-orange-700 dark:text-orange-300">
          Tu bonificación real es {pct(variancePct ?? 0)} mayor que la calculada. Esto sugiere que los <span className="font-semibold">margins.bonificacion_pct</span> están subestimados — cuando tengas 3+ meses de bonificación por producto, podrás recalibrar.
        </div>
      )}
      {variance < -expectedBonifPeriod * 0.1 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300">
          Tu bonificación real es menor a la esperada. Revisar si la fábrica cambió las tarifas o si hubo ajustes.
        </div>
      )}

      {/* Add button */}
      <div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Registrar bonificación</Button>
          </DialogTrigger>
          <BonificacionDialog products={products} onClose={() => setShowDialog(false)} />
        </Dialog>
      </div>

      {/* Monthly history */}
      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-sm font-semibold">Historial mensual ({byMonth.length} meses)</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead className="text-right">Lump</TableHead>
              <TableHead className="text-right">Por producto</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Entradas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byMonth.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sin bonificaciones registradas.</TableCell></TableRow>
            ) : byMonth.map(([mk, data]) => (
              <TableRow key={mk}>
                <TableCell className="font-medium">{format(parseDate(mk + "-01"), "MMMM yyyy", { locale: es })}</TableCell>
                <TableCell className="text-right tabular-nums">{data.lump > 0 ? mxn.format(data.lump) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{data.perProduct > 0 ? mxn.format(data.perProduct) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-green-500">{mxn.format(data.lump + data.perProduct)}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {data.rows.map((r) => <RowChip key={r.id} row={r} />)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RowChip({ row }: { row: BonificacionRow }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bonifications_received").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pnl-bonifications"] });
      toast.success("Eliminada");
    },
  });
  return (
    <Badge variant="outline" className="text-[10px] gap-1 cursor-pointer group" onClick={() => { if (confirm("¿Eliminar esta entrada?")) del.mutate(); }}>
      {row.product_id ? "Producto" : "Lump"} · {mxn.format(row.amount)}
      <Trash2 className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60" />
    </Badge>
  );
}

function BonificacionDialog({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"lump" | "per_product">("lump");
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [amount, setAmount] = useState("");
  const [productId, setProductId] = useState<string>("");
  const [receivedDate, setReceivedDate] = useState(dateStr(now));
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bonifications_received").insert({
        month: `${month}-01`,
        product_id: mode === "per_product" ? productId : null,
        amount: parseFloat(amount) || 0,
        received_date: receivedDate || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pnl-bonifications"] });
      toast.success("Bonificación registrada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="w-[min(92vw,720px)] max-w-[720px]">
      <DialogHeader><DialogTitle>Registrar bonificación</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant={mode === "lump" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setMode("lump")}>Lump sum</Button>
          <Button variant={mode === "per_product" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setMode("per_product")}>Por producto</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === "lump"
            ? "Un solo monto mensual (útil cuando la fábrica solo te da un total)."
            : "Un monto por SKU. Habilita recalibrar margins más adelante."}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Mes</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
          <div><Label>Fecha de recepción</Label><Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} /></div>
        </div>
        {mode === "per_product" && (
          <div>
            <Label>Producto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Elegir producto" /></SelectTrigger>
              <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.brand}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div><Label>Monto recibido</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
        <div><Label>Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => create.mutate()} disabled={!amount || (mode === "per_product" && !productId)}>Guardar</Button>
      </DialogFooter>
    </DialogContent>
  );
}
