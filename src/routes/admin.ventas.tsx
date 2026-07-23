// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import VentasPage from "@/components/ventas-page";

export const Route = createFileRoute("/admin/ventas")({
  head: () => ({
    meta: [
      { title: "Reporte de ventas | IMV Catálogo Digital" },
      { name: "description", content: "Genera reportes mensuales, PDFs y presentaciones de ventas de IMV." },
      { property: "og:title", content: "Reporte de ventas | IMV Catálogo Digital" },
      { property: "og:description", content: "Genera reportes mensuales, PDFs y presentaciones de ventas de IMV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VentasPage,
});
