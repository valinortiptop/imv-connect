import { createFileRoute, Link, Outlet, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold">
            IMV Admin
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink to="/admin/pedidos">Pedidos</NavLink>
            <NavLink to="/admin/productos">Productos</NavLink>
            <NavLink to="/admin/laboratorios">Laboratorios</NavLink>
            <NavLink to="/admin/clientes">Clientes</NavLink>
            <div className="ml-4 flex items-center gap-3 border-l border-border pl-4">
              <span className="text-xs text-muted-foreground">{email}</span>
              <button
                onClick={signOut}
                className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
              >
                Salir
              </button>
            </div>
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
