import { createFileRoute } from "@tanstack/react-router";
import Clients from "@/components/clients-page";

export const Route = createFileRoute("/admin/clientes/")({
  component: Clients,
});
