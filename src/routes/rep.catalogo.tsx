import { createFileRoute } from "@tanstack/react-router";
import CatalogoPage from "@/components/catalogo-page";

export const Route = createFileRoute("/rep/catalogo")({
  head: () => ({ meta: [{ title: "Catálogo · Panel Rep" }] }),
  component: CatalogoPage,
});
