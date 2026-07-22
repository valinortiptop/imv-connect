// @ts-nocheck
/**
 * CotizacionesTab — list of quotes (drafts) inside the Pedidos page.
 *
 * - Each row expands to show necesidades de compra for THAT cotización
 *   (same UX as /purchase-needs).
 * - Actions per row: Editar / Convertir a pedido / Descargar PDF / Eliminar.
 * - Convertir uses the convert_quote_to_order RPC (DB-side; preserves
 *   client, delivery date, payment method, price list, lines).
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronRight, Pencil, ShoppingCart, Trash2, Download, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { NewOrderDialog } from "@/components/orders/NewOrderDialog";
import { EditQuoteSheet } from "@/components/orders/EditQuoteSheet";
import { generateQuotePDF } from "@/lib/quotePdf";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
};

interface QuoteRow {
  id: string;
  quote_number: number;
  client_id: string | null;
  client_name: string;
  contact_name: string | null;
  delivery_date: string | null;
  total: number;
  notes: string | null;
  status: string;
  converted_to_order_id: string | null;
  price_list_name: string | null;
  created_at: string;
}

interface QuoteItemRow {
  id: string;
  quote_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  clave: string;
  product_name: string;
  supplier: string | null;
  image_url: string | null;
}

interface StockRow {
  product_id: string;
  clave: string;
  stock_actual: number;
  stock_committed: number;
  stock_disponible: number;
}

interface CotizacionesTabProps {
  onConverted?: (orderId: string) => void;
  /** Optional controlled state for the "Nueva Cotización" dialog so the
   *  parent page can pin the trigger button in its header (avoids the
   *  layout shift caused by hiding/showing the button per tab). */
  newOpen?: boolean;
  onNewOpenChange?: (open: boolean) => void;
  /** When set, only quotes for these client IDs are shown. Used by the
   *  representative panel to scope quotes to the rep's own clients. */
  restrictClientIds?: string[] | null;
}

export function CotizacionesTab({ onConverted, newOpen, onNewOpenChange, restrictClientIds }: CotizacionesTabProps) {
  const qc = useQueryClient();
  const [internalNewOpen, setInternalNewOpen] = useState(false);
  const dialogOpen = newOpen ?? internalNewOpen;
  const setDialogOpen = onNewOpenChange ?? setInternalNewOpen;
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteRow, setDeleteRow] = useState<QuoteRow | null>(null);
  const [convertRow, setConvertRow] = useState<QuoteRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const restrictKey = restrictClientIds ? [...restrictClientIds].sort().join(",") : null;

  // Quotes (drafts only — exclude already-converted ones).
  // staleTime keeps the data warm so toggling tabs feels instant after
  // the first fetch.
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotes", "drafts", restrictKey],
    queryFn: async () => {
      if (restrictClientIds && restrictClientIds.length === 0) return [] as QuoteRow[];
      let query = (supabase as any)
        .from("quotes")
        .select("id, quote_number, client_id, contact_name, delivery_date, total, notes, status, converted_to_order_id, created_at, clients(name), price_lists(name)")
        .is("converted_to_order_id", null)
        .order("created_at", { ascending: false });
      if (restrictClientIds && restrictClientIds.length > 0) {
        query = query.in("client_id", restrictClientIds);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((q: any): QuoteRow => ({
        id: q.id,
        quote_number: q.quote_number,
        client_id: q.client_id,
        client_name: q.clients?.name ?? q.contact_name ?? "—",
        contact_name: q.contact_name,
        delivery_date: q.delivery_date,
        total: Number(q.total) || 0,
        notes: q.notes,
        status: q.status,
        converted_to_order_id: q.converted_to_order_id,
        price_list_name: q.price_lists?.name ?? null,
        created_at: q.created_at,
      }));
    },
    staleTime: 30 * 1000,
  });

  // Items for all open drafts in ONE query — JOIN-filtered server-side
  // on quotes.converted_to_order_id IS NULL so it runs in parallel with
  // the quotes query (not after it).
  const { data: items = [] } = useQuery({
    queryKey: ["quotes", "drafts", "items"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quote_items")
        .select("id, quote_id, product_id, quantity, unit_price, products(clave, name, supplier, image_url), quotes!inner(converted_to_order_id)")
        .is("quotes.converted_to_order_id", null);
      if (error) throw error;
      return (data ?? []).map((it: any): QuoteItemRow => ({
        id: it.id,
        quote_id: it.quote_id,
        product_id: it.product_id,
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        clave: it.products?.clave ?? "",
        product_name: it.products?.name ?? "",
        supplier: it.products?.supplier ?? null,
        image_url: it.products?.image_url ?? null,
      }));
    },
    staleTime: 30 * 1000,
  });

  // Stock snapshot — only fetched once a row is expanded. Saves the
  // wait on initial tab open.
  const { data: stockRows = [] } = useQuery({
    queryKey: ["quotes", "stock-snapshot"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_products_with_stock")
        .select("id, clave, stock_actual, stock_committed, stock_disponible");
      if (error) throw error;
      return (data ?? []).map((r: any): StockRow => ({
        product_id: r.id,
        clave: r.clave,
        stock_actual: Number(r.stock_actual) || 0,
        stock_committed: Number(r.stock_committed) || 0,
        stock_disponible: Number(r.stock_disponible) || 0,
      }));
    },
    enabled: expanded.size > 0,
    staleTime: 60 * 1000,
  });

  const stockByProduct = useMemo(() => {
    const m = new Map<string, StockRow>();
    for (const r of stockRows) m.set(r.product_id, r);
    return m;
  }, [stockRows]);

  const itemsByQuote = useMemo(() => {
    const m = new Map<string, QuoteItemRow[]>();
    for (const it of items) {
      const arr = m.get(it.quote_id) ?? [];
      arr.push(it);
      m.set(it.quote_id, arr);
    }
    return m;
  }, [items]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConvert = async () => {
    if (!convertRow) return;
    try {
      const { data, error } = await (supabase.rpc as any)("convert_quote_to_order", { p_quote_id: convertRow.id });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Cotización convertida a pedido");
      setConvertRow(null);
      onConverted?.(data as string);
    } catch (err: any) {
      toast.error("Error al convertir: " + err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    try {
      // Delete items first (no ON DELETE CASCADE configured)
      await (supabase as any).from("quote_items").delete().eq("quote_id", deleteRow.id);
      const { error } = await (supabase as any).from("quotes").delete().eq("id", deleteRow.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("Cotización eliminada");
      setDeleteRow(null);
    } catch (err: any) {
      toast.error("Error al eliminar: " + err.message);
    }
  };

  const handlePdf = async (quote: QuoteRow) => {
    const lines = (itemsByQuote.get(quote.id) ?? []).map(it => ({
      clave: it.clave,
      name: it.product_name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      image_url: it.image_url,
    }));
    try {
      await generateQuotePDF({
        quoteNumber: quote.quote_number,
        clientName: quote.client_name,
        deliveryDate: quote.delivery_date,
        notes: quote.notes,
        lines,
      });
    } catch (err: any) {
      toast.error("Error al generar PDF: " + err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {quotes.length} cotización{quotes.length === 1 ? "" : "es"} pendientes
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground">Sin cotizaciones pendientes</p>
          <Button variant="outline" onClick={() => setDialogOpen(true)}>Crear la primera cotización</Button>
        </div>
      ) : (
        <div className="rounded-md border">
          {/* Table header */}
          <div className="grid grid-cols-[40px_120px_1fr_120px_120px_140px_280px] gap-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
            <div />
            <div>Cotización</div>
            <div>Cliente</div>
            <div>Fecha</div>
            <div>Lista</div>
            <div className="text-right">Total</div>
            <div className="text-right">Acciones</div>
          </div>
          {quotes.map((q) => {
            const isOpen = expanded.has(q.id);
            const qItems = itemsByQuote.get(q.id) ?? [];
            return (
              <div key={q.id} className="border-b last:border-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(q.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(q.id);
                    }
                  }}
                  className="grid grid-cols-[40px_120px_1fr_120px_120px_140px_280px] gap-2 px-3 py-2.5 items-center hover:bg-muted/20 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:bg-muted/20"
                  aria-expanded={isOpen}
                >
                  <span
                    className="text-muted-foreground"
                    aria-hidden="true"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <div className="font-mono text-sm font-semibold text-blue-400">
                    C-{String(q.quote_number).padStart(4, "0")}
                  </div>
                  <div className="text-sm truncate">{q.client_name}</div>
                  <div className="text-sm text-muted-foreground">{fmtDate(q.delivery_date)}</div>
                  <div className="text-xs">
                    {q.price_list_name ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        {q.price_list_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Mayoreo</span>
                    )}
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">
                    {fmtMXN(q.total)}
                  </div>
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => handlePdf(q)} title="PDF cotización">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(q.id)} title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => setConvertRow(q)}>
                      <ShoppingCart className="h-3 w-3" />
                      Convertir
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setDeleteRow(q)} title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Expanded — necesidades de compra for this cotización */}
                {isOpen && (
                  <div className="px-3 pb-4 pt-1 bg-muted/10">
                    <div className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wide">
                      Necesidades de compra si se activa
                    </div>
                    <div className="grid grid-cols-[1fr_80px_80px_80px_80px_80px] gap-2 text-xs text-muted-foreground border-b pb-1 mb-1">
                      <div>Producto</div>
                      <div className="text-right">Pedido</div>
                      <div className="text-right">Stock</div>
                      <div className="text-right">Comprometido</div>
                      <div className="text-right">Disponible</div>
                      <div className="text-right">Falta</div>
                    </div>
                    {qItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">Sin productos</p>
                    ) : (
                      qItems.map((it) => {
                        const stock = stockByProduct.get(it.product_id);
                        const disponible = stock?.stock_disponible ?? 0;
                        const falta = Math.max(0, it.quantity - disponible);
                        return (
                          <div key={it.id} className={cn(
                            "grid grid-cols-[1fr_80px_80px_80px_80px_80px] gap-2 py-1.5 text-sm items-center",
                            falta > 0 && "bg-red-500/5"
                          )}>
                            <div className="truncate">
                              <span className="font-mono text-xs text-muted-foreground mr-2">{it.clave}</span>
                              {it.product_name}
                            </div>
                            <div className="text-right tabular-nums">{it.quantity}</div>
                            <div className="text-right tabular-nums text-muted-foreground">{stock?.stock_actual ?? 0}</div>
                            <div className="text-right tabular-nums text-muted-foreground">{stock?.stock_committed ?? 0}</div>
                            <div className={cn("text-right tabular-nums", disponible <= 0 && "text-red-500 font-semibold")}>
                              {disponible}
                            </div>
                            <div className={cn("flex justify-end items-center tabular-nums font-semibold", falta > 0 && "text-red-500")}>
                              {falta > 0
                                ? `-${falta}`
                                : <CheckCircle2 className="h-4 w-4 text-blue-500" />
                              }
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New cotización dialog (reuses NewOrderDialog in quote mode) */}
      <NewOrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onOrderCreated={() => {
          qc.invalidateQueries({ queryKey: ["quotes"] });
        }}
        mode="quote"
      />

      {/* Edit cotización */}
      <EditQuoteSheet
        quoteId={editId}
        open={!!editId}
        onOpenChange={(o) => { if (!o) setEditId(null); }}
        onUpdated={() => qc.invalidateQueries({ queryKey: ["quotes"] })}
      />

      {/* Convert confirmation */}
      <AlertDialog open={!!convertRow} onOpenChange={(o) => { if (!o) setConvertRow(null); }}>
        <AlertDialogContent className="max-w-2xl p-8">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-2xl">Convertir a pedido</AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed">
              {convertRow && (
                <>
                  Cotización <strong>C-{String(convertRow.quote_number).padStart(4, "0")}</strong> para <strong>{convertRow.client_name}</strong> se convertirá en pedido (estado: Nuevo).
                  La cotización quedará archivada con el enlace al pedido.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert}>Convertir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => { if (!o) setDeleteRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cotización</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. ¿Eliminar <strong>C-{deleteRow ? String(deleteRow.quote_number).padStart(4, "0") : ""}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
