/**
 * CurrencyInput — formatted MXN input with thousand separators.
 *
 * Stores raw decimal string outside (parent owns it), so saving is
 * just parseFloat(value). The input shows commas (es-MX format) while
 * not focused, switches to raw decimal while focused to keep typing
 * easy. Strips commas / $ / non-numeric chars on input so paste also
 * works.
 *
 *   value="382894"           → displays "$ 382,894.00" (blurred)
 *   value="382894.50"        → "$ 382,894.50"
 *   on focus                 → shows "382894.50" for easy editing
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Height match; defaults to h-9 (used in cards) but the inline
   *  variant in the items table can pass h-8. */
  inputClassName?: string;
  disabled?: boolean;
}

const fmt = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function CurrencyInput({
  value, onChange, placeholder, className, inputClassName, disabled,
}: Props) {
  const [focused, setFocused] = useState(false);

  // Format on blur — strip the formatting on focus so users can edit
  // the raw number without fighting commas. Empty string stays empty.
  const numericValue = value === "" ? null : parseFloat(value);
  const displayValue =
    focused
      ? value
      : numericValue == null || isNaN(numericValue)
        ? value
        : fmt.format(numericValue);

  return (
    <div className={cn("relative", className)}>
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">$</span>
      <Input
        type="text"
        inputMode="decimal"
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          // Keep only digits + one decimal point. Strip commas / $ / spaces.
          const cleaned = e.target.value.replace(/[^\d.]/g, "");
          const parts = cleaned.split(".");
          const safe = parts.length > 2
            ? parts[0] + "." + parts.slice(1).join("")
            : cleaned;
          onChange(safe);
        }}
        className={cn("pl-6 text-right tabular-nums", inputClassName)}
      />
    </div>
  );
}
