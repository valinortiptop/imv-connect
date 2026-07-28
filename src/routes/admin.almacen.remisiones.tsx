import { createFileRoute } from "@tanstack/react-router";
import RemisionesPage from "@/components/almacen/RemisionesPage";

export const Route = createFileRoute("/admin/almacen/remisiones")({
  head: () => ({
    meta: [
      { title: "Remisiones de almacén · IMV" },
      { name: "description", content: "Salidas por remisión con selección de lote y ubicación, con documento PDF." },
      { property: "og:title", content: "Remisiones de almacén · IMV" },
      { property: "og:description", content: "Salidas por remisión con lote y ubicación, con documento PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RemisionesPage,
});
