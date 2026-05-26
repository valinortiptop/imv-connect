import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Truck, ArrowRight, ArrowLeft, Package } from "lucide-react";
import { mxn, mxnRate, pct, parseDate } from "./pnlHelpers";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Per-entrada bulto economics.
 *
 * For each inbound stock_entry:
 *   - factory_reimbursement = quantity × rate_in (inflow from factory)
 *   - maniobra_cost = crew_size × rate_per_person (outflow to Rodrigo)
 *   - net = reimbursement − maniobra
 *
 * For delivered orders:
 *   - central_maniobra = bultos × rate_out (outflow at central)
 *
 * The rates come from system_config so they're editable in one place
 * and historical entries keep their own timestamps for audit.
 */

interface StockEntry {
  id: string;
  entry_date: string;
  quantity: number;
  supplier: string | null;
  notes: string | null;
  is_torton: boolean;
  maniobra_vendor: string | null;
  maniobra_crew_size: number;
  maniobra_rate_per_person: number;
  maniobra_cost: number;
  factory_rate_per_bulto: number;
  factory_reimbursement: number;
}

export function EntradasBultoTab({
  dateFrom, dateTo,
  rateIn, rateOut, crewDefault, rateManiobra,
  orderBultosByDate,
}: {
  dateFrom: string;
  dateTo: string;
  rateIn: number;
  rateOut: number;
  crewDefault: number;
  rateManiobra: number;
  /** bultos delivered per date, for central maniobra breakdown */
  orderBultosByDate: Map<string, number>;
}) {
  const { data: entries = [] } = useQuery<StockEntry[]>({
    queryKey: ["pnl-stock-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_entries")
        .select("id, entry_date, quantity, supplier, notes, is_torton, maniobra_vendor, maniobra_crew_size, maniobra_rate_per_person, maniobra_cost, factory_rate_per_bulto, factory_reimbursement")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as StockEntry[];
    },
  });

  /* Aggregate entradas by date (an inbound torton can have multiple SKU rows in stock_entries). */
  const entradasByDate = useMemo(() => {
    const m = new Map<string, {
      date: string;
      totalBultos: number;
      supplier: string;
      isTorton: boolean;
      entries: number;
      crewSize: number;
      factoryRate: number;
      maniobraRate: number;
      storedReimbursement: number;
      storedManiobraCost: number;
    }>();
    for (const e of entries) {
      if (e.entry_date < dateFrom || e.entry_date > dateTo) continue;
      const existing = m.get(e.entry_date) ?? {
        date: e.entry_date,
        totalBultos: 0,
        supplier: e.supplier ?? "—",
        isTorton: e.is_torton,
        entries: 0,
        crewSize: e.maniobra_crew_size || 0,
        factoryRate: e.factory_rate_per_bulto || 0,
        maniobraRate: e.maniobra_rate_per_person || 0,
        storedReimbursement: 0,
        storedManiobraCost: 0,
      };
      existing.totalBultos += e.quantity;
      existing.entries += 1;
      existing.storedReimbursement += e.factory_reimbursement || 0;
      existing.storedManiobraCost += e.maniobra_cost || 0;
      m.set(e.entry_date, existing);
    }
    return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, dateFrom, dateTo]);

  // Typical torton capacity. Days with more bultos than this imply multiple
  // tortons arrived, each billed its own crew × rate maniobra.
  const TORTON_CAPACITY = 770;
  const tortonsFor = (bultos: number) => Math.max(1, Math.ceil(bultos / TORTON_CAPACITY));

  const periodTotals = useMemo(() => {
    let bultos = 0, reimb = 0, cost = 0, tortons = 0;
    for (const row of entradasByDate) {
      bultos += row.totalBultos;
      reimb += row.totalBultos * rateIn;
      const crewEffective = row.crewSize || crewDefault;
      const dayTortons = tortonsFor(row.totalBultos);
      tortons += dayTortons;
      cost += dayTortons * crewEffective * rateManiobra;
    }
    return { bultos, reimb, cost, tortons, net: reimb - cost };
  }, [entradasByDate, rateIn, rateManiobra, crewDefault]);

  /* Breakeven info: how many bultos per torton make it cash-neutral on maniobra */
  const breakEvenBultos = rateIn > 0 ? (crewDefault * rateManiobra) / rateIn : 0;
  const avgFillRate = entradasByDate.length > 0 ? periodTotals.bultos / entradasByDate.length : 0;
  const fillPct = breakEvenBultos > 0 ? (avgFillRate / breakEvenBultos) * 100 : 0;

  /* Central maniobra from delivered orders */
  const centralByDate = useMemo(() => {
    const arr = [...orderBultosByDate.entries()]
      .filter(([d]) => d >= dateFrom && d <= dateTo)
      .map(([d, b]) => ({ date: d, bultos: b, cost: b * rateOut }))
      .sort((a, b) => b.date.localeCompare(a.date));
    return arr;
  }, [orderBultosByDate, dateFrom, dateTo, rateOut]);

  const centralTotal = centralByDate.reduce((s, r) => s + r.cost, 0);
  const centralBultos = centralByDate.reduce((s, r) => s + r.bultos, 0);

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><ArrowLeft className="h-3 w-3 text-green-500" /> Reembolso fábrica</p>
          <p className="text-2xl font-bold tabular-nums text-green-500">{mxn.format(periodTotals.reimb)}</p>
          <p className="text-[11px] text-muted-foreground">{periodTotals.bultos.toLocaleString()} bultos × {mxnRate(rateIn)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Truck className="h-3 w-3 text-red-500" /> Maniobra Rodrigo</p>
          <p className="text-2xl font-bold tabular-nums text-red-400">{mxn.format(periodTotals.cost)}</p>
          <p className="text-[11px] text-muted-foreground">{periodTotals.tortons} tortons × {crewDefault} crew × {mxn.format(rateManiobra)}</p>
        </div>
        <div className={cn("rounded-xl border p-4", periodTotals.net >= 0 ? "" : "border-orange-500/30 bg-orange-500/5")}>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Maniobra entrada neta</p>
          <p className={cn("text-2xl font-bold tabular-nums", periodTotals.net >= 0 ? "text-green-500" : "text-orange-500")}>
            {periodTotals.net >= 0 ? "+" : ""}{mxn.format(periodTotals.net)}
          </p>
          <p className="text-[11px] text-muted-foreground">Fill rate promedio: {pct(fillPct)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><ArrowRight className="h-3 w-3 text-red-500" /> Maniobra central (salida)</p>
          <p className="text-2xl font-bold tabular-nums text-red-400">{mxn.format(centralTotal)}</p>
          <p className="text-[11px] text-muted-foreground">{centralBultos.toLocaleString()} bultos × {mxnRate(rateOut)}</p>
        </div>
      </div>

      {/* Break-even insight */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm flex items-start gap-3">
        <Package className="h-5 w-5 text-blue-500 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">Punto de equilibrio por torton: <span className="tabular-nums">{breakEvenBultos.toFixed(0)} bultos</span></p>
          <p className="text-xs text-muted-foreground">
            Con {crewDefault} personas × {mxn.format(rateManiobra)}/persona = {mxn.format(crewDefault * rateManiobra)} de maniobra.
            Se necesitan {breakEvenBultos.toFixed(0)} bultos × {mxnRate(rateIn)} para cubrir. Tortons típicamente topan en ~770 bultos,
            por lo que cada entrada es un costo neto de maniobra — la pregunta es cuánto, no si.
          </p>
        </div>
      </div>

      {/* Entradas table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-sm font-semibold">Entradas con economía por bulto ({entradasByDate.length})</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Bultos</TableHead>
              <TableHead className="text-right">Tortons</TableHead>
              <TableHead className="text-right">Reembolso</TableHead>
              <TableHead className="text-right">Maniobra</TableHead>
              <TableHead className="text-right">Neto</TableHead>
              <TableHead className="text-right">Fill %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entradasByDate.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sin entradas en el período.</TableCell></TableRow>
            ) : entradasByDate.map((r) => {
              const reimb = r.totalBultos * rateIn;
              const crew = r.crewSize || crewDefault;
              const tortons = tortonsFor(r.totalBultos);
              const cost = tortons * crew * rateManiobra;
              const net = reimb - cost;
              // Fill % measures how full the day's tortons were on average
              const avgBultosPerTorton = r.totalBultos / tortons;
              const fill = breakEvenBultos > 0 ? (avgBultosPerTorton / breakEvenBultos) * 100 : 0;
              return (
                <TableRow key={r.date}>
                  <TableCell className="tabular-nums text-xs">{format(parseDate(r.date), "dd MMM yy", { locale: es })}</TableCell>
                  <TableCell>
                    {r.supplier}
                    {r.isTorton && <Badge variant="outline" className="text-[10px] ml-2">Torton</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.totalBultos.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{tortons}</TableCell>
                  <TableCell className="text-right tabular-nums text-green-500">+{mxn.format(reimb)}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-400">−{mxn.format(cost)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", net >= 0 ? "text-green-500" : "text-orange-500")}>
                    {net >= 0 ? "+" : ""}{mxn.format(net)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{fill.toFixed(0)}%</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Central deliveries table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-sm font-semibold">Entregas al central — maniobra pagada ({centralByDate.length} días)</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Bultos</TableHead>
              <TableHead className="text-right">Costo maniobra</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {centralByDate.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin entregas en el período.</TableCell></TableRow>
            ) : centralByDate.map((r) => (
              <TableRow key={r.date}>
                <TableCell className="tabular-nums text-xs">{format(parseDate(r.date), "dd MMM yy", { locale: es })}</TableCell>
                <TableCell className="text-right tabular-nums">{r.bultos.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-red-400">−{mxn.format(r.cost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
