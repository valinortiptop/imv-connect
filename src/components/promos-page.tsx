import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Plus, Pencil, Trash2, Tag, CalendarIcon, Package,
  TrendingDown, ArrowRight, ExternalLink, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const fmtMXN = (v: number) => mxnFmt.format(v);

interface Promo {
  id: string;
  product_id: string;
  base_product_id: string | null;
  promo_clave: string;
  promo_name: string;
  promo_cost_without_iva: number;
  promo_cost_with_iva: number;
  promo_weight_kg: number;
  supplier: string | null;
  valid_from: string;
  valid_to: string;
  active: boolean;
  notes: string | null;
  created_at: string;
}

interface Product {
  id: string;
  clave: string;
  name: string;
  weight_kg: number;
  supplier: string;
  sale_price_with_iva: number;
  cost_with_iva: number;
  cost_without_iva: number;
  image_url?: string | null;
}

type PromoForm = {
  product_id: string;
  base_product_id: string;
  promo_clave: string;
  promo_name: string;
  promo_cost_without_iva: string;
  promo_cost_with_iva: string;
  promo_weight_kg: string;
  supplier: string;
  valid_from: Date | undefined;
  valid_to: Date | undefined;
  notes: string;
};

const emptyForm: PromoForm = {
  product_id: "",
  base_product_id: "",
  promo_clave: "",
  promo_name: "",
  promo_cost_without_iva: "",
  promo_cost_with_iva: "",
  promo_weight_kg: "",
  supplier: "",
  valid_from: undefined,
  valid_to: undefined,
  notes: "",
};

function parseLocalDate(d: string) {
  return new Date(d + "T12:00:00");
}

function dateToString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPromoStatus(promo: Promo): "active" | "upcoming" | "expired" {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const from = parseLocalDate(promo.valid_from);
  const to = parseLocalDate(promo.valid_to);
  if (!promo.active) return "expired";
  if (today < from) return "upcoming";
  if (today > to) return "expired";
  return "active";
}

function getFirstOfMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function Promos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "upcoming" | "expired">("all");
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState("");
  const setThisMonth = () => { setDateFrom(getFirstOfMonth()); setDateTo(""); };
  const setAllTime = () => { setDateFrom(""); setDateTo(""); };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
  const [form, setForm] = useState<PromoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch promos
  const { data: promos = [], isLoading } = useQuery({
    queryKey: ["promos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_promotions")
        .select("*")
        // Stable sort by row creation time so toggling filters doesn't
        // shuffle items around. New promos appear at the top because
        // created_at defaults to now().
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Promo[];
    },
  });

  // Fetch products for dropdown
  const { data: products = [] } = useQuery({
    queryKey: ["products-for-promos"],
    queryFn: async () => {
      // Don't filter by active — promos can reference inactive/discontinued
      // products, and they still need to render in the table.
      const { data, error } = await supabase
        .from("v_products_with_stock")
        .select("id, clave, name, weight_kg, supplier, sale_price_with_iva, cost_with_iva, cost_without_iva, active, image_url")
        .order("clave");
      if (error) throw error;
      return data as Product[];
    },
  });

  // Build product map
  const productMap = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  // Filter & search
  const filtered = useMemo(() => {
    return promos.filter(p => {
      const status = getPromoStatus(p);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const prod = productMap[p.product_id];
        const searchStr = `${p.promo_clave} ${p.promo_name} ${prod?.clave ?? ""} ${prod?.name ?? ""} ${p.supplier ?? ""}`.toLowerCase();
        if (!searchStr.includes(q)) return false;
      }
      // Date range filter: promo overlaps with selected range
      if (dateFrom && p.valid_to < dateFrom) return false;
      if (dateTo && p.valid_from > dateTo) return false;
      return true;
    });
  }, [promos, statusFilter, search, productMap, dateFrom, dateTo]);

  // Stats
  const stats = useMemo(() => {
    const active = promos.filter(p => getPromoStatus(p) === "active").length;
    const upcoming = promos.filter(p => getPromoStatus(p) === "upcoming").length;
    const avgSavings = promos.filter(p => getPromoStatus(p) === "active").reduce((sum, p) => {
      const base = p.base_product_id ? productMap[p.base_product_id] : null;
      if (!base || !base.cost_with_iva || !base.weight_kg) return sum;
      const baseCostKg = base.cost_with_iva / base.weight_kg;
      const promoCostKg = p.promo_cost_with_iva / p.promo_weight_kg;
      return sum + ((baseCostKg - promoCostKg) / baseCostKg * 100);
    }, 0);
    const activeCount = promos.filter(p => getPromoStatus(p) === "active").length;
    return { active, upcoming, avgSavings: activeCount > 0 ? avgSavings / activeCount : 0 };
  }, [promos, productMap]);

  const openNew = () => {
    setEditingPromo(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (promo: Promo) => {
    setEditingPromo(promo);
    setForm({
      product_id: promo.product_id,
      base_product_id: promo.base_product_id ?? "",
      promo_clave: promo.promo_clave,
      promo_name: promo.promo_name,
      promo_cost_without_iva: String(promo.promo_cost_without_iva),
      promo_cost_with_iva: String(promo.promo_cost_with_iva),
      promo_weight_kg: String(promo.promo_weight_kg),
      supplier: promo.supplier ?? "",
      valid_from: parseLocalDate(promo.valid_from),
      valid_to: parseLocalDate(promo.valid_to),
      notes: promo.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.product_id || !form.promo_clave || !form.valid_from || !form.valid_to) {
      toast({ title: "Faltan campos obligatorios", variant: "destructive" });
      return;
    }
    if (form.base_product_id && form.product_id === form.base_product_id) {
      toast({
        title: "Producto promo y base no pueden ser iguales",
        description: "El producto base debe ser el SKU regular (sin bonus pack) equivalente a este promo.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        product_id: form.product_id,
        base_product_id: form.base_product_id || null,
        promo_clave: form.promo_clave.trim(),
        promo_name: form.promo_name.trim(),
        promo_cost_without_iva: parseFloat(form.promo_cost_without_iva) || 0,
        promo_cost_with_iva: parseFloat(form.promo_cost_with_iva) || 0,
        promo_weight_kg: parseFloat(form.promo_weight_kg) || 0,
        supplier: form.supplier.trim() || null,
        valid_from: dateToString(form.valid_from),
        valid_to: dateToString(form.valid_to),
        notes: form.notes.trim() || null,
        active: true,
      };

      if (editingPromo) {
        // If the user is bringing an expired promo back to life (extending
        // valid_to past today, or reactivating it), bump created_at so it
        // jumps to the top of the list.
        const wasExpired = getPromoStatus(editingPromo) === "expired";
        const willBeActive =
          payload.active &&
          new Date(payload.valid_to) >= new Date(new Date().toDateString()) &&
          new Date(payload.valid_from) <= new Date(new Date().toDateString());
        if (wasExpired && willBeActive) {
          (payload as any).created_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from("product_promotions")
          .update(payload)
          .eq("id", editingPromo.id);
        if (error) throw error;
        toast({ title: "Promoción actualizada" });
      } else {
        const { error } = await supabase
          .from("product_promotions")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Promoción creada" });
      }

      // Promo products are end-of-life when their promo expires. Flag the
      // underlying product so the hourly auto-deactivation job knows it
      // should turn off once valid_to passes (no other valid promos).
      // User can untick this from the product edit dialog if they want
      // to keep selling it as a regular product after the promo ends.
      await (supabase as any)
        .from("products")
        .update({ expires_with_promo: true, active: true })
        .eq("id", form.product_id);

      queryClient.invalidateQueries({ queryKey: ["promos"] });
      queryClient.invalidateQueries({ queryKey: ["active-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-catalog"] });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("product_promotions").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Promoción eliminada" });
      queryClient.invalidateQueries({ queryKey: ["promos"] });
      queryClient.invalidateQueries({ queryKey: ["active-promotions"] });
    }
    setDeleteId(null);
  };

  const handleToggleActive = async (promo: Promo) => {
    const { error } = await supabase
      .from("product_promotions")
      .update({ active: !promo.active })
      .eq("id", promo.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["promos"] });
      queryClient.invalidateQueries({ queryKey: ["active-promotions"] });
    }
  };

  // Auto-calc cost_with_iva when cost_without_iva changes
  const updateCostWithoutIva = (val: string) => {
    const num = parseFloat(val);
    setForm(f => ({
      ...f,
      promo_cost_without_iva: val,
      promo_cost_with_iva: !isNaN(num) ? (num * 1.16).toFixed(2) : f.promo_cost_with_iva,
    }));
  };

  // Auto-fill supplier when product selected
  const handleProductChange = (productId: string) => {
    const p = productMap[productId];
    setForm(f => {
      // Auto-seed promo_clave + promo_weight_kg + supplier from the
      // picked product. The user can still override either field after,
      // but pre-filling stops them from drifting when the product
      // changes (and from being empty by accident).
      const claveAlreadyEdited = f.promo_clave && p && f.promo_clave !== p.clave;
      const weightAlreadyEdited = f.promo_weight_kg && p && parseFloat(f.promo_weight_kg) !== (p.weight_kg ?? 0);
      return {
        ...f,
        product_id: productId,
        supplier: p?.supplier ?? f.supplier,
        promo_clave: claveAlreadyEdited ? f.promo_clave : (p?.clave ?? f.promo_clave),
        promo_weight_kg: weightAlreadyEdited ? f.promo_weight_kg : (p?.weight_kg ? String(p.weight_kg) : f.promo_weight_kg),
      };
    });
  };

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedGridPattern className="fixed inset-0 opacity-30" />
      <div className="relative z-10 space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Promociones</h1>
            <p className="text-sm text-muted-foreground">Gestión de promociones mensuales de proveedores</p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva promoción
          </Button>
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={!dateFrom && !dateTo ? "default" : "outline"} onClick={setAllTime}>
              Todo el tiempo
            </Button>
            <Button size="sm" variant={dateFrom === getFirstOfMonth() && !dateTo ? "default" : "outline"} onClick={setThisMonth}>
              Este mes
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Desde</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-normal">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateFrom ? format(parseLocalDate(dateFrom), "dd/MM/yy") : "Seleccionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" locale={es} selected={dateFrom ? parseLocalDate(dateFrom) : undefined} onSelect={d => { if (d) setDateFrom(dateToString(d)); }} />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">Hasta</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-normal">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateTo ? format(parseLocalDate(dateTo), "dd/MM/yy") : "Seleccionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" locale={es} selected={dateTo ? parseLocalDate(dateTo) : undefined} onSelect={d => { if (d) setDateTo(dateToString(d)); }} />
              </PopoverContent>
            </Popover>
          </div>
          {(dateFrom || dateTo) && dateFrom !== getFirstOfMonth() && (
            <Button variant="ghost" size="sm" onClick={setThisMonth}>Limpiar</Button>
          )}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <GlowCard>
            <div className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><Tag className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Promos activas</p>
              </div>
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><CalendarIcon className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.upcoming}</p>
                <p className="text-xs text-muted-foreground">Próximas</p>
              </div>
            </div>
          </GlowCard>
        </div>

        {/* Search + status filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por SKU, producto, proveedor..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="active">Activas</SelectItem>
              <SelectItem value="upcoming">Próximas</SelectItem>
              <SelectItem value="expired">Expiradas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── Mobile: Card view ── */}
        {isLoading ? (
          <div className="space-y-3 md:hidden">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 md:hidden">
            <p className="text-muted-foreground">
              No hay promociones {statusFilter !== "all" ? `con estado "${statusFilter}"` : ""}
            </p>
          </div>
        ) : (
          <div className="space-y-3 md:hidden">
            {filtered.map(promo => {
              const promoProduct = productMap[promo.product_id];
              const status = getPromoStatus(promo);
              const promoSalePrice = promoProduct?.sale_price_with_iva ?? 0;
              return (
                <div
                  key={promo.id}
                  className={cn(
                    "rounded-lg border bg-card p-4 space-y-3 cursor-pointer active:bg-muted/50 transition-colors",
                    !promo.active && "opacity-50"
                  )}
                  onClick={() => openEdit(promo)}
                >
                  {/* Row 1: SKU + Status badge */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-primary text-sm font-semibold">{promo.promo_clave}</span>
                    {status === "active" && (
                      <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">Activa</Badge>
                    )}
                    {status === "upcoming" && (
                      <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-xs">Próxima</Badge>
                    )}
                    {status === "expired" && (
                      <Badge variant="secondary" className="opacity-60 text-xs">Expirada</Badge>
                    )}
                  </div>
                  {/* Row 2: Promo name */}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      {promo.promo_name}
                    </span>
                  </div>
                  {/* Row 3: Product name + thumbnail */}
                  <div className="flex items-center gap-2 min-w-0">
                    <ProductThumb src={promoProduct?.image_url ?? null} size="sm" />
                    <p className="text-sm text-foreground font-medium truncate flex-1">{promoProduct?.name ?? "—"}</p>
                  </div>
                  {/* Row 4: Key numbers */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Peso: </span>
                      <span className="text-foreground">{promo.promo_weight_kg}kg</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Costo+IVA: </span>
                      <span className="text-foreground font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMXN(promo.promo_cost_with_iva)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Precio venta: </span>
                      <span className="text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMXN(promoSalePrice)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Vigencia: </span>
                      <span className="text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {format(parseLocalDate(promo.valid_from), "dd/MM/yy")} — {format(parseLocalDate(promo.valid_to), "dd/MM/yy")}
                      </span>
                    </div>
                  </div>
                  {/* Row 5: Actions */}
                  <div className="flex items-center justify-end gap-1 pt-1 border-t border-border">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEdit(promo); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); setDeleteId(promo.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Desktop: Table ── */}
        <GlowCard className="overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground w-[90px]">SKU</TableHead>
                  <TableHead className="text-muted-foreground">Producto</TableHead>
                  <TableHead className="text-muted-foreground w-[180px]">Promoción</TableHead>
                  <TableHead className="text-muted-foreground text-center w-[80px]">Peso</TableHead>
                  <TableHead className="text-muted-foreground text-center w-[100px]">Costo+IVA</TableHead>
                  <TableHead className="text-muted-foreground text-center w-[90px]">Precio venta</TableHead>
                  <TableHead className="text-muted-foreground text-center w-[80px]">Estado</TableHead>
                  <TableHead className="text-muted-foreground text-center w-[160px]">Vigencia</TableHead>
                  <TableHead className="text-muted-foreground text-center w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      No hay promociones {statusFilter !== "all" ? `con estado "${statusFilter}"` : ""}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(promo => {
                    const promoProduct = productMap[promo.product_id];
                    const status = getPromoStatus(promo);
                    const promoSalePrice = promoProduct?.sale_price_with_iva ?? 0;

                    return (
                      <TableRow key={promo.id} className={cn("border-border", !promo.active && "opacity-50")}>
                        <TableCell className="font-mono text-primary font-medium text-sm">{promo.promo_clave}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            <ProductThumb src={promoProduct?.image_url ?? null} size="sm" />
                            <span className="text-foreground text-sm truncate max-w-[250px]">{promoProduct?.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
                            {promo.promo_name}
                          </span>
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-sm">{promo.promo_weight_kg}kg</TableCell>
                        <TableCell className="text-center tabular-nums text-sm font-medium">{fmtMXN(promo.promo_cost_with_iva)}</TableCell>
                        <TableCell className="text-center tabular-nums text-sm font-medium">{fmtMXN(promoSalePrice)}</TableCell>
                        <TableCell className="text-center">
                          {status === "active" && (
                            <Badge className="bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25 cursor-pointer" onClick={() => handleToggleActive(promo)}>Activa</Badge>
                          )}
                          {status === "upcoming" && (
                            <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25 cursor-pointer" onClick={() => handleToggleActive(promo)}>Próxima</Badge>
                          )}
                          {status === "expired" && (
                            <Badge variant="secondary" className="cursor-pointer opacity-60" onClick={() => handleToggleActive(promo)}>Expirada</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {format(parseLocalDate(promo.valid_from), "dd/MM/yy")} — {format(parseLocalDate(promo.valid_to), "dd/MM/yy")}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(promo)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(promo.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </GlowCard>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPromo ? "Editar promoción" : "Nueva promoción"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <Label>Producto promo (con bonus) *</Label>
              <Select value={form.product_id} onValueChange={handleProductChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar el SKU con bonus pack" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs">{p.clave}</span> — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                El SKU que vendes <span className="font-semibold text-foreground">durante la promo</span> (típicamente con +kg, p.ej. 23kg).
                {productMap[form.product_id] && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => navigate(`/products?search=${encodeURIComponent(productMap[form.product_id]!.clave)}`)}
                      className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      Editar nombre <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                  </>
                )}
              </p>
            </div>
            <div>
              <Label>Producto regular (sin promo)</Label>
              <Select
                value={form.base_product_id || "__none__"}
                onValueChange={v => setForm(f => ({ ...f, base_product_id: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger className={cn(
                  "mt-1",
                  form.product_id && form.base_product_id && form.product_id === form.base_product_id
                    && "border-red-500/60 focus-visible:ring-red-500/30",
                )}>
                  <SelectValue placeholder="Seleccionar el SKU sin promo (equivalente regular)" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="__none__">— Ninguno —</SelectItem>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs">{p.clave}</span> — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.product_id && form.base_product_id && form.product_id === form.base_product_id ? (
                <p className="text-[11px] text-red-400 mt-1 leading-tight flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  No puede ser el mismo SKU. El base es el producto equivalente <em>sin</em> bonus pack.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                  El SKU sin promo, para que el sistema sepa qué producto sustituye esta promoción.
                </p>
              )}
            </div>
            <div>
              <Label>SKU Promo *</Label>
              <Input className="mt-1" value={form.promo_clave} onChange={e => setForm(f => ({ ...f, promo_clave: e.target.value }))} placeholder="MX000627" />
            </div>
            <div>
              <Label>Nombre promoción</Label>
              <Input className="mt-1" value={form.promo_name} onChange={e => setForm(f => ({ ...f, promo_name: e.target.value }))} placeholder="Bonus Pack +15%" />
            </div>
            <div>
              <Label>Costo sin IVA</Label>
              <Input className="mt-1" type="number" step="0.01" value={form.promo_cost_without_iva} onChange={e => updateCostWithoutIva(e.target.value)} placeholder="570.26" />
            </div>
            <div>
              <Label>Costo con IVA</Label>
              <Input className="mt-1" type="number" step="0.01" value={form.promo_cost_with_iva} onChange={e => setForm(f => ({ ...f, promo_cost_with_iva: e.target.value }))} placeholder="661.50" />
            </div>
            <div>
              <Label>Peso promo (kg)</Label>
              <Input className="mt-1" type="number" step="0.01" value={form.promo_weight_kg} onChange={e => setForm(f => ({ ...f, promo_weight_kg: e.target.value }))} placeholder="23" />
            </div>
            <div>
              <Label>Proveedor</Label>
              <Input className="mt-1" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="ADM" />
            </div>
            <div>
              <Label>Válido desde *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !form.valid_from && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.valid_from ? format(form.valid_from, "dd/MM/yyyy") : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.valid_from} onSelect={d => { if (d) setForm(f => ({ ...f, valid_from: d })); }} locale={es} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Válido hasta *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !form.valid_to && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.valid_to ? format(form.valid_to, "dd/MM/yyyy") : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.valid_to} onSelect={d => { if (d) setForm(f => ({ ...f, valid_to: d })); }} locale={es} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="col-span-2">
              <Label>Notas</Label>
              <Input className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Descripción completa del producto promo" />
            </div>
            {/* Preview */}
            {form.product_id && form.promo_weight_kg && form.promo_cost_with_iva && (
              <div className="col-span-2 rounded-lg border border-border p-3 bg-muted/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Vista previa</p>
                {(() => {
                  const promoProduct = productMap[form.product_id];
                  const base = form.base_product_id ? productMap[form.base_product_id] : null;
                  const promoWt = parseFloat(form.promo_weight_kg);
                  const promoCost = parseFloat(form.promo_cost_with_iva);
                  const baseCostKg = base ? base.cost_with_iva / base.weight_kg : 0;
                  const promoCostKg = promoCost / promoWt;
                  const savings = baseCostKg > 0 ? ((baseCostKg - promoCostKg) / baseCostKg * 100) : 0;
                  const promoSalePrice = promoProduct?.sale_price_with_iva ?? 0;
                  return (
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div className="text-center">
                        <p className="text-foreground font-bold">{fmtMXN(promoCostKg)}/kg</p>
                        {base && <p className="text-xs text-muted-foreground">vs {fmtMXN(baseCostKg)}/kg</p>}
                      </div>
                      <div className="text-center">
                        {base ? (
                          <>
                            <p className="font-bold text-green-400">-{savings.toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground">ahorro</p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">Sin base</p>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-foreground">{fmtMXN(promoSalePrice)}</p>
                        <p className="text-xs text-muted-foreground">precio venta</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-foreground">{promoWt}kg</p>
                        {base && <p className="text-xs text-muted-foreground">vs {base.weight_kg}kg</p>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                Boolean(form.product_id && form.base_product_id && form.product_id === form.base_product_id)
              }
              className="gradient-button text-white"
            >
              {saving ? "Guardando..." : editingPromo ? "Guardar cambios" : "Crear promoción"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      {deleteId && (
        <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Eliminar promoción</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">¿Seguro que deseas eliminar esta promoción? Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
