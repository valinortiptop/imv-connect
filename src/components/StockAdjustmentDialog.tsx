import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Package, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface StockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    clave: string;
    name: string;
    image_url: string | null;
    stock_actual: number;
    stock_disponible: number;
  } | null;
}

export function StockAdjustmentDialog({ open, onOpenChange, product }: StockAdjustmentDialogProps) {
  const [mode, setMode] = useState<"add" | "remove">("remove");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const qty = parseInt(quantity) || 0;
  const delta = mode === "add" ? qty : -qty;
  const newStock = product ? product.stock_actual + delta : 0;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!product || qty <= 0) throw new Error("Cantidad inválida");

      // Get current adjustment value
      const { data: prod, error: fetchErr } = await supabase
        .from("products")
        .select("stock_adjustment")
        .eq("id", product.id)
        .single();
      if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);

      const currentAdj = (prod as any).stock_adjustment ?? 0;
      const newAdj = currentAdj + delta;

      // Update the adjustment
      const { error: updateErr } = await supabase
        .from("products")
        .update({ stock_adjustment: newAdj })
        .eq("id", product.id);
      if (updateErr) throw new Error(`Update error: ${updateErr.message}`);

      // Log the adjustment
      const { error: logErr } = await supabase
        .from("stock_adjustments")
        .insert({
          product_id: product.id,
          quantity: delta,
          reason: reason.trim() || null,
          created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        });
      if (logErr) throw new Error(`Log error: ${logErr.message}`);
    },
    onSuccess: () => {
      toast({
        title: "Ajuste aplicado",
        description: `${mode === "add" ? "+" : ""}${delta} bultos para ${product?.clave}`,
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["portal-stock-levels"] });
      handleClose();
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "No se pudo aplicar el ajuste",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setQuantity("");
    setReason("");
    setMode("remove");
    onOpenChange(false);
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajuste de Inventario</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Product info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <ProductThumb src={product.image_url} size="lg" />
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium text-primary">{product.clave}</p>
              <p className="text-sm text-foreground truncate">{product.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Stock actual: <span className="font-semibold text-foreground">{product.stock_actual.toLocaleString()}</span>
                {" · "}
                Disponible: <span className="font-semibold text-foreground">{product.stock_disponible.toLocaleString()}</span>
              </p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("remove")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors",
                mode === "remove"
                  ? "bg-red-500/10 border-red-500/50 text-red-500"
                  : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Minus className="h-4 w-4" />
              Quitar
            </button>
            <button
              onClick={() => setMode("add")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors",
                mode === "add"
                  ? "bg-green-500/10 border-green-500/50 text-green-500"
                  : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="adj-qty">Cantidad (bultos)</Label>
            <Input
              id="adj-qty"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
              className="text-lg font-semibold tabular-nums"
              autoFocus
            />
          </div>

          {/* Preview */}
          {qty > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
              <span className="text-sm text-muted-foreground">Stock después del ajuste:</span>
              <span className={cn(
                "text-lg font-bold tabular-nums",
                newStock < 0 ? "text-red-500" : "text-foreground"
              )}>
                {newStock.toLocaleString()}
              </span>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="adj-reason">Razón (opcional)</Label>
            <Textarea
              id="adj-reason"
              placeholder="Ej: Producto dañado, conteo físico, devolución..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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
              className={cn(
                "flex-1",
                mode === "remove"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-green-600 hover:bg-green-700 text-white"
              )}
              disabled={qty <= 0 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending
                ? "Aplicando..."
                : mode === "remove"
                  ? `Quitar ${qty > 0 ? qty.toLocaleString() : ""} bultos`
                  : `Agregar ${qty > 0 ? qty.toLocaleString() : ""} bultos`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
