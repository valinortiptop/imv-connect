// @ts-nocheck
import React, { useState, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Trash2, FileSpreadsheet, Download, ChevronDown, Search, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { sortProducts } from "@/lib/sort-products";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/integrations/supabase/client";
import { aiChatFn } from "@/lib/valinor.functions";

interface OrderLine {
  order_id: string;
  order_code: string;
  status: string;
  delivery_date: string | null;
  client_name: string;
  product_id: string;
  clave: string;
  product_name: string;
  supplier: string;
  bultos_pedido: number;
  stock_fisico: number;
  total_committed_all_orders: number;
  units_incoming: number;
  product_units_short: number;
  cost_with_iva: number;
  shared_orders_count: number;
  next_incoming_date: string | null;
  next_incoming_qty: number | null;
}

interface PORow {
  clave: string;
  product_name: string;
  image_url: string | null;
  bultos: number;
  tons: number;
  weight_kg: number;
}

interface ProductInfo {
  clave: string;
  product_name: string;
  supplier: string;
  image_url: string | null;
}

interface PurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawLines: OrderLine[];
  suppliers: string[];
  productWeights: Record<string, number>;
  allProducts: ProductInfo[];
  dayFilter: string;
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
};

export function PurchaseOrderDialog({
  open, onOpenChange, rawLines, suppliers, productWeights, allProducts, dayFilter,
}: PurchaseOrderDialogProps) {
  const [poSupplier, setPoSupplier] = useState("all");
  const [poDayFilter, setPoDayFilter] = useState(dayFilter);
  const [includeFaltantes, setIncludeFaltantes] = useState(true);
  const [rows, setRows] = useState<PORow[]>([]);
  const [initialized, setInitialized] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Delivery days available (from rawLines)
  const deliveryDays = useMemo(() => {
    const set = new Set<string>();
    for (const l of rawLines) {
      if (l.delivery_date) set.add(l.delivery_date);
    }
    return Array.from(set).sort();
  }, [rawLines]);

  // Image lookup from allProducts
  const imageMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const p of allProducts) m[p.clave] = p.image_url;
    return m;
  }, [allProducts]);

  // Build shortage rows based on supplier + day + includeFaltantes
  const shortageRows = useMemo(() => {
    if (!includeFaltantes) return [];
    const bySku = new Map<string, PORow>();
    for (const l of rawLines) {
      if (l.product_units_short <= 0) continue;
      if (poSupplier !== "all" && l.supplier !== poSupplier) continue;
      if (poDayFilter !== "all" && l.delivery_date !== poDayFilter) continue;
      const existing = bySku.get(l.clave);
      const kg = productWeights[l.clave] ?? 0;
      if (existing) {
        existing.bultos += l.product_units_short;
        existing.tons = (existing.bultos * kg) / 1000;
      } else {
        bySku.set(l.clave, {
          clave: l.clave,
          product_name: l.product_name,
          image_url: imageMap[l.clave] ?? null,
          bultos: l.product_units_short,
          tons: (l.product_units_short * kg) / 1000,
          weight_kg: kg,
        });
      }
    }
    return sortProducts(Array.from(bySku.values()).map(r => ({ ...r, name: r.product_name }))).map(({ name, ...rest }) => rest);
  }, [rawLines, poSupplier, poDayFilter, includeFaltantes, productWeights, imageMap]);

  // Re-initialize rows when filters change or dialog opens
  React.useEffect(() => {
    if (open) {
      setPoDayFilter(dayFilter);
      setPoSupplier("all");
      setIncludeFaltantes(true);
      setInitialized(false);
    }
  }, [open, dayFilter]);

  React.useEffect(() => {
    if (open && !initialized) {
      setRows(shortageRows);
      setInitialized(true);
    }
  }, [open, initialized, shortageRows]);

  const updateBultos = (idx: number, value: number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const bultos = Math.max(0, value);
      return { ...r, bultos, tons: (bultos * r.weight_kg) / 1000 };
    }));
  };

  const deleteRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const addProducts = (claves: string[]) => {
    const toAdd = claves
      .filter(c => !rows.some(r => r.clave === c))
      .map(c => {
        const product = allProducts.find(p => p.clave === c);
        if (!product) return null;
        const kg = productWeights[c] ?? 0;
        return {
          clave: c,
          product_name: product.product_name,
          image_url: product.image_url,
          bultos: 0,
          tons: 0,
          weight_kg: kg,
        };
      })
      .filter(Boolean) as PORow[];
    if (toAdd.length === 0) return;
    setRows(prev => [...prev, ...toAdd]);
  };

  // Multi-select popover state
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSelection, setAddSelection] = useState<Set<string>>(new Set());

  // Products available for "add" (filtered by supplier, sorted Ganador/Minino first)
  const addableProducts = useMemo(() => {
    let prods = allProducts;
    if (poSupplier !== "all") {
      prods = prods.filter(p => p.supplier === poSupplier);
    }
    const available = prods.filter(p => !rows.some(r => r.clave === p.clave));
    return sortProducts(available.map(p => ({ ...p, name: p.product_name })));
  }, [allProducts, poSupplier, rows]);

  const filteredAddable = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    if (!q) return addableProducts;
    return addableProducts.filter(p =>
      p.clave.toLowerCase().includes(q) || (p.product_name ?? "").toLowerCase().includes(q)
    );
  }, [addableProducts, addSearch]);

  const commitAddSelection = () => {
    if (addSelection.size === 0) { setAddOpen(false); return; }
    addProducts(Array.from(addSelection));
    setAddSelection(new Set());
    setAddSearch("");
    setAddOpen(false);
  };

  // AI suggestion: query historical purchases from stock_entries for the
  // current supplier and ask the model to recommend which SKUs to reorder
  // and typical bulto quantities.
  const [aiLoading, setAiLoading] = useState(false);
  const suggestRepeat = async () => {
    setAiLoading(true);
    try {
      const since = new Date();
      since.setMonth(since.getMonth() - 6);
      const sinceStr = since.toISOString().slice(0, 10);

      // Restrict to the current supplier's product ids (via products.supplier text match)
      const supplierProductIds = poSupplier === "all"
        ? null
        : (await supabase.from("products").select("id, clave").eq("supplier", poSupplier).eq("active", true)).data ?? [];
      const idFilter = supplierProductIds ? supplierProductIds.map((p: any) => p.id) : null;

      let q = supabase
        .from("stock_entries")
        .select("product_id, quantity, entry_date, supplier")
        .gte("entry_date", sinceStr)
        .limit(2000);
      if (idFilter) q = q.in("product_id", idFilter);
      else if (poSupplier !== "all") q = q.eq("supplier", poSupplier);
      const { data: entries, error } = await q;
      if (error) throw error;

      // Aggregate by clave
      const productById = new Map(allProducts.map((p: any) => [p.id ?? p.clave, p]));
      // We only have clave in allProducts, need to fetch id->clave map
      const { data: prodMap } = await supabase
        .from("products")
        .select("id, clave, name, supplier")
        .in("id", Array.from(new Set((entries ?? []).map(e => e.product_id).filter(Boolean))));
      const byId = new Map((prodMap ?? []).map((p: any) => [p.id, p]));

      type Agg = { clave: string; product_name: string; supplier: string; total: number; orders: number; last_date: string | null };
      const agg = new Map<string, Agg>();
      for (const e of entries ?? []) {
        const p = byId.get(e.product_id);
        if (!p?.clave) continue;
        const cur = agg.get(p.clave) ?? {
          clave: p.clave, product_name: p.name, supplier: p.supplier ?? "",
          total: 0, orders: 0, last_date: null,
        };
        cur.total += Number(e.quantity ?? 0);
        cur.orders += 1;
        if (!cur.last_date || (e.entry_date && e.entry_date > cur.last_date)) cur.last_date = e.entry_date;
        agg.set(p.clave, cur);
      }
      const history = Array.from(agg.values()).sort((a, b) => b.total - a.total).slice(0, 60);
      if (history.length === 0) {
        toast.info("Sin historial de compras para este proveedor en los últimos 6 meses");
        return;
      }

      const currentRows = rows.map(r => ({ clave: r.clave, bultos: r.bultos }));
      const system = `Eres un asistente de compras para una distribuidora farmacéutica veterinaria en México.
Analiza el historial de compras al proveedor y recomienda una orden de compra para repetir el patrón habitual.
Devuelve SOLO JSON válido, sin markdown, con la forma:
{"suggestions":[{"clave":"...","bultos": N, "reason":"corto"}]}
Reglas:
- Sugiere SKUs frecuentes del historial (>=2 órdenes en 6 meses) o de alta rotación (total alto).
- Para cada sugerencia, propone "bultos" como el promedio redondeado de bultos por orden histórica.
- No incluyas SKUs ya cubiertos con bultos > 0 en "currentRows".
- Máximo 20 sugerencias, ordenadas por total desc.`;
      const userMsg = JSON.stringify({ supplier: poSupplier, since: sinceStr, currentRows, history });

      const resp = await aiChatFn({
        data: {
          model: "google/gemini-2.5-flash",
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
        },
      });
      const content = (resp as any)?.content ?? (resp as any)?.choices?.[0]?.message?.content ?? "";
      const cleaned = String(content).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      const suggestions: { clave: string; bultos: number }[] = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];

      let added = 0;
      const newRows: PORow[] = [];
      for (const s of suggestions) {
        if (!s?.clave) continue;
        if (rows.some(r => r.clave === s.clave)) continue;
        const product = allProducts.find(p => p.clave === s.clave);
        if (!product) continue;
        const kg = productWeights[s.clave] ?? 0;
        const bultos = Math.max(0, Math.round(Number(s.bultos) || 0));
        newRows.push({
          clave: s.clave,
          product_name: product.product_name,
          image_url: product.image_url,
          bultos,
          tons: (bultos * kg) / 1000,
          weight_kg: kg,
        });
        added++;
      }
      if (added === 0) {
        toast.info("La IA no encontró sugerencias nuevas para este proveedor");
      } else {
        setRows(prev => [...prev, ...newRows]);
        toast.success(`IA sugirió ${added} productos con base en compras previas`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Error al generar sugerencias con IA");
    } finally {
      setAiLoading(false);
    }
  };


  const totalBultos = rows.reduce((s, r) => s + r.bultos, 0);
  const totalTons = rows.reduce((s, r) => s + r.tons, 0);
  const fmtTons = (t: number) => t.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const supplierLabel = poSupplier === "all" ? "Todos" : poSupplier;
  const todayStr = format(new Date(), "dd/MM/yyyy");

  // Excel export
  function handleExcel() {
    if (rows.length === 0) { toast("Sin productos para exportar"); return; }
    const data = rows.map((r, i) => ({
      "#": i + 1,
      "Clave": r.clave,
      "Producto": r.product_name,
      "Bultos": r.bultos,
      "Toneladas": Number(r.tons.toFixed(2)),
    }));
    data.push({
      "#": "" as any, "Clave": "", "Producto": "TOTAL",
      "Bultos": totalBultos, "Toneladas": Number(totalTons.toFixed(2)),
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 50 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orden de Compra");
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    XLSX.writeFile(wb, `Orden de Compra ${supplierLabel} ${dd}-${mm}-${yy}.xlsx`);
  }

  // PDF (image) export
  async function handlePDF() {
    const node = printRef.current;
    if (!node) { toast("Error al generar PDF"); return; }
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
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yy = String(now.getFullYear()).slice(-2);
      const link = document.createElement("a");
      link.download = `Orden de Compra ${supplierLabel} ${dd}-${mm}-${yy}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      toast("Error al generar PDF");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">Nueva Orden de Compra</DialogTitle>
        </DialogHeader>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-end border-b border-border pb-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Proveedor</Label>
            <Select value={poSupplier} onValueChange={(v) => { setPoSupplier(v); setInitialized(false); }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                {suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Día de entrega</Label>
            <Select value={poDayFilter} onValueChange={(v) => { setPoDayFilter(v); setInitialized(false); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los días</SelectItem>
                {deliveryDays.map(d => (
                  <SelectItem key={d} value={d}>{fmtDate(d)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pb-1">
            <Switch
              id="include-faltantes"
              checked={includeFaltantes}
              onCheckedChange={(v) => { setIncludeFaltantes(v); setInitialized(false); }}
            />
            <Label htmlFor="include-faltantes" className="text-sm cursor-pointer">
              Incluir faltantes
            </Label>
          </div>
        </div>

        {/* Add product multi-select + AI suggest */}
        <div className="flex gap-2">
          <Popover open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setAddSearch(""); setAddSelection(new Set()); } }}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex-1 justify-between font-normal">
                <span className="text-muted-foreground">
                  {addSelection.size > 0
                    ? `${addSelection.size} seleccionados`
                    : "Agregar productos..."}
                </span>
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] p-0 flex flex-col max-h-[min(70vh,var(--radix-popover-content-available-height))]"
              align="start"
              side="bottom"
              sideOffset={4}
              avoidCollisions
              collisionPadding={16}
            >
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Buscar por clave o nombre…"
                    className="pl-7 h-8"
                  />
                </div>
                <div className="flex items-center justify-between px-1 pt-2 text-xs text-muted-foreground">
                  <button
                    className="hover:text-foreground"
                    onClick={() => setAddSelection(new Set(filteredAddable.map(p => p.clave)))}
                  >
                    Seleccionar todo ({filteredAddable.length})
                  </button>
                  {addSelection.size > 0 && (
                    <button
                      className="hover:text-foreground"
                      onClick={() => setAddSelection(new Set())}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
              <ScrollArea className="max-h-[320px]">
                <div className="p-1">
                  {filteredAddable.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Sin resultados
                    </div>
                  )}
                  {filteredAddable.map((p) => {
                    const checked = addSelection.has(p.clave);
                    return (
                      <label
                        key={p.clave}
                        className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setAddSelection(prev => {
                              const next = new Set(prev);
                              if (v) next.add(p.clave);
                              else next.delete(p.clave);
                              return next;
                            });
                          }}
                        />
                        <ProductThumb src={p.image_url} size="sm" />
                        <span className="font-mono text-xs text-muted-foreground shrink-0">{p.clave}</span>
                        <span className="truncate">{p.product_name}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between p-2 border-t border-border gap-2">
                {addSelection.size > 0 && (
                  <Badge variant="secondary">{addSelection.size} seleccionados</Badge>
                )}
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancelar</Button>
                  <Button size="sm" onClick={commitAddSelection} disabled={addSelection.size === 0}>
                    Agregar
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            onClick={suggestRepeat}
            disabled={aiLoading}
            title="Sugerir productos con base en compras anteriores al proveedor"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Sugerir con IA
          </Button>
        </div>

        {/* Table */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="min-w-[700px]">
            {/* Header */}
            <div className="grid grid-cols-[40px_120px_1fr_120px_120px_44px] gap-4 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              <div />
              <div>Clave</div>
              <div>Producto</div>
              <div className="text-right">Bultos</div>
              <div className="text-right">Toneladas</div>
              <div />
            </div>

            {/* Rows */}
            {rows.map((row, i) => (
              <div
                key={row.clave}
                className="grid grid-cols-[40px_120px_1fr_120px_120px_44px] gap-4 px-4 py-3 items-center border-b border-border/30 hover:bg-muted/30"
              >
                <ProductThumb src={row.image_url} size="sm" />
                <div className="font-mono text-sm font-medium text-primary">{row.clave}</div>
                <div className="text-sm text-foreground truncate">{row.product_name}</div>
                <div className="flex justify-end">
                  <Input
                    type="number"
                    min={0}
                    value={row.bultos}
                    onChange={(e) => updateBultos(i, parseInt(e.target.value) || 0)}
                    className="w-24 h-9 text-right text-sm tabular-nums"
                  />
                </div>
                <div className="text-right text-sm tabular-nums text-muted-foreground">
                  {fmtTons(row.tons)}
                </div>
                <div className="flex justify-center">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteRow(i)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                  </Button>
                </div>
              </div>
            ))}

            {rows.length === 0 && (
              <div className="py-10 text-center text-muted-foreground text-sm">
                Sin productos. Activa "Incluir faltantes" o selecciona un producto arriba.
              </div>
            )}

            {/* Total row */}
            {rows.length > 0 && (
              <div className="grid grid-cols-[40px_120px_1fr_120px_120px_44px] gap-4 px-4 py-3 items-center border-t-2 border-border font-semibold">
                <div />
                <div />
                <div className="text-sm text-muted-foreground uppercase tracking-wider">Total</div>
                <div className="text-right text-sm tabular-nums">{totalBultos.toLocaleString("es-MX")}</div>
                <div className="text-right text-sm tabular-nums">{fmtTons(totalTons)}</div>
                <div />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Export buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={rows.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handlePDF} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Descargar PDF
          </Button>
        </div>
      </DialogContent>

      {/* Offscreen print card */}
      <POPrintCard ref={printRef} rows={rows} supplier={supplierLabel} totalBultos={totalBultos} totalTons={totalTons} />
    </Dialog>
  );
}

/* ── Offscreen print card for PDF/image export ── */

const POPrintCard = React.forwardRef<HTMLDivElement, {
  rows: PORow[];
  supplier: string;
  totalBultos: number;
  totalTons: number;
}>(({ rows, supplier, totalBultos, totalTons }, ref) => {
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const bg = isDark ? "#020817" : "#ffffff";
  const fg = isDark ? "#f8fafc" : "#020817";
  const muted = isDark ? "#94a3b8" : "#64748b";
  const accent = "#1e293b";
  const separatorColor = isDark ? "rgba(248,250,252,0.10)" : "rgba(2,8,23,0.10)";

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const tnum: React.CSSProperties = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1, "lnum" 1' };
  const fmtTons = (t: number) => t.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gridCols = "130px minmax(0, 1fr) 120px 120px";

  return (
    <div
      ref={ref}
      style={{
        position: "fixed", top: 0, left: 0, transform: "translateX(-200vw)",
        pointerEvents: "none", zIndex: 0, width: 1000, minHeight: 700,
        backgroundColor: bg, color: fg,
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        padding: 48, boxSizing: "border-box",
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Orden de Compra
        </div>
        <div style={{ fontSize: 20, color: fg, marginTop: 6, fontWeight: 600 }}>
          {supplier}
          <span style={{ fontSize: 16, color: muted, fontWeight: 400, marginLeft: 12 }}>· {dateStr}</span>
        </div>
      </div>

      <div style={{ height: 3, background: accent, borderRadius: 2, marginBottom: 24 }} />

      <div style={{ display: "flex", gap: 48, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Productos</div>
          <div style={{ fontSize: 28, fontWeight: 700, ...tnum }}>{rows.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Bultos</div>
          <div style={{ fontSize: 28, fontWeight: 700, ...tnum }}>{totalBultos.toLocaleString("es-MX")}</div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Toneladas</div>
          <div style={{ fontSize: 28, fontWeight: 700, ...tnum }}>{fmtTons(totalTons)}</div>
        </div>
      </div>

      {/* Table header */}
      <div style={{
        display: "grid", gridTemplateColumns: gridCols, columnGap: 20,
        fontSize: 13, color: muted, textTransform: "uppercase", letterSpacing: "0.06em",
        paddingBottom: 10, borderBottom: `1px solid ${separatorColor}`,
      }}>
        <div>Clave</div>
        <div>Producto</div>
        <div style={{ textAlign: "right" }}>Bultos</div>
        <div style={{ textAlign: "right" }}>Toneladas</div>
      </div>

      {rows.map((r, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: gridCols, columnGap: 20,
          fontSize: 15, paddingTop: 10, paddingBottom: 10,
          borderBottom: `1px solid ${separatorColor}`, alignItems: "center",
        }}>
          <div style={{ fontFamily: "'SF Mono', Menlo, monospace", fontWeight: 600 }}>{r.clave}</div>
          <div style={{ wordBreak: "break-word", lineHeight: 1.3 }}>{r.product_name || "—"}</div>
          <div style={{ textAlign: "right", fontWeight: 600, ...tnum }}>{r.bultos.toLocaleString("es-MX")}</div>
          <div style={{ textAlign: "right", fontWeight: 600, ...tnum }}>{fmtTons(r.tons)}</div>
        </div>
      ))}

      {rows.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: gridCols, columnGap: 20,
          fontSize: 16, paddingTop: 14, paddingBottom: 10, marginTop: 4,
          borderTop: `2px solid ${separatorColor}`, fontWeight: 700,
        }}>
          <div />
          <div style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 13, color: muted }}>Total</div>
          <div style={{ textAlign: "right", ...tnum }}>{totalBultos.toLocaleString("es-MX")}</div>
          <div style={{ textAlign: "right", ...tnum }}>{fmtTons(totalTons)}</div>
        </div>
      )}
    </div>
  );
});
POPrintCard.displayName = "POPrintCard";
