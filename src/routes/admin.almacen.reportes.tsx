import { createFileRoute } from "@tanstack/react-router";
import ReportesAlmacenPage from "@/components/almacen/ReportesAlmacenPage";

export const Route = createFileRoute("/admin/almacen/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes de almacén · IMV" },
      {
        name: "description",
        content: "Rotación, corta caducidad y trazabilidad de compra y venta con exportación a PDF.",
      },
      { property: "og:title", content: "Reportes de almacén · IMV" },
      { property: "og:description", content: "Rotación, caducidades y trazabilidad completa de almacén." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportesAlmacenPage,
});
