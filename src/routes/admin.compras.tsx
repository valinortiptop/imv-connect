import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/compras")({
  component: ComprasLayout,
});

const TABS = [
  { to: "/admin/compras", label: "Dashboard", exact: true },
  { to: "/admin/compras/planeacion", label: "Planeación" },
  { to: "/admin/compras/ordenes", label: "Órdenes" },
  { to: "/admin/compras/proveedores", label: "Proveedores" },
  { to: "/admin/compras/caducidades", label: "Caducidades" },
  { to: "/admin/compras/costos", label: "Costos" },
  { to: "/admin/compras/rotacion", label: "Rotación" },
] as const;

function ComprasLayout() {
  const { pathname } = useLocation();
  const isDetail = /^\/admin\/compras\/[0-9a-f-]{20,}$/i.test(pathname);

  return (
    <section className="space-y-4">
      {!isDetail && (
        <>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Compras</h1>
            <p className="text-sm text-muted-foreground">
              Planeación, órdenes, proveedores, caducidades y costos.
            </p>
          </div>
          <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border pb-px">
            {TABS.map((t) => {
              const active = t.exact
                ? pathname === t.to
                : pathname === t.to || pathname.startsWith(t.to + "/");
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "shrink-0 rounded-t-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-b-2 border-primary bg-muted font-medium text-foreground"
                      : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}
      <Outlet />
    </section>
  );
}
