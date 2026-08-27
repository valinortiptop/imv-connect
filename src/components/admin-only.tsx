import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useRoles } from "@/lib/use-roles";
import { Button } from "@/components/ui/button";

/** Wraps admin-only settings pages; non-admins get their personal account page instead. */
export default function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, isLoading } = useRoles();

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Verificando permisos…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Sección solo para administradores</h1>
        <p className="text-sm text-muted-foreground">
          La gestión de usuarios, roles y contraseñas está reservada a administradores.
          Puedes revisar y editar tus propios datos en tu cuenta.
        </p>
        <Button asChild>
          <Link to="/admin/cuenta">Ir a mi cuenta</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
