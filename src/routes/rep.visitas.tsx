import { createFileRoute } from "@tanstack/react-router";
import VisitsList from "@/components/rep/VisitsList";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/visitas")({
  component: () => (
    <>
      <AIPageInsights module="rep-visitas" />
      <VisitsList />
    </>
  ),
});
