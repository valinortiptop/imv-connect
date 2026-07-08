// @ts-nocheck
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router-compat";
import { useServerFn } from "@tanstack/react-start";
import { downloadInvoiceFn } from "@/lib/facturapi.functions";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/ui/product-thumb";
import { StatusBadge } from "./StatusBadge";
import { DeliveryWindowChip } from "@/components/clients/DeliveryWindowChip";
import { format } from "date-fns";
import { Pencil, Trash2, Truck, CheckCircle2, Clock, MapPin, Undo2, AlertTriangle, XCircle, TrendingDown, Plus, Gift, Receipt, Loader2, Download, Mail, ExternalLink, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { es } from "date-fns/locale";
import { parseLocalDate } from "@/lib/date-utils";
import { RegistrarAjusteDialog } from "./RegistrarAjusteDialog";
import { useDeleteAdjustment } from "@/hooks/use-delete-adjustment";

interface OrderDetailSheetProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (orderId: string) => void;
  onDelete?: (orderId: string, orderCode: string, clientName: string | null) => void;
}

export function OrderDetailSheet({ orderId, open, onOpenChange, onEdit, onDelete }: OrderDetailSheetProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const downloadFn = useServerFn(downloadInvoiceFn);

  const downloadCfdi = async (facturaId, format) => {
    try {
      const res = await downloadFn({ data: { facturaId, format } });
      const blob = new Blob(
        [Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0))],
        { type: res.contentType },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e?.message ?? "La factura no está timbrada.");
    }
  };
  const [ajusteDialogOpen, setAjusteDialogOpen] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState<any | null>(null);
  const [deletingAdjustment, setDeletingAdjustment] = useState<any | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const deleteMutation = useDeleteAdjustment();
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId && open,
  });

  const { data: client } = useQuery({
    queryKey: ["order-client", order?.client_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", order!.client_id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!order?.client_id,
  });

  const { data: existingFactura } = useQuery({
    queryKey: ["order-factura", orderId],
    enabled: !!orderId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("facturas")
        .select("id, folio, serie, estado, total, pdf_url, xml_url, uuid_fiscal, cfdi_status")
        .eq("pedido_id", orderId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const handleFacturar = async () => {
    if (!orderId) return;
    setInvoicing(true);
    try {
      const { data, error } = await (supabase as any).rpc("facturar_pedido", { _pedido: orderId, _dias_credito: 30 });
      if (error) throw error;
      toast.success(`Factura ${data?.folio ?? ""} creada · $${Number(data?.total ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);
      qc.invalidateQueries({ queryKey: ["order-factura", orderId] });
      qc.invalidateQueries({ queryKey: ["pedidos-por-facturar"] });
      qc.invalidateQueries({ queryKey: ["facturas"] });
      onOpenChange(false);
      navigate(`/admin/facturas/${data?.factura_id}`);
    } catch (err: any) {
      toast.error("No se pudo crear la factura: " + (err?.message ?? "desconocido"));
    } finally {
      setInvoicing(false);
    }
  };

  const { data: items = [] } = useQuery({
    queryKey: ["order-items", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*, products(clave, name, sale_price_with_iva, image_url)")
        .eq("order_id", orderId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId && open,
  });

  // Gifted-first breakdown per line item (cortesía vs paid). Lets us
  // render a small 🎁 chip and the implied 100 % profit on gifted units.
  const { data: breakdown = [] } = useQuery({
    queryKey: ["order-item-breakdown", orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_order_item_breakdown")
        .select("order_item_id, gifted_used, paid_used, cost_without_iva, sale_price_with_iva, unit_price_override, quantity")
        .eq("order_id", orderId!);
      if (error) throw error;
      return (data ?? []) as Array<{
        order_item_id: string;
        gifted_used: number;
        paid_used: number;
        cost_without_iva: number | null;
        sale_price_with_iva: number | null;
        unit_price_override: number | null;
        quantity: number;
      }>;
    },
    enabled: !!orderId && open,
  });

  // Lookup: order_item_id → gifted breakdown
  const breakdownByItemId = useMemo(() => {
    const m: Record<string, typeof breakdown[number]> = {};
    for (const b of breakdown) m[b.order_item_id] = b;
    return m;
  }, [breakdown]);

  // Order-level gifted summary
  const giftedSummary = useMemo(() => {
    let giftedUnits = 0;
    let paidUnits = 0;
    let costNoIva = 0;
    let revenueNoIva = 0;
    for (const b of breakdown) {
      giftedUnits += Number(b.gifted_used ?? 0);
      paidUnits += Number(b.paid_used ?? 0);
      const unitPrice = b.unit_price_override ?? b.sale_price_with_iva ?? 0;
      revenueNoIva += (Number(b.quantity ?? 0) * Number(unitPrice)) / 1.16;
      costNoIva += Number(b.paid_used ?? 0) * Number(b.cost_without_iva ?? 0);
    }
    const profit = revenueNoIva - costNoIva;
    const marginPct = revenueNoIva > 0 ? (profit / revenueNoIva) * 100 : 0;
    return { giftedUnits, paidUnits, costNoIva, revenueNoIva, profit, marginPct };
  }, [breakdown]);

  // Order adjustments (returns + faltantes)
  const { data: adjustments = [] } = useQuery({
    queryKey: ["order-adjustments", orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_adjustments")
        .select("*, products(clave, name, image_url)")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId && open,
  });

  // Delivery trips for this order
  const { data: orderTrips = [] } = useQuery({
    queryKey: ["order-delivery-trips", orderId],
    queryFn: async () => {
      const { data: tripItems, error } = await supabase
        .from("delivery_trip_items")
        .select("quantity, product_id, products(clave, name), delivery_trips(id, trip_date, truck_provider, truck_type, truck_capacity_bultos, status)")
        .eq("order_id", orderId!);
      if (error) throw error;

      // Group by trip
      const tripMap = new Map<string, { trip: any; items: any[] }>();
      for (const ti of tripItems ?? []) {
        const trip = (ti as any).delivery_trips;
        if (!trip) continue;
        if (!tripMap.has(trip.id)) tripMap.set(trip.id, { trip, items: [] });
        tripMap.get(trip.id)!.items.push({ quantity: ti.quantity, clave: (ti as any).products?.clave, name: (ti as any).products?.name });
      }
      return [...tripMap.values()].sort((a, b) => (a.trip.trip_date ?? "").localeCompare(b.trip.trip_date ?? ""));
    },
    enabled: !!orderId && open,
  });

  const fmtDate = (d: string | null) => {
    if (!d) return "\u2014";
    try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
  };

  // Safe number conversion — returns fallback (default 0) for null/undefined/NaN
  const toNum = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  // NaN-safe MXN formatter — renders "$0" for bad values instead of "$NaN"
  const fmtMXN = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(Number(n))) return "$0";
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(Number(n));
  };

  // Lookup: order_item.id -> order_item (used to fall back to unit_price_override on ajustes)
  const itemsById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const i of items) m[i.id] = i;
    return m;
  }, [items]);

  // Compute adjustment price with fallback to order_item's unit_price_override
  const adjPrice = (adj: any): number => {
    const p = toNum(adj.unit_price, NaN);
    if (Number.isFinite(p) && p > 0) return p;
    const item = itemsById[adj.order_item_id];
    return toNum(item?.unit_price_override, 0);
  };

  const adjCredit = (adj: any): number => {
    const c = toNum(adj.credit_amount, NaN);
    if (Number.isFinite(c) && c > 0) return c;
    return toNum(adj.quantity, 0) * adjPrice(adj);
  };

  const totalBultos = items.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);
  const totalMXN = items.reduce((s: number, i: any) => s + (i.quantity ?? 0) * (i.unit_price_override ?? 0), 0);
  const totalAjustes = adjustments.reduce((s: number, a: any) => s + adjCredit(a), 0);
  const orderDiscount = Math.min(toNum((order as any)?.discount_amount, 0), totalMXN);
  const orderDiscountReason = (((order as any)?.discount_reason ?? "") as string).trim();
  const totalPagado = totalMXN - totalAjustes - orderDiscount;
  const bultosAjustados = adjustments.reduce((s: number, a: any) => s + (a.quantity ?? 0), 0);


  const tipoConfig: Record<string, { label: string; icon: typeof Undo2; color: string; bg: string }> = {
    devolucion_buena: { label: "Devolución", icon: Undo2, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30" },
    devolucion_danada: { label: "Devolución dañada", icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30" },
    perdida_total: { label: "Pérdida total", icon: XCircle, color: "text-red-500", bg: "bg-red-500/10 border-red-500/30" },
    faltante: { label: "Faltante", icon: TrendingDown, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30" },
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-4 sm:px-4 sm:px-6 pt-6 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">
              {orderLoading ? <Skeleton className="h-6 w-40" /> : `Pedido ${order?.order_code ?? ""}`}
            </DialogTitle>
            {order && (
              <div className="flex items-center gap-2 mr-6">
                {existingFactura ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/10"
                        title={`Factura ${existingFactura.folio}`}
                      >
                        <Receipt className="h-4 w-4" />
                        Factura {[existingFactura.serie, existingFactura.folio].filter(Boolean).join("-")}
                        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => downloadCfdi(existingFactura.id, "pdf")}>
                        <Download className="h-4 w-4 mr-2" /> Descargar PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadCfdi(existingFactura.id, "xml")}>
                        <Download className="h-4 w-4 mr-2" /> Descargar XML
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!existingFactura.pdf_url && !existingFactura.xml_url}
                        onClick={() => {
                          const to = (client as any)?.email ?? "";
                          const folio = [existingFactura.serie, existingFactura.folio].filter(Boolean).join("-");
                          const subject = `Factura ${folio}`;
                          const bodyLines = [
                            `Estimado(a) cliente,`,
                            ``,
                            `Adjuntamos los enlaces de su factura ${folio}:`,
                            existingFactura.pdf_url ? `PDF: ${existingFactura.pdf_url}` : null,
                            existingFactura.xml_url ? `XML: ${existingFactura.xml_url}` : null,
                            existingFactura.uuid_fiscal ? `UUID: ${existingFactura.uuid_fiscal}` : null,
                            ``,
                            `Saludos.`,
                          ].filter(Boolean).join("\n");
                          const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines)}`;
                          window.location.href = href;
                        }}
                      >
                        <Mail className="h-4 w-4 mr-2" /> Enviar por email
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => { onOpenChange(false); navigate(`/admin/facturas/${existingFactura.id}`); }}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" /> Ver detalle de factura
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={handleFacturar}
                    disabled={invoicing || (order?.status ?? "").toLowerCase() === "cancelado"}
                  >
                    {invoicing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                    Facturar
                  </Button>
                )}
                {onEdit && (
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onEdit(orderId!)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {onDelete && (
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => onDelete(orderId!, order.order_code, client?.name ?? null)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {orderLoading ? (
          <div className="px-4 sm:px-6 pb-6 space-y-4 mt-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : order ? (
          <div className="px-4 sm:px-6 pb-6 mt-4 space-y-5">

            {/* Top row: Client + Order details side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* LEFT: Client box */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cliente</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nombre</span>
                    <button
                      className="font-medium text-blue-400 hover:text-blue-300 hover:underline transition-colors cursor-pointer"
                      onClick={() => { if (order?.client_id) { onOpenChange(false); navigate(`/admin/clientes?expandClient=${order.client_id}`); } }}
                    >
                      {client?.name ?? "\u2014"}
                    </button>
                  </div>
                  {client?.company && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Empresa</span>
                      <span>{client.company}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Teléfono</span>
                    <span>{client?.phone || "\u2014"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RFC</span>
                    <span>{client?.rfc || "\u2014"}</span>
                  </div>
                  {client?.central && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Central</span>
                      <span>{client.central}</span>
                    </div>
                  )}
                  {client?.address && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dirección</span>
                      <span className="text-right max-w-[220px]">{client.address}</span>
                    </div>
                  )}
                  {client?.payment_method && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pago preferido</span>
                      <span className="text-muted-foreground/70 text-xs">{client.payment_method}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: Order details box */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detalles del pedido</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Estado</span>
                    <StatusBadge status={order.status} />
                  </div>
                  {order.urgency && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Urgencia</span>
                      <span className="text-destructive font-medium">Urgente</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fecha pedido</span>
                    <span>{fmtDate(order.order_date)}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Fecha entrega</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span>{fmtDate(order.delivery_date)}</span>
                      <DeliveryWindowChip
                        from={(client as any)?.delivery_window_from}
                        until={(client as any)?.delivery_window_until}
                        notes={(client as any)?.delivery_notes}
                        isPickup={(order as any).fulfillment_method === "pickup"}
                      />
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Método de pago</span>
                    <span>{(order as any).payment_method || "Transferencia"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Entrega</span>
                    <span className="inline-flex items-center gap-1.5">
                      {(order as any).fulfillment_method === "pickup" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          📦 Pickup en bodega
                        </span>
                      ) : (
                        <span className="text-foreground">🚚 A domicilio</span>
                      )}
                    </span>
                  </div>
                  {(order as any).needs_approval && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Aprobación</span>
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-500 border border-amber-500/40"
                        title="Pedido dentro de 3 días hábiles. Confirma o cancela."
                      >
                        ⚠ Pendiente aprobación
                      </span>
                    </div>
                  )}
                  {order.notes && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Notas</span>
                      <span className="text-right max-w-[220px]">{order.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Products section - full width */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Productos ({items.length} SKUs)
              </h3>

              {items.length > 0 ? (
                <div className="space-y-0">
                  {giftedSummary.giftedUnits > 0 && (
                    <div
                      className="mb-3 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-2 flex items-center gap-3 whitespace-nowrap overflow-hidden text-sm"
                      title={giftedSummary.paidUnits > 0
                        ? `${giftedSummary.giftedUnits} bultos sin costo para ti (100 % margen) + ${giftedSummary.paidUnits} a costo normal. El cliente paga precio completo por toda la orden.`
                        : `Toda la orden sale del inventario sin costo → 100 % de margen. El cliente paga precio completo.`}
                    >
                      <Gift className="h-4 w-4 text-purple-300 shrink-0" />
                      <span className="truncate min-w-0">
                        <span className="font-semibold text-purple-200">
                          {giftedSummary.giftedUnits} al 100% de margen
                        </span>
                        {giftedSummary.paidUnits > 0 && (
                          <span className="text-muted-foreground"> + {giftedSummary.paidUnits} a margen normal</span>
                        )}
                      </span>
                      <span className="ml-auto flex items-center gap-1.5 text-xs shrink-0">
                        <span className="text-muted-foreground">Margen real:</span>
                        <span className={cn(
                          "font-semibold tabular-nums",
                          giftedSummary.marginPct >= 50 ? "text-emerald-400"
                          : giftedSummary.marginPct >= 10 ? "text-amber-400"
                          : "text-red-400",
                        )}>
                          {giftedSummary.marginPct.toFixed(1)}%
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-[1fr_100px_120px_100px] gap-2 text-xs text-muted-foreground font-medium py-1 border-b border-border">
                    <div>Producto</div>
                    <div className="text-center">Bultos</div>
                    <div className="text-center">Precio/u</div>
                    <div className="text-right">Subtotal</div>
                  </div>
                  {[...items].sort((a: any, b: any) => ((b.quantity ?? 0) * (b.unit_price_override ?? 0)) - ((a.quantity ?? 0) * (a.unit_price_override ?? 0))).map((item: any) => {
                    const subtotal = (item.quantity ?? 0) * (item.unit_price_override ?? 0);
                    const catalogPrice = item.products?.sale_price_with_iva;
                    const overridePrice = item.unit_price_override;
                    const isManualPrice = catalogPrice != null && overridePrice != null && Math.abs(overridePrice - catalogPrice) > 0.01;
                    const priceDiff = isManualPrice ? ((overridePrice - catalogPrice) / catalogPrice * 100) : 0;
                    const lineBreak = breakdownByItemId[item.id];
                    const lineGifted = Number(lineBreak?.gifted_used ?? 0);
                    const linePaid = Number(lineBreak?.paid_used ?? 0);
                    const allGifted = lineGifted > 0 && linePaid === 0;
                    const mixedGifted = lineGifted > 0 && linePaid > 0;
                    return (
                      <div key={item.id} className="grid grid-cols-[1fr_100px_120px_100px] gap-2 items-center py-2 border-b border-border/50">
                        <button
                          className="text-sm text-left hover:opacity-80 transition-opacity cursor-pointer"
                          onClick={() => { onOpenChange(false); navigate(`/products?search=${encodeURIComponent(item.products?.clave ?? "")}`); }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ProductThumb src={item.products?.image_url ?? null} size="sm" />
                            <div className="min-w-0 flex-1">
                              <span className="font-mono text-xs text-primary hover:underline">{item.products?.clave}</span>
                              <span className="ml-2 hover:text-blue-400 transition-colors">{item.products?.name ?? "\u2014"}</span>
                              {lineGifted > 0 && (
                                <span
                                  className="ml-2 inline-flex items-center gap-1 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/40 px-1.5 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap align-middle"
                                  title={allGifted
                                    ? `Toda esta l\u00ednea sin costo para ti \u2192 100 % de margen. El cliente paga precio completo.`
                                    : `${lineGifted} de ${item.quantity} sin costo (100 % margen). Las otras ${linePaid} a costo normal. El cliente paga precio completo por las ${item.quantity}.`}
                                >
                                  <Gift className="h-2.5 w-2.5" />
                                  {allGifted ? "100% margen" : `${lineGifted} al 100%`}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                        <div className="text-sm text-center font-medium">
                          {item.quantity}
                          {mixedGifted && (
                            <div className="text-[10px] leading-tight">
                              <span className="text-purple-400 font-semibold">{lineGifted} al 100%</span>
                              <span className="text-muted-foreground"> · {linePaid} norm.</span>
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-center">
                          {isManualPrice ? (
                            <div className="inline-flex items-center gap-2.5">
                              <span className="text-sm text-amber-400 font-medium">{fmtMXN(overridePrice)}</span>
                              <span className="text-sm text-muted-foreground line-through">{fmtMXN(catalogPrice)}</span>
                              <span className={`text-sm font-semibold px-1.5 py-0.5 rounded ${priceDiff < 0 ? "text-red-400 bg-red-500/10" : "text-green-400 bg-green-500/10"}`}>
                                {priceDiff > 0 ? "+" : ""}{priceDiff.toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            <span>{fmtMXN(overridePrice)}</span>
                          )}
                        </div>
                        <div className="text-sm text-right font-medium">{fmtMXN(subtotal)}</div>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-[1fr_100px_120px_100px] gap-2 py-2">
                    <div className="text-sm font-semibold">
                      {(adjustments.length > 0 || orderDiscount > 0) ? "Subtotal" : "Total"}
                    </div>
                    <div className="text-center text-sm font-medium">{totalBultos} bultos</div>
                    <div />
                    <div className={cn(
                      "text-right text-sm font-bold",
                      (adjustments.length > 0 || orderDiscount > 0) ? "text-muted-foreground" : "text-primary"
                    )}>{fmtMXN(totalMXN)}</div>
                  </div>

                  {orderDiscount > 0 && (
                    <div className="grid grid-cols-[1fr_100px_120px_100px] gap-2 py-1">
                      <div className="text-sm text-amber-500">
                        Descuento{orderDiscountReason ? ` · ${orderDiscountReason}` : ""}
                      </div>
                      <div />
                      <div />
                      <div className="text-right text-sm font-medium text-amber-500">−{fmtMXN(orderDiscount)}</div>
                    </div>
                  )}

                  {adjustments.length > 0 && (
                    <div className="grid grid-cols-[1fr_100px_120px_100px] gap-2 py-1">
                      <div className="text-sm text-muted-foreground">Ajustes ({adjustments.length})</div>
                      <div className="text-center text-sm text-muted-foreground">−{bultosAjustados} bultos</div>
                      <div />
                      <div className="text-right text-sm font-medium text-red-400">−{fmtMXN(totalAjustes)}</div>
                    </div>
                  )}

                  {(orderDiscount > 0 || adjustments.length > 0) && (
                    <div className="grid grid-cols-[1fr_100px_120px_100px] gap-2 py-2 border-t border-border">
                      <div className="text-sm font-bold text-primary">Total pagado</div>
                      <div />
                      <div />
                      <div className="text-right text-base font-bold text-primary">{fmtMXN(totalPagado)}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">Sin productos</div>
              )}
            </div>

            {/* Adjustments section */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Ajustes ({adjustments.length})
                </h3>
                {items.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAjusteDialogOpen(true)}
                    className="h-8 gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Registrar ajuste
                  </Button>
                )}
              </div>

              {adjustments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Sin devoluciones ni faltantes registrados
                </p>
              ) : (
                <div className="space-y-2">
                  {adjustments.map((adj: any) => {
                    const cfg = tipoConfig[adj.tipo] ?? tipoConfig.devolucion_buena;
                    const Icon = cfg.icon;
                    const destinoLabel = adj.tipo === "faltante"
                      ? adj.faltante_destino === "bodega" ? " · Quedó en bodega" : " · Perdido en camino"
                      : "";
                    const price = adjPrice(adj);
                    const credit = adjCredit(adj);
                    return (
                      <div key={adj.id} className={cn("flex items-start gap-3 p-3 rounded-lg border", cfg.bg)}>
                        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", cfg.color)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-xs font-semibold", cfg.color)}>{cfg.label}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {adj.products?.clave}
                            </span>
                            <span className="text-sm truncate">{adj.products?.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {adj.quantity} bultos × {fmtMXN(price)}{destinoLabel}
                          </div>
                          {adj.notes && (
                            <p className="text-xs text-muted-foreground/70 italic mt-1">{adj.notes}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end gap-1">
                          <div className="text-sm font-bold text-red-400 tabular-nums">
                            −{fmtMXN(credit)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {(() => {
                              try {
                                if (!adj.created_at) return "";
                                const d = new Date(adj.created_at);
                                if (isNaN(d.getTime())) return "";
                                return format(d, "dd MMM", { locale: es });
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
                                setAjusteDialogOpen(true);
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

            {/* Delivery trips timeline */}
            {orderTrips.length > 0 && (
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Entregas ({orderTrips.length} {orderTrips.length === 1 ? "viaje" : "viajes"})
                </h3>
                <div className="space-y-2">
                  {orderTrips.map(({ trip, items: tripItems }) => {
                    const tripBultos = tripItems.reduce((s: number, i: any) => s + (i.quantity || 0), 0);
                    const statusIcon = trip.status === "Entregado"
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      : trip.status === "En ruta"
                      ? <MapPin className="h-4 w-4 text-blue-500" />
                      : <Clock className="h-4 w-4 text-amber-500" />;
                    const statusColor = trip.status === "Entregado"
                      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                      : trip.status === "En ruta"
                      ? "bg-blue-500/15 text-blue-500 border-blue-500/30"
                      : "bg-amber-500/15 text-amber-500 border-amber-500/30";

                    return (
                      <div key={trip.id} className="flex items-start gap-3 p-2 rounded-lg border border-border/50 bg-card/50">
                        {statusIcon}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {format(parseLocalDate(trip.trip_date), "dd MMM yyyy", { locale: es })}
                            </span>
                            <Badge className={cn("text-[10px]", statusColor)}>{trip.status}</Badge>
                            <span className="text-xs text-muted-foreground">
                              <Truck className="h-3 w-3 inline mr-1" />
                              {trip.truck_type} ({trip.truck_provider})
                            </span>
                            <span className="text-xs font-medium">{tripBultos} bultos</span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {tripItems.map((i: any, idx: number) => (
                              <span key={idx}>
                                {idx > 0 && " · "}
                                {i.clave} ×{i.quantity}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Progress summary */}
                {(() => {
                  const deliveredBultos = orderTrips
                    .filter(t => t.trip.status === "Entregado")
                    .reduce((s, t) => s + t.items.reduce((ss: number, i: any) => ss + (i.quantity || 0), 0), 0);
                  const assignedBultos = orderTrips
                    .reduce((s, t) => s + t.items.reduce((ss: number, i: any) => ss + (i.quantity || 0), 0), 0);
                  return (
                    <div className="flex items-center gap-4 text-xs pt-2 border-t border-border/50">
                      <span className="text-muted-foreground">Progreso:</span>
                      <span className="font-medium text-emerald-500">{deliveredBultos} entregados</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="font-medium">{assignedBultos} asignados</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="font-medium">{totalBultos} total pedido</span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Comprobante de entrega — signature link share + download */}
            <DeliverySignatureSection
              orderId={order.id}
              orderCode={order.order_code ?? "pedido"}
              signedAt={(order as any).signed_at ?? null}
              signedByName={(order as any).signed_by_name ?? null}
              signatureToken={(order as any).signature_token ?? null}
            />
          </div>
        ) : (
          <div className="px-4 sm:px-6 pb-6 mt-4 text-muted-foreground">Pedido no encontrado</div>
        )}
      </DialogContent>
    </Dialog>
    <RegistrarAjusteDialog
      orderId={orderId}
      open={ajusteDialogOpen}
      onOpenChange={(o) => {
        setAjusteDialogOpen(o);
        if (!o) setEditingAdjustment(null);
      }}
      editingAdjustment={editingAdjustment}
    />
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
    </>
  );
}

/* ── Comprobante de entrega section ───────────────────────────────────
 *  Renders inside the OrderDetailSheet when the user views an order.
 *  Three states:
 *   1. Signed → green panel with timestamp + signed-by + Descargar /
 *      Ver firma buttons. Download generates the full signed snapshot
 *      (order details + signature embedded).
 *   2. Token exists but not signed → yellow "Pendiente de firma" panel
 *      with Copy Link + Ver buttons.
 *   3. No token yet → grey "Sin firma" panel with a Generar Link button
 *      (lazy-creates the token).
 */
function DeliverySignatureSection({
  orderId,
  orderCode,
  signedAt,
  signedByName,
  signatureToken,
}: {
  orderId: string;
  orderCode: string;
  signedAt: string | null;
  signedByName: string | null;
  signatureToken: string | null;
}) {
  const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
  /**
   * Returns the signature token in the readable `<orderCode>-<4ch>`
   * format. If the order already has a token in that format, reuses
   * it. If it has an old UUID-style token (from before the readable
   * format was introduced), auto-upgrades to the new format. The old
   * UUID URL stops working at that point — accept the trade-off so
   * the user always copies/shares the clean format.
   */
  const ensureToken = async (): Promise<string | null> => {
    if (signatureToken && signatureToken.startsWith(`${orderCode}-`)) {
      return signatureToken;
    }
    const random4 = Array.from({ length: 4 }, () =>
      ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
    ).join("");
    const newToken = `${orderCode}-${random4}`;
    const { error } = await (supabase as any)
      .from("orders")
      .update({ signature_token: newToken })
      .eq("id", orderId);
    if (error) {
      const { toast } = await import("sonner");
      toast.error(error.message ?? "No se pudo generar el link");
      return null;
    }
    return newToken;
  };

  // Resolved token in component state. Pre-populated from the prop, then
  // eagerly upgraded on mount so clipboard.writeText can run inside the
  // user's tap (no awaits before the write — required by iOS Safari to
  // accept a clipboard write).
  const [resolvedToken, setResolvedToken] = useState<string | null>(
    signatureToken && signatureToken.startsWith(`${orderCode}-`) ? signatureToken : null,
  );

  useEffect(() => {
    // Don't pre-create a token for already-signed orders (token exists in
    // the right format by definition once the customer has signed).
    if (signedAt) return;
    if (resolvedToken) return;
    let cancelled = false;
    (async () => {
      const t = await ensureToken();
      if (!cancelled && t) setResolvedToken(t);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, orderCode, signatureToken, signedAt]);

  const signatureUrl = resolvedToken
    ? `${window.location.origin}/entrega/${resolvedToken}`
    : null;

  // Read-only input ref used by the bulletproof copy path: select + execCommand
  // both run synchronously inside the click event, which is the only thing
  // iOS Safari reliably accepts for clipboard writes.
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  const openSignaturePage = async () => {
    // Tap-time fallback in case the eager useEffect didn't finish yet.
    const token = resolvedToken ?? (await ensureToken());
    if (!token) return;
    window.open(`${window.location.origin}/entrega/${token}`, "_blank", "noopener,noreferrer");
  };

  /**
   * Bulletproof copy. iOS Safari's `navigator.clipboard.writeText` keeps
   * failing for various flavors of "user gesture lost" reasons even when
   * we run it synchronously, so we use the legacy execCommand path as the
   * PRIMARY mechanism here. It still works on every browser we care about
   * (including iOS) when invoked from a sync click on a focused/selected
   * input, and it doesn't require any async machinery.
   *
   * Order:
   *   1. select the read-only input + execCommand('copy')
   *   2. async fallback to navigator.clipboard.writeText
   *   3. final fallback toast pointing at the visible URL
   */
  const copyLink = (): void => {
    const input = linkInputRef.current;
    let copied = false;

    // Path 1: synchronous select + execCommand. Works on iOS, Android,
    // every desktop. Requires a real <input> in the DOM, which we render
    // below.
    if (input && input.value) {
      try {
        input.focus({ preventScroll: true });
        input.select();
        input.setSelectionRange(0, input.value.length); // iOS hack
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      // iOS sometimes leaves the input visually "selected" after copy;
      // blur to clear that state.
      input.blur();
    }

    if (copied) {
      void import("sonner").then(({ toast }) => toast.success("Link copiado"));
      return;
    }

    // Path 2: modern clipboard API as fallback (works in some contexts
    // where execCommand is disabled, like restricted webviews).
    const url = signatureUrl;
    if (url && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => { void import("sonner").then(({ toast }) => toast.success("Link copiado")); },
        () => {
          void import("sonner").then(({ toast }) =>
            toast.error("No se pudo copiar — mantén presionado el link y elige Copiar"));
        },
      );
      return;
    }

    // Path 3: nothing worked
    void import("sonner").then(({ toast }) =>
      toast.error("No se pudo copiar — mantén presionado el link y elige Copiar"));
  };

  const downloadComprobante = async () => {
    const { exportOrderAsImage } = await import("@/components/orders/SingleOrderImageCard");
    await exportOrderAsImage(orderId);
  };

  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | "del" | "reset">(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const refreshOrder = () => {
    qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    qc.invalidateQueries({ queryKey: ["order-documents-list"] });
    qc.invalidateQueries({ queryKey: ["orders-signed"] });
  };

  const handleDeleteComprobante = async () => {
    setBusy("del");
    try {
      const { deleteComprobanteSnapshotsForOrder } = await import("@/components/orders/SingleOrderImageCard");
      const n = await deleteComprobanteSnapshotsForOrder(orderId);
      const { toast } = await import("sonner");
      toast.success(n > 0 ? `${n} comprobante${n === 1 ? "" : "s"} eliminado${n === 1 ? "" : "s"}` : "No había comprobantes que borrar");
      refreshOrder();
    } finally { setBusy(null); }
  };

  const handleResetSignature = async () => {
    setBusy("reset");
    try {
      const { resetOrderSignature } = await import("@/components/orders/SingleOrderImageCard");
      await resetOrderSignature(orderId);
      const { toast } = await import("sonner");
      toast.success("Firma reiniciada — el cliente puede volver a firmar");
      refreshOrder();
    } finally {
      setBusy(null);
      setResetConfirmOpen(false);
    }
  };

  // Signed: green panel
  if (signedAt) {
    let when = "";
    try {
      const d = new Date(signedAt);
      when = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch { when = signedAt; }
    return (
      <>
        <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500 text-white text-xs font-bold">✓</span>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Comprobante de entrega firmado
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Firmó</div>
              <div className="font-semibold">{signedByName ?? "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Fecha</div>
              <div className="font-semibold tabular-nums">{when}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadComprobante} className="gap-1.5">
              <span className="text-xs">📄</span> Descargar comprobante
            </Button>
            {signatureUrl ? (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={signatureUrl} target="_blank" rel="noopener noreferrer">
                  <span className="text-xs">👁</span> Ver firma
                </a>
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={openSignaturePage} className="gap-1.5">
                <span className="text-xs">👁</span> Ver firma
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={copyLink} className="gap-1.5">
              <span className="text-xs">🔗</span> Copiar link
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-500/20">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteComprobante}
              disabled={busy !== null}
              className="gap-1.5"
            >
              {busy === "del" ? "Borrando…" : "Borrar comprobante"}
            </Button>
            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              disabled={busy !== null}
              className="ml-auto text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 disabled:no-underline"
            >
              Reiniciar firma
            </button>
          </div>
        </div>

        <AlertDialog open={resetConfirmOpen} onOpenChange={(o) => !o && !busy && setResetConfirmOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Reiniciar la firma de este pedido?</AlertDialogTitle>
              <AlertDialogDescription>
                Esto borra la evidencia de que el cliente firmó: el comprobante,
                la imagen de la firma y la fecha. El link <code>/entrega/...</code>
                quedará desbloqueado para volver a firmar.
                <br /><br />
                Úsalo solo si la firma fue un error (firmó la persona equivocada,
                etcétera). Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy === "reset"}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleResetSignature}
                disabled={busy === "reset"}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                {busy === "reset" ? "Reiniciando…" : "Reiniciar firma"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Has token but not signed yet: yellow waiting panel
  if (signatureToken || resolvedToken) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Comprobante de entrega · pendiente de firma
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          El cliente todavía no firma. Manda el link al repartidor para que el cliente firme al recibir.
        </p>
        {signatureUrl && (
          // Read-only input visible as the URL. Two reasons over a plain
          // <a>:
          //  • Tapping (or focusing) auto-selects the value and lets
          //    Copiar link run a synchronous select + execCommand("copy")
          //    — the most iOS-reliable way to write to the clipboard.
          //  • Long-press on a real input gives the native iOS text-
          //    selection popover with "Copiar" / "Compartir" entries,
          //    which works even when navigator.clipboard is blocked.
          <input
            ref={linkInputRef}
            type="text"
            readOnly
            value={signatureUrl}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.currentTarget.select()}
            className="w-full break-all text-xs font-mono px-2 py-1.5 rounded border bg-background/60 text-blue-600 dark:text-blue-400 select-all"
            aria-label="Link de firma"
          />
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5">Copiar link</Button>
          {signatureUrl ? (
            // Real <a> wrapped by Button(asChild). iOS treats this as a
            // normal user-initiated navigation; window.open() doesn't,
            // because of the await before it. Real anchors work.
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={signatureUrl} target="_blank" rel="noopener noreferrer">Abrir página</a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={openSignaturePage} className="gap-1.5">Abrir página</Button>
          )}
        </div>
      </div>
    );
  }

  // No token yet (eager creation hasn't resolved or failed)
  const handleGenerateAndCopy = async () => {
    const token = await ensureToken();
    if (!token) return;
    setResolvedToken(token);
    const url = `${window.location.origin}/entrega/${token}`;
    const { toast } = await import("sonner");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Link generado y copiado");
        return;
      }
    } catch {
      /* fall through */
    }
    toast.success("Link generado — cópialo abajo");
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Comprobante de entrega · sin generar
      </div>
      <p className="text-xs text-muted-foreground">
        Genera un link para que el cliente firme la entrega desde el celular del repartidor.
      </p>
      <Button variant="outline" size="sm" onClick={handleGenerateAndCopy} className="gap-1.5">
        Generar y copiar link
      </Button>
    </div>
  );
}
