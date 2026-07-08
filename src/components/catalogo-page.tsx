import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveListPrice } from "@/lib/price-list-math";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, Download, Package, Eye, X, Loader2, ClipboardList, UserRound, AlertTriangle, BadgePercent, ArrowDown, ArrowUp, Pencil } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditClientPriceDialog, type EditableProduct } from "@/components/clients/EditClientPriceDialog";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import { AvailabilityDownloadDialog } from "@/components/AvailabilityDownloadDialog";
import { Product360Drawer } from "@/components/catalog/Product360Drawer";

/* ── types ─────────────────────────────────────── */
type Product = {
  id: string;
  clave: string;
  name: string;
  brand: string | null;
  weight_kg: number | null;
  sale_price_with_iva: number | null;
  image_url: string | null;
  active: boolean;
};

/* ── constants ─────────────────────────────────── */
const DEEP_BLUE: [number, number, number] = [15, 23, 42];
const BRAND_BLUE: [number, number, number] = [59, 130, 246];
const WEIGHT_GREEN: [number, number, number] = [22, 163, 74];
const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [30, 30, 30];
const LIGHT_GRAY: [number, number, number] = [200, 200, 200];

import { BUSINESS_CONTACT } from "@/config/business";

const STORAGE_BASE =
  "https://rfyshhzkhewzjudohzii.supabase.co/storage/v1/object/public/product-images/";

/* ── helpers ───────────────────────────────────── */
async function loadImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function drawPaw(
  doc: jsPDF,
  cx: number,
  cy: number,
  size: number,
  gray = 234
) {
  doc.setFillColor(gray, gray, gray);
  const s = size;
  doc.ellipse(cx, cy + s * 0.15, s * 0.25, s * 0.22, "F");
  doc.ellipse(cx - s * 0.28, cy - s * 0.12, s * 0.12, s * 0.12, "F");
  doc.ellipse(cx, cy - s * 0.2, s * 0.12, s * 0.12, "F");
  doc.ellipse(cx + s * 0.28, cy - s * 0.12, s * 0.12, s * 0.12, "F");
}

function formatPrice(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── PDF generation ────────────────────────────── */
async function generateCatalogPDF(
  products: Product[],
  onProgress?: (msg: string) => void,
  priceListLabel?: string
) {
  onProgress?.("Cargando imágenes...");

  // Preload all product images + QR
  const imageCache = new Map<string, string>();

  // Load QR (only if a QR image is configured)
  if (BUSINESS_CONTACT.qrImageUrl) {
    try {
      const qrB64 = await loadImageAsBase64(BUSINESS_CONTACT.qrImageUrl);
      imageCache.set("qr", qrB64);
    } catch {
      /* QR optional */
    }
  }

  // Load product images
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (p.image_url) {
      onProgress?.(`Cargando imagen ${i + 1}/${products.length}...`);
      try {
        const b64 = await loadImageAsBase64(p.image_url);
        imageCache.set(p.id, b64);
      } catch {
        /* skip */
      }
    }
  }

  onProgress?.("Generando PDF...");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const W = 215.9;
  const H = 279.4;
  const COLS = 3;
  const MARGIN_X = 12;
  const GAP_X = 8;
  const GAP_Y = 8;
  const CARD_W = (W - MARGIN_X * 2 - GAP_X * (COLS - 1)) / COLS;
  const HEADER_H = 28;
  const FOOTER_H = 32;
  const MARGIN_TOP = HEADER_H + 6;
  const IMG_H = 50;
  const IMG_W = 38;
  const BADGE_H = 5.5;
  const NAME_LINE_H = 3.8;
  const PRICE_H = 9;
  const SKU_H = 6;
  const MAX_NAME_LINES = 2;
  const CARD_H =
    3 + IMG_H + 2 + BADGE_H + 2 + NAME_LINE_H * MAX_NAME_LINES + 1 + PRICE_H + SKU_H + 3;
  const ROWS_PER_PAGE = Math.floor((H - MARGIN_TOP - FOOTER_H - 8) / (CARD_H + GAP_Y));
  const PER_PAGE = COLS * ROWS_PER_PAGE;
  const totalPages = Math.ceil(products.length / PER_PAGE);

  // Seeded random for paw positions
  const pawPositions: { x: number; y: number; s: number }[] = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 14; i++) {
    pawPositions.push({
      x: 10 + rand() * (W - 20),
      y: 30 + rand() * (H - 70),
      s: 8 + rand() * 6,
    });
  }

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) doc.addPage();

    // Paw background
    pawPositions.forEach((p) => drawPaw(doc, p.x, p.y, p.s));

    // Header
    doc.setFillColor(...DEEP_BLUE);
    doc.rect(0, 0, W, HEADER_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...WHITE);
    doc.text("Catálogo de productos", 12, 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text("Alimentos para mascotas · Precios con IVA incluido", 12, 24);
    // Download date + price list (top-right)
    const downloadDate = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
    doc.setFontSize(9);
    doc.text(`Descargado: ${downloadDate}`, W - 12, 18, { align: "right" });
    if (priceListLabel) {
      doc.text(`Lista: ${priceListLabel}`, W - 12, 24, { align: "right" });
    }

    // Products for this page
    const pageProducts = products.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

    for (let idx = 0; idx < pageProducts.length; idx++) {
      const p = pageProducts[idx];
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const x = MARGIN_X + col * (CARD_W + GAP_X);
      const y = MARGIN_TOP + row * (CARD_H + GAP_Y);

      // Card background
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...LIGHT_GRAY);
      doc.rect(x, y, CARD_W, CARD_H, "FD");

      // Product image
      const imgB64 = imageCache.get(p.id);
      if (imgB64) {
        const imgX = x + (CARD_W - IMG_W) / 2;
        const imgY = y + 3;
        try {
          doc.addImage(imgB64, "PNG", imgX, imgY, IMG_W, IMG_H);
        } catch {
          /* skip broken images */
        }
      } else {
        // Placeholder
        doc.setFillColor(245, 245, 245);
        doc.rect(x + 4, y + 3, CARD_W - 8, IMG_H, "F");
        doc.setFontSize(8);
        doc.setTextColor(180, 180, 180);
        doc.text("Sin imagen", x + CARD_W / 2, y + 3 + IMG_H / 2, { align: "center" });
      }

      const badgeY = y + 3 + IMG_H + 2;

      // Brand badge
      if (p.brand) {
        doc.setFillColor(...BRAND_BLUE);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...WHITE);
        const bw = doc.getTextWidth(p.brand) + 5;
        doc.rect(x + 3, badgeY, bw, BADGE_H, "F");
        doc.text(p.brand, x + 3 + bw / 2, badgeY + 4, { align: "center" });

        // Weight badge
        if (p.weight_kg) {
          const wt = `${p.weight_kg} kg`;
          doc.setFillColor(...WEIGHT_GREEN);
          const ww = doc.getTextWidth(wt) + 5;
          const wx = x + 3 + bw + 2;
          doc.rect(wx, badgeY, ww, BADGE_H, "F");
          doc.text(wt, wx + ww / 2, badgeY + 4, { align: "center" });
        }
      }

      // Product name
      const nameY = badgeY + BADGE_H + 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...DARK);
      const nameLines = doc.splitTextToSize(p.name, CARD_W - 6);
      const displayLines = nameLines.slice(0, MAX_NAME_LINES);
      doc.text(displayLines, x + 3, nameY + 3);
      const nameBottom = nameY + displayLines.length * NAME_LINE_H;

      // Price
      const priceY = nameBottom + 1;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...DEEP_BLUE);
      const priceStr = p.sale_price_with_iva ? formatPrice(p.sale_price_with_iva) : "—";
      doc.text(priceStr, x + CARD_W / 2, priceY + 7, { align: "center" });

      // SKU
      if (p.clave) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`SKU: ${p.clave}`, x + CARD_W / 2, priceY + 12, { align: "center" });
      }
    }

    // Footer
    const footerY = H - FOOTER_H;
    doc.setFillColor(...DEEP_BLUE);
    doc.rect(0, footerY, W, FOOTER_H, "F");

    // Phone + WhatsApp tagline (only if configured)
    if (BUSINESS_CONTACT.phone) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...WHITE);
      doc.text(BUSINESS_CONTACT.phone, 14, footerY + 13);
      if (BUSINESS_CONTACT.whatsappNumber) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text("Contáctanos por WhatsApp", 14, footerY + 21);
      }
    }

    // Page number — centered when no phone, right-of-phone otherwise
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...WHITE);
    doc.setFontSize(8);
    doc.text(`${page + 1} / ${totalPages}`, W / 2, footerY + 28, { align: "center" });

    // QR (only if configured)
    const qrB64 = imageCache.get("qr");
    if (qrB64) {
      const qrSize = 26;
      const qrX = W - qrSize - 14;
      const qrY = footerY + (FOOTER_H - qrSize) / 2;
      try {
        doc.addImage(qrB64, "PNG", qrX, qrY, qrSize, qrSize);
      } catch {
        /* skip */
      }
    }
  }

  doc.save("catalogo_productos.pdf");
  onProgress?.(null as unknown as string);
}

/* ── Price list PDF ────────────────────────────── */
async function generatePriceListPDF(products: Product[], priceListLabel?: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const W = 215.9;
  const H = 279.4;
  const MARGIN_X = 12;
  const HEADER_H = 24;
  const FOOTER_H = 14;

  // Column layout
  const COL_SKU_X = MARGIN_X;
  const COL_SKU_W = 28;
  const COL_NAME_X = COL_SKU_X + COL_SKU_W;
  const COL_PRICE_W = 28;
  const COL_WEIGHT_W = 18;
  const COL_PRICE_X = W - MARGIN_X - COL_PRICE_W;
  const COL_WEIGHT_X = COL_PRICE_X - COL_WEIGHT_W - 2;
  const COL_NAME_W = COL_WEIGHT_X - COL_NAME_X - 2;

  const ROW_H = 7;
  const BODY_TOP = HEADER_H + 14;
  const BODY_BOTTOM = H - FOOTER_H - 4;
  const ROWS_PER_PAGE = Math.floor((BODY_BOTTOM - BODY_TOP) / ROW_H);
  const totalPages = Math.max(1, Math.ceil(products.length / ROWS_PER_PAGE));

  const drawHeader = (page: number) => {
    // Top bar
    doc.setFillColor(...DEEP_BLUE);
    doc.rect(0, 0, W, HEADER_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...WHITE);
    doc.text("Lista de precios", MARGIN_X, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const today = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
    doc.text(`Precios con IVA · ${today}`, MARGIN_X, 20);

    // Column headers
    const hy = HEADER_H + 9;
    doc.setFillColor(240, 240, 240);
    doc.rect(MARGIN_X, hy - 5, W - MARGIN_X * 2, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text("SKU", COL_SKU_X + 1, hy);
    doc.text("Producto", COL_NAME_X + 1, hy);
    doc.text("Peso", COL_WEIGHT_X + COL_WEIGHT_W - 1, hy, { align: "right" });
    doc.text("Precio", COL_PRICE_X + COL_PRICE_W - 1, hy, { align: "right" });
  };

  const drawFooter = (page: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`${page} / ${totalPages}`, W / 2, H - 6, { align: "center" });
    if (BUSINESS_CONTACT.phone) {
      const tail = BUSINESS_CONTACT.whatsappNumber ? " · WhatsApp" : "";
      doc.text(`${BUSINESS_CONTACT.phone}${tail}`, MARGIN_X, H - 6);
    }
  };

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) doc.addPage();
    drawHeader(page + 1);

    const pageProducts = products.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

    for (let i = 0; i < pageProducts.length; i++) {
      const p = pageProducts[i];
      const y = BODY_TOP + i * ROW_H;

      // Zebra stripe
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(MARGIN_X, y - 4, W - MARGIN_X * 2, ROW_H, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);

      // SKU (monospace-ish via bold)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(p.clave ?? "—", COL_SKU_X + 1, y + 1);

      // Name (truncate)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const nameLines = doc.splitTextToSize(
        `${p.brand ? p.brand + " · " : ""}${p.name}`,
        COL_NAME_W
      );
      doc.text(nameLines[0] ?? "", COL_NAME_X + 1, y + 1);

      // Weight
      doc.setFontSize(9);
      doc.setTextColor(60, 120, 60);
      doc.text(p.weight_kg ? `${p.weight_kg} kg` : "—", COL_WEIGHT_X + COL_WEIGHT_W - 1, y + 1, { align: "right" });

      // Price
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DEEP_BLUE);
      doc.text(
        p.sale_price_with_iva ? formatPrice(p.sale_price_with_iva) : "—",
        COL_PRICE_X + COL_PRICE_W - 1,
        y + 1,
        { align: "right" }
      );
    }

    drawFooter(page + 1);
  }

  doc.save("lista_de_precios.pdf");
}

/* ── component ─────────────────────────────────── */
type PriceList = { id: string; name: string; markup_pct: number | null };

export default function Catalogo() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("__all__");
  const [supplierFilter, setSupplierFilter] = useState("__all__");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [drawerProductId, setDrawerProductId] = useState<string | null>(null);
  const [promoFilter, setPromoFilter] = useState<"all" | "promo">("all");
  const [mode, setMode] = useState<"catalog" | "pricelist">("catalog");
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  // "mayoreo" = use products.sale_price_with_iva (default).
  // Any other value = price_lists.id (e.g. Menudeo). Affects card grid,
  // PDFs (catalog + price list) and the disponibilidad dialog.
  const [priceListId, setPriceListId] = useState<"mayoreo" | string>("mayoreo");

  // Optional client overlay. When set, applies per-client price
  // overrides on top of the active tier. Adds a "Precio personalizado"
  // amber chip to rows whose effective price differs from base, plus
  // a "Solo cambios" toggle to filter the grid. PDFs render with the
  // effective prices but never mention the client name (the client
  // shouldn't know they're getting a personalized list).
  const [clientId, setClientId] = useState<string | null>(null);
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  // Confirm-before-download — gated on client being set so it never
  // fires on a generic tier-only download.
  const [pendingDownload, setPendingDownload] = useState<null | "catalog" | "pricelist">(null);
  // In-place price editor — Catalogo no longer needs a side-trip to
  // /clients/:id to tweak overrides. Holds the set of products being
  // edited (1 = single mode, many = bulk mode).
  const [editorProducts, setEditorProducts] = useState<EditableProduct[]>([]);

  // Available price lists (Mayoreo is the implicit default — backed by
  // products.sale_price_with_iva, no row needed).
  const { data: priceLists = [] } = useQuery({
    queryKey: ["catalogo-price-lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_lists")
        .select("id, name, markup_pct")
        .eq("active", true)
        .order("name") as any;
      if (error) throw error;
      return (data ?? []) as PriceList[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Items for the currently-selected non-mayoreo list.
  const { data: priceListItems = [] } = useQuery({
    queryKey: ["catalogo-price-list-items", priceListId],
    queryFn: async () => {
      if (priceListId === "mayoreo") return [];
      const { data, error } = await supabase
        .from("price_list_items")
        .select("product_id, price_with_iva")
        .eq("price_list_id", priceListId);
      if (error) throw error;
      return (data ?? []) as { product_id: string; price_with_iva: number }[];
    },
    enabled: priceListId !== "mayoreo",
    staleTime: 60 * 1000,
  });

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of priceListItems) m.set(r.product_id, Number(r.price_with_iva));
    return m;
  }, [priceListItems]);

  // Active clients — fed into the Cliente picker.
  const { data: clients = [] } = useQuery({
    queryKey: ["catalogo-clients-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, razon_social, price_list_id")
        .eq("active", true)
        .order("name") as any;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string | null;
        razon_social: string | null;
        price_list_id: string | null;
      }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Per-client overrides — single fetch keyed on clientId. Empty Map
  // when no client selected so downstream code can branch on size.
  const { data: clientOverrides = [] } = useQuery({
    queryKey: ["catalogo-client-overrides", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("client_price_overrides")
        .select("product_id, price_with_iva")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data ?? []) as { product_id: string; price_with_iva: number }[];
    },
    staleTime: 60 * 1000,
  });

  const overrideMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of clientOverrides) m.set(r.product_id, Number(r.price_with_iva));
    return m;
  }, [clientOverrides]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  // When a client is picked, jump the tier picker to the client's
  // assigned price_list_id (if any). The user can still tweak the
  // tier manually after — we don't keep re-applying. Clearing the
  // client doesn't reset the tier (avoids surprising regressions).
  useEffect(() => {
    if (!selectedClient) return;
    if (selectedClient.price_list_id && selectedClient.price_list_id !== priceListId) {
      setPriceListId(selectedClient.price_list_id);
    } else if (!selectedClient.price_list_id && priceListId !== "mayoreo") {
      // Client has no tier → reset to mayoreo so the base catalog is
      // the reference for the override layer.
      setPriceListId("mayoreo");
    }
    // We only run this when the SELECTED CLIENT changes, not on
    // every priceListId change — the user might intentionally pick
    // a different tier after picking the client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
  // Friendly label for the picker + confirm dialog. Falls back to
  // razon_social when name is empty (same convention as the rest of
  // the app post-Block 8).
  const selectedClientLabel = useMemo(() => {
    if (!selectedClient) return null;
    return (selectedClient.name?.trim() || selectedClient.razon_social?.trim() || "—");
  }, [selectedClient]);

  const selectedList = useMemo(
    () => priceLists.find((pl) => pl.id === priceListId) ?? null,
    [priceLists, priceListId]
  );

  // Resolve a product's effective price.
  //
  // Priority chain:
  //   1. Per-client override (when a Cliente is selected)
  //   2. Active tier (price_lists.markup_pct or explicit price_list_items)
  //   3. Mayoreo base price
  //
  // priceSource() returns which layer won so the UI can render the
  // "Precio personalizado" chip on any row where the price differs
  // from base (loose definition — includes tier shifts).
  const effectivePrice = useCallback(
    (p: Product): number | null => {
      const override = overrideMap.get(p.id);
      if (override != null) return override;
      if (priceListId === "mayoreo") return p.sale_price_with_iva;
      return resolveListPrice(p.id, p.sale_price_with_iva, selectedList, priceMap);
    },
    [overrideMap, priceListId, priceMap, selectedList]
  );

  // Loose definition: "personalized" means the client gets ANY price
  // that isn't the base mayoreo price — whether that's an explicit
  // override or because their tier shifts the catalog. Returns:
  //   "override" — client-specific override row exists
  //   "tier"     — no override but the active tier moves the price
  //   "base"     — price equals products.sale_price_with_iva (no change)
  type PriceSource = "override" | "tier" | "base";
  const priceSource = useCallback(
    (p: Product): PriceSource => {
      const eff = effectivePrice(p);
      if (eff == null || p.sale_price_with_iva == null) return "base";
      // If override is set BUT equals the base price (e.g. user
      // clicked the "Precio base" reset chip and saved), treat it as
      // base — no band, no colored delta. Otherwise we'd render an
      // emerald "+$0.00 · 0 %" badge which is meaningless noise.
      // 0.01 tolerance absorbs rounding from tier math.
      const same = Math.abs(eff - p.sale_price_with_iva) <= 0.01;
      if (same) return "base";
      if (clientId && overrideMap.has(p.id)) return "override";
      return "tier";
    },
    [clientId, overrideMap, effectivePrice]
  );

  const activeListName = useMemo(() => {
    if (priceListId === "mayoreo") return "Mayoreo";
    return priceLists.find((pl) => pl.id === priceListId)?.name ?? "Mayoreo";
  }, [priceListId, priceLists]);

  // Active promotions keyed by product_id
  const { data: promoMap = {} } = useQuery({
    queryKey: ["active-promotions-catalogo"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("product_promotions")
        .select("product_id")
        .eq("active", true)
        .lte("valid_from", today)
        .gte("valid_to", today);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const p of data ?? []) map[p.product_id] = true;
      return map;
    },
  });

  // Fetch products with images. Supabase caps a single response at 1,000 rows,
  // so page through the full catalog before filtering/rendering.
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["catalogo-products"],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const all: (Product & { supplier: string | null })[] = [];

      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id, clave, name, brand, weight_kg, sale_price_with_iva, image_url, active, supplier")
          .eq("active", true)
          .order("brand")
          .order("name")
          .order("id")
          .range(from, from + pageSize - 1);

        if (error) throw error;

        const batch = (data ?? []) as (Product & { supplier: string | null })[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      // Sort: Ganador first, Minino second, then alphabetical
      const priority = ["ganador", "minino"];
      const sorted = all.sort((a, b) => {
        const aIdx = priority.indexOf((a.brand ?? "").toLowerCase());
        const bIdx = priority.indexOf((b.brand ?? "").toLowerCase());
        const aPri = aIdx >= 0 ? aIdx : 999;
        const bPri = bIdx >= 0 ? bIdx : 999;
        if (aPri !== bPri) return aPri - bPri;
        return (a.name ?? "").localeCompare(b.name ?? "");
      });
      return sorted;
    },
  });

  // Unique brands and suppliers
  const brands = useMemo(() => {
    const set = new Set(products.map((p) => p.brand).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [products]);

  const suppliers = useMemo(() => {
    const set = new Set(products.map((p) => p.supplier).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [products]);

  // Filtered products
  const filtered = useMemo(() => {
    let list = products;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.clave?.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q)
      );
    }
    if (brandFilter !== "__all__") list = list.filter((p) => p.brand === brandFilter);
    if (supplierFilter !== "__all__") list = list.filter((p) => p.supplier === supplierFilter);
    if (promoFilter === "promo") list = list.filter((p) => promoMap[p.id]);
    // "Solo cambios" — loose: any row whose effective price differs
    // from base for this client (override OR tier shift). Toggle is
    // only meaningful while a client is selected.
    if (clientId && showOnlyChanges) {
      list = list.filter((p) => priceSource(p) !== "base");
    }
    return list;
  }, [products, search, brandFilter, supplierFilter, promoFilter, promoMap, clientId, showOnlyChanges, priceSource]);

  // Counts for the chip strip — only meaningful when a client is set.
  const personalizedCount = useMemo(() => {
    if (!clientId) return 0;
    return products.reduce((n, p) => (priceSource(p) !== "base" ? n + 1 : n), 0);
  }, [clientId, products, priceSource]);

  // Selection helpers
  const toggleProduct = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(filtered.map((p) => p.id)));
  }, [filtered]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  // Selected products with the active list's prices applied. PDFs and the
  // disponibilidad dialog read sale_price_with_iva, so we replace it here.
  const selectedProducts = useMemo(
    () =>
      products
        .filter((p) => selected.has(p.id))
        .map((p) => ({ ...p, sale_price_with_iva: effectivePrice(p) })),
    [products, selected, effectivePrice]
  );

  // Generate PDF. When a client is active we open a confirmation
  // first — protects against the staff accidentally sending Client A
  // a list that was prepared with Client B's overrides applied.
  const runDownload = useCallback(async (which: "catalog" | "pricelist") => {
    if (selectedProducts.length === 0) {
      toast({ title: "Selecciona al menos un producto", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      if (which === "pricelist") {
        await generatePriceListPDF(selectedProducts);
        toast({ title: "Lista de precios descargada" });
      } else {
        await generateCatalogPDF(selectedProducts, setProgress);
        toast({ title: "Catálogo descargado" });
      }
    } catch (e: any) {
      toast({ title: "Error generando PDF", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
      setProgress(null);
      setPendingDownload(null);
    }
  }, [selectedProducts, toast]);

  const handleGenerate = useCallback(() => {
    if (selectedProducts.length === 0) {
      toast({ title: "Selecciona al menos un producto", variant: "destructive" });
      return;
    }
    // Client active → confirm first. Otherwise just go.
    if (clientId) {
      setPendingDownload(mode);
    } else {
      void runDownload(mode);
    }
  }, [selectedProducts, mode, toast, clientId, runDownload]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo</h1>
          <p className="text-muted-foreground text-sm">
            {mode === "catalog"
              ? "Selecciona productos y genera un catálogo PDF descargable"
              : "Genera una lista de precios en PDF (SKU, producto, peso, precio)"}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Cliente picker — sits side-by-side with the tier picker.
              Picking a client also auto-jumps the tier to whatever
              that client's price_list_id points at, and turns on
              per-product override resolution. */}
          <div className="inline-flex items-center gap-1.5 rounded-lg border bg-card pl-2 pr-1 py-1 text-sm">
            <UserRound className={cn("h-4 w-4", clientId ? "text-amber-500" : "text-muted-foreground")} />
            <Select
              value={clientId ?? "__none__"}
              onValueChange={(v) => setClientId(v === "__none__" ? null : v)}
            >
              <SelectTrigger className="h-8 border-0 bg-transparent shadow-none focus:ring-0 focus:ring-offset-0 min-w-[180px]">
                <SelectValue placeholder="Sin cliente (genérico)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">Sin cliente (genérico)</span>
                </SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name?.trim() || c.razon_social?.trim() || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {clientId && (
              <button
                type="button"
                onClick={() => setClientId(null)}
                className="rounded-md p-1 hover:bg-muted/40 text-muted-foreground"
                title="Quitar cliente"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Mayoreo / Menudeo / other-list picker */}
          <div className="inline-flex rounded-lg border bg-card p-1 text-sm">
            <button
              type="button"
              onClick={() => setPriceListId("mayoreo")}
              className={cn(
                "px-3 py-1.5 rounded-md font-medium transition-colors",
                priceListId === "mayoreo"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Mayoreo
            </button>
            {priceLists.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => setPriceListId(pl.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md font-medium transition-colors",
                  priceListId === pl.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {pl.name}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAvailabilityOpen(true)}
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            Disponibilidad
          </Button>
        <div className="inline-flex rounded-lg border bg-card p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("catalog")}
            className={cn(
              "px-3 py-1.5 rounded-md font-medium transition-colors",
              mode === "catalog" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Catálogo
          </button>
          <button
            type="button"
            onClick={() => setMode("pricelist")}
            className={cn(
              "px-3 py-1.5 rounded-md font-medium transition-colors",
              mode === "pricelist" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Lista de precios
          </button>
        </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {/* Search row */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, clave o marca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="Todas las marcas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las marcas</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[170px] h-9 text-sm">
              <SelectValue placeholder="Todos los proveedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los proveedores</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={promoFilter === "promo" ? "default" : "outline"}
            size="sm"
            className={cn("h-9", promoFilter === "promo" ? "bg-orange-600 hover:bg-orange-700 text-white" : "")}
            onClick={() => setPromoFilter(promoFilter === "promo" ? "all" : "promo")}
          >
            Promo
          </Button>

          {/* Solo cambios — only meaningful when a client is selected.
              Loose definition: any row whose effective price differs
              from base for this client (override OR tier shift). */}
          {clientId && (
            <>
              <Button
                variant={showOnlyChanges ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-9 gap-1.5",
                  showOnlyChanges && "bg-amber-500 hover:bg-amber-600 text-white",
                )}
                onClick={() => setShowOnlyChanges((v) => !v)}
                title="Filtrar solo productos con precio personalizado"
              >
                <BadgePercent className="h-3.5 w-3.5" />
                Solo cambios
              </Button>
              <Badge
                variant="outline"
                className="h-9 px-2.5 gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
                title="Productos cuyo precio cambia respecto al catálogo base para este cliente"
              >
                <span className="tabular-nums font-bold">{personalizedCount}</span>
                <span className="text-[10px] opacity-80">personalizado{personalizedCount === 1 ? "" : "s"}</span>
              </Badge>
            </>
          )}

          <div className="flex gap-2 ml-auto">
            {clientId && selected.size > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  // Pre-build the EditableProduct[] from the currently
                  // selected products. Each one carries its tier
                  // price so the editor can show the right context.
                  const items: EditableProduct[] = filtered
                    .filter((p) => selected.has(p.id))
                    .map((p) => ({
                      id: p.id,
                      clave: p.clave,
                      name: p.name,
                      image_url: p.image_url,
                      sale_price_with_iva: p.sale_price_with_iva,
                      tier_price: priceListId === "mayoreo" ? null : effectivePrice(p),
                    }));
                  if (items.length === 0) return;
                  setEditorProducts(items);
                }}
                className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar precios ({selected.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={selectAll}>
              Seleccionar todos ({filtered.length})
            </Button>
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={deselectAll}>
                <X className="h-4 w-4 mr-1" />
                Limpiar ({selected.size})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Product grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-[220px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No hay productos con imagen que coincidan</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map((p) => {
            const isSelected = selected.has(p.id);
            return (
              <div
                key={p.id}
                className={cn(
                  "relative rounded-xl border bg-card p-3 text-left transition-all hover:shadow-md cursor-pointer overflow-hidden",
                  isSelected
                    ? "border-primary ring-2 ring-primary/20 shadow-md"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                {/* Checkbox indicator */}
                <div
                  className="absolute top-2 right-2 z-10 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); toggleProduct(p.id); }}
                >
                  <Checkbox checked={isSelected} className="pointer-events-none" />
                </div>

                {/* Pencil icon — only visible when a client is active.
                    Opens the price editor for this single product so
                    the operator can tweak overrides without leaving
                    the catalog. */}
                {clientId && (
                  <button
                    type="button"
                    className="absolute top-2 left-2 z-10 rounded-md p-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 transition active:scale-95"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditorProducts([{
                        id: p.id,
                        clave: p.clave,
                        name: p.name,
                        image_url: p.image_url,
                        sale_price_with_iva: p.sale_price_with_iva,
                        tier_price: priceListId === "mayoreo" ? null : effectivePrice(p),
                      }]);
                    }}
                    title="Editar precio personalizado para este cliente"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Image — click to open Product 360 drawer */}
                <div
                  className="cursor-zoom-in"
                  onClick={() => setDrawerProductId(p.id)}
                >

                  {p.image_url ? (
                    <div className="flex justify-center mb-2">
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="h-[100px] w-auto object-contain"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="h-[100px] flex items-center justify-center mb-2">
                      <Package className="h-10 w-10 text-muted-foreground/20" />
                    </div>
                  )}
                </div>

                {/* Full-width "Precio personalizado" band — same visual
                    pattern as the portal product card's "200–500
                    disponibles" strip. -mx-3 breaks out of the card's
                    p-3 padding so the band hugs the card edges. Shows
                    the cash + % delta with arrow + emerald (discount)
                    or red (mark-up) colour. Internal only — never on
                    the downloaded PDFs. */}
                {clientId && (() => {
                  const src = priceSource(p);
                  // When a client is active we ALWAYS reserve the
                  // band's vertical space so cards with and without a
                  // personalized price line up at the same height.
                  // For base-price products the band renders as an
                  // invisible placeholder of identical dimensions —
                  // also doubles as an affordance: clicking it opens
                  // the editor pre-loaded with this product so the
                  // operator can quickly set a new override without
                  // hunting for the pencil icon.
                  if (src === "base") {
                    return (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditorProducts([{
                            id: p.id,
                            clave: p.clave,
                            name: p.name,
                            image_url: p.image_url,
                            sale_price_with_iva: p.sale_price_with_iva,
                            tier_price: null,
                          }]);
                        }}
                        // Single-line tier name placeholder — same
                        // dimensions as the colored band so cards
                        // align. Click still opens the editor.
                        className="-mx-3 mb-2 w-[calc(100%+1.5rem)] py-1 px-2 text-center text-[11px] font-bold tracking-wide truncate bg-muted/40 text-muted-foreground hover:bg-muted/60 transition"
                        title={`Precio base (${activeListName}) — toca para fijar un precio personalizado.`}
                      >
                        {activeListName}
                      </button>
                    );
                  }
                  const base = p.sale_price_with_iva ?? 0;
                  const eff = effectivePrice(p) ?? 0;
                  const delta = eff - base;
                  const pct = base > 0 ? (delta / base) * 100 : 0;
                  const down = delta < 0;
                  return (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditorProducts([{
                          id: p.id,
                          clave: p.clave,
                          name: p.name,
                          image_url: p.image_url,
                          sale_price_with_iva: p.sale_price_with_iva,
                          tier_price: priceListId === "mayoreo" ? null : eff,
                        }]);
                      }}
                      className={cn(
                        "-mx-3 mb-2 w-[calc(100%+1.5rem)] py-1 px-2 text-center text-[11px] font-bold tracking-wide hover:brightness-110 transition active:scale-[0.98]",
                        // Band color reflects margin impact for the
                        // business: discount = amber (margin lowers),
                        // markup = emerald (margin rises). Override
                        // sources get full saturation; tier-shifts get
                        // slightly softer so explicit deals pop more.
                        down
                          ? src === "override"
                            ? "bg-amber-500 text-white"
                            : "bg-amber-500/85 text-white"
                          : src === "override"
                            ? "bg-emerald-500 text-white"
                            : "bg-emerald-500/85 text-white",
                      )}
                      title={
                        src === "override"
                          ? `Precio especial fijado para ${selectedClientLabel}. Toca para editar. Base: ${formatPrice(base)} · Cliente: ${formatPrice(eff)} · ${delta > 0 ? "+" : ""}${formatPrice(delta)} (${pct.toFixed(1)}%)`
                          : `Ajustado por su tarifa (${activeListName}). Toca para fijar un override. Base: ${formatPrice(base)} · Cliente: ${formatPrice(eff)} · ${delta > 0 ? "+" : ""}${formatPrice(delta)} (${pct.toFixed(1)}%)`
                      }
                    >
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        {down ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                        <span>{delta > 0 ? "+" : ""}{formatPrice(delta)}</span>
                        <span className="opacity-80">·</span>
                        <span>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>
                      </span>
                    </button>
                  );
                })()}

                {/* Below image — click to toggle selection */}
                <div onClick={() => toggleProduct(p.id)}>
                  {/* Badges */}
                  <div className="flex gap-1 flex-wrap mb-1">
                    {p.brand && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {p.brand}
                      </Badge>
                    )}
                    {p.weight_kg && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      >
                        {p.weight_kg} kg
                      </Badge>
                    )}
                  </div>

                  {/* Name */}
                  <p className="text-xs font-medium leading-tight line-clamp-2 mb-1">
                    {p.name}
                  </p>

                  {/* Price + SKU */}
                  <p className="text-sm font-bold text-primary">
                    {effectivePrice(p) ? formatPrice(effectivePrice(p)!) : "—"}
                  </p>
                  {p.clave && (
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{p.clave}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product preview dialog */}
      <Dialog open={!!previewProduct} onOpenChange={(open) => !open && setPreviewProduct(null)}>
        <DialogContent className="sm:max-w-md">
          {previewProduct && (
            <div className="flex flex-col items-center gap-4 pt-2">
              {previewProduct.image_url ? (
                <img
                  src={previewProduct.image_url}
                  alt={previewProduct.name}
                  className="max-h-[300px] w-auto object-contain"
                />
              ) : (
                <div className="h-[200px] flex items-center justify-center">
                  <Package className="h-16 w-16 text-muted-foreground/20" />
                </div>
              )}
              <div className="w-full space-y-2 text-center">
                <div className="flex gap-2 justify-center flex-wrap">
                  {previewProduct.brand && (
                    <Badge variant="secondary">{previewProduct.brand}</Badge>
                  )}
                  {previewProduct.weight_kg && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {previewProduct.weight_kg} kg
                    </Badge>
                  )}
                </div>
                <h3 className="text-lg font-semibold leading-tight">{previewProduct.name}</h3>
                <p className="text-2xl font-bold text-primary">
                  {effectivePrice(previewProduct) ? formatPrice(effectivePrice(previewProduct)!) : "—"}
                </p>
              </div>
              <Button
                variant={selected.has(previewProduct.id) ? "outline" : "default"}
                className={selected.has(previewProduct.id) ? "" : "gradient-button"}
                onClick={() => toggleProduct(previewProduct.id)}
              >
                {selected.has(previewProduct.id) ? (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Quitar del catálogo
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Agregar al catálogo
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Availability dialog — respects active price list */}
      <AvailabilityDownloadDialog
        open={availabilityOpen}
        onOpenChange={setAvailabilityOpen}
        priceListId={priceListId === "mayoreo" ? null : priceListId}
        priceListLabel={activeListName}
      />

      {/* Product 360 drawer */}
      <Product360Drawer
        productId={drawerProductId}
        open={!!drawerProductId}
        onOpenChange={(o) => !o && setDrawerProductId(null)}
      />


      {/* Sticky bottom bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t p-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="text-sm">
              <span className="font-semibold">{selected.size}</span> productos seleccionados
              {" · "}
              <span className="text-muted-foreground">
                {mode === "catalog"
                  ? `${Math.ceil(selected.size / 6)} páginas`
                  : `${Math.ceil(selected.size / 32)} páginas · lista de precios`}
              </span>
            </div>
            <Button
              className="gradient-button"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {progress || "Generando..."}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  {mode === "catalog" ? "Descargar catálogo PDF" : "Descargar lista de precios"}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Confirm pre-download — fires only when a client is active so
          the staff can sanity-check who they're generating for. The
          downloaded PDF never mentions the client's name; this dialog
          is the LAST place the connection between client + prices is
          visible before the file leaves the screen. */}
      <AlertDialog
        open={!!pendingDownload}
        onOpenChange={(o) => { if (!o && !generating) setPendingDownload(null); }}
      >
        <AlertDialogContent className="sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Generar PDF para {selectedClientLabel}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {(() => {
                  const personalized = selectedProducts.reduce(
                    (n, p) => (priceSource(p as any) !== "base" ? n + 1 : n),
                    0,
                  );
                  // Average %-delta across personalized rows so the
                  // operator sees the magnitude of the deal in one
                  // glance, not just the count.
                  let deltaSum = 0;
                  let baseSum = 0;
                  let downCount = 0;
                  let upCount = 0;
                  for (const p of selectedProducts) {
                    const src = priceSource(p as any);
                    if (src === "base") continue;
                    const base = p.sale_price_with_iva ?? 0;
                    const eff = effectivePrice(p as any) ?? 0;
                    if (base <= 0) continue;
                    const delta = eff - base;
                    deltaSum += delta;
                    baseSum += base;
                    if (delta < 0) downCount += 1;
                    else if (delta > 0) upCount += 1;
                  }
                  const avgPct = baseSum > 0 ? (deltaSum / baseSum) * 100 : 0;
                  return (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded-lg border bg-card p-2 text-center">
                          <div className="text-base font-bold tabular-nums">{selectedProducts.length}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">productos</div>
                        </div>
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-center">
                          <div className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-300">{personalized}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">personalizados</div>
                        </div>
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                          <div className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{downCount}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">descuentos</div>
                        </div>
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-center">
                          <div className="text-base font-bold tabular-nums text-red-700 dark:text-red-400">{upCount}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">aumentos</div>
                        </div>
                      </div>
                      {personalized > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Δ promedio sobre base: <span className={cn("font-bold tabular-nums", avgPct < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                            {avgPct > 0 ? "+" : ""}{avgPct.toFixed(1)}%
                          </span>
                        </div>
                      )}
                      <div className="text-muted-foreground italic text-xs">
                        El PDF no incluye el nombre del cliente — el archivo se ve genérico.
                      </div>
                    </>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingDownload) void runDownload(pendingDownload); }}
              disabled={generating}
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Sí, descargar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* In-place price editor — opens with 1 product (single mode)
          from the pencil icon or amber band, OR N products (bulk mode)
          from the toolbar "Editar precios" button. Auto-invalidates
          the catalog override query on save so changes show
          immediately without a page refresh. */}
      {clientId && selectedClient && editorProducts.length > 0 && (
        <EditClientPriceDialog
          open={editorProducts.length > 0}
          onOpenChange={(o) => { if (!o) setEditorProducts([]); }}
          clientId={clientId}
          clientLabel={selectedClientLabel ?? "—"}
          products={editorProducts}
          currentOverrides={overrideMap}
          tierLabel={activeListName}
          extraInvalidate={["catalogo-client-overrides"]}
        />
      )}
    </div>
  );
}
