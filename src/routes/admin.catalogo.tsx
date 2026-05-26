import { createFileRoute } from "@tanstack/react-router";
import CatalogoPage from "@/components/catalogo-page";

export const Route = createFileRoute("/admin/catalogo")({
  component: CatalogoPage,
});
