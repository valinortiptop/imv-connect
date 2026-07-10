import React, { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveListPrice } from "@/lib/price-list-math";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { format, addDays } from "date-fns";
import { BUSINESS_CONTACT } from "@/config/business";
import { es } from "date-fns/locale";
import { parseLocalDate, todayMx } from "@/lib/date-utils";
import { sortProducts } from "@/lib/sort-products";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx-js-style";

/* ── types ── */
interface StockProduct {
  id: string;
  clave: string;
  name: string;
  brand: string | null;
  weight_kg: number | null;
  sale_price_with_iva: number | null;
  image_url: string | null;
  stock_actual: number;
  stock_committed: number;
  stock_incoming: number;
  stock_disponible: number;
}

interface AvailabilityRow {
  clave: string;
  name: string;
  brand: string | null;
  weight_kg: number | null;
  price: number | null;
  image_url: string | null;
  projected: number;
  bucket: string;
  bucketColor: "green" | "teal" | "blue" | "amber" | "orange";
}

type BucketColor = "green" | "teal" | "blue" | "amber" | "orange";
type BucketInfo = { label: string; color: BucketColor };

function getBucket(qty: number): BucketInfo | null {
  if (qty <= 0) return null;
  if (qty >= 500) return { label: "500+", color: "green" };
  if (qty >= 200) return { label: "200 – 500", color: "teal" };
  if (qty >= 100) return { label: "100 – 200", color: "blue" };
  if (qty >= 50) return { label: "50 – 100", color: "amber" };
  return { label: "< 50", color: "orange" };
}

const bucketTextClass: Record<string, string> = {
  green: "text-green-500",
  teal: "text-teal-500",
  blue: "text-blue-500",
  amber: "text-amber-500",
  orange: "text-orange-500",
};

const formatPrice = (n: number | null) =>
  n == null ? "—" : "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── component ── */
export function AvailabilityDownloadDialog({
  open,
  onOpenChange,
  priceListId = null,
  priceListLabel = "Mayoreo",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional price-list id. When null, uses products.sale_price_with_iva (mayoreo). */
  priceListId?: string | null;
  /** Display label for the active list — shown in the header / file name. */
  priceListLabel?: string;
}) {
  const today = todayMx();
  // Generate next 7 days as date options
  const dateOptions = useMemo(() => {
    const base = parseLocalDate(today);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      const val = format(d, "yyyy-MM-dd");
      const label = i === 0
        ? `Hoy — ${format(d, "EEEE d 'de' MMMM", { locale: es })}`
        : format(d, "EEEE d 'de' MMMM", { locale: es });
      return { value: val, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  }, [today]);

  const [selectedDate, setSelectedDate] = useState(today);
  const [exporting, setExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch stock data from the view
  const { data: stockProducts = [], isLoading: loadingStock } = useQuery({
    queryKey: ["availability-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_products_with_stock")
        .select("id, clave, name, brand, weight_kg, sale_price_with_iva, image_url, stock_actual, stock_committed, stock_incoming, stock_disponible")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as StockProduct[];
    },
    enabled: open,
  });

  // Per-product price overrides for the active price list (e.g. Menudeo).
  // When priceListId is null we just use products.sale_price_with_iva.
  const { data: priceListItems = [] } = useQuery({
    queryKey: ["availability-price-list-items", priceListId],
    queryFn: async () => {
      if (!priceListId) return [];
      const { data, error } = await supabase
        .from("price_list_items")
        .select("product_id, price_with_iva")
        .eq("price_list_id", priceListId);
      if (error) throw error;
      return (data ?? []) as { product_id: string; price_with_iva: number }[];
    },
    enabled: open && !!priceListId,
    staleTime: 60 * 1000,
  });

  // List metadata (mostly markup_pct) for the formula fallback when a
  // product has no explicit override. Same lookup pattern as Catalogo.
  const { data: priceListInfo = null } = useQuery({
    queryKey: ["availability-price-list-info", priceListId],
    queryFn: async () => {
      if (!priceListId) return null;
      const { data, error } = await supabase
        .from("price_lists")
        .select("id, name, markup_pct")
        .eq("id", priceListId)
        .single();
      if (error) throw error;
      return data as { id: string; name: string; markup_pct: number | null } | null;
    },
    enabled: open && !!priceListId,
    staleTime: 60 * 1000,
  });

  const priceOverrideMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of priceListItems) m.set(r.product_id, Number(r.price_with_iva));
    return m;
  }, [priceListItems]);

  // Fetch programmed stock entries arriving on or before selected date
  const { data: incomingEntries = [] } = useQuery({
    queryKey: ["availability-incoming", selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_deliveries")
        .select("id, delivery_date, delivery_status, stock_entries(product_id, quantity, products(clave))")
        .eq("delivery_status", "Programado")
        .lte("delivery_date", selectedDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  // Fetch open orders (not Entregado/Cancelado) with delivery_date ≤ selected date.
  // These consume stock on or before that date and must be subtracted to avoid
  // double-selling bultos already committed to a customer.
  const { data: committedItems = [] } = useQuery({
    queryKey: ["availability-committed", selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("quantity, product:products(clave), order:orders!inner(status, delivery_date)")
        .lte("order.delivery_date", selectedDate)
        .not("order.status", "in", '("Entregado","Cancelado")');
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  // Calculate projected availability
  const availabilityRows = useMemo(() => {
    // projected(X) = stock_actual
    //              + incoming arriving on/before X
    //              − open-order commits due on/before X
    //
    // We do NOT use stock_disponible from the view here: that value subtracts
    // ALL future commits (regardless of date) and floors at 0, which drops
    // the information we need to balance same-day incoming vs. same-day
    // commits.

    // Incoming by clave, capped at selectedDate
    const incomingByProduct: Record<string, number> = {};
    for (const delivery of incomingEntries) {
      if (!delivery.stock_entries) continue;
      for (const entry of delivery.stock_entries as any[]) {
        const clave = entry.products?.clave;
        if (clave) {
          incomingByProduct[clave] = (incomingByProduct[clave] ?? 0) + (entry.quantity ?? 0);
        }
      }
    }

    // Commits by clave, capped at selectedDate, open orders only
    const committedByProduct: Record<string, number> = {};
    for (const item of committedItems as any[]) {
      const clave = item.product?.clave;
      if (clave) {
        committedByProduct[clave] = (committedByProduct[clave] ?? 0) + (item.quantity ?? 0);
      }
    }

    const rows: AvailabilityRow[] = [];

    for (const p of stockProducts) {
      const incomingByDate = incomingByProduct[p.clave] ?? 0;
      const committedByDate = committedByProduct[p.clave] ?? 0;
      const projected = Math.max(0, p.stock_actual + incomingByDate - committedByDate);

      const bucket = getBucket(projected);
      if (!bucket) continue; // hide out-of-stock

      // Order: explicit override → list.markup_pct → mayoreo
      const effectivePrice = resolveListPrice(p.id, p.sale_price_with_iva, priceListInfo, priceOverrideMap);

      rows.push({
        clave: p.clave,
        name: p.name,
        brand: p.brand,
        weight_kg: p.weight_kg,
        price: effectivePrice,
        image_url: p.image_url,
        projected,
        bucket: bucket.label,
        bucketColor: bucket.color,
      });
    }

    return sortProducts(rows);
  }, [stockProducts, incomingEntries, committedItems, priceOverrideMap]);

  const dateLabel = useMemo(() => {
    const opt = dateOptions.find(d => d.value === selectedDate);
    return opt?.label ?? selectedDate;
  }, [selectedDate, dateOptions]);

  const dateLabelShort = useMemo(() => {
    try {
      const d = parseLocalDate(selectedDate);
      return format(d, "d 'de' MMMM yyyy", { locale: es });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Excel export
  function handleExcel() {
    if (availabilityRows.length === 0) { toast("Sin productos disponibles"); return; }
    const data = availabilityRows.map((r, i) => ({
      "#": i + 1,
      "Clave": r.clave,
      "Producto": r.name,
      "Peso": r.weight_kg ? `${r.weight_kg} kg` : "—",
      "Precio c/IVA": r.price ?? 0,
      "Bultos disponibles": r.bucket,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 45 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Disponibilidad");
    const dd = selectedDate.split("-").reverse().join("-");
    XLSX.writeFile(wb, `Disponibilidad ${dd}.xlsx`);
  }

  // PNG export
  async function handleImage() {
    const node = printRef.current;
    if (!node) { toast("Error al generar imagen"); return; }
    setExporting(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const isDark = document.documentElement.classList.contains("dark");
      const bg = isDark ? "#020817" : "#ffffff";
      const height = node.scrollHeight || 900;
      const canvas = await html2canvas(node, {
        backgroundColor: bg, scale: 2, useCORS: true,
        allowTaint: true, logging: false,
        width: 1000, height, windowWidth: 1000, windowHeight: height,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const dd = selectedDate.split("-").reverse().join("-");
      link.download = `Disponibilidad ${dd}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      toast("Error al generar imagen");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-full sm:max-w-5xl max-h-[90vh] p-4 sm:p-6 flex flex-col !overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl leading-tight">
            <span className="block sm:inline">Disponibilidad de Inventario</span>
            <span className="mt-1 block text-sm font-normal text-muted-foreground sm:ml-2 sm:mt-0 sm:inline">
              · {priceListLabel}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Date picker */}
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div className="space-y-1.5 w-full sm:w-auto">
            <Label className="text-xs text-muted-foreground">Fecha de disponibilidad</Label>
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="w-full sm:w-[320px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dateOptions.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground sm:pb-1">
            {availabilityRows.length} productos disponibles
          </div>
        </div>

        {/* Preview table */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loadingStock ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Cargando inventario...
            </div>
          ) : availabilityRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No hay productos disponibles para esta fecha.
            </div>
          ) : (
            <>
              {/* Desktop: table grid */}
              <div className="hidden sm:block">
                <div className="grid grid-cols-[36px_100px_1fr_80px_110px_130px] gap-4 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <div />
                  <div>Clave</div>
                  <div>Producto</div>
                  <div className="text-right">Peso</div>
                  <div className="text-right">Precio</div>
                  <div className="text-right">Bultos disponibles</div>
                </div>
                {availabilityRows.map((row) => (
                  <div
                    key={row.clave}
                    className="grid grid-cols-[36px_100px_1fr_80px_110px_130px] gap-4 px-4 py-2.5 items-center border-b border-border/30 hover:bg-muted/30"
                  >
                    <ProductThumb src={row.image_url} size="sm" />
                    <div className="font-mono text-sm font-medium text-primary">{row.clave}</div>
                    <div className="text-sm text-foreground truncate">{row.name}</div>
                    <div className="text-right text-sm text-muted-foreground">
                      {row.weight_kg ? `${row.weight_kg} kg` : "—"}
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums text-foreground">
                      {formatPrice(row.price)}
                    </div>
                    <div className={`text-right text-sm font-bold tabular-nums ${bucketTextClass[row.bucketColor]}`}>
                      {row.bucket}
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile: card list */}
              <div className="sm:hidden space-y-2 py-2">
                {availabilityRows.map((row) => (
                  <div
                    key={row.clave}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-start gap-3">
                      <ProductThumb src={row.image_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-medium text-primary">{row.clave}</div>
                        <div className="mt-0.5 text-sm text-foreground line-clamp-2">{row.name}</div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-xs">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peso</div>
                        <div className="text-foreground tabular-nums">
                          {row.weight_kg ? `${row.weight_kg} kg` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Precio</div>
                        <div className="font-semibold text-foreground tabular-nums">
                          {formatPrice(row.price)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Bultos</div>
                        <div className={`font-bold tabular-nums ${bucketTextClass[row.bucketColor]}`}>
                          {row.bucket}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Export buttons */}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={availabilityRows.length === 0} className="w-full sm:w-auto">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleImage} disabled={availabilityRows.length === 0 || exporting} className="w-full sm:w-auto">
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Descargar imagen
          </Button>
        </div>

      </DialogContent>

      {/* Offscreen print card — mounted only while the dialog is open so it
          never contributes to mobile page overflow on the catálogo screen. */}
      {open && (
        <AvailabilityPrintCard
          ref={printRef}
          rows={availabilityRows}
          dateLabel={dateLabelShort}
        />
      )}
    </Dialog>
  );
}

/* ── Print card for PNG export ── */
const AvailabilityPrintCard = React.forwardRef<HTMLDivElement, {
  rows: AvailabilityRow[];
  dateLabel: string;
}>(({ rows, dateLabel }, ref) => {
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const bg = isDark ? "#020817" : "#ffffff";
  const fg = isDark ? "#f8fafc" : "#020817";
  const muted = isDark ? "#94a3b8" : "#64748b";
  const accent = "#1e293b";
  const sep = isDark ? "rgba(248,250,252,0.10)" : "rgba(2,8,23,0.10)";
  const tnum: React.CSSProperties = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1, "lnum" 1' };

  const bucketPrintColors: Record<string, { bg: string; fg: string; dot: string }> = {
    green: { bg: "rgba(34,197,94,0.12)", fg: "#22c55e", dot: "#22c55e" },
    teal: { bg: "rgba(20,184,166,0.12)", fg: "#14b8a6", dot: "#14b8a6" },
    blue: { bg: "rgba(59,130,246,0.12)", fg: "#3b82f6", dot: "#3b82f6" },
    amber: { bg: "rgba(245,158,11,0.12)", fg: "#f59e0b", dot: "#f59e0b" },
    orange: { bg: "rgba(249,115,22,0.12)", fg: "#f97316", dot: "#f97316" },
  };

  const gridCols = "110px minmax(0,1fr) 70px 100px 150px";

  const formatPrice = (n: number | null) =>
    n == null ? "—" : "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const now = new Date();
  const genDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed", top: 0, left: -10000,
        pointerEvents: "none", zIndex: -1, width: 1000, maxWidth: "none", minHeight: 700,
        contain: "layout paint style", overflow: "hidden",
        backgroundColor: bg, color: fg,
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        padding: 48, boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Disponibilidad de Inventario
        </div>
        <div style={{ fontSize: 20, color: fg, marginTop: 6, fontWeight: 600 }}>
          {dateLabel}
          <span style={{ fontSize: 14, color: muted, fontWeight: 400, marginLeft: 12 }}>
            · Generado {genDate} · {rows.length} productos
          </span>
        </div>
      </div>

      <div style={{ height: 3, background: accent, borderRadius: 2, marginBottom: 20 }} />

      {/* Legend — simple inline text */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontSize: 12, color: muted,
      }}>
        <span style={{ fontWeight: 500 }}>Disponibilidad en bultos:</span>
        {[
          { label: "500+", color: "#22c55e" },
          { label: "200–500", color: "#14b8a6" },
          { label: "100–200", color: "#3b82f6" },
          { label: "50–100", color: "#f59e0b" },
          { label: "<50", color: "#f97316" },
        ].map((b, i) => (
          <React.Fragment key={b.label}>
            {i > 0 && <span style={{ color: muted, opacity: 0.3 }}>·</span>}
            <span style={{ color: b.color, fontWeight: 700 }}>{b.label}</span>
          </React.Fragment>
        ))}
      </div>

      {/* Table header */}
      <div style={{
        display: "grid", gridTemplateColumns: gridCols, columnGap: 16,
        fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: "0.06em",
        paddingBottom: 8, borderBottom: `1px solid ${sep}`,
      }}>
        <div>Clave</div>
        <div>Producto</div>
        <div style={{ textAlign: "right" }}>Peso</div>
        <div style={{ textAlign: "right" }}>Precio</div>
        <div style={{ textAlign: "right" }}>Bultos disponibles</div>
      </div>

      {/* Rows */}
      {rows.map((r, i) => {
        const bc = bucketPrintColors[r.bucketColor];
        return (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: gridCols, columnGap: 16,
            fontSize: 14, paddingTop: 8, paddingBottom: 8,
            borderBottom: `1px solid ${sep}`, alignItems: "center",
          }}>
            <div style={{ fontFamily: "'SF Mono', Menlo, monospace", fontWeight: 600, fontSize: 13 }}>{r.clave}</div>
            <div style={{ wordBreak: "break-word", lineHeight: 1.3 }}>{r.name}</div>
            <div style={{ textAlign: "right", color: muted, fontSize: 13 }}>
              {r.weight_kg ? `${r.weight_kg} kg` : "—"}
            </div>
            <div style={{ textAlign: "right", fontWeight: 600, ...tnum }}>{formatPrice(r.price)}</div>
            <div style={{ textAlign: "right", color: bc.fg, fontWeight: 700, fontSize: 14, ...tnum }}>
              {r.bucket}
            </div>
          </div>
        );
      })}

      {/* Footer (only when business phone is configured) */}
      {BUSINESS_CONTACT.phone && (
        <div style={{ marginTop: 20, fontSize: 12, color: muted }}>
          {BUSINESS_CONTACT.phone}
          {BUSINESS_CONTACT.whatsappNumber ? " · WhatsApp" : ""}
        </div>
      )}
    </div>
  );
});
AvailabilityPrintCard.displayName = "AvailabilityPrintCard";
