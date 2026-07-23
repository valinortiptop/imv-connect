// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import SalesPage from "@/components/sales-page";

export const Route = createFileRoute("/admin/sales")({
  head: () => ({
    meta: [
      { title: "Ventas | IMV Catálogo Digital" },
      { name: "description", content: "Analiza ventas, utilidad, clientes, productos, pedidos y marcas de IMV." },
      { property: "og:title", content: "Ventas | IMV Catálogo Digital" },
      { property: "og:description", content: "Analiza ventas, utilidad, clientes, productos, pedidos y marcas de IMV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPage,
});
