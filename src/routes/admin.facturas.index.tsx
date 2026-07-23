import { createFileRoute } from "@tanstack/react-router";
import FacturacionPage from "@/components/facturacion-page";

export const Route = createFileRoute("/admin/facturas")({
  component: FacturacionPage,
});
