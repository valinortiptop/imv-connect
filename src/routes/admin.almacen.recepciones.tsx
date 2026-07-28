import { createFileRoute } from "@tanstack/react-router";
import RecepcionesPage from "@/components/almacen/RecepcionesPage";

export const Route = createFileRoute("/admin/almacen/recepciones")({
  head: () => ({
    meta: [
      { title: "Recepciones de almacén · IMV" },
      { name: "description", content: "Ingresos de mercancía con lote, caducidad y documento PDF por recepción." },
      { property: "og:title", content: "Recepciones de almacén · IMV" },
      { property: "og:description", content: "Ingresos de mercancía con lote, caducidad y documento PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecepcionesPage,
});
