// @ts-nocheck
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductThumb } from "./product-thumb";

interface ProductDropdownOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  isPromo?: boolean;
  /** Product image URL (nullable). When provided, a thumbnail renders
   *  next to the label both in the menu and on the trigger when this
   *  option is the selected value. */
  imageUrl?: string | null;
}

interface ProductDropdownProps {
  options: ProductDropdownOption[];
  valueId: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ProductDropdown({
  options,
  valueId,
  onChange,
  placeholder = "Selecciona un producto",
  className,
  disabled = false,
}: ProductDropdownProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const selected = options.find((o) => o.id === valueId);

  const updatePos = useCallback(() => {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  const scheduleUpdatePos = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updatePos();
    });
  }, [updatePos]);

  useEffect(() => {
    if (!open) return;
    updatePos();

    const onScroll = () => scheduleUpdatePos();
    const onResize = () => scheduleUpdatePos();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKey);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, scheduleUpdatePos, updatePos]);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={cn("flex items-center gap-2 min-w-0 flex-1", selected ? "" : "text-muted-foreground")}>
          {selected && <ProductThumb src={selected.imageUrl ?? null} size="xs" />}
          <span className="truncate text-left">{selected ? selected.label : placeholder}</span>
          {selected?.isPromo && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">Promo</span>
          )}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </motion.div>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
              className="z-[60] overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
            >
              <div className="max-h-[320px] overflow-y-auto overscroll-contain p-1">
                {options.map((opt, i) => {
                  const isSelected = opt.id === valueId;
                  return (
                    <motion.div
                      key={opt.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <button
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => {
                          if (!opt.disabled) {
                            onChange(opt.id);
                            setOpen(false);
                          }
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                          opt.disabled
                            ? "cursor-not-allowed text-muted-foreground"
                            : "cursor-pointer hover:bg-muted text-foreground",
                        )}
                      >
                        <Check
                          className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
                        />
                        <ProductThumb src={opt.imageUrl ?? null} size="xs" />
                        <span className="flex-1 text-left flex items-center gap-2 min-w-0">
                          <span className="truncate">{opt.label}</span>
                          {opt.isPromo && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">Promo</span>
                          )}
                          {opt.disabled && opt.disabledReason && (
                            <span className="ml-2 text-xs text-destructive shrink-0">{opt.disabledReason}</span>
                          )}
                        </span>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
