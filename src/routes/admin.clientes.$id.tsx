import { createFileRoute } from "@tanstack/react-router";
import ClientDetail from "@/components/client-detail-page";

export const Route = createFileRoute("/admin/clientes/$id")({
  component: ClientDetail,
});
