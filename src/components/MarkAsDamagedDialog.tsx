import { useState, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Package, AlertTriangle, TrendingUp, TrendingDown, Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

interface MarkAsDamagedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    clave: string;
    name: string;
    image_url: string | null;
    cost_with_iva: number;
    cost_without_iva: number;
    bonificacion_pct: number;
    sale_price_with_iva: number;
    stock_actual: number;
  } | null;
}

type Condition = "leve" | "moderado" | "severo";
type PricingMode = "catalogo" | "margen_alto" | "margen_medio" | "al_costo" | "custom";

export function MarkAsDamagedDialog({ open, onOpenChange, product }: MarkAsDamagedDialogProps) {
  const [quantity, setQuantity] = useState("");
  const [condition, setCondition] = useState<Condition>("moderado");
  const [pricingMode, setPricingMode] = useState<PricingMode>("margen_medio");
  const [customMargin, setCustomMargin] = useState(5); // percentage margin (slider)
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [acceptLoss, setAcceptLoss] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const qty = parseInt(quantity) || 0;
  const cost = product?.cost_with_iva ?? 0;
  const costSinIva = product?.cost_without_iva ?? 0;
  const bonifPct = product?.bonificacion_pct ?? 0.07;
  const costBonifSinIva = costSinIva * (1 - bonifPct); // real effective cost (sin IVA, con bonif)
  const normalSale = product?.sale_price_with_iva ?? 0;
  const saleSinIva = normalSale / 1.16;
  // Margins computed sin-IVA (matches DB convention in v_products_with_stock)
  const normalMarginPct = saleSinIva > 0 && costSinIva > 0
    ? ((saleSinIva - costSinIva) / saleSinIva) * 100 : 0;
  const catalogRealMarginPct = saleSinIva > 0 && costBonifSinIva > 0
    ? ((saleSinIva - costBonifSinIva) / saleSinIva) * 100 : 0;

  // Target REAL margin (con bonif) per preset. Option B: fixed pp drop from catalog.
  // Note: "catalogo" mode uses direct price, targetRealMarginPct is unused for it.
  const targetRealMarginPct = useMemo(() => {
    switch (pricingMode) {
      case "catalogo": return catalogRealMarginPct; // informational only
      case "margen_alto": return Math.max(0, catalogRealMarginPct - 3);
      case "margen_medio": return Math.max(0, catalogRealMarginPct - 8);
      case "al_costo": return 0; // break-even vs effective cost
      case "custom": return customMargin; // slider is real margin %
    }
  }, [pricingMode, customMargin, catalogRealMarginPct]);

  // Calculate unit price (displayed with IVA). Math done sin-IVA against cost_bonif.
  const unitPrice = useMemo(() => {
    if (!product || costBonifSinIva === 0) return 0;
    if (pricingMode === "catalogo") return normalSale; // direct catalog price
    const factor = 1 - (targetRealMarginPct / 100);
    if (factor <= 0) return costBonifSinIva * 2 * 1.16; // cap
    const priceSinIva = costBonifSinIva / factor;
    return priceSinIva * 1.16;
  }, [pricingMode, targetRealMarginPct, costBonifSinIva, normalSale, product]);

  // All profit/margin numbers below are sin-IVA (real).
  const unitPriceSinIva = unitPrice / 1.16;
  const realMarginPct = unitPriceSinIva > 0
    ? ((unitPriceSinIva - costBonifSinIva) / unitPriceSinIva) * 100 : 0;
  const marginSinBonifPct = unitPriceSinIva > 0 && costSinIva > 0
    ? ((unitPriceSinIva - costSinIva) / unitPriceSinIva) * 100 : 0;
  const marginAmount = unitPriceSinIva - costBonifSinIva; // real ganancia por bulto (sin IVA)
  const totalRevenue = unitPrice * qty; // with IVA (what customer pays)
  const totalProfit = marginAmount * qty; // sin IVA (real profit)
  const isLoss = realMarginPct < 0;
  const isLowMargin = realMarginPct >= 0 && realMarginPct < 3;

  const exceedsStock = product ? qty > product.stock_actual : false;
  const canSubmit = qty > 0 && !exceedsStock && (!isLoss || acceptLoss);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!product || qty <= 0) throw new Error("Cantidad inválida");
      if (exceedsStock) throw new Error("La cantidad excede el stock disponible");
      if (isLoss && !acceptLoss) throw new Error("Confirma la venta con pérdida");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      // 1. Upload photos if any
      const photoPaths: string[] = [];
      for (const file of photos) {
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("damaged-photos")
          .upload(path, file);
        if (uploadErr) throw new Error(`Foto: ${uploadErr.message}`);
        photoPaths.push(path);
      }

      // 2. Create damaged batch
      const { error: batchErr } = await supabase
        .from("damaged_batches")
        .insert({
          product_id: product.id,
          original_quantity: qty,
          remaining_quantity: qty,
          condition,
          unit_price: Number(unitPrice.toFixed(2)),
          cost_at_time: cost,
          margin_pct: Number(realMarginPct.toFixed(2)),
          photos: photoPaths,
          notes: notes.trim() || null,
          source: "warehouse_found",
          status: "disponible",
          created_by: userId,
        } as any);
      if (batchErr) throw new Error(`Lote: ${batchErr.message}`);

      // 3. Subtract from regular stock via stock_adjustments (reuses existing system)
      const { data: prod, error: fetchErr } = await supabase
        .from("products")
        .select("stock_adjustment")
        .eq("id", product.id)
        .single();
      if (fetchErr) throw new Error(`Fetch: ${fetchErr.message}`);

      const currentAdj = (prod as any).stock_adjustment ?? 0;
      const { error: updateErr } = await supabase
        .from("products")
        .update({ stock_adjustment: currentAdj - qty })
        .eq("id", product.id);
      if (updateErr) throw new Error(`Ajuste: ${updateErr.message}`);

      const { error: logErr } = await supabase
        .from("stock_adjustments")
        .insert({
          product_id: product.id,
          quantity: -qty,
          reason: `Marcado como dañado (${condition})${notes ? `: ${notes.trim()}` : ""}`,
          created_by: userId,
        });
      if (logErr) throw new Error(`Log: ${logErr.message}`);
    },
    onSuccess: () => {
      toast({
        title: "Marcado como dañado",
        description: `${qty} bultos de ${product?.clave} movidos al pool de dañados`,
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["damaged-batches"] });
      queryClient.invalidateQueries({ queryKey: ["damaged-by-product"] });
      handleClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleClose = () => {
    setQuantity("");
    setCondition("moderado");
    setPricingMode("margen_medio");
    setCustomMargin(5);
    setNotes("");
    setPhotos([]);
    setAcceptLoss(false);
    onOpenChange(false);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPhotos(prev => [...prev, ...files].slice(0, 4));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Marcar como dañado</DialogTitle>
          <DialogDescription>
            Mueve bultos al pool de dañados con precio de recuperación. Se restará del stock normal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Product info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <ProductThumb src={product.image_url} size="lg" />
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium text-primary">{product.clave}</p>
              <p className="text-sm text-foreground truncate">{product.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Stock: <span className="font-semibold text-foreground">{product.stock_actual.toLocaleString()}</span>
                {" · "}
                Costo: <span className="font-semibold text-foreground">{mxnFmt.format(cost)}</span>
                {" · "}
                Venta normal: <span className="font-semibold text-foreground">{mxnFmt.format(normalSale)}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Margen normal: <span className="font-semibold text-foreground">{normalMarginPct.toFixed(1)}%</span>
                {" · "}
                <span className="text-green-500">
                  Margen con bonif ({(bonifPct * 100).toFixed(0)}%): <span className="font-semibold">{catalogRealMarginPct.toFixed(1)}%</span>
                </span>
              </p>
            </div>
          </div>

          {/* Quantity + condition row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="damaged-qty">Cantidad (bultos)</Label>
              <Input
                id="damaged-qty"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
                className={cn("text-lg font-semibold tabular-nums", exceedsStock && "border-red-500")}
                autoFocus
              />
              {exceedsStock && <p className="text-xs text-red-500">Excede el stock ({product.stock_actual})</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Condición</Label>
              <div className="flex gap-1">
                {(["leve", "moderado", "severo"] as Condition[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCondition(c)}
                    className={cn(
                      "flex-1 py-2 rounded-md text-xs font-medium capitalize transition-colors",
                      condition === c
                        ? c === "leve" ? "bg-amber-500/20 text-amber-600 border border-amber-500/50"
                          : c === "moderado" ? "bg-orange-500/20 text-orange-600 border border-orange-500/50"
                          : "bg-red-500/20 text-red-600 border border-red-500/50"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Pricing mode presets */}
          <div className="space-y-2">
            <Label>Modelo de precio (recuperación)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {[
                { mode: "catalogo" as const, label: "Precio catálogo", sub: `${mxnFmt.format(normalSale)}` },
                { mode: "margen_alto" as const, label: "Margen alto", sub: `~${Math.max(0, catalogRealMarginPct - 3).toFixed(0)}% con bonif` },
                { mode: "margen_medio" as const, label: "Margen medio", sub: `~${Math.max(0, catalogRealMarginPct - 8).toFixed(0)}% con bonif` },
                { mode: "al_costo" as const, label: "Al costo", sub: "0% con bonif" },
                { mode: "custom" as const, label: "Personalizado", sub: "Ajustar" },
              ].map(({ mode, label, sub }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPricingMode(mode)}
                  className={cn(
                    "flex flex-col items-center py-2.5 px-2 rounded-md text-xs transition-colors border",
                    pricingMode === mode
                      ? "bg-primary/10 text-primary border-primary/50"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted border-transparent"
                  )}
                >
                  <span className="font-medium">{label}</span>
                  <span className="text-[10px] mt-0.5 opacity-70">{sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom slider */}
          {pricingMode === "custom" && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Margen objetivo (con bonif)</Label>
                <span className={cn(
                  "text-sm font-bold tabular-nums",
                  customMargin < 0 ? "text-red-500" : customMargin < 3 ? "text-amber-500" : "text-green-500"
                )}>
                  {customMargin > 0 ? "+" : ""}{customMargin}%
                </span>
              </div>
              <input
                type="range"
                min={-10}
                max={Math.max(15, Math.ceil(catalogRealMarginPct))}
                step={1}
                value={customMargin}
                onChange={(e) => setCustomMargin(parseInt(e.target.value))}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>-10% (pérdida)</span>
                <span>0% (break-even)</span>
                <span>catálogo {catalogRealMarginPct.toFixed(0)}%</span>
              </div>
            </div>
          )}

          {/* Profit preview */}
          {qty > 0 && (
            <div className={cn(
              "p-4 rounded-lg border-2 space-y-2",
              isLoss ? "border-red-500/50 bg-red-500/5"
                : isLowMargin ? "border-amber-500/50 bg-amber-500/5"
                : "border-green-500/50 bg-green-500/5"
            )}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {isLoss ? <TrendingDown className="h-4 w-4 text-red-500" />
                  : isLowMargin ? <AlertTriangle className="h-4 w-4 text-amber-500" />
                  : <TrendingUp className="h-4 w-4 text-green-500" />}
                <span className={cn(
                  isLoss ? "text-red-500"
                    : isLowMargin ? "text-amber-600"
                    : "text-green-600"
                )}>
                  {isLoss ? "Vendiendo con pérdida" : isLowMargin ? "Margen bajo" : "Precio saludable"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="text-muted-foreground">Precio por bulto (c/IVA):</div>
                <div className="text-right font-semibold tabular-nums">{mxnFmt.format(unitPrice)}</div>

                <div className="text-muted-foreground">Margen sin bonif:</div>
                <div className={cn(
                  "text-right font-semibold tabular-nums",
                  marginSinBonifPct < 0 ? "text-red-500" : marginSinBonifPct < 3 ? "text-amber-500" : "text-green-500"
                )}>
                  {marginSinBonifPct >= 0 ? "+" : ""}{marginSinBonifPct.toFixed(1)}%
                </div>

                <div className="text-muted-foreground">Margen con bonif:</div>
                <div className={cn(
                  "text-right font-semibold tabular-nums",
                  realMarginPct < 0 ? "text-red-500" : realMarginPct < 3 ? "text-amber-500" : "text-green-500"
                )}>
                  {marginAmount >= 0 ? "+" : ""}{mxnFmt.format(marginAmount)} ({realMarginPct.toFixed(1)}%)
                </div>

                <div className="text-muted-foreground pt-1 border-t border-border/50">Total venta ({qty} bultos, c/IVA):</div>
                <div className="text-right font-bold tabular-nums pt-1 border-t border-border/50">{mxnFmt.format(totalRevenue)}</div>

                <div className="text-muted-foreground">Ganancia (s/IVA, con bonif):</div>
                <div className={cn(
                  "text-right font-bold tabular-nums",
                  totalProfit < 0 ? "text-red-500" : "text-green-500"
                )}>
                  {totalProfit >= 0 ? "+" : ""}{mxnFmt.format(totalProfit)}
                </div>
              </div>

              {isLoss && (
                <label className="flex items-center gap-2 pt-2 border-t border-red-500/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptLoss}
                    onChange={(e) => setAcceptLoss(e.target.checked)}
                    className="rounded accent-red-500"
                  />
                  <span className="text-xs text-red-500 font-medium">Confirmo vender con pérdida</span>
                </label>
              )}
            </div>
          )}

          {/* Photos */}
          <div className="space-y-1.5">
            <Label>Fotos (opcional, máx 4)</Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((file, i) => (
                <div key={i} className="relative h-16 w-16 rounded-md border bg-muted overflow-hidden">
                  <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {photos.length < 4 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-16 w-16 rounded-md border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                >
                  <Camera className="h-5 w-5" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoSelect}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="damaged-notes">Notas (opcional)</Label>
            <Textarea
              id="damaged-notes"
              placeholder="Ej: Bolsa rota, humedad, descosido, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              className={cn("flex-1", isLoss ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700", "text-white")}
              disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Guardando..." : `Marcar ${qty > 0 ? qty : ""} bultos como dañados`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
