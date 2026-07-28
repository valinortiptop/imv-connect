import { createFileRoute } from "@tanstack/react-router";
import TraspasosPage from "@/components/almacen/TraspasosPage";

export const Route = createFileRoute("/admin/almacen/traspasos")({
  head: () => ({
    meta: [
      { title: "Traspasos entre almacenes · IMV" },
      { name: "description", content: "Movimientos de material entre almacenes por clave y lote, con documento PDF." },
      { property: "og:title", content: "Traspasos entre almacenes · IMV" },
      { property: "og:description", content: "Movimientos entre almacenes por clave y lote, con documento PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TraspasosPage,
});
