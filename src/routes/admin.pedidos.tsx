import { createFileRoute } from "@tanstack/react-router";
import Orders from "@/components/orders-page";

export const Route = createFileRoute("/admin/pedidos")({
  component: () => <Orders hideCotizaciones />,
});
