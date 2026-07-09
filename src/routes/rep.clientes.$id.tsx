import { createFileRoute } from "@tanstack/react-router";
import ClientDetail360 from "@/components/rep/ClientDetail360";

function Page() {
  const { id } = Route.useParams();
  return <ClientDetail360 clienteId={id} />;
}

export const Route = createFileRoute("/rep/clientes/$id")({ component: Page });
