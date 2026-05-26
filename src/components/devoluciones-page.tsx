// @ts-nocheck
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { ChronoBar } from "@/components/ChronoBar";
import { RegistrarAjusteDialog } from "@/components/orders/RegistrarAjusteDialog";
import { useDeleteAdjustment } from "@/hooks/use-delete-adjustment";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseLocalDate } from "@/lib/date-utils";
import {
  Search, Undo2, AlertTriangle, XCircle, TrendingDown, DollarSign,
  Package, Percent, ShoppingCart, AlertOctagon, Pencil, Trash2,
} from "lucide-react";

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fmtMXN = (v: number | null | undefined) => {
  if (v == null) return "$0";
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0";
  return mxnFmt.format(n);
};

type TipoFilter = "all" | "devolucion_buena" | "devolucion_danada" | "perdida_total" | "faltante";

interface AdjustmentRow {
  id: string;
  order_id: string;
  order_item_id: string | null;
  product_id: string;
  tipo: "devolucion_buena" | "devolucion_danada" | "perdida_total" | "faltante";
  quantity: number;
  unit_price: number;
  credit_amount: number;
  faltante_destino: "bodega" | "perdidos" | null;
  damaged_batch_id: string | null;
  notes: string | null;
  created_at: string;
  products: { clave: string; name: string; image_url: string | null } | null;
  orders: { order_code: string; client_id: string | null } | null;
  clients: { name: string } | null;
}

const tipoConfig = {
  devolucion_buena: {
    label: "Devolución",
    icon: Undo2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
  devolucion_danada: {
    label: "Dañada",
    icon: AlertTriangle,
    color: "text-orange-500",
    bg: "bg-orange-500/10 border-orange-500/30",
  },
  perdida_total: {
    label: "Pérdida",
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-500/10 border-red-500/30",
  },
  faltante: {
    label: "Faltante",
    icon: TrendingDown,
    color: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/30",
  },
} as const;

const firstOfMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

export default function Devoluciones() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>("all");
  const [dateFrom, setDateFrom] = useState<string>(firstOfMonth());
  const [dateTo, setDateTo] = useState<string>("");
  const [editingAdjustment, setEditingAdjustment] = useState<AdjustmentRow | null>(null);
  const [deletingAdjustment, setDeletingAdjustment] = useState<AdjustmentRow | null>(null);
  const deleteMutation = useDeleteAdjustment();

  // Compute range start/end for queries (end is exclusive, i.e. +1 day)
  const { rangeStartIso, rangeEndIso, rangeStartDate, rangeEndDate } = useMemo(() => {
    const startDate = dateFrom ? parseLocalDate(dateFrom) : new Date("1970-01-01");
    let endDate: Date;
    if (dateTo) {
      const end = parseLocalDate(dateTo);
      end.setDate(end.getDate() + 1); // exclusive upper bound
      endDate = end;
    } else {
      endDate = new Date("2099-12-31");
    }
    return {
      rangeStartIso: startDate.toISOString(),
      rangeEndIso: endDate.toISOString(),
      rangeStartDate: dateFrom,
      rangeEndDate: dateTo,
    };
  }, [dateFrom, dateTo]);

  // Main query: adjustments within range, joined with product/order/client
  const { data: adjustments = [], isLoading } = useQuery<AdjustmentRow[]>({
    queryKey: ["order-adjustments-all", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_adjustments")
        .select(`
          id, order_id, order_item_id, product_id, tipo, quantity, unit_price, credit_amount,
          faltante_destino, damaged_batch_id, notes, created_at,
          products(clave, name, image_url),
          orders(order_code, client_id)
        `)
        .gte("created_at", rangeStartIso)
        .lt("created_at", rangeEndIso)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Second pass: fetch client names for unique client_ids
      const rows = (data ?? []) as any[];
      const clientIds = [...new Set(rows.map((r) => r.orders?.client_id).filter(Boolean))];
      let clientMap: Record<string, string> = {};
      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id, name")
          .in("id", clientIds);
        clientMap = Object.fromEntries((clients ?? []).map((c) => [c.id, c.name]));
      }

      return rows.map((r) => ({
        ...r,
        clients: r.orders?.client_id ? { name: clientMap[r.orders.client_id] ?? "—" } : null,
      }));
    },
  });

  // Sales total within range for % devolución
  const { data: salesTotal = 0 } = useQuery<number>({
    queryKey: ["sales-total-for-returns", dateFrom, dateTo],
    queryFn: async () => {
      let q = (supabase as any).from("order_summary").select("total_with_iva, order_date");
      if (rangeStartDate) q = q.gte("order_date", rangeStartDate);
      if (rangeEndDate) q = q.lte("order_date", rangeEndDate);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.total_with_iva ?? 0), 0);
    },
  });

  // Stats
  const stats = useMemo(() => {
    const totalBultos = adjustments.reduce((s, a) => s + a.quantity, 0);
    const totalCredit = adjustments.reduce((s, a) => s + Number(a.credit_amount), 0);
    const pctReturn = salesTotal > 0 ? (totalCredit / salesTotal) * 100 : 0;

    // Merma = perdida_total + faltante con destino perdidos + devolucion_danada
    const mermaBultos = adjustments
      .filter((a) =>
        a.tipo === "perdida_total" ||
        (a.tipo === "faltante" && a.faltante_destino === "perdidos") ||
        a.tipo === "devolucion_danada"
      )
      .reduce((s, a) => s + a.quantity, 0);

    const mermaValue = adjustments
      .filter((a) =>
        a.tipo === "perdida_total" ||
        (a.tipo === "faltante" && a.faltante_destino === "perdidos")
      )
      .reduce((s, a) => s + Number(a.credit_amount), 0);

    // Top 5 SKUs
    const skuMap: Record<string, { clave: string; name: string; bultos: number; credit: number }> = {};
    for (const a of adjustments) {
      if (!a.products) continue;
      const key = a.product_id;
      if (!skuMap[key]) {
        skuMap[key] = {
          clave: a.products.clave,
          name: a.products.name,
          bultos: 0,
          credit: 0,
        };
      }
      skuMap[key].bultos += a.quantity;
      skuMap[key].credit += Number(a.credit_amount);
    }
    const topSkus = Object.values(skuMap).sort((a, b) => b.bultos - a.bultos).slice(0, 5);

    // Breakdown by tipo
    const byTipo: Record<string, { bultos: number; credit: number }> = {};
    for (const a of adjustments) {
      if (!byTipo[a.tipo]) byTipo[a.tipo] = { bultos: 0, credit: 0 };
      byTipo[a.tipo].bultos += a.quantity;
      byTipo[a.tipo].credit += Number(a.credit_amount);
    }

    return { totalBultos, totalCredit, pctReturn, mermaBultos, mermaValue, topSkus, byTipo };
  }, [adjustments, salesTotal]);

  const filtered = useMemo(() => {
    let list = adjustments;
    if (tipoFilter !== "all") list = list.filter((a) => a.tipo === tipoFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          (a.products?.clave ?? "").toLowerCase().includes(q) ||
          (a.products?.name ?? "").toLowerCase().includes(q) ||
          (a.orders?.order_code ?? "").toLowerCase().includes(q) ||
          (a.clients?.name ?? "").toLowerCase().includes(q) ||
          (a.notes ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [adjustments, tipoFilter, search]);

  const rangeLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return "todo el tiempo";
    if (dateFrom && dateTo) {
      try {
        return `${format(parseLocalDate(dateFrom), "d MMM", { locale: es })} — ${format(parseLocalDate(dateTo), "d MMM yyyy", { locale: es })}`;
      } catch { return "rango personalizado"; }
    }
    if (dateFrom) {
      if (dateFrom === firstOfMonth() && !dateTo) return "este mes";
      try { return `desde ${format(parseLocalDate(dateFrom), "d MMM yyyy", { locale: es })}`; }
      catch { return "rango personalizado"; }
    }
    try { return `hasta ${format(parseLocalDate(dateTo), "d MMM yyyy", { locale: es })}`; }
    catch { return "rango personalizado"; }
  }, [dateFrom, dateTo]);

  return (
    <div className="relative min-h-screen">
      <AnimatedGridPattern className="fixed inset-0 opacity-20 pointer-events-none" />
      <div className="relative z-10 space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Devoluciones</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Devoluciones, faltantes y mermas. Cada ajuste reduce el total pagado del pedido.
              </p>
            </div>
            <ChronoBar
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
            />
          </div>
        </div>

        {/* Primary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Bultos ajustados</span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className="text-2xl font-bold text-foreground">{stats.totalBultos.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{rangeLabel}</p>
                </>
              )}
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-red-500" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">$ Acreditado</span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className="text-2xl font-bold text-red-500">−{fmtMXN(stats.totalCredit)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">descuento en pedidos</p>
                </>
              )}
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">% Devolución</span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className={cn(
                    "text-2xl font-bold",
                    stats.pctReturn > 5 ? "text-red-500" : stats.pctReturn > 2 ? "text-amber-500" : "text-emerald-500"
                  )}>
                    {stats.pctReturn.toFixed(2)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">de ventas {rangeLabel}</p>
                </>
              )}
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertOctagon className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Merma</span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className="text-2xl font-bold text-orange-500">{stats.mermaBultos.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">bultos · {fmtMXN(stats.mermaValue)}</p>
                </>
              )}
            </div>
          </GlowCard>
        </div>

        {/* Breakdown by tipo + Top 5 SKUs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GlowCard>
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Desglose por tipo
              </h3>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {(Object.keys(tipoConfig) as Array<keyof typeof tipoConfig>).map((t) => {
                    const cfg = tipoConfig[t];
                    const Icon = cfg.icon;
                    const data = stats.byTipo[t] ?? { bultos: 0, credit: 0 };
                    return (
                      <div key={t} className={cn("flex items-center gap-3 p-2.5 rounded-lg border", cfg.bg)}>
                        <Icon className={cn("h-4 w-4 shrink-0", cfg.color)} />
                        <span className="text-sm font-medium flex-1">{cfg.label}</span>
                        <span className="text-xs text-muted-foreground">{data.bultos} bultos</span>
                        <span className={cn("text-sm font-semibold tabular-nums w-24 text-right", cfg.color)}>
                          {fmtMXN(data.credit)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </GlowCard>

          <GlowCard>
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Top 5 SKUs con más devoluciones
              </h3>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : stats.topSkus.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Sin ajustes {rangeLabel}
                </p>
              ) : (
                <div className="space-y-2">
                  {stats.topSkus.map((sku, i) => (
                    <div key={sku.clave} className="flex items-center gap-3 p-2 rounded-md border border-border bg-card/50">
                      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs text-primary">{sku.clave}</p>
                        <p className="text-xs text-muted-foreground truncate">{sku.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{sku.bultos} bultos</p>
                        <p className="text-[10px] text-muted-foreground">{fmtMXN(sku.credit)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlowCard>
        </div>

        {/* Filters */}
        <GlowCard>
          <div className="p-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por SKU, pedido, cliente o nota..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as TipoFilter)}>
              <SelectTrigger className="w-full sm:w-[200px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="devolucion_buena">Devolución (buena)</SelectItem>
                <SelectItem value="devolucion_danada">Devolución (dañada)</SelectItem>
                <SelectItem value="perdida_total">Pérdida total</SelectItem>
                <SelectItem value="faltante">Faltante</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{filtered.length} ajustes</span>
          </div>
        </GlowCard>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <GlowCard>
            <div className="text-center py-16">
              <Undo2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {adjustments.length === 0
                  ? `Sin ajustes ${rangeLabel}`
                  : "Sin resultados con los filtros actuales"}
              </p>
              {adjustments.length === 0 && (
                <p className="text-xs text-muted-foreground/70 mt-2">
                  Registra devoluciones y faltantes desde el detalle del pedido.
                </p>
              )}
            </div>
          </GlowCard>
        ) : (
          <div className="space-y-2">
            {filtered.map((adj) => {
              const cfg = tipoConfig[adj.tipo];
              const Icon = cfg.icon;
              const destinoLabel = adj.tipo === "faltante"
                ? adj.faltante_destino === "bodega" ? " · Quedó en bodega" : " · Perdido en camino"
                : "";

              return (
                <div
                  key={adj.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors",
                    cfg.bg
                  )}
                  onClick={() => navigate(`/orders?openOrder=${adj.order_id}`)}
                >
                  <Icon className={cn("h-4 w-4 mt-1 shrink-0", cfg.color)} />
                  <ProductThumb src={adj.products?.image_url ?? null} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-xs font-semibold", cfg.color)}>{cfg.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {adj.products?.clave}
                      </span>
                      <span className="text-sm truncate">{adj.products?.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1">
                      <ShoppingCart className="h-3 w-3" />
                      <span className="font-medium">{adj.orders?.order_code ?? "—"}</span>
                      <span>·</span>
                      <span>{adj.clients?.name ?? "—"}</span>
                      <span>·</span>
                      <span>{adj.quantity} bultos × {fmtMXN(Number(adj.unit_price))}</span>
                      {destinoLabel && <span className="text-muted-foreground/80">{destinoLabel}</span>}
                    </div>
                    {adj.notes && (
                      <p className="text-xs text-muted-foreground/70 italic mt-0.5">{adj.notes}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <div className="text-sm font-bold text-red-400 tabular-nums">
                      −{fmtMXN(Number(adj.credit_amount))}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {(() => {
                        try {
                          if (!adj.created_at) return "";
                          const d = new Date(adj.created_at);
                          if (isNaN(d.getTime())) return "";
                          return format(d, "d MMM yyyy", { locale: es });
                        } catch { return ""; }
                      })()}
                    </div>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="Editar ajuste"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAdjustment(adj);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        title="Eliminar ajuste"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingAdjustment(adj);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit ajuste dialog */}
      <RegistrarAjusteDialog
        orderId={editingAdjustment?.order_id ?? null}
        open={!!editingAdjustment}
        onOpenChange={(o) => { if (!o) setEditingAdjustment(null); }}
        editingAdjustment={editingAdjustment}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deletingAdjustment}
        onOpenChange={(o) => { if (!o) setDeletingAdjustment(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este ajuste?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingAdjustment && (
                <>
                  Se eliminará el ajuste de <strong>{deletingAdjustment.quantity} bultos</strong>
                  {deletingAdjustment.products?.name ? <> de <strong>{deletingAdjustment.products.name}</strong></> : null}
                  {" "}del pedido <strong>{deletingAdjustment.orders?.order_code ?? "—"}</strong>
                  {" "}y se revertirán los efectos en stock y pedido. Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!deletingAdjustment) return;
                deleteMutation.mutate(deletingAdjustment, {
                  onSuccess: () => setDeletingAdjustment(null),
                });
              }}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
