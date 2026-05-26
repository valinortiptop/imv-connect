import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseLocalDate, calendarDateToString } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export interface ChronoBarProps {
  /** YYYY-MM-DD string, or "" for no lower bound */
  dateFrom: string;
  /** YYYY-MM-DD string, or "" for no upper bound */
  dateTo: string;
  onChange: (from: string, to: string) => void;
  /**
   * The value for dateFrom that represents "all time" — used to highlight the
   * "Todo" pill and to reset. Default: "".
   */
  allTimeFrom?: string;
  /** Compact sizing for header bars. Default: false */
  compact?: boolean;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmtYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const firstOfMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
};

/**
 * Standard chrono bar: [Todo] [<] [Mon YY] [>]  Desde [date]  Hasta [date]
 *
 * The month pill is an anchor derived from `dateFrom`. Arrows shift by ±1 month
 * and set the full month range. "Todo" clears both bounds (or sets dateFrom to
 * `allTimeFrom` if provided).
 */
export function ChronoBar({
  dateFrom,
  dateTo,
  onChange,
  allTimeFrom = "",
  compact = false,
  className,
}: ChronoBarProps) {
  const btnH = compact ? "h-7 sm:h-8" : "h-8";
  const btnText = compact ? "text-[11px] sm:text-xs" : "text-xs";
  const labelText = compact ? "text-[10px] sm:text-xs" : "text-xs";

  const monthAnchor = useMemo(() => {
    const hasFrom = !!dateFrom && dateFrom !== allTimeFrom;
    const base = hasFrom ? parseLocalDate(dateFrom) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }, [dateFrom, allTimeFrom]);

  const isCurrentMonth = dateFrom === firstOfMonth() && !dateTo;
  const isAllTime = (dateFrom === allTimeFrom || !dateFrom) && !dateTo;

  const setAllTime = () => onChange(allTimeFrom, "");
  const setThisMonth = () => onChange(firstOfMonth(), "");
  const shiftMonth = (delta: number) => {
    const d = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + delta, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    onChange(fmtYMD(d), fmtYMD(last));
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2 sm:gap-3", className)}>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={isAllTime ? "default" : "outline"}
          onClick={setAllTime}
          className={cn(btnText, btnH)}
        >
          Todo
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => shiftMonth(-1)}
          aria-label="Mes anterior"
          className={cn("px-1.5", btnH)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={isCurrentMonth ? "default" : "outline"}
          onClick={setThisMonth}
          className={cn(btnText, "capitalize min-w-[72px]", btnH)}
        >
          {format(monthAnchor, "MMM yy", { locale: es })}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => shiftMonth(1)}
          aria-label="Mes siguiente"
          className={cn("px-1.5", btnH)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <span className={cn("text-muted-foreground", labelText)}>Desde</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("gap-1 font-normal px-2 sm:px-3", btnH, labelText)}
            >
              <CalendarIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {dateFrom && dateFrom !== allTimeFrom ? format(parseLocalDate(dateFrom), "dd/MM/yy") : "\u2014"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={es}
              selected={dateFrom && dateFrom !== allTimeFrom ? parseLocalDate(dateFrom) : undefined}
              onSelect={(d) => { if (d) onChange(calendarDateToString(d), dateTo); }}
            />
          </PopoverContent>
        </Popover>
        <span className={cn("text-muted-foreground", labelText)}>Hasta</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("gap-1 font-normal px-2 sm:px-3", btnH, labelText)}
            >
              <CalendarIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {dateTo ? format(parseLocalDate(dateTo), "dd/MM/yy") : "\u2014"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={es}
              selected={dateTo ? parseLocalDate(dateTo) : undefined}
              onSelect={(d) => { if (d) onChange(dateFrom, calendarDateToString(d)); }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
