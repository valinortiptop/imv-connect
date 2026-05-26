// @ts-nocheck
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type OrderStatus } from "@/types/orders";

const statusStyles: Record<OrderStatus, string> = {
  "Pendiente portal": "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  // Pendiente aprobación = stronger amber/red call-to-attention; admin
  // needs to visually parse "I have to confirm this" at a glance.
  "Pendiente aprobación": "bg-amber-200 text-amber-900 border-amber-400 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/60",
  // Reservado = pre-order against incoming stock. Distinct teal so admin
  // can spot "this can't ship until the entrada lands" at a glance,
  // separate from the amber approval-needed and the blue active-new.
  "Reservado": "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800",
  "Nuevo": "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  "Confirmado": "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
  "En preparacion": "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  "En ruta": "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  "Entregado": "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  "Cancelado": "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
};

export function StatusBadge({ status }: { status: string | null }) {
  const s = status as OrderStatus;
  const styles = statusStyles[s] ?? "bg-muted text-muted-foreground border-border";
  const label = STATUS_LABELS[s] ?? status ?? "Unknown";

  return (
    <Badge variant="outline" className={cn("text-xs font-medium", styles)}>
      {label}
    </Badge>
  );
}
