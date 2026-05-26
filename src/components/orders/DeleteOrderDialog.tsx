// @ts-nocheck
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";

interface DeleteOrderDialogProps {
  orderId: string | null;
  orderNumber: string | null;
  clientName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteOrderDialog({
  orderId,
  orderNumber,
  clientName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteOrderDialogProps) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!orderId) return;
    setDeleting(true);
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    setDeleting(false);

    if (error) {
      toast.error("Failed to delete order", { description: error.message });
      return;
    }

    toast.success(`Order #${orderNumber ?? ""} deleted`);
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    onDeleted();
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Order #{orderNumber ?? "—"}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span>
              Are you sure you want to delete this order
              {clientName ? ` for ${clientName}` : ""}? This will also remove all associated line items.
            </span>
            <span className="block text-destructive font-medium">This action cannot be easily undone.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Deleting…" : "Delete Order"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
