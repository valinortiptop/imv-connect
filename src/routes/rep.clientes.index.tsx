import { createFileRoute } from "@tanstack/react-router";
import ClientList from "@/components/rep/ClientList";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/clientes/")({
  component: () => (
    <>
      <AIPageInsights module="rep-clientes" />
      <ClientList />
    </>
  ),
});
