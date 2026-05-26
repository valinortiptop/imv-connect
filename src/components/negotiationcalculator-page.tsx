// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle, Trash2, CopyPlus, Download, ShoppingCart, ExternalLink } from "lucide-react";
import { ConvertQuoteDialog, type QuoteLineForConversion } from "@/components/orders/ConvertQuoteDialog";
import html2canvas from "html2canvas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GradientButton } from "@/components/ui/gradient-button";
import { ProductDropdown } from "@/components/ui/product-dropdown";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { sortProducts } from "@/lib/sort-products";
import { LumaSpin } from "@/components/ui/luma-spin";

import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { GlowCard } from "@/components/ui/spotlight-card";
import { toast } from "sonner";

/* ── Types ── */

type Product = {
  product_id: string;
  clave: string;
  product_name: string;
  image_url: string | null;
  supplier: string;
  brand: string;
  weight_kg: number;
  price: number;           // IVA included
  price_no_iva: number;
  cost: number;            // without IVA
  cost_with_iva: number;
  bonificacion_pct: number;
  margin_normal: number;
  margin_con_bonificacion: number;
};

type QuoteItem = {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  clave: string;
  sacoKg: number;
  precioKg: number;
  precioBolsa: number;
  bolsas: number;
  kgEntregados: number;
  totalSinIva: number;
  totalIvaIncluido: number;
  margenNormal: number | null;
  margenConBono: number | null;
  utilidadConIva: number | null;
  utilidadConBono: number | null;
  costSinIva: number;
  bonificacionPct: number;
};

type InputMode = "num_bags" | "total_kg" | "total_mxn";

const IVA_RATE = 0.16;

/* ── Formatters ── */

const fmt = (n: number, lang: string = "es") =>
  n.toLocaleString(lang === "en" ? "en-US" : "es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number, lang: string = "es") =>
  (n * 100).toLocaleString(lang === "en" ? "en-US" : "es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

function normMargin(m: number | null | undefined): number | null {
  if (m == null) return null;
  return m > 1 ? m / 100 : m;
}

/* ── Component ── */

export default function NegotiationCalculator() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [productsError, setProductsError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  // Calculator
  const [inputMode, setInputMode] = useState<InputMode>("num_bags");
  const [inputValue, setInputValue] = useState("");

  // Custom margin
  const [useCustomMarginToggle, setUseCustomMarginToggle] = useState(false);
  const [customMarginPct, setCustomMarginPct] = useState("");
  const parsedCustomMargin = parseFloat(customMarginPct);
  const customMarginValid = isFinite(parsedCustomMargin) && parsedCustomMargin >= 0 && parsedCustomMargin <= 60 && parsedCustomMargin / 100 < 0.99;
  const customMarginDecimal = customMarginValid ? parsedCustomMargin / 100 : null;

  // Quote
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const quoteImageRef = useRef<HTMLDivElement>(null);

  // Quote persistence (kept for quote→order linking)
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState<number | null>(null);
  const [quoteDirty, setQuoteDirty] = useState(false);

  // Quote → Order conversion
  const [convertedToOrderId, setConvertedToOrderId] = useState<string | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  // Active promo product IDs
  const [promoProductIds, setPromoProductIds] = useState<Set<string>>(new Set());

  /* ── Data fetch ── */
  useEffect(() => {
    supabase
      .from("product_prices")
      .select("*")
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) setProductsError(error.message);
        else if (data) {
          const mapped: Product[] = (data as any[])
            .filter((r: any) => r.product_id && r.price != null)
            .map((r: any) => ({
              product_id: r.product_id,
              clave: r.clave ?? "",
              product_name: r.product_name ?? "",
              image_url: r.image_url ?? null,
              supplier: r.supplier ?? "",
              brand: r.brand ?? "",
              weight_kg: r.weight_kg ?? 0,
              price: r.price ?? 0,
              price_no_iva: r.price_no_iva ?? 0,
              cost: r.cost ?? 0,
              cost_with_iva: r.cost_with_iva ?? 0,
              bonificacion_pct: r.bonificacion_pct ?? 0,
              margin_normal: r.margin_normal ?? 0,
              margin_con_bonificacion: r.margin_con_bonificacion ?? 0,
            }));
          setProducts(mapped);
        }
      });

    // Fetch active promos
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from("product_promotions")
      .select("product_id")
      .eq("active", true)
      .lte("valid_from", today)
      .gte("valid_to", today)
      .then(({ data }) => {
        if (data) setPromoProductIds(new Set(data.map((d: any) => d.product_id)));
      });
  }, []);


  /* ── Convert quote → order ── */
  async function handleConvertQuote(data: {
    clientId: string;
    clientName: string;
    deliveryDate: string | null;
    notes: string;
  }) {
    if (isConverting) return;
    setIsConverting(true);
    try {
      // Resolve client_id: use existing or create new via find_or_create_client
      let clientId = data.clientId;
      if (!clientId) {
        // New client — use the RPC
        const { data: newClientId, error: clientErr } = await supabase.rpc(
          "find_or_create_client",
          { p_client_name: data.clientName }
        );
        if (clientErr) throw clientErr;
        clientId = newClientId as string;
      }

      // Create order
      const orderPayload: any = {
        client_id: clientId,
        order_date: new Date().toISOString().slice(0, 10),
        status: "Nuevo",
        notes: data.notes || null,
      };
      if (data.deliveryDate) {
        orderPayload.delivery_date = data.deliveryDate;
      }

      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert(orderPayload)
        .select("id, order_code")
        .single();
      if (orderErr) throw orderErr;

      // Merge duplicate products (order_items has unique on order_id+product_id)
      const merged = new Map<string, { quantity: number; unit_price: number }>();
      for (const item of quoteItems) {
        const existing = merged.get(item.productId);
        if (existing) {
          // weighted average price
          const totalQty = existing.quantity + item.bolsas;
          existing.unit_price =
            (existing.unit_price * existing.quantity + item.precioBolsa * item.bolsas) / totalQty;
          existing.quantity = totalQty;
        } else {
          merged.set(item.productId, { quantity: item.bolsas, unit_price: item.precioBolsa });
        }
      }
      const orderItems = Array.from(merged.entries()).map(([productId, v]) => ({
        order_id: orderRow.id,
        product_id: productId,
        quantity: v.quantity,
        unit_price_override: Math.round(v.unit_price * 100) / 100,
      }));

      const { error: itemsErr } = await supabase
        .from("order_items")
        .insert(orderItems);
      if (itemsErr) throw itemsErr;

      // Update quote status if saved
      if (quoteId) {
        await supabase
          .from("quotes")
          .update({ status: "converted_to_order", converted_to_order_id: orderRow.id, client_id: clientId })
          .eq("id", quoteId);
      }

      setConvertedToOrderId(orderRow.id);
      setConvertDialogOpen(false);
      toast.success(
        lang === "en"
          ? `Order ${orderRow.order_code} created`
          : `Pedido ${orderRow.order_code} creado`
      );
      navigate("/orders?openOrderId=" + orderRow.id);
    } catch (err: any) {
      console.error("Convert quote error:", err);
      toast.error(err?.message ?? "Error al crear pedido");
    } finally {
      setIsConverting(false);
    }
  }

  function updateQuoteItems(updater: QuoteItem[] | ((prev: QuoteItem[]) => QuoteItem[])) {
    setQuoteItems(updater);
    setQuoteDirty(true);
  }

  /* ── Image export ── */
  async function handleDownloadImage() {
    const node = quoteImageRef.current;
    if (!node) { toast(t("saveError")); return; }
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const isDark = document.documentElement.classList.contains("dark");
      const bg = isDark ? "#020817" : "#ffffff";
      const canvas = await html2canvas(node, {
        backgroundColor: bg, scale: 2, useCORS: true,
        allowTaint: true, logging: false,
        width: 1600, height: 900, windowWidth: 1600, windowHeight: 900,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yy = String(now.getFullYear()).slice(-2);
      const link = document.createElement("a");
      link.download = `Cotización ${dd}-${mm}-${yy}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      toast(t("saveError"));
    }
  }

  /* ── Derived state ── */
  const product = products.find((p) => p.product_id === selectedProductId);
  const kgPerBag = product?.weight_kg ?? 0;

  /* ── Dropdown options: Ganador first, Minino second, rest alphabetical ── */
  const dropdownOptions = useMemo(() => {
    const sorted = sortProducts(products.map(p => ({ ...p, name: p.product_name })));
    return sorted.map((p: any) => ({
      id: p.product_id,
      label: `${p.clave} — ${p.product_name}`,
      disabled: p.weight_kg <= 0,
      disabledReason: p.weight_kg <= 0 ? t("missingKg") : undefined,
      isPromo: promoProductIds.has(p.product_id),
      imageUrl: p.image_url ?? null,
    }));
  }, [products, t, promoProductIds]);

  /* ── Calculator result ── */
  const result = useMemo(() => {
    if (!product || !inputValue) return null;

    const val = parseFloat(inputValue);
    if (isNaN(val) || val <= 0) return null;

    const listPrice = product.price; // IVA included
    if (!listPrice || listPrice <= 0) return null;

    let bags = 0;

    switch (inputMode) {
      case "num_bags":
        bags = Math.ceil(val);
        break;
      case "total_kg":
        if (kgPerBag <= 0) return null;
        bags = Math.ceil(val / kgPerBag);
        break;
      case "total_mxn":
        bags = Math.max(1, Math.round(val / listPrice));
        break;
    }

    if (bags <= 0) return null;
    const deliveredKg = bags * kgPerBag;

    // Custom margin override
    if (useCustomMarginToggle && customMarginDecimal != null) {
      if (product.cost <= 0) {
        return { noRefMargin: true } as any;
      }
      const customSellPriceNoIva = product.cost / (1 - customMarginDecimal);
      const customSellPrice = customSellPriceNoIva * (1 + IVA_RATE);
      const customTotalConIva = bags * customSellPrice;
      const customTotalSinIva = customTotalConIva / (1 + IVA_RATE);
      const customPricePerKg = kgPerBag > 0 ? customSellPrice / kgPerBag : 0;

      return {
        pricePerBag: customSellPrice,
        pricePerKg: customPricePerKg,
        bags,
        deliveredKg,
        totalConIva: customTotalConIva,
        totalSinIva: customTotalSinIva,
        marginNormal: null,
        marginConBonificacion: null,
        isCustom: true,
        customMargin: customMarginDecimal,
      };
    }

    const totalConIva = bags * listPrice;
    const totalSinIva = totalConIva / (1 + IVA_RATE);
    const pricePerKg = kgPerBag > 0 ? listPrice / kgPerBag : 0;

    return {
      pricePerBag: listPrice,
      pricePerKg,
      bags,
      deliveredKg,
      totalConIva,
      totalSinIva,
      marginNormal: normMargin(product.margin_normal),
      marginConBonificacion: normMargin(product.margin_con_bonificacion),
      isCustom: false,
    };
  }, [product, inputValue, inputMode, kgPerBag, useCustomMarginToggle, customMarginDecimal]);

  const canAddToQuote = result != null && !result.noRefMargin
    && isFinite(result.totalConIva) && result.totalConIva > 0
    && (!useCustomMarginToggle || customMarginValid);

  function handleAddToQuote() {
    if (!result || !product) return;
    const margin = result.isCustom ? result.customMargin : result.marginNormal;
    const marginBono = result.isCustom ? result.customMargin : result.marginConBonificacion;
    const profit = margin != null ? result.totalSinIva * margin : null;
    const profitBono = marginBono != null ? result.totalSinIva * marginBono : null;

    const item: QuoteItem = {
      id: crypto.randomUUID(),
      productId: product.product_id,
      productName: product.product_name,
      imageUrl: product.image_url,
      clave: product.clave,
      sacoKg: kgPerBag,
      precioKg: result.pricePerKg,
      precioBolsa: result.pricePerBag,
      bolsas: result.bags,
      kgEntregados: result.deliveredKg,
      totalSinIva: result.totalSinIva,
      totalIvaIncluido: result.totalConIva,
      margenNormal: result.isCustom ? result.customMargin : result.marginNormal,
      margenConBono: result.isCustom ? result.customMargin : result.marginConBonificacion,
      utilidadConIva: profit,
      utilidadConBono: profitBono,
      costSinIva: product.cost,
      bonificacionPct: product.bonificacion_pct,
    };
    updateQuoteItems((prev) => [...prev, item]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canAddToQuote) {
      e.preventDefault();
      handleAddToQuote();
    }
  }

  function handleDuplicate(item: QuoteItem) {
    updateQuoteItems((prev) => [...prev, { ...item, id: crypto.randomUUID() }]);
  }

  function handleRemoveItem(id: string) {
    updateQuoteItems((prev) => prev.filter((i) => i.id !== id));
  }

  function handleQuotePriceChange(id: string, newPriceBolsa: number) {
    updateQuoteItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      const precioBolsa = newPriceBolsa;
      const precioKg = item.sacoKg > 0 ? precioBolsa / item.sacoKg : 0;
      const totalIvaIncluido = precioBolsa * item.bolsas;
      const totalSinIva = totalIvaIncluido / (1 + IVA_RATE);
      const costPerBag = item.costSinIva * item.sacoKg;
      const costBonifPerBag = costPerBag * (1 - item.bonificacionPct);
      const precioBolsaSinIva = precioBolsa / (1 + IVA_RATE);
      const margenNormal = precioBolsaSinIva > 0 ? (precioBolsaSinIva - costPerBag) / precioBolsaSinIva : null;
      const margenConBono = precioBolsaSinIva > 0 ? (precioBolsaSinIva - costBonifPerBag) / precioBolsaSinIva : null;
      const utilidadConIva = margenNormal != null ? totalSinIva * margenNormal : null;
      const utilidadConBono = margenConBono != null ? totalSinIva * margenConBono : null;
      return { ...item, precioBolsa, precioKg, totalIvaIncluido, totalSinIva, margenNormal, margenConBono, utilidadConIva, utilidadConBono };
    }));
  }

  /* ── Quote totals ── */
  const quoteTotals = useMemo(() => {
    if (quoteItems.length === 0) return null;
    const sumTotalIva = quoteItems.reduce((s, i) => s + i.totalIvaIncluido, 0);
    const sumTotalSinIva = quoteItems.reduce((s, i) => s + i.totalSinIva, 0);
    const sumUtilidadConIva = quoteItems.reduce((s, i) => s + (i.utilidadConIva ?? 0), 0);
    const sumUtilidadConBono = quoteItems.reduce((s, i) => s + (i.utilidadConBono ?? 0), 0);
    const sumBolsas = quoteItems.reduce((s, i) => s + i.bolsas, 0);
    const sumKg = quoteItems.reduce((s, i) => s + i.kgEntregados, 0);
    const blendedMargin = sumTotalSinIva > 0 ? sumUtilidadConIva / sumTotalSinIva : 0;
    const blendedMarginBono = sumTotalSinIva > 0 ? sumUtilidadConBono / sumTotalSinIva : 0;
    return { sumTotalIva, sumTotalSinIva, sumUtilidadConIva, sumUtilidadConBono, sumBolsas, sumKg, blendedMargin, blendedMarginBono };
  }, [quoteItems]);


  /* ── Copy summary ── */
  function handleCopyResumen() {
    if (!quoteTotals) return;
    const lines = quoteItems.map((i) => {
      return `${i.clave} — ${i.productName} — ${t("clipBags")}: ${i.bolsas}, kg: ${fmt(i.kgEntregados, lang)} — ${t("clipTotalIva")}: $${fmt(i.totalIvaIncluido, lang)}`;
    });
    const summary = [
      ...lines,
      "",
      `${t("clipTotalIva")}: $${fmt(quoteTotals.sumTotalIva, lang)}`,
      `${t("clipProfit")}: $${fmt(quoteTotals.sumUtilidadConIva, lang)}`,
      `${t("clipMargin")}: ${fmtPct(quoteTotals.blendedMargin, lang)}`,
    ];
    navigator.clipboard.writeText(summary.join("\n"));
    toast(t("copiedToClipboard"));
  }

  const inputLabels: Record<InputMode, string> = {
    num_bags: t("num_bags"),
    total_kg: t("total_kg"),
    total_mxn: t("total_mxn"),
  };

  /* ── Telemetry ── */
  const telemetry = useMemo(() => {
    if (!result || !product) return null;
    const m = result.isCustom ? result.customMargin : normMargin(result.marginNormal);
    return {
      product: product.clave,
      total: `$${fmt(result.totalConIva, lang)}`,
      margin: m != null ? fmtPct(m, lang) : "—",
      profit: m != null ? `$${fmt(result.totalSinIva * m, lang)}` : "—",
    };
  }, [result, product, lang]);

  /* ── Render ── */
  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden" onPointerMove={(e) => {
      const el = e.currentTarget as HTMLElement;
      el.style.setProperty('--x', `${e.clientX}px`);
      el.style.setProperty('--y', `${e.clientY}px`);
    }}>
      <AnimatedGridPattern className="inset-x-0 inset-y-[-40%] h-[220%] [mask-image:radial-gradient(900px_circle_at_center,white,transparent_85%)]" />
      <div className="relative z-10 p-4 md:p-8 pb-24 md:pb-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Telemetry Bar */}
        <div className="flex items-center justify-center">
          <div className="flex w-fit items-center gap-3 rounded-2xl border border-border bg-card/40 px-4 py-2 backdrop-blur sm:gap-5 sm:px-6">
            <TelemetryItem label={t("product")} value={telemetry?.product ?? "—"} />
            <div className="h-6 w-px bg-border" />
            <TelemetryItem label={t("telTotalIva")} value={telemetry?.total ?? "—"} />
            <div className="h-6 w-px bg-border" />
            <TelemetryItem label={t("telMargin")} value={telemetry?.margin ?? "—"} />
            <div className="h-6 w-px bg-border" />
            <TelemetryItem label={t("telProfit")} value={telemetry?.profit ?? "—"} />
          </div>
        </div>

        {/* 2-col cockpit */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1fr]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Product Selection */}
            <GlowCard>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{t("product")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ProductDropdown
                  options={dropdownOptions}
                  valueId={selectedProductId || null}
                  onChange={setSelectedProductId}
                  placeholder={t("searchProduct")}
                />
                {product && (
                  <>
                    <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                      <span>{t("kgPerBag")}: {kgPerBag}</span>
                      <span>{product.supplier}</span>
                    </div>
                    {product.image_url && (
                      <div className="mt-4 flex justify-center">
                        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
                          <img src={product.image_url} alt={product.product_name} className="h-56 w-auto object-contain" />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            </GlowCard>

            {/* Errors */}
            {productsError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>{t("errorProducts")}</AlertTitle><AlertDescription>{productsError}</AlertDescription></Alert>}

            <GlowCard>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{t("inputMode")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!product && (
                    <p className="text-sm text-muted-foreground">{t("selectProductToEnable")}</p>
                  )}
                  <RadioGroup value={inputMode} onValueChange={(v) => { setInputMode(v as InputMode); setInputValue(""); }} className="grid grid-cols-3 gap-2" disabled={!product}>
                    {(Object.keys(inputLabels) as InputMode[]).map((mode) => (
                      <div key={mode} className="flex items-center space-x-2">
                        <RadioGroupItem value={mode} id={mode} disabled={!product} />
                        <Label htmlFor={mode} className={cn("cursor-pointer text-sm", !product && "opacity-50")}>{inputLabels[mode]}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                  <div>
                    <Label htmlFor="input-val">{inputLabels[inputMode]}</Label>
                    <Input id="input-val" type="number" min="0" step="any" placeholder="0" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} className="mt-1" disabled={!product} />
                  </div>

                  {/* Custom Margin Section */}
                  <div className="space-y-3 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="custom-margin-toggle" className="cursor-pointer text-sm">{t("useCustomMargin")}</Label>
                      <Switch id="custom-margin-toggle" checked={useCustomMarginToggle} onCheckedChange={setUseCustomMarginToggle} disabled={!product} />
                    </div>
                    {useCustomMarginToggle && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">{t("customMarginLabel")}</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="60"
                            placeholder={t("customMarginPlaceholder")}
                            value={customMarginPct}
                            onChange={(e) => setCustomMarginPct(e.target.value)}
                            className="flex-1"
                            disabled={!product}
                          />
                          <span className="text-sm font-medium text-muted-foreground">%</span>
                        </div>
                        {customMarginPct !== "" && !customMarginValid && (
                          <p className="text-xs text-destructive">{t("customMarginError")}</p>
                        )}
                        {result?.noRefMargin && (
                          <p className="text-xs text-destructive">{lang === "en" ? "No reference margin for this product" : "Sin margen de referencia para este producto"}</p>
                        )}
                        {customMarginValid && !result?.noRefMargin && (
                          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {t("customMarginActive")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </GlowCard>
          </div>

          {/* Right column — Result */}
          <div className="space-y-4">
          {result && !result.noRefMargin ? (
              <GlowCard>
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">{t("result")}</CardTitle>
                  {result.isCustom && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {t("tierPersonalizado")}
                    </span>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* SALE */}
                  <section>
                    <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium border-b border-border pb-1 mb-3">{t("sectionSale")}</h4>
                    <div className="space-y-3 mb-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted-foreground">{t("totalIva")}</span>
                        <span className="text-2xl font-bold text-primary tabular-nums">${fmt(result.totalConIva, lang)}</span>
                      </div>
                      {(() => {
                        const m = result.isCustom ? result.customMargin : normMargin(result.marginNormal);
                        const mBono = result.isCustom ? result.customMargin : normMargin(result.marginConBonificacion);
                        return (
                          <>
                            {m != null && (
                              <div className="flex items-baseline justify-between">
                                <span className="text-sm text-muted-foreground">{t("profitIva")}</span>
                                <span className="text-2xl font-bold tabular-nums">${fmt(result.totalSinIva * m, lang)}</span>
                              </div>
                            )}
                            {mBono != null && !result.isCustom && (
                              <div className="flex items-baseline justify-between">
                                <span className="text-sm text-muted-foreground">{t("profitBonus7")}</span>
                                <span className="text-xl font-bold text-primary tabular-nums">${fmt(result.totalSinIva * mBono, lang)}</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="space-y-2 border-t border-muted-foreground/20 pt-3">
                      {normMargin(result.marginNormal) != null && !result.isCustom && (
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm text-muted-foreground">{t("marginNormal")}</span>
                          <span className="text-sm font-medium tabular-nums">{fmtPct(normMargin(result.marginNormal)!, lang)}</span>
                        </div>
                      )}
                      {normMargin(result.marginConBonificacion) != null && !result.isCustom && (
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm text-muted-foreground">{t("marginBonus")}</span>
                          <span className="text-sm font-medium tabular-nums">{fmtPct(normMargin(result.marginConBonificacion)!, lang)}</span>
                        </div>
                      )}
                      {result.isCustom && result.customMargin != null && (
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm text-muted-foreground">{t("customMarginActive")}</span>
                          <span className="text-sm font-medium tabular-nums">{fmtPct(result.customMargin, lang)}</span>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* PRICE */}
                  <section>
                    <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium border-b border-border pb-1 mb-3">{t("sectionPrice")}</h4>
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted-foreground">{t("pricePerKg")}</span>
                        <span className="text-sm font-medium tabular-nums">${fmt(result.pricePerKg, lang)}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted-foreground">{t("pricePerBag")}</span>
                        <span className="text-sm font-medium tabular-nums">${fmt(result.pricePerBag, lang)}</span>
                      </div>
                    </div>
                  </section>

                  {/* QUANTITY */}
                  <section>
                    <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium border-b border-border pb-1 mb-3">{t("sectionQuantity")}</h4>
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted-foreground">{t("numBags")}</span>
                        <span className="text-sm font-medium tabular-nums">{result.bags}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted-foreground">{t("deliveredKg")}</span>
                        <span className="text-sm font-medium tabular-nums">{fmt(result.deliveredKg, lang)}</span>
                      </div>
                    </div>
                  </section>
                </CardContent>
              </Card>
              </GlowCard>
            ) : (
              <GlowCard>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-lg">{t("result")}</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-8 space-y-4">
                    <LumaSpin />
                    <div className="text-center space-y-1">
                      <p className="text-sm text-muted-foreground font-medium">{t("waitingParams")}</p>
                      <p className="text-xs text-muted-foreground/60">{t("selectProductHint")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              </GlowCard>
            )}

            {/* Add to quote button */}
            <GradientButton
              className="w-full"
              disabled={!canAddToQuote}
              onClick={handleAddToQuote}
            >
              {t("addToQuote")}
            </GradientButton>
          </div>
        </div>

        {/* Quote Card */}
        {quoteItems.length > 0 && quoteTotals && (
          <GlowCard className="relative z-20">
            <Card className="overflow-visible">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{t("quote")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 overflow-visible">
                {/* Hero totals */}
                <section>
                  <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium border-b border-border pb-1 mb-3">{t("sectionSale")}</h4>
                  <div className="space-y-3 mb-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">{t("quoteTotalIva")}</span>
                      <span className="text-2xl font-bold text-primary tabular-nums">${fmt(quoteTotals.sumTotalIva, lang)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">{t("quoteProfit")}</span>
                      <span className="text-2xl font-bold tabular-nums">${fmt(quoteTotals.sumUtilidadConIva, lang)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">{t("profitBonus7")}</span>
                      <span className="text-xl font-bold text-primary tabular-nums">${fmt(quoteTotals.sumUtilidadConBono, lang)}</span>
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-muted-foreground/20 pt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">{t("quoteTotalNoIva")}</span>
                      <span className="text-sm font-medium tabular-nums">${fmt(quoteTotals.sumTotalSinIva, lang)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">{t("quoteBlendedMargin")}</span>
                      <span className="text-sm font-medium tabular-nums">{fmtPct(quoteTotals.blendedMargin, lang)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">{t("marginBonus")}</span>
                      <span className="text-sm font-medium text-primary tabular-nums">{fmtPct(quoteTotals.blendedMarginBono, lang)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">{t("quoteTotalBags")}</span>
                      <span className="text-sm font-medium tabular-nums">{quoteTotals.sumBolsas > 0 ? quoteTotals.sumBolsas : "—"}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">{t("quoteTotalKg")}</span>
                      <span className="text-sm font-medium tabular-nums">{quoteTotals.sumKg > 0 ? fmt(quoteTotals.sumKg, lang) : "—"}</span>
                    </div>
                  </div>
                </section>

                {/* Line items */}
                <section>
                  <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium border-b border-border pb-1 mb-3">{t("sectionProducts")}</h4>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto relative">
                    <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                      <colgroup>
                        <col />
                        <col style={{ width: 65 }} />
                        <col style={{ width: 85 }} />
                        <col style={{ width: 100 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 95 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 70 }} />
                        <col style={{ width: 70 }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="pb-2 font-medium text-left">{t("thProduct")}</th>
                          <th className="pb-2 font-medium text-center">{t("thBags")}</th>
                          <th className="pb-2 font-medium text-center">KG</th>
                          <th className="pb-2 font-medium text-center">$/bulto</th>
                          <th className="pb-2 font-medium text-center">{t("quoteTotalIva")}</th>
                          <th className="pb-2 font-medium text-center">{t("quoteProfit")}</th>
                          <th className="pb-2 font-medium text-center">{t("profitBonus7")}</th>
                          <th className="pb-2 font-medium text-center">{t("thMargin")}</th>
                          <th className="pb-2 font-medium text-center">{t("thActions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quoteItems.map((item) => (
                          <tr key={item.id} className="border-b border-border/50">
                            <td className="py-2">
                              <div className="flex items-center gap-2">
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt="" className="h-8 w-8 rounded object-contain shrink-0 bg-white" />
                                ) : (
                                  <div className="h-8 w-8 rounded bg-muted/50 shrink-0" />
                                )}
                                <div>
                                  <span className="font-medium">{item.clave}</span>
                                  <span className="ml-1 text-muted-foreground text-xs">{item.productName}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-2 text-center tabular-nums">{item.bolsas}</td>
                            <td className="py-2 text-center tabular-nums">{fmt(item.kgEntregados, lang)}</td>
                            <td className="py-2">
                              <Input
                                type="number"
                                className="w-full h-7 text-center text-sm tabular-nums"
                                value={item.precioBolsa}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  if (!isNaN(v) && v >= 0) handleQuotePriceChange(item.id, v);
                                }}
                                onFocus={(e) => e.target.select()}
                              />
                            </td>
                            <td className="py-2 text-center tabular-nums">${fmt(item.totalIvaIncluido, lang)}</td>
                            <td className="py-2 text-center tabular-nums">{item.utilidadConIva != null ? `$${fmt(item.utilidadConIva, lang)}` : "—"}</td>
                            <td className="py-2 text-center tabular-nums text-primary">{item.utilidadConBono != null ? `$${fmt(item.utilidadConBono, lang)}` : "—"}</td>
                            <td className="py-2 text-center tabular-nums">{item.margenNormal != null ? fmtPct(item.margenNormal, lang) : "—"}</td>
                            <td className="py-2">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(item)} title={t("duplicate")}>
                                  <CopyPlus className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveItem(item.id)} title={t("remove")}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile stacked cards */}
                  <div className="md:hidden space-y-3 relative">
                    {quoteItems.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {item.imageUrl && <img src={item.imageUrl} alt="" className="h-8 w-8 rounded object-contain shrink-0 bg-white" />}
                            <div>
                              <span className="font-medium text-sm">{item.clave}</span>
                              <span className="ml-1 text-muted-foreground text-xs">{item.productName}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(item)}>
                              <CopyPlus className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveItem(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <span className="text-muted-foreground">{t("thBags")}</span>
                          <span className="text-right tabular-nums">{item.bolsas}</span>
                          <span className="text-muted-foreground">KG</span>
                          <span className="text-right tabular-nums">{fmt(item.kgEntregados, lang)}</span>
                          <span className="text-muted-foreground">$/bulto</span>
                          <Input
                            type="number"
                            className="w-full h-7 text-right text-sm tabular-nums"
                            value={item.precioBolsa}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v) && v >= 0) handleQuotePriceChange(item.id, v);
                            }}
                            onFocus={(e) => e.target.select()}
                          />
                          <span className="text-muted-foreground">{t("quoteTotalIva")}</span>
                          <span className="text-right tabular-nums">${fmt(item.totalIvaIncluido, lang)}</span>
                          <span className="text-muted-foreground">{t("quoteProfit")}</span>
                          <span className="text-right tabular-nums">{item.utilidadConIva != null ? `$${fmt(item.utilidadConIva, lang)}` : "—"}</span>
                          <span className="text-muted-foreground">{t("profitBonus7")}</span>
                          <span className="text-right tabular-nums text-primary">{item.utilidadConBono != null ? `$${fmt(item.utilidadConBono, lang)}` : "—"}</span>
                          <span className="text-muted-foreground">{t("thMargin")}</span>
                          <span className="text-right tabular-nums">{item.margenNormal != null ? fmtPct(item.margenNormal, lang) : "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Controls */}
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" size="sm" onClick={handleCopyResumen}>
                    <CopyPlus className="mr-2 h-4 w-4" />
                    {t("copySummary")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadImage}>
                    <Download className="mr-2 h-4 w-4" />
                    {t("downloadQuote")}
                  </Button>
                  {/* Create / View Order button */}
                  {convertedToOrderId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/orders?openOrderId=" + convertedToOrderId)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {lang === "en" ? "View Order" : "Ver pedido"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setConvertDialogOpen(true)}
                      disabled={quoteItems.length === 0}
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      {lang === "en" ? "Create Order" : "Crear pedido"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => {
                    setQuoteItems([]);
                    setQuoteId(null);
                    setQuoteNumber(null);
                    setQuoteDirty(false);
                    setConvertedToOrderId(null);
                  }}>
                    {t("clearQuote")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </GlowCard>
        )}

        {/* Offscreen QuoteImageCard for export */}
        {quoteTotals && (
          <QuoteImageCard
            ref={quoteImageRef}
            sumTotalIva={quoteTotals.sumTotalIva}
            sumBolsas={quoteTotals.sumBolsas}
            sumKg={quoteTotals.sumKg}
            lang={lang}
            items={quoteItems}
          />
        )}

        <ConvertQuoteDialog
          open={convertDialogOpen}
          onOpenChange={setConvertDialogOpen}
          isConverting={isConverting}
          onConfirm={handleConvertQuote}
          quoteItems={quoteItems.map((i) => ({
            productId: i.productId,
            clave: i.clave,
            productName: i.productName,
            bolsas: i.bolsas,
            precioBolsa: i.precioBolsa,
            totalIvaIncluido: i.totalIvaIncluido,
          }))}
          quoteTotalIva={quoteTotals?.sumTotalIva ?? 0}
        />
      </div>
      </div>
    </div>
  );
}

/* ── QuoteImageCard (offscreen, for image export) ── */

type QuoteImageCardProps = {
  sumTotalIva: number;
  sumBolsas: number;
  sumKg: number;
  lang: string;
  logoUrl?: string;
  items: QuoteItem[];
};

const QuoteImageCard = React.forwardRef<HTMLDivElement, QuoteImageCardProps>(
  ({ sumTotalIva, sumBolsas, sumKg, lang, logoUrl, items }, ref) => {
    const isDark = document.documentElement.classList.contains("dark");

    const bg = isDark ? "#020817" : "#ffffff";
    const fg = isDark ? "#f8fafc" : "#020817";
    const muted = isDark ? "#94a3b8" : "#64748b";
    const accent = "#1e293b";
    const separatorColor = isDark ? "rgba(248,250,252,0.10)" : "rgba(2,8,23,0.10)";

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

    const fmtCurrency = (n: number) =>
      "$" + n.toLocaleString(lang === "en" ? "en-US" : "es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtNumber2 = (n: number) =>
      n.toLocaleString(lang === "en" ? "en-US" : "es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const tnum: React.CSSProperties = {
      fontVariantNumeric: "tabular-nums",
      fontFeatureSettings: '"tnum" 1, "lnum" 1',
    };

    const sortedItems = [...items].sort((a, b) => b.totalIvaIncluido - a.totalIvaIncluido);
    const maxRows = 12;
    const visibleItems = sortedItems.slice(0, maxRows);
    const hiddenCount = sortedItems.length - maxRows;

    const colHeaders = lang === "en"
      ? ["Product", "Bags", "KG", "$/Bag", "Total"]
      : ["Producto", "Bultos", "KG", "$/Bulto", "Total"];

    return (
      <div
        ref={ref}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          transform: "translateX(-200vw)",
          pointerEvents: "none",
          zIndex: 0,
          width: 1600,
          height: 900,
          backgroundColor: bg,
          color: fg,
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          display: "flex",
          flexDirection: "row",
          boxSizing: "border-box",
        }}
      >
        {/* Left panel */}
        <div style={{
          width: 520,
          minWidth: 520,
          padding: 56,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxSizing: "border-box",
          borderRight: `1px solid ${separatorColor}`,
        }}>
          <div>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.02em" }}>
                {lang === "en" ? "Quote" : "Cotización"}
              </div>
              <div style={{ fontSize: 20, color: muted, marginTop: 8 }}>{dateStr}</div>
            </div>

            <div style={{ height: 3, background: accent, borderRadius: 2, marginBottom: 36 }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <div>
                <div style={{ fontSize: 16, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Total con IVA</div>
                <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.02em", ...tnum }}>{fmtCurrency(sumTotalIva)}</div>
              </div>
              <div>
                <div style={{ fontSize: 16, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{lang === "en" ? "Total bags" : "Bultos totales"}</div>
                <div style={{ fontSize: 44, fontWeight: 600, ...tnum }}>{sumBolsas}</div>
              </div>
              <div>
                <div style={{ fontSize: 16, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>KG totales</div>
                <div style={{ fontSize: 44, fontWeight: 600, ...tnum }}>{fmtNumber2(sumKg)}</div>
              </div>
            </div>

            {logoUrl && (
              <img src={logoUrl} alt="Logo" style={{ maxHeight: 60, maxWidth: 200, objectFit: "contain", marginTop: 32 }} />
            )}
          </div>

          <div style={{ fontSize: 16, color: muted }}>
            {lang === "en" ? "Prices include VAT" : "Precios incluyen IVA"}
          </div>
        </div>

        {/* Right panel */}
        <div style={{
          flex: 1,
          padding: 56,
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          overflow: "hidden",
        }}>
          {visibleItems.length > 0 && (() => {
            const summaryCellBase: React.CSSProperties = { display: "flex", alignItems: "center", overflow: "visible", paddingTop: 1, paddingBottom: 1 };
            const headerCell: React.CSSProperties = { ...summaryCellBase, minHeight: 36 };
            const rowCell: React.CSSProperties = { ...summaryCellBase, minHeight: 44, minWidth: 0 };
            const summarySpanBase: React.CSSProperties = { display: "block", lineHeight: "1.35", paddingTop: 4, paddingBottom: 4, transform: "translateY(1px)" };
            const productSpan: React.CSSProperties = { ...summarySpanBase, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" };
            const numericSpan: React.CSSProperties = { ...summarySpanBase, ...tnum, whiteSpace: "nowrap", textAlign: "right" as const, width: "100%", display: "block" };
            const numericCell: React.CSSProperties = { ...rowCell, justifyContent: "flex-end" };
            const gridCols = "minmax(0, 1fr) 90px 110px 140px 160px";
            return (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                  {lang === "en" ? "Summary" : "Resumen"}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: gridCols, columnGap: 16, fontSize: 14, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 8, borderBottom: `1px solid ${separatorColor}` }}>
                  <div style={{ ...headerCell, minWidth: 0 }}><span style={summarySpanBase}>{colHeaders[0]}</span></div>
                  <div style={{ ...headerCell, justifyContent: "flex-end" }}><span style={{ ...numericSpan, fontSize: 14 }}>{colHeaders[1]}</span></div>
                  <div style={{ ...headerCell, justifyContent: "flex-end" }}><span style={{ ...numericSpan, fontSize: 14 }}>{colHeaders[2]}</span></div>
                  <div style={{ ...headerCell, justifyContent: "flex-end" }}><span style={{ ...numericSpan, fontSize: 14 }}>{colHeaders[3]}</span></div>
                  <div style={{ ...headerCell, justifyContent: "flex-end" }}><span style={{ ...numericSpan, fontSize: 14 }}>{colHeaders[4]}</span></div>
                </div>

                {visibleItems.map((item) => {
                  const displayName = `${item.clave} — ${item.productName}`;
                  const truncated = displayName.length > 55 ? displayName.slice(0, 55) + "…" : displayName;
                  return (
                    <div key={item.id} style={{ display: "grid", gridTemplateColumns: gridCols, columnGap: 16, fontSize: 18, paddingTop: 6, paddingBottom: 6, borderBottom: `1px solid ${separatorColor}` }}>
                      <div style={{ ...rowCell, paddingRight: 12 }}><span style={productSpan}>{truncated}</span></div>
                      <div style={numericCell}><span style={numericSpan}>{item.bolsas}</span></div>
                      <div style={numericCell}><span style={numericSpan}>{fmtNumber2(item.kgEntregados)}</span></div>
                      <div style={numericCell}><span style={numericSpan}>{fmtCurrency(item.precioBolsa)}</span></div>
                      <div style={numericCell}><span style={numericSpan}>{fmtCurrency(item.totalIvaIncluido)}</span></div>
                    </div>
                  );
                })}
                {hiddenCount > 0 && (
                  <div style={{ fontSize: 16, color: muted, marginTop: 12, fontStyle: "italic" }}>
                    +{hiddenCount} {lang === "en" ? "additional products" : "productos adicionales"}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }
);
QuoteImageCard.displayName = "QuoteImageCard";

function TelemetryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
