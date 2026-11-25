import { useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Vista 360 compartida: panel lateral con botón para expandir a pantalla completa. */
export function Panel360({
  open,
  onOpenChange,
  title,
  description,
  actions,
  children,
  defaultExpanded = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-full overflow-y-auto transition-[max-width] duration-300 motion-reduce:transition-none",
          expanded ? "sm:max-w-none" : "sm:max-w-2xl",
        )}
      >
        <SheetHeader className="pr-20">
          <SheetTitle className="text-base">{title}</SheetTitle>
          {description && <SheetDescription className="text-xs">{description}</SheetDescription>}
        </SheetHeader>
        <div className="absolute right-11 top-3 flex items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-sm p-1 opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={expanded ? "Reducir vista" : "Expandir vista"}
            title={expanded ? "Reducir" : "Expandir"}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
        <div className={cn("mt-4", expanded && "mx-auto max-w-6xl")}>{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Hace clicable una fila sin interferir con botones/enlaces internos. */
export function rowClickProps(onOpen: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    className: "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/60",
    onClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
      onOpen();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
    },
  };
}
