import { Link } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  FileText,
  Banknote,
  RotateCcw,
  UserPlus,
  CalendarDays,
  ShoppingBag,
  Boxes,
  ClipboardList,
  Target,
  CalendarCheck2,
  Sparkles,
  Trophy,
  Swords,
  FlaskConical,
  MoreHorizontal,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: any };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "Ventas",
    items: [
      { to: "/rep/cotizaciones", label: "Cotizaciones", icon: FileText },
      { to: "/rep/cobranza", label: "Cobranza", icon: Banknote },
      { to: "/rep/devoluciones", label: "Devoluciones", icon: RotateCcw },
      { to: "/rep/prospectos", label: "Prospectos", icon: UserPlus },
    ],
  },
  {
    label: "Operación",
    items: [
      { to: "/rep/calendario", label: "Calendario", icon: CalendarDays },
      { to: "/rep/catalogo", label: "Catálogo", icon: ShoppingBag },
      { to: "/rep/inventario", label: "Inventario", icon: Boxes },
      { to: "/rep/plan", label: "Plan semanal", icon: ClipboardList },
      { to: "/rep/cierre", label: "Cierre de día", icon: CalendarCheck2 },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      { to: "/rep/laboratorios", label: "Laboratorios", icon: FlaskConical },
      { to: "/rep/competencia", label: "Competencia", icon: Swords },
      { to: "/rep/metas", label: "Metas", icon: Target },
      { to: "/rep/coach", label: "Coach IA", icon: Sparkles },
      { to: "/rep/supervisor", label: "Supervisor", icon: Trophy },
    ],
  },
];

export default function MoreSheet({ active }: { active?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>Más</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="h-[85dvh] rounded-t-2xl p-0"
      >
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle>Todas las secciones</SheetTitle>
        </SheetHeader>
        <div
          className="overflow-y-auto px-4 py-4"
          style={{
            maxHeight: "calc(85dvh - 3.5rem)",
            paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
          }}
        >
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-6 last:mb-0">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.label}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((it) => (
                  <Link
                    key={it.to}
                    to={it.to}
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center text-xs transition-colors hover:bg-muted/50 active:bg-muted"
                  >
                    <it.icon className="h-5 w-5 text-primary" />
                    <span className="line-clamp-2 leading-tight">
                      {it.label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
