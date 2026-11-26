import { createFileRoute } from "@tanstack/react-router";
import RecepcionesPage from "@/components/almacen/RecepcionesPage";

export const Route = createFileRoute("/admin/entradas")({
  head: () => ({
    meta: [
      { title: "Entradas de mercancía · IMV" },
      { name: "description", content: "Recepciones de órdenes de compra con lote, caducidad, almacén destino y documento PDF." },
      { property: "og:title", content: "Entradas de mercancía · IMV" },
      { property: "og:description", content: "Recepciones por OC con lote y caducidad." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecepcionesPage,
});
