import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductThumb } from "@/components/ui/product-thumb";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Undo2, Package, AlertTriangle, MapPin, XCircle, TrendingDown,
} from "lucide-react";

type Tipo = "devolucion_buena" | "devolucion_danada" | "perdida_total" | "faltante";
type FaltanteDestino = "bodega" | "perdidos";
type DamagedCondition = "leve" | "moderado" | "severo";

interface RegistrarAjusteDialogProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, opens the dialog in "edit" mode — pre-fills the form and
   *  the mutation will delete the old adjustment + insert a new one. */
  editingAdjustment?: any | null;
}

interface OrderItemRow {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_override: number;
  is_damaged: boolean | null;
  products: {
    clave: string;
    name: string;
    image_url: string | null;
  } | null;
}

const tipoLabel: Record<Tipo, { es: string; description: string; icon: typeof Undo2; color: string }> = {
  devolucion_buena: {
    es: "Devolución (buen estado)",
    description: "El cliente regresó bultos en buen estado. Regresan al stock normal.",
    icon: Undo2,
    color: "text-emerald-500",
  },
  devolucion_danada: {
    es: "Devolución (dañada)",
    description: "El cliente regresó bultos dañados. Van al pool de dañados pendientes de precio.",
    icon: AlertTriangle,
    color: "text-orange-500",
  },
  perdida_total: {
    es: "Pérdida total",
    description: "Los bultos no se pueden recuperar. Solo se descuenta del total.",
    icon: XCircle,
    color: "text-red-500",
  },
  faltante: {
    es: "Faltante",
    description: "Entregamos menos de lo pedido. Se descuenta del total.",
    icon: TrendingDown,
    color: "text-amber-500",
  },
};

export function RegistrarAjusteDialog({ orderId, open, onOpenChange, editingAdjustment }: RegistrarAjusteDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEditing = !!editingAdjustment;

  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [tipo, setTipo] = useState<Tipo>("devolucion_buena");
  const [quantity, setQuantity] = useState<number>(1);
  const [faltanteDestino, setFaltanteDestino] = useState<FaltanteDestino>("bodega");
  const [damagedCondition, setDamagedCondition] = useState<DamagedCondition>("leve");
  const [notes, setNotes] = useState("");

  // Reset / pre-fill form when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (editingAdjustment) {
        // Pre-fill from existing ajuste
        setSelectedItemId(editingAdjustment.order_item_id ?? "");
        setTipo((editingAdjustment.tipo as Tipo) ?? "devolucion_buena");
        setQuantity(Number(editingAdjustment.quantity) || 1);
        setFaltanteDestino((editingAdjustment.faltante_destino as FaltanteDestino) ?? "bodega");
        setDamagedCondition("leve");
        setNotes(editingAdjustment.notes ?? "");
      } else {
        setSelectedItemId("");
        setTipo("devolucion_buena");
        setQuantity(1);
        setFaltanteDestino("bodega");
        setDamagedCondition("leve");
        setNotes("");
      }
    }
  }, [open, orderId, editingAdjustment]);

  // Fetch order items
  const { data: items = [], isLoading: itemsLoading } = useQuery<OrderItemRow[]>({
    queryKey: ["registrar-ajuste-items", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, product_id, quantity, unit_price_override, is_damaged, products(clave, name, image_url)")
        .eq("order_id", orderId!);
      if (error) throw error;
      return (data ?? []) as unknown as OrderItemRow[];
    },
    enabled: !!orderId && open,
  });

  // Fetch existing adjustments to compute remaining adjustable qty per item
  const { data: existingAdjustments = [] } = useQuery({
    queryKey: ["order-adjustments", orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_adjustments")
        .select("id, order_item_id, quantity")
        .eq("order_id", orderId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId && open,
  });

  const adjustedByItem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of existingAdjustments) {
      // When editing, exclude the ajuste being edited from the "already adjusted" total
      if (editingAdjustment && a.id === editingAdjustment.id) continue;
      m[a.order_item_id] = (m[a.order_item_id] ?? 0) + a.quantity;
    }
    return m;
  }, [existingAdjustments, editingAdjustment]);

  const selectedItem = items.find(i => i.id === selectedItemId) || null;
  const alreadyAdjusted = selectedItem ? (adjustedByItem[selectedItem.id] ?? 0) : 0;
  const maxAdjustable = selectedItem ? Math.max(0, selectedItem.quantity - alreadyAdjusted) : 0;
  const creditAmount = selectedItem ? quantity * (selectedItem.unit_price_override ?? 0) : 0;

  const fmtMXN = (v: number) => new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 2,
  }).format(v);

  // Clamp quantity if it exceeds max
  useEffect(() => {
    if (selectedItem && quantity > maxAdjustable) {
      setQuantity(Math.max(1, maxAdjustable));
    }
  }, [selectedItem, maxAdjustable, quantity]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!orderId || !selectedItem) throw new Error("Falta seleccionar producto");
      if (quantity <= 0 || quantity > maxAdjustable) throw new Error("Cantidad inválida");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const unitPrice = selectedItem.unit_price_override ?? 0;
      const credit = quantity * unitPrice;

      // If editing: first reverse + delete the old ajuste (same logic as OrderDetailSheet delete)
      if (editingAdjustment) {
        const old = editingAdjustment;
        const oldAddedStock =
          old.tipo === "devolucion_buena" ||
          (old.tipo === "faltante" && old.faltante_destino === "bodega");

        if (oldAddedStock) {
          const { data: prod, error: pErr } = await supabase
            .from("products")
            .select("stock_adjustment")
            .eq("id", old.product_id)
            .single();
          if (pErr) throw new Error(`Producto: ${pErr.message}`);
          const currentAdj = (prod as any)?.stock_adjustment ?? 0;
          const newAdj = Math.max(0, currentAdj - (old.quantity ?? 0));
          const { error: upErr } = await supabase
            .from("products")
            .update({ stock_adjustment: newAdj })
            .eq("id", old.product_id);
          if (upErr) throw new Error(`Stock reverso: ${upErr.message}`);
          const { error: logErr } = await supabase
            .from("stock_adjustments")
            .insert({
              product_id: old.product_id,
              quantity: -(old.quantity ?? 0),
              reason: `Reverso (edición) de ajuste`,
              created_by: userId,
            });
          if (logErr) throw new Error(`Log reverso: ${logErr.message}`);
        }

        if (old.damaged_batch_id) {
          const { data: batch } = await (supabase as any)
            .from("damaged_batches")
            .select("id, original_quantity, remaining_quantity, status")
            .eq("id", old.damaged_batch_id)
            .maybeSingle();
          if (batch && batch.status === "pendiente_preciar" && batch.remaining_quantity === batch.original_quantity) {
            await (supabase as any).from("damaged_batches").delete().eq("id", old.damaged_batch_id);
          }
        }

        const { error: delErr } = await (supabase as any)
          .from("order_adjustments")
          .delete()
          .eq("id", old.id);
        if (delErr) throw new Error(`Eliminar viejo: ${delErr.message}`);
      }

      let damagedBatchId: string | null = null;

      // 1. If devolucion_danada, create a damaged_batch pendiente_preciar
      if (tipo === "devolucion_danada") {
        // fetch product cost for record-keeping (from view, not table)
        const { data: prod } = await supabase
          .from("v_products_with_stock")
          .select("cost_with_iva")
          .eq("id", selectedItem.product_id)
          .single();
        const cost = (prod as any)?.cost_with_iva ?? null;

        const { data: batch, error: batchErr } = await (supabase as any)
          .from("damaged_batches")
          .insert({
            product_id: selectedItem.product_id,
            original_quantity: quantity,
            remaining_quantity: quantity,
            condition: damagedCondition,
            unit_price: null,
            cost_at_time: cost,
            margin_pct: null,
            photos: [],
            notes: notes ? `Devolución pedido ${orderId.slice(0, 8)}: ${notes}` : `Devolución pedido ${orderId.slice(0, 8)}`,
            source: "client_return",
            source_order_id: orderId,
            status: "pendiente_preciar",
            created_by: userId,
          })
          .select("id")
          .single();
        if (batchErr) throw new Error(`Lote dañado: ${batchErr.message}`);
        damagedBatchId = batch.id;
      }

      // 2. Insert order_adjustment
      const { error: adjErr } = await (supabase as any)
        .from("order_adjustments")
        .insert({
          order_id: orderId,
          order_item_id: selectedItem.id,
          product_id: selectedItem.product_id,
          tipo,
          quantity,
          unit_price: unitPrice,
          credit_amount: credit,
          faltante_destino: tipo === "faltante" ? faltanteDestino : null,
          damaged_batch_id: damagedBatchId,
          notes: notes || null,
          created_by: userId,
        });
      if (adjErr) throw new Error(`Ajuste: ${adjErr.message}`);

      // 3. Apply stock side-effects
      const needsStockAdd =
        tipo === "devolucion_buena" ||
        (tipo === "faltante" && faltanteDestino === "bodega");

      if (needsStockAdd) {
        const { data: prod, error: pErr } = await supabase
          .from("products")
          .select("stock_adjustment")
          .eq("id", selectedItem.product_id)
          .single();
        if (pErr) throw new Error(`Producto: ${pErr.message}`);

        const currentAdj = (prod as any).stock_adjustment ?? 0;
        const { error: upErr } = await supabase
          .from("products")
          .update({ stock_adjustment: currentAdj + quantity })
          .eq("id", selectedItem.product_id);
        if (upErr) throw new Error(`Stock: ${upErr.message}`);

        const reason =
          tipo === "devolucion_buena"
            ? `Devolución pedido ${orderId.slice(0, 8)} (buen estado)`
            : `Faltante pedido ${orderId.slice(0, 8)} (quedó en bodega)`;

        const { error: logErr } = await supabase
          .from("stock_adjustments")
          .insert({
            product_id: selectedItem.product_id,
            quantity,
            reason,
            created_by: userId,
          });
        if (logErr) throw new Error(`Log: ${logErr.message}`);
      }
    },
    onSuccess: () => {
      toast({
        title: isEditing ? "Ajuste actualizado" : "Ajuste registrado",
        description: "El pedido y el inventario se actualizaron",
      });
      queryClient.invalidateQueries({ queryKey: ["order-adjustments", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-adjustments-all"] });
      queryClient.invalidateQueries({ queryKey: ["damaged-batches"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit =
    !!selectedItem &&
    quantity > 0 &&
    quantity <= maxAdjustable &&
    !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-primary" />
            {isEditing ? "Editar ajuste" : "Registrar ajuste"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* 1. Product selection */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Producto del pedido
            </Label>
            {itemsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un producto" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => {
                    const adj = adjustedByItem[item.id] ?? 0;
                    const remaining = Math.max(0, item.quantity - adj);
                    const isFullyAdjusted = remaining === 0;
                    return (
                      <SelectItem
                        key={item.id}
                        value={item.id}
                        disabled={isFullyAdjusted}
                      >
                        <div className="flex items-center gap-2">
                          <ProductThumb src={item.products?.image_url ?? null} size="xs" />
                          <span className="font-mono text-xs">{item.products?.clave}</span>
                          <span className="truncate max-w-[220px]">{item.products?.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {remaining}/{item.quantity} bultos
                          </span>
                          {item.is_damaged && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-500 border border-orange-500/30">
                              dañado
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            {selectedItem && (
              <p className="text-xs text-muted-foreground">
                Precio unitario: {fmtMXN(selectedItem.unit_price_override ?? 0)} · Ajustable: {maxAdjustable} bultos
              </p>
            )}
          </div>

          {/* 2. Tipo de ajuste */}
          {selectedItem && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Tipo de ajuste
              </Label>
              <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as Tipo)} className="grid grid-cols-1 gap-2">
                {(Object.keys(tipoLabel) as Tipo[]).map((t) => {
                  const cfg = tipoLabel[t];
                  const Icon = cfg.icon;
                  const checked = tipo === t;
                  return (
                    <label
                      key={t}
                      htmlFor={`tipo-${t}`}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      )}
                    >
                      <RadioGroupItem id={`tipo-${t}`} value={t} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", cfg.color)} />
                          <span className="text-sm font-medium">{cfg.es}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>
          )}

          {/* 3. Conditional: faltante destino */}
          {selectedItem && tipo === "faltante" && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                ¿Dónde están los bultos?
              </Label>
              <RadioGroup
                value={faltanteDestino}
                onValueChange={(v) => setFaltanteDestino(v as FaltanteDestino)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              >
                <label
                  htmlFor="dest-bodega"
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    faltanteDestino === "bodega" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem id="dest-bodega" value="bodega" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium">Quedaron en bodega</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Regresan al stock normal.
                    </p>
                  </div>
                </label>
                <label
                  htmlFor="dest-perdidos"
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    faltanteDestino === "perdidos" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem id="dest-perdidos" value="perdidos" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium">Perdidos en el camino</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Merma. No regresa al stock.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          )}

          {/* 4. Conditional: damaged condition */}
          {selectedItem && tipo === "devolucion_danada" && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Condición de los bultos dañados
              </Label>
              <Select
                value={damagedCondition}
                onValueChange={(v) => setDamagedCondition(v as DamagedCondition)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leve">Leve — bolsa rota pero producto íntegro</SelectItem>
                  <SelectItem value="moderado">Moderado — daño visible, algunos con merma</SelectItem>
                  <SelectItem value="severo">Severo — la mayoría con producto afectado</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se creará un lote en Dañados con estado "pendiente de precio". Podrás asignar precio después.
              </p>
            </div>
          )}

          {/* 5. Quantity */}
          {selectedItem && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Cantidad (bultos)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={maxAdjustable}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(maxAdjustable, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Crédito al cliente
                </Label>
                <div className="h-10 flex items-center px-3 rounded-md border border-border bg-muted/40 text-sm font-semibold tabular-nums">
                  {fmtMXN(creditAmount)}
                </div>
              </div>
            </div>
          )}

          {/* 6. Notes */}
          {selectedItem && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Notas (opcional)
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalles adicionales sobre el ajuste..."
                rows={2}
              />
            </div>
          )}

          {/* Summary box */}
          {selectedItem && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total original del pedido no cambia</span>
              </div>
              <div className="flex justify-between font-semibold text-primary">
                <span>Descuento al total pagado</span>
                <span className="tabular-nums">−{fmtMXN(creditAmount)}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={!canSubmit}
            >
              {mutation.isPending
                ? (isEditing ? "Actualizando..." : "Registrando...")
                : (isEditing ? "Actualizar ajuste" : "Registrar ajuste")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
