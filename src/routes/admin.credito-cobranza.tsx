import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { CreditCard, Users, Phone, HandCoins, ShieldCheck, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/credito-cobranza")({
  head: () => ({ meta: [{ title: "Crédito y Cobranza" }] }),
  component: CreditoCobranzaLayout,
});

const TABS: Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { to: "/admin/credito-cobranza/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/credito-cobranza/cartera", label: "Cartera", icon: Users },
  { to: "/admin/credito-cobranza/gestiones", label: "Gestiones", icon: Phone },
  { to: "/admin/credito-cobranza/promesas", label: "Promesas de pago", icon: HandCoins },
  { to: "/admin/credito-cobranza/autorizaciones", label: "Autorizaciones", icon: ShieldCheck },
];


function CreditoCobranzaLayout() {
  const { pathname } = useLocation();
  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" /> Crédito y Cobranza
        </h1>
        <p className="text-sm text-muted-foreground">
          Centro inteligente de gestión financiera y riesgo crediticio.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </section>
  );
}
