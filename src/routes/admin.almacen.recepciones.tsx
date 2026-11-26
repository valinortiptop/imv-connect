import { createFileRoute, redirect } from "@tanstack/react-router";

// Página unificada en /admin/entradas; se conserva la dirección anterior.
export const Route = createFileRoute("/admin/almacen/recepciones")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/entradas", replace: true });
  },
});
