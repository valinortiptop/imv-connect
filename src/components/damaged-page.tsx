// @ts-nocheck
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Package, AlertTriangle, TrendingDown, TrendingUp,
  Camera, DollarSign, Boxes, MoreVertical, Trash2, RotateCcw, Tag,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseLocalDate } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const mxnFmt2 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const fmtMXN = (v: number | null) => v == null ? "$0" : mxnFmt.format(v);

interface DamagedBatch {
  id: string;
  product_id: string;
  original_quantity: number;
  remaining_quantity: number;
  condition: "leve" | "moderado" | "severo";
  unit_price: number | null;
  cost_at_time: number | null;
  margin_pct: number | null;
  photos: string[];
  notes: string | null;
  source: string;
  source_order_id: string | null;
  status: "disponible" | "agotado" | "descartado" | "pendiente_preciar";
  created_at: string;
  // Joined product fields
  product_clave: string;
  product_name: string;
  product_image_url: string | null;
  product_supplier: string;
  product_cost_with_iva: number | null;
  product_sale_price: number | null;
  product_bonificacion_pct: number;
}

type StatusFilter = "disponible" | "agotado" | "descartado" | "pendiente_preciar" | "all";
type ConditionFilter = "leve" | "moderado" | "severo" | "all";

const conditionColors = {
  leve: "bg-amber-500/20 text-amber-600 border-amber-500/50",
  moderado: "bg-orange-500/20 text-orange-600 border-orange-500/50",
  severo: "bg-red-500/20 text-red-600 border-red-500/50",
};

const statusColors = {
  disponible: "bg-green-500/20 text-green-600 border-green-500/50",
  agotado: "bg-muted text-muted-foreground border-border",
  descartado: "bg-red-500/20 text-red-600 border-red-500/50",
  pendiente_preciar: "bg-blue-500/20 text-blue-600 border-blue-500/50",
};

export default function Damaged() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("disponible");
  const [conditionFilter, setConditionFilter] = useState<ConditionFilter>("all");
  const [previewPhotos, setPreviewPhotos] = useState<string[] | null>(null);
  const [discardBatch, setDiscardBatch] = useState<DamagedBatch | null>(null);
  const [restoreBatch, setRestoreBatch] = useState<DamagedBatch | null>(null);
  const [priceBatch, setPriceBatch] = useState<DamagedBatch | null>(null);
  const [priceInput, setPriceInput] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: batches = [], isLoading } = useQuery<DamagedBatch[]>({
    queryKey: ["damaged-batches"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("damaged_batches")
        .select(`
          id, product_id, original_quantity, remaining_quantity, condition,
          unit_price, cost_at_time, margin_pct, photos, notes, source,
          source_order_id, status, created_at,
          products!inner(clave, name, image_url, supplier, sale_price_with_iva)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as any[];
      if (rows.length === 0) return [];

      // Fetch costs + bonificacion from v_products_with_stock for the products in batches
      const productIds = [...new Set(rows.map((r) => r.product_id))];
      const { data: costs } = await supabase
        .from("v_products_with_stock")
        .select("id, cost_with_iva, bonificacion_pct")
        .in("id", productIds);
      const costMap: Record<string, number | null> = Object.fromEntries(
        (costs ?? []).map((c: any) => [c.id, c.cost_with_iva != null ? Number(c.cost_with_iva) : null])
      );
      const bonifMap: Record<string, number> = Object.fromEntries(
        (costs ?? []).map((c: any) => [c.id, c.bonificacion_pct != null ? Number(c.bonificacion_pct) : 0.07])
      );

      return rows.map((b: any) => ({
        id: b.id,
        product_id: b.product_id,
        original_quantity: b.original_quantity,
        remaining_quantity: b.remaining_quantity,
        condition: b.condition,
        unit_price: b.unit_price != null ? Number(b.unit_price) : null,
        cost_at_time: b.cost_at_time != null ? Number(b.cost_at_time) : null,
        margin_pct: b.margin_pct != null ? Number(b.margin_pct) : null,
        photos: b.photos ?? [],
        notes: b.notes,
        source: b.source,
        source_order_id: b.source_order_id,
        status: b.status,
        created_at: b.created_at,
        product_clave: b.products?.clave ?? "",
        product_name: b.products?.name ?? "",
        product_image_url: b.products?.image_url ?? null,
        product_supplier: b.products?.supplier ?? "",
        product_cost_with_iva: costMap[b.product_id] ?? null,
        product_sale_price: b.products?.sale_price_with_iva != null ? Number(b.products.sale_price_with_iva) : null,
        product_bonificacion_pct: bonifMap[b.product_id] ?? 0.07,
      }));
    },
  });

  const discardMutation = useMutation({
    mutationFn: async (batch: DamagedBatch) => {
      const { error } = await (supabase as any)
        .from("damaged_batches")
        .update({ status: "descartado" })
        .eq("id", batch.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Lote descartado", description: "El lote ya no aparecerá como disponible" });
      queryClient.invalidateQueries({ queryKey: ["damaged-batches"] });
      setDiscardBatch(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const setPriceMutation = useMutation({
    mutationFn: async ({ batch, unitPrice }: { batch: DamagedBatch; unitPrice: number }) => {
      if (unitPrice <= 0) throw new Error("El precio debe ser mayor a 0");

      // Fetch current product cost from view
      const { data: prod, error: prodErr } = await supabase
        .from("v_products_with_stock")
        .select("cost_with_iva")
        .eq("id", batch.product_id)
        .single();
      if (prodErr) throw new Error(`Producto: ${prodErr.message}`);

      const cost = (prod as any)?.cost_with_iva ?? 0;
      const margin = cost > 0 ? ((unitPrice - cost) / unitPrice) * 100 : null;

      const { error } = await (supabase as any)
        .from("damaged_batches")
        .update({
          unit_price: unitPrice,
          cost_at_time: cost,
          margin_pct: margin,
          status: "disponible",
        })
        .eq("id", batch.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Precio asignado", description: "El lote ya está disponible para la venta" });
      queryClient.invalidateQueries({ queryKey: ["damaged-batches"] });
      setPriceBatch(null);
      setPriceInput("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (batch: DamagedBatch) => {
      // Return units to regular stock and delete (or mark discarded) the batch
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      const qty = batch.remaining_quantity;
      if (qty <= 0) {
        // Nothing to restore — just discard
        const { error } = await (supabase as any)
          .from("damaged_batches")
          .update({ status: "descartado" })
          .eq("id", batch.id);
        if (error) throw error;
        return;
      }

      // Add back to regular stock via stock_adjustments
      const { data: prod, error: fetchErr } = await supabase
        .from("products")
        .select("stock_adjustment")
        .eq("id", batch.product_id)
        .single();
      if (fetchErr) throw new Error(`Fetch: ${fetchErr.message}`);

      const currentAdj = (prod as any).stock_adjustment ?? 0;
      const { error: updateErr } = await supabase
        .from("products")
        .update({ stock_adjustment: currentAdj + qty })
        .eq("id", batch.product_id);
      if (updateErr) throw new Error(`Update: ${updateErr.message}`);

      const { error: logErr } = await supabase
        .from("stock_adjustments")
        .insert({
          product_id: batch.product_id,
          quantity: qty,
          reason: `Retornado desde dañados (lote ${batch.id.slice(0, 8)})`,
          created_by: userId,
        });
      if (logErr) throw new Error(`Log: ${logErr.message}`);

      // Mark batch as descartado (so it doesn't double-count)
      const { error: batchErr } = await (supabase as any)
        .from("damaged_batches")
        .update({ status: "descartado", remaining_quantity: 0 })
        .eq("id", batch.id);
      if (batchErr) throw new Error(`Lote: ${batchErr.message}`);
    },
    onSuccess: () => {
      toast({ title: "Stock restaurado", description: "Los bultos regresaron al inventario normal" });
      queryClient.invalidateQueries({ queryKey: ["damaged-batches"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      setRestoreBatch(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Resolve photo URLs (public URL from storage)
  const getPhotoUrl = (path: string): string => {
    const { data } = supabase.storage.from("damaged-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  const filtered = useMemo(() => {
    let list = batches;
    if (statusFilter !== "all") list = list.filter(b => b.status === statusFilter);
    if (conditionFilter !== "all") list = list.filter(b => b.condition === conditionFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.product_clave.toLowerCase().includes(q) ||
        b.product_name.toLowerCase().includes(q) ||
        (b.notes ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [batches, statusFilter, conditionFilter, search]);

  // Stats — based on disponible batches only (priced).
  // Ganancia is REAL: sin-IVA and con bonificación (matches v_products_with_stock convention).
  const stats = useMemo(() => {
    const available = batches.filter(b => b.status === "disponible");
    const pendiente = batches.filter(b => b.status === "pendiente_preciar");
    const totalBatches = available.length;
    const totalBultos = available.reduce((s, b) => s + b.remaining_quantity, 0);
    // Revenue shown c/IVA (what customer pays total)
    const totalPotentialRevenue = available.reduce((s, b) => s + (b.unit_price ?? 0) * b.remaining_quantity, 0);
    // Real cost per bulto sin-IVA, con bonif: cost_at_time / 1.16 × (1 - bonif)
    const totalValueAtRealCost = available.reduce((s, b) => {
      const cost = b.cost_at_time ?? 0;
      const bonif = b.product_bonificacion_pct;
      return s + (cost / 1.16) * (1 - bonif) * b.remaining_quantity;
    }, 0);
    // Real profit sin-IVA (revenue sin-IVA − real cost sin-IVA con bonif)
    const totalRealProfit = available.reduce((s, b) => {
      const price = b.unit_price ?? 0;
      const cost = b.cost_at_time ?? 0;
      const bonif = b.product_bonificacion_pct;
      const realPriceSinIva = price / 1.16;
      const realCostSinIva = (cost / 1.16) * (1 - bonif);
      return s + (realPriceSinIva - realCostSinIva) * b.remaining_quantity;
    }, 0);
    // Avg real margin % weighted by bultos
    const avgMargin = totalBultos > 0
      ? available.reduce((s, b) => {
          const price = b.unit_price ?? 0;
          const cost = b.cost_at_time ?? 0;
          const bonif = b.product_bonificacion_pct;
          const psi = price / 1.16;
          const csi = (cost / 1.16) * (1 - bonif);
          const realM = psi > 0 ? ((psi - csi) / psi) * 100 : 0;
          return s + realM * b.remaining_quantity;
        }, 0) / totalBultos
      : 0;
    const pendienteCount = pendiente.length;
    const pendienteBultos = pendiente.reduce((s, b) => s + b.remaining_quantity, 0);
    return {
      totalBatches, totalBultos,
      totalValueAtCost: totalValueAtRealCost,
      totalPotentialRevenue,
      totalPotentialProfit: totalRealProfit,
      avgMargin, pendienteCount, pendienteBultos,
    };
  }, [batches]);

  return (
    <div className="relative min-h-screen">
      <AnimatedGridPattern className="fixed inset-0 opacity-20 pointer-events-none" />
      <div className="relative z-10 space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dañados</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bultos dañados a precio de recuperación. Se venden por lotes separados en los pedidos.
          </p>
        </div>

        {/* Pendientes banner */}
        {!isLoading && stats.pendienteCount > 0 && (
          <div
            className="flex items-center gap-3 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 cursor-pointer hover:bg-blue-500/10 transition-colors"
            onClick={() => setStatusFilter("pendiente_preciar")}
          >
            <Tag className="h-5 w-5 text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-600">
                {stats.pendienteCount} {stats.pendienteCount === 1 ? "lote" : "lotes"} pendientes de precio
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.pendienteBultos} bultos devueltos esperando precio para ponerse a la venta
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Lotes disponibles</span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-20 bg-muted" /> : (
                <p className="text-2xl font-bold text-foreground">{stats.totalBatches}</p>
              )}
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Boxes className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Bultos dañados</span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-20 bg-muted" /> : (
                <p className="text-2xl font-bold text-orange-500">{stats.totalBultos.toLocaleString()}</p>
              )}
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Ingreso potencial (c/IVA)</span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-20 bg-muted" /> : (
                <p className="text-2xl font-bold text-foreground">{fmtMXN(stats.totalPotentialRevenue)}</p>
              )}
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                {stats.totalPotentialProfit >= 0
                  ? <TrendingUp className="h-4 w-4 text-green-500" />
                  : <TrendingDown className="h-4 w-4 text-red-500" />}
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Ganancia con bonif ({stats.avgMargin.toFixed(1)}%)
                </span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-20 bg-muted" /> : (
                <p className={cn(
                  "text-2xl font-bold",
                  stats.totalPotentialProfit >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {stats.totalPotentialProfit >= 0 ? "+" : ""}{fmtMXN(stats.totalPotentialProfit)}
                </p>
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
                placeholder="Buscar por SKU, producto o nota..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-full sm:w-[160px] bg-background">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disponible">Disponibles</SelectItem>
                <SelectItem value="pendiente_preciar">Pendientes de precio</SelectItem>
                <SelectItem value="agotado">Agotados</SelectItem>
                <SelectItem value="descartado">Descartados</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={conditionFilter} onValueChange={(v) => setConditionFilter(v as ConditionFilter)}>
              <SelectTrigger className="w-full sm:w-[160px] bg-background">
                <SelectValue placeholder="Condición" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las condiciones</SelectItem>
                <SelectItem value="leve">Leve</SelectItem>
                <SelectItem value="moderado">Moderado</SelectItem>
                <SelectItem value="severo">Severo</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{filtered.length} lotes</span>
          </div>
        </GlowCard>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <GlowCard key={i}>
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4 bg-muted" />
                  <Skeleton className="h-24 w-full bg-muted" />
                  <Skeleton className="h-4 w-full bg-muted" />
                  <Skeleton className="h-4 w-2/3 bg-muted" />
                </div>
              </GlowCard>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <GlowCard>
            <div className="text-center py-16">
              <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {batches.length === 0
                  ? "Aún no hay bultos dañados registrados"
                  : "Sin resultados con los filtros actuales"}
              </p>
              {batches.length === 0 && (
                <p className="text-xs text-muted-foreground/70 mt-2">
                  Desde Inventario, usa "Marcar como dañado" para mover bultos al pool de recuperación.
                </p>
              )}
            </div>
          </GlowCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(batch => {
              const unitPrice = batch.unit_price ?? 0;
              const costAtTime = batch.cost_at_time ?? 0;
              const bonif = batch.product_bonificacion_pct;
              // Real (sin-IVA, con bonif) numbers for margin + profit
              const priceSinIva = unitPrice / 1.16;
              const costRealSinIva = (costAtTime / 1.16) * (1 - bonif);
              const realMarginPct = priceSinIva > 0
                ? ((priceSinIva - costRealSinIva) / priceSinIva) * 100 : 0;
              const realProfitPerBulto = priceSinIva - costRealSinIva;
              const remainingProfit = realProfitPerBulto * batch.remaining_quantity;
              const isLoss = realMarginPct < 0;
              const soldQty = batch.original_quantity - batch.remaining_quantity;
              const isAgotado = batch.status === "agotado";
              const isDescartado = batch.status === "descartado";
              const isPendiente = batch.status === "pendiente_preciar";

              return (
                <GlowCard key={batch.id}>
                  <div className={cn(
                    "p-4 space-y-3 rounded-lg",
                    isDescartado && "opacity-60"
                  )}>
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <ProductThumb src={batch.product_image_url} size="lg" />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-medium text-primary">{batch.product_clave}</p>
                        <p className="text-sm text-foreground truncate">{batch.product_name}</p>
                        <p className="text-[11px] text-muted-foreground">{batch.product_supplier}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isPendiente && (
                            <DropdownMenuItem
                              onClick={() => {
                                setPriceBatch(batch);
                                // Suggest a default price (e.g. 80% of catalog)
                                const suggested = batch.product_sale_price
                                  ? Math.round(batch.product_sale_price * 0.8)
                                  : "";
                                setPriceInput(String(suggested));
                              }}
                            >
                              <Tag className="h-4 w-4 mr-2" />
                              Asignar precio
                            </DropdownMenuItem>
                          )}
                          {(batch.status === "disponible" || isPendiente) && batch.remaining_quantity > 0 && (
                            <DropdownMenuItem onClick={() => setRestoreBatch(batch)}>
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Regresar al stock normal
                            </DropdownMenuItem>
                          )}
                          {batch.status !== "descartado" && (
                            <DropdownMenuItem onClick={() => setDiscardBatch(batch)} className="text-red-500">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Descartar lote
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border capitalize",
                        conditionColors[batch.condition]
                      )}>
                        {batch.condition}
                      </span>
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border capitalize",
                        statusColors[batch.status]
                      )}>
                        {batch.status === "pendiente_preciar" ? "pendiente de precio" : batch.status}
                      </span>
                      {isLoss && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-red-500/10 text-red-500 border-red-500/40">
                          <TrendingDown className="h-2.5 w-2.5" />
                          Pérdida
                        </span>
                      )}
                    </div>

                    {/* Photos */}
                    {batch.photos.length > 0 && (
                      <div className="flex gap-1.5">
                        {batch.photos.slice(0, 4).map((photo, i) => (
                          <button
                            key={i}
                            onClick={() => setPreviewPhotos(batch.photos)}
                            className="h-14 w-14 rounded-md overflow-hidden border bg-muted shrink-0 hover:opacity-80 transition-opacity"
                          >
                            <img src={getPhotoUrl(photo)} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                        {batch.photos.length > 4 && (
                          <div className="h-14 w-14 rounded-md border bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0">
                            +{batch.photos.length - 4}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Quantity pill */}
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {isAgotado ? "Vendido" : "Disponible"}
                        </p>
                        <p className="text-xl font-bold text-foreground tabular-nums">
                          {batch.remaining_quantity.toLocaleString()}
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            / {batch.original_quantity.toLocaleString()} bultos
                          </span>
                        </p>
                      </div>
                      {soldQty > 0 && (
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ya vendidos</p>
                          <p className="text-sm font-semibold text-foreground tabular-nums">
                            {soldQty.toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Financials */}
                    {isPendiente ? (
                      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <Tag className="h-4 w-4 text-blue-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-blue-600">Pendiente de precio</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Devolución de pedido. Asigna precio para poder vender.
                            </p>
                          </div>
                        </div>
                        {batch.product_sale_price && (
                          <p className="text-[10px] text-muted-foreground">
                            Precio catálogo: {mxnFmt2.format(batch.product_sale_price)}
                          </p>
                        )}
                        <Button
                          size="sm"
                          className="w-full h-8"
                          onClick={() => {
                            setPriceBatch(batch);
                            const suggested = batch.product_sale_price
                              ? Math.round(batch.product_sale_price * 0.8)
                              : "";
                            setPriceInput(String(suggested));
                          }}
                        >
                          <Tag className="h-3.5 w-3.5 mr-1.5" />
                          Asignar precio
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Precio unitario:</span>
                          <span className="font-semibold tabular-nums">{mxnFmt2.format(unitPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Costo:</span>
                          <span className="tabular-nums text-muted-foreground">{mxnFmt2.format(costAtTime)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Margen con bonif:</span>
                          <span className={cn(
                            "font-semibold tabular-nums",
                            isLoss ? "text-red-500" : realMarginPct < 3 ? "text-amber-500" : "text-green-500"
                          )}>
                            {realMarginPct >= 0 ? "+" : ""}{realMarginPct.toFixed(1)}%
                          </span>
                        </div>
                        {batch.status === "disponible" && batch.remaining_quantity > 0 && (
                          <div className="flex justify-between pt-1 border-t border-border">
                            <span className="text-muted-foreground">Ganancia si se vende:</span>
                            <span className={cn(
                              "font-bold tabular-nums",
                              remainingProfit < 0 ? "text-red-500" : "text-green-500"
                            )}>
                              {remainingProfit >= 0 ? "+" : ""}{fmtMXN(remainingProfit)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    {batch.notes && (
                      <p className="text-xs text-muted-foreground italic pt-1 border-t border-border">
                        {batch.notes}
                      </p>
                    )}

                    {/* Date */}
                    <p className="text-[10px] text-muted-foreground/70">
                      {(() => {
                        try {
                          return format(parseLocalDate(batch.created_at.slice(0, 10)), "d 'de' MMM, yyyy", { locale: es });
                        } catch {
                          return batch.created_at.slice(0, 10);
                        }
                      })()}
                    </p>
                  </div>
                </GlowCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Photo preview dialog */}
      <Dialog open={!!previewPhotos} onOpenChange={(open) => !open && setPreviewPhotos(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Fotos del lote</DialogTitle>
          </DialogHeader>
          {previewPhotos && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {previewPhotos.map((p, i) => (
                <a
                  key={i}
                  href={getPhotoUrl(p)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg overflow-hidden border bg-muted hover:opacity-80 transition-opacity"
                >
                  <img src={getPhotoUrl(p)} alt="" className="w-full h-auto" />
                </a>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Discard confirmation */}
      <AlertDialog open={!!discardBatch} onOpenChange={(open) => !open && setDiscardBatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar este lote?</AlertDialogTitle>
            <AlertDialogDescription>
              El lote se marcará como descartado y ya no aparecerá como disponible. Los {discardBatch?.remaining_quantity ?? 0} bultos restantes NO regresarán al stock normal (se consideran pérdida total).
              <br /><br />
              Si quieres recuperar el stock normal, usa "Regresar al stock normal" en su lugar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => discardBatch && discardMutation.mutate(discardBatch)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Descartar lote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore confirmation */}
      <AlertDialog open={!!restoreBatch} onOpenChange={(open) => !open && setRestoreBatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Regresar al stock normal?</AlertDialogTitle>
            <AlertDialogDescription>
              Se regresarán {restoreBatch?.remaining_quantity ?? 0} bultos al inventario normal. El lote dañado se descartará. Usa esta opción si los bultos no están realmente dañados o fueron recuperados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreBatch && restoreMutation.mutate(restoreBatch)}
            >
              Regresar al stock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set price dialog */}
      <Dialog open={!!priceBatch} onOpenChange={(open) => { if (!open) { setPriceBatch(null); setPriceInput(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar precio al lote</DialogTitle>
          </DialogHeader>
          {priceBatch && (() => {
            const parsed = parseFloat(priceInput);
            const validPrice = !isNaN(parsed) && parsed > 0;
            const cost = priceBatch.product_cost_with_iva ?? 0;
            const catalogPrice = priceBatch.product_sale_price ?? 0;
            const margin = validPrice && cost > 0 ? ((parsed - cost) / parsed) * 100 : null;
            const profit = validPrice ? (parsed - cost) * priceBatch.remaining_quantity : 0;
            const discountFromCatalog = validPrice && catalogPrice > 0 ? ((parsed - catalogPrice) / catalogPrice) * 100 : null;
            const marginColor = margin == null ? "text-muted-foreground"
              : margin < 0 ? "text-red-500"
              : margin < 3 ? "text-amber-500"
              : "text-green-500";

            return (
              <div className="space-y-4 pt-2">
                {/* Product info */}
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <ProductThumb src={priceBatch.product_image_url} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-primary">{priceBatch.product_clave}</p>
                    <p className="text-sm truncate">{priceBatch.product_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {priceBatch.remaining_quantity} bultos · Condición: {priceBatch.condition}
                    </p>
                  </div>
                </div>

                {/* Reference */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2 rounded-md border border-border bg-card">
                    <p className="text-muted-foreground">Precio catálogo</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {catalogPrice > 0 ? mxnFmt2.format(catalogPrice) : "—"}
                    </p>
                  </div>
                  <div className="p-2 rounded-md border border-border bg-card">
                    <p className="text-muted-foreground">Costo c/IVA</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {cost > 0 ? mxnFmt2.format(cost) : "—"}
                    </p>
                  </div>
                </div>

                {/* Price input */}
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Precio de recuperación
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder="Ej: 180.00"
                  />
                </div>

                {/* Preview */}
                {validPrice && (
                  <div className="space-y-1.5 p-3 rounded-lg border border-primary/30 bg-primary/5 text-sm">
                    {discountFromCatalog != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">vs. catálogo:</span>
                        <span className={cn("font-medium tabular-nums", discountFromCatalog < 0 ? "text-red-400" : "text-green-400")}>
                          {discountFromCatalog >= 0 ? "+" : ""}{discountFromCatalog.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {margin != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Margen:</span>
                        <span className={cn("font-semibold tabular-nums", marginColor)}>
                          {margin >= 0 ? "+" : ""}{margin.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-primary/20">
                      <span className="text-muted-foreground">Ganancia total:</span>
                      <span className={cn("font-bold tabular-nums", profit < 0 ? "text-red-500" : "text-green-500")}>
                        {profit >= 0 ? "+" : ""}{fmtMXN(profit)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setPriceBatch(null); setPriceInput(""); }}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => priceBatch && validPrice && setPriceMutation.mutate({ batch: priceBatch, unitPrice: parsed })}
                    disabled={!validPrice || setPriceMutation.isPending}
                  >
                    {setPriceMutation.isPending ? "Guardando..." : "Asignar precio"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
