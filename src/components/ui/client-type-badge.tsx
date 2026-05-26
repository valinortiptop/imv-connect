// @ts-nocheck
/**
 * ClientTypeBadge — small pill that distinguishes wholesale (Mayoreo)
 * from retail (Menudeo) clients. Used in the clients list, the
 * facturación list, the order-creation client picker, and the client
 * detail header so the team always knows which kind of customer
 * they're looking at.
 *
 * Layout note: the wrapper is a fixed-width inline-flex so dropping
 * the badge into a row never pushes other columns around when the
 * label length differs (Mayoreo has 7 chars, Menudeo has 7 too, but
 * future labels could differ — fixed slot keeps everything aligned).
 */
import { cn } from "@/lib/utils";

export type ClientType = "mayoreo" | "menudeo";

interface Props {
  type: ClientType;
  size?: "sm" | "md";
  /** When true, reserve the badge's slot but render nothing — useful
   *  for keeping rows aligned in single-type views. */
  invisible?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  sm: "px-1.5 py-0.5 text-[10px] w-[60px]",
  md: "px-2 py-0.5 text-xs w-[72px]",
};

export function ClientTypeBadge({ type, size = "sm", invisible = false, className }: Props) {
  if (invisible) {
    // Reserve the slot so adjacent content stays in the same column.
    return <span className={cn("inline-block", SIZE_CLASS[size], "invisible", className)} aria-hidden />;
  }
  const isMayoreo = type === "mayoreo";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold border tabular-nums shrink-0",
        SIZE_CLASS[size],
        isMayoreo
          ? "bg-blue-500/15 text-blue-600 border-blue-500/40 dark:text-blue-300"
          : "bg-purple-500/15 text-purple-600 border-purple-500/40 dark:text-purple-300",
        className,
      )}
    >
      {isMayoreo ? "Mayoreo" : "Menudeo"}
    </span>
  );
}
