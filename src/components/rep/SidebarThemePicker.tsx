import { Palette, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const REP_SIDEBAR_THEMES = [
  { id: "claro", label: "Claro" },
  { id: "arena", label: "Arena" },
  { id: "pizarra", label: "Pizarra" },
  { id: "oceano", label: "Océano" },
  { id: "bosque", label: "Bosque" },
  { id: "vino", label: "Vino" },
] as const;

export type RepSidebarTheme = (typeof REP_SIDEBAR_THEMES)[number]["id"];

export function SidebarThemePicker({
  value,
  onChange,
}: {
  value: RepSidebarTheme;
  onChange: (t: RepSidebarTheme) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Color del menú"
          aria-label="Cambiar color del menú"
          className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary"
        >
          <Palette className="h-3 w-3" />
          <span>Tema</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-56 p-3">
        <div className="mb-2 text-xs font-medium">Color del menú</div>
        <div className="grid grid-cols-3 gap-2">
          {REP_SIDEBAR_THEMES.map((t) => {
            const active = value === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
                className="flex flex-col items-center gap-1 rounded-md p-1 text-[11px] text-muted-foreground hover:bg-muted"
                aria-pressed={active}
              >
                <span
                  data-rep-sidebar={t.id === "claro" ? undefined : t.id}
                  className={cn(
                    "relative flex h-9 w-full items-end gap-0.5 overflow-hidden rounded-md border border-border bg-card p-1",
                    active && "ring-2 ring-ring ring-offset-1",
                  )}
                >
                  <span className="h-1.5 w-3 rounded-full bg-primary" />
                  <span className="h-1.5 w-4 rounded-full bg-muted-foreground/50" />
                  {active && (
                    <Check className="absolute right-1 top-1 h-3 w-3 text-primary" />
                  )}
                </span>
                <span className={cn(active && "font-medium text-foreground")}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
