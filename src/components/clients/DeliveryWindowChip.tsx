/**
 * DeliveryWindowChip
 *
 * Compact pill that shows when a client accepts deliveries. Used in
 * the directorio list, order tables, maniobra plan, surtir dialog,
 * and the live order header. One source of truth so the look matches
 * everywhere.
 *
 * Three states (always same dimensions so list rows never shift):
 *   • Window captured → "🕐 11:00 – 18:00" gray pill, mono nums
 *   • Not captured    → "🕐 Sin horario"   muted dashed pill
 *   • Pickup order    → returns null (caller decides if it wants
 *                       to render nothing or a "Pickup" chip)
 *
 * For pickup orders the chip is suppressed entirely — the client
 * comes to us, no inbound delivery window applies.
 */

import { Clock, Hand } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  from?: string | null;        // "HH:MM" or "HH:MM:SS"
  until?: string | null;       // "HH:MM" or "HH:MM:SS"
  notes?: string | null;       // free-text, shown via tooltip
  /** When true, the chip renders nothing — pickup orders don't have
   *  a delivery window since the client comes to us. */
  isPickup?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** Trim seconds off "HH:MM:SS" → "HH:MM". Idempotent for "HH:MM". */
function hhmm(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s));
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function DeliveryWindowChip({
  from, until, notes, isPickup, size = "sm", className,
}: Props) {
  if (isPickup) return null;

  const a = hhmm(from);
  const b = hhmm(until);
  const hasWindow = a && b;
  const tooltip = hasWindow
    ? `Recibe entre ${a} y ${b}${notes ? ` · ${notes}` : ""}`
    : "Horario de recepción no capturado — el cliente parece estar abierto todo el día. Captura el horario en su perfil.";

  const dims = size === "md"
    ? "text-xs py-1 px-2"
    : "text-[10px] py-0.5 px-1.5";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";

  if (!hasWindow) {
    return (
      <Badge
        variant="outline"
        title={tooltip}
        className={cn(
          "gap-1 font-normal italic border-dashed",
          "bg-muted/30 text-muted-foreground border-muted-foreground/40",
          dims,
          className,
        )}
      >
        <Clock className={iconSize} />
        Sin horario
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      title={tooltip}
      className={cn(
        "gap-1 font-semibold tabular-nums",
        "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/40",
        dims,
        className,
      )}
    >
      <Clock className={iconSize} />
      <span>{a}</span>
      <span className="opacity-50">–</span>
      <span>{b}</span>
      {notes && <span className="opacity-60 ml-0.5" aria-hidden>·</span>}
    </Badge>
  );
}

/** Compact chip used to flag the order as pickup (and therefore not
 *  needing a delivery window). Caller may use it alongside the
 *  DeliveryWindowChip's `isPickup` prop returning null. */
export function PickupChip({ size = "sm", className }: { size?: "sm" | "md"; className?: string }) {
  const dims = size === "md"
    ? "text-xs py-1 px-2"
    : "text-[10px] py-0.5 px-1.5";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-semibold",
        "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40",
        dims,
        className,
      )}
    >
      <Hand className={iconSize} />
      Pickup
    </Badge>
  );
}
