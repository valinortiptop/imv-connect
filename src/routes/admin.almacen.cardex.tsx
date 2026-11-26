import { createFileRoute, redirect } from "@tanstack/react-router";

// Unificado en /admin/kardex (vista "Por almacén y lote").
export const Route = createFileRoute("/admin/almacen/cardex")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/kardex", replace: true });
  },
});
