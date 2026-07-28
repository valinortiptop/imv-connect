import { createFileRoute } from "@tanstack/react-router";
import CardexPage from "@/components/almacen/CardexPage";

export const Route = createFileRoute("/admin/almacen/cardex")({
  head: () => ({
    meta: [
      { title: "Cardex de material · IMV" },
      {
        name: "description",
        content:
          "Trazabilidad completa por artículo y lote: entradas, salidas, traspasos, devoluciones y saldo corrido.",
      },
      { property: "og:title", content: "Cardex de material · IMV" },
      { property: "og:description", content: "Movimientos y saldo corrido por artículo y lote en almacén." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CardexPage,
});
