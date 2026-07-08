// @ts-nocheck
import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatMarkup, applyMarkup } from "@/lib/price-list-math";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, Upload, FileSpreadsheet, Check, X, AlertTriangle, Download, RotateCw, Lock } from "lucide-react";
import { OverridesMatrixView } from "@/components/clients/OverridesMatrixView";
import { PriceListsImportDialog } from "@/components/pricelists/PriceListsImportDialog";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

/* ── PDF Export ── */
const DEEP_BLUE: [number, number, number] = [15, 23, 42];
const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [30, 30, 30];
const fmtPrice = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function generatePriceListPDF(listName: string, items: { clave: string; name: string; brand: string; price: number; catalogPrice: number }[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const W = 215.9;
  const H = 279.4;
  const MARGIN_X = 12;
  const HEADER_H = 24;
  const FOOTER_H = 14;

  const COL_SKU_X = MARGIN_X;
  const COL_SKU_W = 28;
  const COL_NAME_X = COL_SKU_X + COL_SKU_W;
  const COL_CATALOG_W = 28;
  const COL_PRICE_W = 28;
  const COL_PRICE_X = W - MARGIN_X - COL_PRICE_W;
  const COL_CATALOG_X = COL_PRICE_X - COL_CATALOG_W - 2;
  const COL_NAME_W = COL_CATALOG_X - COL_NAME_X - 2;

  const ROW_H = 7;
  const BODY_TOP = HEADER_H + 14;
  const BODY_BOTTOM = H - FOOTER_H - 4;
  const ROWS_PER_PAGE = Math.floor((BODY_BOTTOM - BODY_TOP) / ROW_H);
  const totalPages = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE));

  const drawHeader = (page: number) => {
    doc.setFillColor(...DEEP_BLUE);
    doc.rect(0, 0, W, HEADER_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...WHITE);
    doc.text(`${listName} · Lista de precios`, MARGIN_X, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const today = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
    doc.text(`Precios con IVA · ${today}`, MARGIN_X, 20);

    const hy = HEADER_H + 9;
    doc.setFillColor(240, 240, 240);
    doc.rect(MARGIN_X, hy - 5, W - MARGIN_X * 2, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text("SKU", COL_SKU_X + 1, hy);
    doc.text("Producto", COL_NAME_X + 1, hy);
    doc.text("Catálogo", COL_CATALOG_X + COL_CATALOG_W - 1, hy, { align: "right" });
    doc.text(listName, COL_PRICE_X + COL_PRICE_W - 1, hy, { align: "right" });
  };

  const drawFooter = (page: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`${page} / ${totalPages}`, W / 2, H - 6, { align: "center" });
  };

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) doc.addPage();
    drawHeader(page + 1);

    const pageItems = items.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

    for (let i = 0; i < pageItems.length; i++) {
      const p = pageItems[i];
      const y = BODY_TOP + i * ROW_H;

      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(MARGIN_X, y - 4, W - MARGIN_X * 2, ROW_H, "F");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...DARK);
      doc.text(p.clave ?? "—", COL_SKU_X + 1, y + 1);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      const nameLines = doc.splitTextToSize(`${p.brand ? p.brand + " · " : ""}${p.name}`, COL_NAME_W);
      doc.text(nameLines[0] ?? "", COL_NAME_X + 1, y + 1);

      // Catalog price (muted)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 140);
      doc.text(fmtPrice(p.catalogPrice), COL_CATALOG_X + COL_CATALOG_W - 1, y + 1, { align: "right" });

      // List price (bold blue)
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DEEP_BLUE);
      doc.text(fmtPrice(p.price), COL_PRICE_X + COL_PRICE_W - 1, y + 1, { align: "right" });
    }

    drawFooter(page + 1);
  }

  doc.save(`${listName.toLowerCase().replace(/\s+/g, "_")}_lista_de_precios.pdf`);
}

interface PriceList {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  markup_pct: number | null;
  default_for_client_type: "mayoreo" | "menudeo" | null;
}

interface PriceListItem {
  id: string;
  price_list_id: string;
  product_id: string;
  price_with_iva: number;
  manual_override: boolean;
  products: {
    clave: string;
    name: string;
    sale_price_with_iva: number;
    image_url: string | null;
    brand: string | null;
  } | null;
}

export default function PriceLists() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // View mode — global tier (Habid / Menudeo / …) or the cross-client
  // overrides matrix. The tier ID drives the active tier when in "tier"
  // mode; "matrix" mode is the new "who pays what" view.
  const [viewMode, setViewMode] = useState<"tier" | "matrix">("tier");
  const [activePL, setActivePL] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNewList, setShowNewList] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDefaultType, setNewDefaultType] = useState<"mayoreo" | "menudeo" | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parsedRows, setParsedRows] = useState<{ clave: string; price: number; name?: string; matched?: boolean; productId?: string }[]>([]);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Products for matching claves
  const { data: allProducts = [] } = useQuery({
    queryKey: ["products-all-claves"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, clave, name").order("clave") as any;
      if (error) throw error;
      return (data ?? []) as { id: string; clave: string; name: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const parseExcel = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

        if (json.length === 0) {
          toast({ title: "Error", description: lang === "es" ? "El archivo está vacío" : "File is empty" });
          return;
        }

        // Find clave and price columns by header name heuristics
        const headers = Object.keys(json[0]);
        const claveCol = headers.find((h) => /clave|sku|código|codigo|code/i.test(h)) ?? headers[0];
        const priceCol = headers.find((h) => /precio|price|mayoreo|iva|costo|cost/i.test(h)) ?? headers[headers.length - 1];
        const nameCol = headers.find((h) => /desc|nombre|name|producto|product/i.test(h));

        const productMap = new Map(allProducts.map((p) => [p.clave.toUpperCase(), p]));

        const rows = json
          .map((row) => {
            const rawClave = String(row[claveCol] ?? "").trim().toUpperCase();
            const rawPrice = parseFloat(String(row[priceCol] ?? "0").replace(/[,$]/g, ""));
            const rawName = nameCol ? String(row[nameCol] ?? "").trim() : undefined;
            if (!rawClave || isNaN(rawPrice) || rawPrice <= 0) return null;
            const product = productMap.get(rawClave);
            return {
              clave: rawClave,
              price: Math.round(rawPrice * 100) / 100,
              name: rawName || product?.name,
              matched: !!product,
              productId: product?.id,
            };
          })
          .filter(Boolean) as typeof parsedRows;

        setParsedRows(rows);
      } catch {
        toast({ title: "Error", description: lang === "es" ? "No se pudo leer el archivo" : "Could not read file" });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [allProducts, lang, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseExcel(file);
  }, [parseExcel]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseExcel(file);
  }, [parseExcel]);

  const resetDialog = () => {
    setShowNewList(false);
    setNewName("");
    setParsedRows([]);
    setFileName("");
    setDragOver(false);
  };

  const createPriceList = async () => {
    if (!newName.trim() || parsedRows.length === 0) return;
    const matched = parsedRows.filter((r) => r.matched && r.productId);
    if (matched.length === 0) {
      toast({ title: "Error", description: lang === "es" ? "Ningún SKU coincide con el catálogo" : "No SKUs match catalog" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.from("price_lists").insert({
        name: newName.trim(),
        description: `Importado desde ${fileName}`,
      } as any).select("id").single();
      if (error) throw error;

      const plId = (data as any).id;
      const items = matched.map((r) => ({
        price_list_id: plId,
        product_id: r.productId!,
        price_with_iva: r.price,
      }));

      // Insert in batches of 50
      for (let i = 0; i < items.length; i += 50) {
        const batch = items.slice(i, i + 50);
        const { error: insErr } = await supabase.from("price_list_items").insert(batch as any);
        if (insErr) throw insErr;
      }

      await queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      await queryClient.invalidateQueries({ queryKey: ["price-list-items"] });
      await queryClient.invalidateQueries({ queryKey: ["price-list-all-items"] });
      setActivePL(plId);
      resetDialog();
      toast({ title: lang === "es" ? `Lista creada — ${matched.length} productos` : `List created — ${matched.length} products` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    } finally {
      setCreating(false);
    }
  };

  const { data: priceLists = [], isLoading: plLoading } = useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_lists").select("*").order("created_at") as any;
      if (error) throw error;
      return (data ?? []) as PriceList[];
    },
  });

  const currentPL = priceLists.find((pl) => pl.id === activePL) ?? priceLists[0];
  const plId = currentPL?.id;

  if (priceLists.length > 0 && !activePL) {
    setActivePL(priceLists[0].id);
  }

  // Items shown for a list. Two layers:
  //   1. Override rows in price_list_items — manual prices per product.
  //   2. For every other ACTIVE product, synthesize a row at the formula
  //      price (mayoreo ± markup_pct). This is what was missing before:
  //      when we deleted the override rows after wiring Habid/Menudeo as
  //      formulas, the page went empty even though every product still
  //      has a valid price.
  // For lists WITHOUT a markup_pct (custom-price-only lists like the old
  // Habid before we set −4), only override rows show — that preserves
  // the legacy behavior.
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["price-list-items", plId, currentPL?.markup_pct],
    queryFn: async (): Promise<PriceListItem[]> => {
      if (!plId || !currentPL) return [];
      // 1. Existing overrides
      const { data: overrideRows, error: oErr } = await (supabase as any)
        .from("price_list_items")
        .select("*, products(clave, name, sale_price_with_iva, image_url, brand)")
        .eq("price_list_id", plId)
        .order("created_at");
      if (oErr) throw oErr;
      const overrides = (overrideRows ?? []) as PriceListItem[];

      // 2. If list has a markup formula, also add formula-priced rows
      //    for every active product missing an override row.
      if (currentPL.markup_pct == null) return overrides;

      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, clave, name, sale_price_with_iva, image_url, brand")
        .eq("active", true)
        .order("clave");
      if (pErr) throw pErr;
      const overriddenIds = new Set(overrides.map((o) => o.product_id));
      const synthesized: PriceListItem[] = (products ?? [])
        .filter((p: any) => !overriddenIds.has(p.id) && p.sale_price_with_iva != null)
        .map((p: any) => ({
          // Use a stable synthetic id so React keys don't collide; still
          // distinguishable from real rows because `manual_override`
          // stays false and there's no row in the DB to mutate.
          id: `formula:${plId}:${p.id}`,
          price_list_id: plId,
          product_id: p.id,
          price_with_iva: applyMarkup(Number(p.sale_price_with_iva) || 0, currentPL.markup_pct),
          manual_override: false,
          products: {
            clave: p.clave,
            name: p.name,
            sale_price_with_iva: Number(p.sale_price_with_iva) || 0,
            image_url: p.image_url,
            brand: p.brand,
          },
        }));

      return [...overrides, ...synthesized];
    },
    enabled: !!plId && !!currentPL,
  });

  const fmtMXN = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n);

  const [resyncing, setResyncing] = useState(false);
  const handleResync = async () => {
    if (!plId || !currentPL) return;
    if (currentPL.markup_pct == null) return; // only derived lists
    if (!confirm(
      `Resincronizar "${currentPL.name}" desde mayoreo (${formatMarkup(currentPL.markup_pct)})?\n\n` +
      `Esto recalcula los precios de todos los productos sin override manual. Los productos con candado se mantienen.`
    )) return;
    setResyncing(true);
    try {
      const { data, error } = await (supabase.rpc as any)("resync_price_list", { p_list_id: plId });
      if (error) throw error;
      const r = data as { updated: number; inserted: number; skipped_overridden: number };
      await queryClient.invalidateQueries({ queryKey: ["price-list-items", plId] });
      await queryClient.invalidateQueries({ queryKey: ["price-list-all-items"] });
      toast({
        title: lang === "es" ? "Lista resincronizada" : "List resynced",
        description: lang === "es"
          ? `${r.updated} actualizados · ${r.inserted} nuevos · ${r.skipped_overridden} bloqueados`
          : `${r.updated} updated · ${r.inserted} added · ${r.skipped_overridden} locked`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    } finally {
      setResyncing(false);
    }
  };

  // Group by brand and filter
  const filtered = items.filter((item) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      item.products?.clave?.toLowerCase().includes(s) ||
      item.products?.name?.toLowerCase().includes(s) ||
      item.products?.brand?.toLowerCase().includes(s)
    );
  });

  const grouped = new Map<string, PriceListItem[]>();
  for (const item of filtered) {
    const brand = item.products?.brand ?? "Sin marca";
    if (!grouped.has(brand)) grouped.set(brand, []);
    grouped.get(brand)!.push(item);
  }
  // Sort brands: Ganador first, Minino second, rest alphabetical
  const BRAND_PRIORITY = ["Ganador", "Minino"];
  const sortedBrands = [...grouped.keys()].sort((a, b) => {
    const ai = BRAND_PRIORITY.indexOf(a);
    const bi = BRAND_PRIORITY.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const totalSaved = filtered.reduce((sum, item) => {
    const catalog = item.products?.sale_price_with_iva ?? 0;
    const diff = catalog - item.price_with_iva;
    return sum + (diff > 0 ? diff : 0);
  }, 0);

  if (plLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {currentPL ? `${currentPL.name} · ${lang === "es" ? "Lista de precios" : "Price list"}` : (lang === "es" ? "Listas de Precios" : "Price Lists")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {lang === "es"
            ? "Precios especiales por vendedor o acuerdo comercial"
            : "Special pricing by salesperson or commercial agreement"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {priceLists.map((pl) => (
          <button
            key={pl.id}
            onClick={() => { setViewMode("tier"); setActivePL(pl.id); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              viewMode === "tier" && pl.id === plId
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80 text-foreground"
            }`}
          >
            {pl.name}
          </button>
        ))}
        <button
          onClick={() => setViewMode("matrix")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            viewMode === "matrix"
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/80 text-foreground"
          }`}
          title="Quién paga qué precio en qué SKU"
        >
          📊 Por cliente
        </button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 gap-1.5 shrink-0"
          onClick={() => setShowImport(true)}
        >
          <Upload className="h-4 w-4" />
          {lang === "es" ? "Importar Excel" : "Import Excel"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 gap-1.5 shrink-0"
          onClick={() => setShowNewList(true)}
        >
          <Plus className="h-4 w-4" />
          {lang === "es" ? "Nueva lista" : "New list"}
        </Button>
      </div>

      {showImport && (
        <PriceListsImportDialog
          onClose={() => setShowImport(false)}
          onSaved={async () => {
            setShowImport(false);
            await queryClient.invalidateQueries({ queryKey: ["price-lists"] });
            await queryClient.invalidateQueries({ queryKey: ["price-list-items"] });
            await queryClient.invalidateQueries({ queryKey: ["price-list-all-items"] });
          }}
        />
      )}

      {/* Cross-client overrides matrix replaces the per-tier content when
          active. Returns to the tier view by clicking any tier button. */}
      {viewMode === "matrix" && <OverridesMatrixView />}

      {/* New price list dialog */}
      <Dialog open={showNewList} onOpenChange={(o) => { if (!o) resetDialog(); else setShowNewList(true); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="text-xl">{lang === "es" ? "Nueva lista de precios" : "New price list"}</DialogTitle>
          </DialogHeader>

          <div className="px-6 pb-6 mt-4 space-y-5">
            {/* Name */}
            <Input
              autoFocus
              placeholder={lang === "es" ? "Nombre de la lista (ej. Habid, Proveedor X)" : "List name (e.g. Habid, Supplier X)"}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-base h-11"
            />

            {/* Drop zone */}
            {parsedRows.length === 0 ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Upload className={`h-10 w-10 mx-auto mb-3 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm font-medium">
                  {lang === "es" ? "Arrastra un archivo Excel aquí" : "Drag an Excel file here"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {lang === "es"
                    ? "o haz clic para seleccionar · .xlsx, .xls, .csv"
                    : "or click to select · .xlsx, .xls, .csv"}
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  {lang === "es"
                    ? "El archivo debe tener columnas de Clave/SKU y Precio"
                    : "File must have Clave/SKU and Price columns"}
                </p>
              </div>
            ) : (
              <>
                {/* File info */}
                <div className="flex items-center gap-3 bg-muted/30 border border-border rounded-lg px-4 py-3">
                  <FileSpreadsheet className="h-5 w-5 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsedRows.length} {lang === "es" ? "filas leídas" : "rows read"} ·{" "}
                      <span className="text-green-500">{parsedRows.filter((r) => r.matched).length} {lang === "es" ? "coinciden" : "matched"}</span>
                      {parsedRows.filter((r) => !r.matched).length > 0 && (
                        <span className="text-amber-500"> · {parsedRows.filter((r) => !r.matched).length} {lang === "es" ? "sin match" : "unmatched"}</span>
                      )}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setParsedRows([]); setFileName(""); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Preview table */}
                <div className="border border-border rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                  <div className="grid grid-cols-[100px_1fr_110px_50px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border sticky top-0">
                    <div>Clave</div>
                    <div>Producto</div>
                    <div className="text-right">{lang === "es" ? "Precio" : "Price"}</div>
                    <div className="text-center">Match</div>
                  </div>
                  {parsedRows.map((row, i) => (
                    <div
                      key={i}
                      className={`grid grid-cols-[100px_1fr_110px_50px] gap-2 px-4 py-2.5 items-center border-b border-border/50 ${
                        !row.matched ? "bg-amber-500/5" : ""
                      }`}
                    >
                      <div className="font-mono text-xs text-primary">{row.clave}</div>
                      <div className="text-sm truncate">{row.name ?? "—"}</div>
                      <div className="text-sm text-right font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                        ${row.price.toFixed(2)}
                      </div>
                      <div className="text-center">
                        {row.matched ? (
                          <Check className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={resetDialog}>
                {lang === "es" ? "Cancelar" : "Cancel"}
              </Button>
              <Button
                disabled={!newName.trim() || parsedRows.filter((r) => r.matched).length === 0 || creating}
                onClick={createPriceList}
                className="gap-1.5"
              >
                {creating ? "..." : (
                  <>
                    <Plus className="h-4 w-4" />
                    {lang === "es"
                      ? `Crear con ${parsedRows.filter((r) => r.matched).length} productos`
                      : `Create with ${parsedRows.filter((r) => r.matched).length} products`}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {viewMode === "tier" && currentPL && (
        <>
          {/* Description + search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{currentPL.description}</span>
              <Badge variant="secondary" className="text-xs">
                {filtered.length} SKUs
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={lang === "es" ? "Buscar producto..." : "Search product..."}
                  className="pl-9 h-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {currentPL.markup_pct != null && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 shrink-0"
                  onClick={handleResync}
                  disabled={resyncing}
                  title={`Recalcular precios desde mayoreo (${formatMarkup(currentPL.markup_pct)}) — los items con candado se mantienen`}
                >
                  <RotateCw className={`h-4 w-4 ${resyncing ? "animate-spin" : ""}`} />
                  {resyncing
                    ? (lang === "es" ? "Resincronizando..." : "Syncing...")
                    : (lang === "es" ? "Resincronizar" : "Resync")}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 shrink-0"
                onClick={() => {
                  const pdfItems = filtered.map((item) => ({
                    clave: item.products?.clave ?? "",
                    name: item.products?.name ?? "",
                    brand: item.products?.brand ?? "",
                    price: item.price_with_iva,
                    catalogPrice: item.products?.sale_price_with_iva ?? 0,
                  })).sort((a, b) => a.clave.localeCompare(b.clave));
                  generatePriceListPDF(currentPL.name, pdfItems);
                }}
                disabled={filtered.length === 0}
              >
                <Download className="h-4 w-4" />
                PDF
              </Button>
            </div>
          </div>

          {/* Products by brand */}
          {itemsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : sortedBrands.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {lang === "es" ? "Sin productos en esta lista" : "No products in this list"}
            </div>
          ) : (
            <div className="space-y-6">
              {sortedBrands.map((brand) => {
                const brandItems = grouped.get(brand)!;
                return (
                  <div key={brand}>
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{brand}</h2>
                      <span className="text-xs text-muted-foreground">({brandItems.length})</span>
                    </div>

                    <div className="border border-border rounded-lg overflow-hidden">
                      {/* Table header */}
                      <div className="grid grid-cols-[1fr_110px_110px_80px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border">
                        <div>Producto</div>
                        <div className="text-right">{currentPL.name}</div>
                        <div className="text-right">{lang === "es" ? "Catálogo" : "Catalog"}</div>
                        <div className="text-right">Diff</div>
                      </div>

                      {brandItems
                        .sort((a, b) => (a.products?.clave ?? "").localeCompare(b.products?.clave ?? ""))
                        .map((item, idx) => {
                          const catalog = item.products?.sale_price_with_iva ?? 0;
                          const diff = item.price_with_iva - catalog;
                          const pct = catalog > 0 ? (diff / catalog) * 100 : 0;

                          return (
                            <div
                              key={item.id}
                              className={`grid grid-cols-[1fr_110px_110px_80px] gap-2 px-4 py-3 items-center ${
                                idx < brandItems.length - 1 ? "border-b border-border/50" : ""
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <ProductThumb src={item.products?.image_url ?? null} size="md" />
                                <div className="min-w-0">
                                  <span className="font-mono text-xs text-primary">{item.products?.clave}</span>
                                  <p className="text-sm truncate">{item.products?.name}</p>
                                </div>
                              </div>
                              <div className="text-sm text-right font-semibold text-amber-400 flex items-center justify-end gap-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {item.manual_override && (
                                  <Lock
                                    className="h-3 w-3 text-muted-foreground"
                                    aria-label="Precio manual — no se recalcula al resincronizar"
                                  />
                                )}
                                {fmtMXN(item.price_with_iva)}
                              </div>
                              <div className="text-sm text-right text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {fmtMXN(catalog)}
                              </div>
                              <div className="text-right">
                                <span
                                  className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                    diff < 0
                                      ? "text-red-400 bg-red-500/10"
                                      : diff > 0
                                      ? "text-green-400 bg-green-500/10"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}

              {/* Summary */}
              <div className="bg-muted/30 border border-border rounded-lg p-4 text-sm">
                <span className="text-muted-foreground">
                  {lang === "es" ? "Diferencia promedio vs catálogo:" : "Average difference vs catalog:"}
                </span>
                <span className="ml-2 font-semibold text-red-400">
                  -{fmtMXN(totalSaved)} {lang === "es" ? "por unidad total" : "per total unit"}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
