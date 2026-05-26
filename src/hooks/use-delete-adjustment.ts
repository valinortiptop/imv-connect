// @ts-nocheck
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Shared mutation for deleting an order_adjustment. Reverses any stock
 * side-effects, removes the associated damaged_batch when untouched, and
 * then deletes the adjustment row. Used by OrderDetailSheet + Devoluciones.
 */
export function useDeleteAdjustment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (adj: any) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      // 1. Reverse stock if this ajuste originally added stock
      const addedStock =
        adj.tipo === "devolucion_buena" ||
        (adj.tipo === "faltante" && adj.faltante_destino === "bodega");

      if (addedStock) {
        const { data: prod, error: pErr } = await supabase
          .from("products")
          .select("stock_adjustment")
          .eq("id", adj.product_id)
          .single();
        if (pErr) throw new Error(`Producto: ${pErr.message}`);

        const currentAdj = (prod as any)?.stock_adjustment ?? 0;
        const newAdj = Math.max(0, currentAdj - (adj.quantity ?? 0));
        const { error: upErr } = await supabase
          .from("products")
          .update({ stock_adjustment: newAdj })
          .eq("id", adj.product_id);
        if (upErr) throw new Error(`Stock: ${upErr.message}`);

        const { error: logErr } = await supabase
          .from("stock_adjustments")
          .insert({
            product_id: adj.product_id,
            quantity: -(adj.quantity ?? 0),
            reason: `Reverso de ajuste (${adj.tipo})`,
            created_by: userId,
          });
        if (logErr) throw new Error(`Log: ${logErr.message}`);
      }

      // 2. If this ajuste created a damaged_batch, delete it (only if untouched)
      if (adj.damaged_batch_id) {
        const { data: batch } = await (supabase as any)
          .from("damaged_batches")
          .select("id, original_quantity, remaining_quantity, status")
          .eq("id", adj.damaged_batch_id)
          .maybeSingle();
        if (
          batch &&
          batch.status === "pendiente_preciar" &&
          batch.remaining_quantity === batch.original_quantity
        ) {
          await (supabase as any).from("damaged_batches").delete().eq("id", adj.damaged_batch_id);
        }
      }

      // 3. Delete the adjustment
      const { error: delErr } = await (supabase as any)
        .from("order_adjustments")
        .delete()
        .eq("id", adj.id);
      if (delErr) throw new Error(`Ajuste: ${delErr.message}`);
    },
    onSuccess: () => {
      toast({ title: "Ajuste eliminado", description: "El pedido y el inventario se actualizaron" });
      queryClient.invalidateQueries({ queryKey: ["order-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["order-adjustments-all"] });
      queryClient.invalidateQueries({ queryKey: ["damaged-batches"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: any) => {
      toast({ title: "Error al eliminar", description: err.message, variant: "destructive" });
    },
  });
}
