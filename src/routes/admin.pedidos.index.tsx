import { createFileRoute } from "@tanstack/react-router";
import Orders from "@/components/orders-page";

export const Route = createFileRoute("/admin/pedidos/")({
  head: () => ({
    meta: [
      { title: "Pedidos | IMV Catálogo Digital" },
      { name: "description", content: "Gestiona pedidos, estados, entregas y documentos comerciales de IMV." },
      { property: "og:title", content: "Pedidos | IMV Catálogo Digital" },
      { property: "og:description", content: "Gestiona pedidos, estados, entregas y documentos comerciales de IMV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Orders hideCotizaciones />,
});
