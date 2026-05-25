import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold">
            IMV Admin
          </Link>
          <nav className="flex gap-1 text-sm">
            <NavLink to="/admin/productos">Productos</NavLink>
            <NavLink to="/admin/laboratorios">Laboratorios</NavLink>
            <NavLink to="/admin/clientes">Clientes</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      activeProps={{ className: "rounded-md px-3 py-2 bg-accent text-accent-foreground" }}
    >
      {children}
    </Link>
  );
}
