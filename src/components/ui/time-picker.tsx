/**
 * TimePicker — iOS-alarm-style scrolling wheels.
 *
 * Two vertical wheels (hour : minute) inside a popover. The center
 * row is always the "selected" one; users scroll/drag to bring the
 * desired number into the center, or tap any visible row to snap
 * it. Items above/below fade out via a CSS mask so it reads like
 * the classic iOS alarm dial.
 *
 * Value protocol: standard "HH:MM" 24-hour ("" when unset). Compatible
 * with Postgres `time without time zone` columns. Seconds are not
 * exposed.
 *
 * Implementation notes:
 *   - Each wheel is an overflow-y-auto container with CSS
 *     `scroll-snap-type: y mandatory` + `scroll-snap-align: center`
 *     on each item, so native momentum scrolling on touch and mouse
 *     wheel both snap cleanly to the nearest item.
 *   - The "selected index" is derived from scrollTop debounced
 *     ~120ms after scrolling stops, so we don't fire onChange on
 *     every intermediate pixel.
 *   - Top + bottom padding equal to (visible-h - item-h)/2 lets the
 *     first/last items reach the center band.
 *   - The middle highlight is an absolutely-positioned overlay so
 *     it stays fixed while items scroll through it.
 *   - Out-of-range incoming values (e.g. legacy 11:13 minute) keep
 *     the literal label on the trigger; scrolling the wheel will
 *     snap to a quarter-hour and overwrite.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  /** "HH:MM" 24-hour. Empty string when unset. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest hour offered in the picker (inclusive). Default 6. */
  fromHour?: number;
  /** Latest hour offered in the picker (inclusive). Default 22. */
  toHour?: number;
  /** Step in minutes — must divide 60 evenly. Default 15. */
  minuteStep?: number;
  /** Visual error styling (red border on trigger). */
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

/* Wheel geometry. Five-row view, item height 40 → 200px total. */
const ITEM_H = 40;
const VISIBLE_ROWS = 5;
const PICKER_H = ITEM_H * VISIBLE_ROWS;   // 200
const PAD = (PICKER_H - ITEM_H) / 2;       // 80

function WheelColumn({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Sync the scroll position to the externally-controlled value.
  // Smooth scroll only after the initial mount so opening the popover
  // jumps straight to the current value with no lerp animation.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!containerRef.current) return;
    const idx = items.indexOf(value);
    if (idx < 0) return;
    containerRef.current.scrollTo({
      top: idx * ITEM_H,
      behavior: mountedRef.current ? "smooth" : "auto",
    });
    mountedRef.current = true;
  }, [value, items]);

  // Debounced scroll-end → derive the centered index and emit.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScroll = () => {
    if (!containerRef.current) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (!containerRef.current) return;
      const idx = Math.round(containerRef.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      const next = items[clamped];
      if (next && next !== valueRef.current) onChange(next);
    }, 120);
  };

  const pickItem = (item: string) => {
    const idx = items.indexOf(item);
    if (idx < 0 || !containerRef.current) return;
    containerRef.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
    // Emit immediately on tap (the scroll handler would also fire,
    // but the explicit click should not require waiting for settle).
    if (item !== valueRef.current) onChange(item);
  };

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{ width: 88, height: PICKER_H }}
    >
      {/* Center selection band */}
      <div
        className="absolute left-0 right-0 pointer-events-none border-y border-primary/40 bg-primary/[0.07]"
        style={{ top: PAD, height: ITEM_H }}
        aria-hidden
      />

      {/* Scrollable list — fades at top + bottom via CSS mask so off-
          center items dim out the iOS way. */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{
          paddingTop: PAD,
          paddingBottom: PAD,
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 28%, black 72%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 28%, black 72%, transparent 100%)",
          // smooth touch-scroll on iOS
          WebkitOverflowScrolling: "touch",
        }}
      >
        {items.map((item) => {
          const isSelected = item === value;
          return (
            <button
              key={item}
              type="button"
              tabIndex={isSelected ? 0 : -1}
              onClick={() => pickItem(item)}
              className={cn(
                "block w-full text-center font-mono tabular-nums transition-all duration-150",
                isSelected
                  ? "text-2xl font-bold text-foreground"
                  : "text-lg font-medium text-muted-foreground/60 hover:text-muted-foreground",
              )}
              style={{
                height: ITEM_H,
                lineHeight: `${ITEM_H}px`,
                scrollSnapAlign: "center",
                scrollSnapStop: "always",
              }}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TimePicker({
  value,
  onChange,
  fromHour = 6,
  toHour = 22,
  minuteStep = 15,
  invalid,
  disabled,
  className,
  placeholder = "HH:MM",
}: TimePickerProps) {
  const [open, setOpen] = useState(false);

  const hours = useMemo(
    () => Array.from({ length: toHour - fromHour + 1 }, (_, i) => String(i + fromHour).padStart(2, "0")),
    [fromHour, toHour],
  );
  const minutes = useMemo(
    () => Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => String(i * minuteStep).padStart(2, "0")),
    [minuteStep],
  );

  // Parse the controlled value, falling back to sensible defaults
  // when the wheels open with nothing picked yet — center on 09:00
  // (warehouse-typical opening time).
  const raw = (value ?? "").slice(0, 5);
  const [rawH, rawM] = raw.includes(":") ? raw.split(":") : ["", ""];
  const fallbackH = hours.includes("09") ? "09" : hours[Math.floor(hours.length / 2)];
  const fallbackM = minutes[0];
  const currentH = hours.includes(rawH) ? rawH : fallbackH;
  const currentM = minutes.includes(rawM) ? rawM : fallbackM;

  const setHour = (h: string) => onChange(`${h}:${currentM}`);
  const setMinute = (m: string) => onChange(`${currentH}:${m}`);

  const displayValue = raw && raw.includes(":") ? raw : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 px-3 justify-start gap-2 font-mono tabular-nums text-sm w-full",
            !displayValue && "text-muted-foreground font-normal",
            invalid && "border-red-500 focus:ring-red-500",
            className,
          )}
        >
          <Clock className="h-4 w-4 shrink-0" />
          {displayValue || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-auto p-0 overflow-hidden"
      >
        {/* Header — shows the current selection big so the user gets
            instant feedback as they scroll the wheels. */}
        <div className="px-4 py-2 border-b text-center bg-muted/30">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Hora seleccionada
          </div>
          <div className="text-2xl font-mono font-bold tabular-nums">
            {currentH}<span className="text-foreground/40">:</span>{currentM}
          </div>
        </div>

        {/* Wheels */}
        <div className="flex items-center justify-center gap-1 py-2 px-3">
          <WheelColumn items={hours} value={currentH} onChange={setHour} />
          <span className="text-3xl font-bold text-foreground/30 select-none px-1" aria-hidden>
            :
          </span>
          <WheelColumn items={minutes} value={currentM} onChange={setMinute} />
        </div>

        {/* Footer */}
        <div className="border-t px-3 py-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs font-semibold text-primary hover:text-primary/80 transition"
          >
            Listo
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
