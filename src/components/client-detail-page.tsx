// @ts-nocheck
import { useState, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "@/lib/router-compat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ProductThumb } from "@/components/ui/product-thumb";
import {
  ArrowLeft, FileText, Upload, Trash2, ExternalLink, Phone, MapPin, Loader2,
  ShoppingCart, DollarSign, Receipt, Calendar, IdCard, Building2, Mail, Hash,
  Package, Tags, CreditCard, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { toast } from "sonner";
import { ClientPricesTab } from "@/components/clients/ClientPricesTab";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { ChevronRight } from "lucide-react";

const mxnFmt = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", maximumFractionDigits: 0,
});
const CLIENT_DETAIL_ORDERS_LIMIT = 100;

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
};

const SUPABASE_URL = "https://rfyshhzkhewzjudohzii.supabase.co";
/** All CFDI PDFs live in the `cfdi-documents` bucket. The legacy
 *  `client-cfdi` bucket was empty — pointing at it produced a 404 for
 *  every "Ver" link. */
const CFDI_BUCKET = "cfdi-documents";
const cfdiPublicUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/${CFDI_BUCKET}/${path}`;

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: client, isLoading } = useQuery({
    queryKey: ["client-detail", id],
    enabled: !!id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
  });

  // Resolve the client's pricing tier so the Precios tab can show
  // "Tier: Habid (-4%)" etc. in the header strip.
  const { data: clientTier } = useQuery({
    queryKey: ["client-tier", client?.price_list_id ?? null],
    enabled: !!client?.price_list_id,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_lists")
        .select("name, markup_pct")
        .eq("id", client.price_list_id)
        .single();
      if (error) throw error;
      return data as { name: string; markup_pct: number | null };
    },
  });
  const tierName = clientTier?.name ?? null;
  const tierMarkupPct = clientTier?.markup_pct ?? null;

  const { data: orders = [] } = useQuery({
    queryKey: ["client-detail-orders", id],
    enabled: !!id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("orders")
        .select("id, order_code, order_date, delivery_date, status, notes, discount_amount, discount_reason")
        .eq("client_id", id!)
        .order("order_date", { ascending: false })
        .limit(CLIENT_DETAIL_ORDERS_LIMIT);
      return data ?? [];
    },
  });

  const { data: totalOrderCount = 0 } = useQuery({
    queryKey: ["client-detail-orders-count", id],
    enabled: !!id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("client_id", id!);
      return count ?? 0;
    },
  });

  // Only fetch items for the most recent N orders to keep the KPI/Top
  // Products aggregations fast for clients with thousands of orders.
  const RECENT_ORDERS_LIMIT = 200;
  const recentOrderIds = useMemo(
    () => (orders as any[]).slice(0, RECENT_ORDERS_LIMIT).map((o) => o.id),
    [orders]
  );

  const { data: items = [] } = useQuery({
    queryKey: ["client-detail-items", id, recentOrderIds.length],
    enabled: !!id && recentOrderIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data: its } = await supabase
        .from("order_items")
        .select("order_id, quantity, product_id, unit_price_override")
        .in("order_id", recentOrderIds);
      if (!its?.length) return [];
      const pids = [...new Set(its.map((i: any) => i.product_id))];
      const { data: prods } = await supabase
        .from("products")
        .select("id, clave, name, sale_price_with_iva, image_url")
        .in("id", pids);
      const pmap = new Map((prods ?? []).map((p: any) => [p.id, p]));
      return its.map((i: any) => ({ ...i, products: pmap.get(i.product_id) ?? null }));
    },
  });



  // Totals — net of any per-order manual discount
  const orderTotals = useMemo(() => {
    const gross: Record<string, number> = {};
    for (const it of items as any[]) {
      const price = it.unit_price_override ?? it.products?.sale_price_with_iva ?? 0;
      gross[it.order_id] = (gross[it.order_id] ?? 0) + price * it.quantity;
    }
    const map: Record<string, number> = {};
    for (const o of orders as any[]) {
      const subtotal = gross[o.id] ?? 0;
      const discount = Math.min(Number(o.discount_amount) || 0, subtotal);
      map[o.id] = Math.max(0, subtotal - discount);
    }
    return map;
  }, [items, orders]);

  const totalRevenue = useMemo(
    () => Object.values(orderTotals).reduce((a, b) => a + b, 0),
    [orderTotals]
  );
  const totalBultos = useMemo(
    () => (items as any[]).reduce((s, i) => s + i.quantity, 0),
    [items]
  );
  const avgTicket = orders.length ? totalRevenue / orders.length : 0;
  const lastOrderDate = orders[0]?.order_date ?? null;

  const topProducts = useMemo(() => {
    const agg: Record<string, { name: string; clave: string; image_url: string | null; qty: number; total: number }> = {};
    for (const it of items as any[]) {
      const k = it.product_id;
      const price = it.unit_price_override ?? it.products?.sale_price_with_iva ?? 0;
      if (!agg[k]) {
        agg[k] = {
          name: it.products?.name ?? "?",
          clave: it.products?.clave ?? "",
          image_url: it.products?.image_url ?? null,
          qty: 0,
          total: 0,
        };
      }
      agg[k].qty += it.quantity;
      agg[k].total += price * it.quantity;
    }
    return Object.values(agg).sort((a, b) => b.qty - a.qty);
  }, [items]);

  // CFDI upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !client) return;
    if (file.type !== "application/pdf") {
      toast.error("Solo archivos PDF");
      return;
    }
    setUploading(true);
    try {
      // Delete old one if exists
      if (client.cfdi_pdf_path) {
        await supabase.storage.from(CFDI_BUCKET).remove([client.cfdi_pdf_path]);
      }
      const path = `${client.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage
        .from(CFDI_BUCKET)
        .upload(path, file, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase
        .from("clients")
        .update({ cfdi_pdf_path: path })
        .eq("id", client.id);
      if (updErr) throw updErr;
      toast.success("Constancia subida");
      qc.invalidateQueries({ queryKey: ["client-detail", id] });
      qc.invalidateQueries({ queryKey: ["clientes-directory"] });
    } catch (err: any) {
      toast.error(err.message ?? "Error al subir");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteCfdi = async () => {
    if (!client?.cfdi_pdf_path) return;
    if (!confirm("¿Eliminar la constancia CFDI?")) return;
    try {
      await supabase.storage.from(CFDI_BUCKET).remove([client.cfdi_pdf_path]);
      await supabase.from("clients").update({ cfdi_pdf_path: null }).eq("id", client.id);
      toast.success("Eliminada");
      qc.invalidateQueries({ queryKey: ["client-detail", id] });
    } catch (err: any) {
      toast.error(err.message ?? "Error al eliminar");
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!client) {
    return (
      <div className="p-8 text-center">
        <p>Cliente no encontrado</p>
        <Button onClick={() => navigate("/clients")} className="mt-4">Volver</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link
            to="/clients"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Clientes
          </Link>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{client.name}</h1>
              {client.company && (
                <p className="text-muted-foreground">{client.company}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                {client.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {client.phone}
                  </span>
                )}
                {client.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {client.address}
                  </span>
                )}
                {client.central && <Badge variant="outline">{client.central}</Badge>}
                {!client.active && <Badge variant="outline">Inactivo</Badge>}
              </div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            icon={<ShoppingCart className="h-5 w-5" />}
            label="Total pedidos"
            value={String(totalOrderCount || orders.length)}
            accent="blue"
          />
          <Kpi
            icon={<DollarSign className="h-5 w-5" />}
            label={totalOrderCount > orders.length ? `Facturado reciente (${orders.length})` : "Total facturado"}
            value={mxnFmt.format(totalRevenue)}
            accent="emerald"
          />
          <Kpi
            icon={<Receipt className="h-5 w-5" />}
            label={totalOrderCount > orders.length ? "Ticket promedio reciente" : "Ticket promedio"}
            value={mxnFmt.format(avgTicket)}
            accent="amber"
          />
          <Kpi
            icon={<Calendar className="h-5 w-5" />}
            label="Último pedido"
            value={fmtDate(lastOrderDate)}
            accent="purple"
          />
        </div>

        <Tabs defaultValue="resumen">
          {/* Equal-width grid so the 6 tabs spread across the full row
              and each gets the same horizontal real estate — no more
              cramped cluster in the middle with whitespace on either
              side. Gap-2 keeps clear separation between buttons. */}
          <TabsList className="w-full grid grid-cols-3 md:grid-cols-6 h-auto gap-2 p-2 bg-muted/40">
            <TabsTrigger value="resumen" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5 rounded-md text-sm font-medium">Resumen</TabsTrigger>
            <TabsTrigger value="pedidos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5 rounded-md text-sm font-medium">Pedidos ({totalOrderCount || orders.length})</TabsTrigger>
            <TabsTrigger value="productos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5 rounded-md text-sm font-medium">Productos</TabsTrigger>
            <TabsTrigger value="precios" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5 rounded-md text-sm font-medium">Precios</TabsTrigger>
            <TabsTrigger value="cfdi" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5 rounded-md text-sm font-medium">CFDI</TabsTrigger>
            <TabsTrigger value="datos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5 rounded-md text-sm font-medium">Datos</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="space-y-6 mt-6">
            {/* Información Fiscal — bigger card, two-column grid with PROPER
                horizontal gap, vertical Row (label above value) for breathing
                room, color-coded icons per field. */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-5 pb-3 border-b">
                <FileText className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold uppercase tracking-wide">Información Fiscal</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
                <Row icon={<Hash className="h-3.5 w-3.5 text-blue-500" />}     label="RFC"             value={client.rfc}              mono accent="text-blue-600 dark:text-blue-400" />
                <Row icon={<Building2 className="h-3.5 w-3.5 text-purple-500"/>} label="Razón Social"   value={client.razon_social} />
                <Row icon={<IdCard className="h-3.5 w-3.5 text-blue-500"/>}     label="CURP"            value={client.curp}             mono accent="text-blue-600 dark:text-blue-400" />
                <Row icon={<FileText className="h-3.5 w-3.5 text-purple-500"/>} label="Nombre CFDI"     value={client.nombre_cfdi} />
                <Row icon={<MapPin className="h-3.5 w-3.5 text-amber-500"/>}    label="Código Postal"   value={client.codigo_postal}    mono />
                <Row icon={<CreditCard className="h-3.5 w-3.5 text-emerald-500"/>} label="Método de pago" value={client.payment_method} />
              </div>
            </div>

            {/* Totales — bigger numbers, colored chips */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-5 pb-3 border-b">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-semibold uppercase tracking-wide">Totales</h3>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <TotalStat
                  icon={<Package className="h-6 w-6" />}
                  label="Bultos totales"
                  value={totalBultos.toLocaleString("es-MX")}
                  accent="emerald"
                />
                <TotalStat
                  icon={<Tags className="h-6 w-6" />}
                  label="Productos distintos"
                  value={topProducts.length.toString()}
                  accent="blue"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pedidos" className="mt-6">
            {orders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/30 p-12 text-center space-y-2">
                <ShoppingCart className="h-8 w-8 mx-auto opacity-30" />
                <p className="text-sm text-muted-foreground">
                  Este cliente aún no tiene pedidos registrados.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
                  <ShoppingCart className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide">
                    Pedidos recientes ({orders.length}{totalOrderCount > orders.length ? ` de ${totalOrderCount}` : ""})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/20">
                      <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold border-b">
                        <th className="px-5 py-3">Pedido</th>
                        <th className="px-3 py-3">Fecha</th>
                        <th className="px-3 py-3">Entrega</th>
                        <th className="px-3 py-3">Estado</th>
                        <th className="px-3 py-3 text-right">Total</th>
                        <th className="px-3 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orders.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-muted/30 transition-colors cursor-pointer group"
                          onClick={() => navigate(`/orders?openOrderId=${o.id}`)}
                        >
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
                              {o.order_code}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                            {fmtDate(o.order_date)}
                          </td>
                          <td className="px-3 py-3.5 text-xs tabular-nums whitespace-nowrap">
                            {fmtDate(o.delivery_date)}
                          </td>
                          <td className="px-3 py-3.5">
                            {o.status
                              ? <StatusBadge status={o.status} />
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3.5 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                            {mxnFmt.format(orderTotals[o.id] ?? 0)}
                          </td>
                          <td className="px-3 py-3.5">
                            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
                  <span>Toca un pedido para ver el detalle</span>
                  <Link
                    to={`/orders?clientId=${client.id}`}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Ver en Pedidos
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="productos" className="mt-6">
            {topProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/30 p-12 text-center space-y-2">
                <Package className="h-8 w-8 mx-auto opacity-30" />
                <p className="text-sm text-muted-foreground">
                  Este cliente aún no ha comprado productos.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
                  <Package className="h-4 w-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide">
                    Productos comprados ({topProducts.length})
                  </h3>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Ordenado por bultos
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/20">
                      <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold border-b">
                        <th className="px-3 py-3 w-14"></th>
                        <th className="px-3 py-3">Clave</th>
                        <th className="px-3 py-3">Producto</th>
                        <th className="px-3 py-3 text-right">Bultos</th>
                        <th className="px-3 py-3 text-right">Total facturado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {topProducts.map((p) => (
                        <tr key={p.clave} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-3">
                            <ProductThumb src={p.image_url} size="md" />
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
                              {p.clave}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-sm font-medium">{p.name}</span>
                          </td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {p.qty.toLocaleString("es-MX")}
                            </span>
                            <span className="text-muted-foreground text-[10px] ml-1 font-normal">
                              bultos
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums text-foreground whitespace-nowrap">
                            {mxnFmt.format(p.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="cfdi" className="mt-4">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <h3 className="font-semibold">Constancia de Situación Fiscal</h3>
              </div>
              {client.cfdi_pdf_path ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-blue-400" />
                      <span className="text-sm truncate">
                        {client.cfdi_pdf_path.split("/").pop()}
                      </span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <a
                        href={cfdiPublicUrl(client.cfdi_pdf_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-4 w-4 mr-1" /> Ver
                        </Button>
                      </a>
                      <Button size="sm" variant="outline" onClick={handleDeleteCfdi}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Reemplazar
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full border-2 border-dashed border-border rounded-lg py-10 flex flex-col items-center gap-2 hover:bg-muted/30 transition disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {uploading ? "Subiendo..." : "Subir constancia (PDF)"}
                  </p>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleUpload}
              />
            </div>
          </TabsContent>

          <TabsContent value="precios" className="mt-4">
            <ClientPricesTab
              clientId={client.id}
              tierName={tierName}
              tierMarkupPct={tierMarkupPct}
            />
          </TabsContent>

          <TabsContent value="datos" className="mt-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
              <Row label="Nombre" value={client.name} />
              <Row label="Empresa" value={client.company} />
              <Row label="Teléfono" value={client.phone} />
              <Row label="Dirección" value={client.address} />
              <Row label="Central" value={client.central} />
              <Row label="Activo" value={client.active ? "Sí" : "No"} />
              <p className="text-xs text-muted-foreground pt-3 border-t border-border mt-3">
                Para editar los datos del cliente usa la página de Clientes (dropdown).
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/** KPI tile with an icon chip on the left and the value + label
 *  stacked on the right. Accent colors the icon background + value
 *  for visual hierarchy. */
function Kpi({
  icon, label, value, accent = "blue",
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  accent?: "blue" | "emerald" | "amber" | "purple";
}) {
  const styles = {
    blue:    { bg: "bg-blue-500/10",    text: "text-blue-500",    val: "text-foreground" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", val: "text-emerald-600 dark:text-emerald-400" },
    amber:   { bg: "bg-amber-500/10",   text: "text-amber-500",   val: "text-foreground" },
    purple:  { bg: "bg-purple-500/10",  text: "text-purple-500",  val: "text-foreground" },
  }[accent];
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4 hover:bg-card/80 transition-colors">
      {icon && (
        <div className={cn("rounded-lg p-2.5 shrink-0", styles.bg, styles.text)}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className={cn("text-xl md:text-2xl font-bold tabular-nums truncate", styles.val)}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/** Vertical info row: icon + label above, value below. Used in the
 *  Información Fiscal section. Mono optional for codes (RFC/CURP/CP).
 *  Accent recolors the value text for emphasis. */
function Row({
  label, value, mono, icon, accent,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn("text-sm leading-tight break-words", mono && "font-mono", accent ?? "text-foreground")}>
        {value || <span className="text-muted-foreground/50 italic">—</span>}
      </div>
    </div>
  );
}

/** Bigger "headline" stat used in the Totales section — colored icon
 *  on the left, large tabular number + label on the right. */
function TotalStat({
  icon, label, value, accent = "emerald",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "emerald" | "blue";
}) {
  const styles = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", val: "text-emerald-600 dark:text-emerald-400" },
    blue:    { bg: "bg-blue-500/10",    text: "text-blue-500",    val: "text-blue-600 dark:text-blue-400" },
  }[accent];
  return (
    <div className="flex items-center gap-4">
      <div className={cn("rounded-xl p-3.5", styles.bg, styles.text)}>
        {icon}
      </div>
      <div>
        <p className={cn("text-3xl font-bold tabular-nums leading-none", styles.val)}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
      </div>
    </div>
  );
}
