/**
 * ProductThumb — single source of truth for product thumbnails across
 * the admin app. Pass `src` (the product's image_url, may be null) and
 * pick a size. Falls back to a Package icon on a muted square so the
 * row never collapses when an image is missing.
 *
 * Why a shared component: thumbnails were getting added one-off in
 * dozens of places with inconsistent sizing, padding, and fallbacks.
 * This keeps every product line, dropdown, and table row visually
 * aligned with no more than `<ProductThumb src={p.image_url} />`.
 */
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

const ICON_CLASS: Record<Size, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

interface Props {
  src: string | null | undefined;
  size?: Size;
  alt?: string;
  className?: string;
}

export function ProductThumb({ src, size = "sm", alt = "", className }: Props) {
  const sizeClass = SIZE_CLASS[size];
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn(
          sizeClass,
          "rounded object-contain bg-white shrink-0 border border-border/40",
          className,
        )}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={cn(
        sizeClass,
        "rounded bg-muted shrink-0 grid place-items-center text-muted-foreground/50 border border-border/40",
        className,
      )}
      aria-hidden="true"
    >
      <Package className={ICON_CLASS[size]} />
    </div>
  );
}
