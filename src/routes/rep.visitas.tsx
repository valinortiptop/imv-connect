import { createFileRoute } from "@tanstack/react-router";
import VisitsList from "@/components/rep/VisitsList";
import TodayPlan from "@/components/rep/TodayPlan";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/visitas")({
  component: () => (
    <div className="space-y-6">
      <AIPageInsights module="rep-visitas" />
      <TodayPlan />
      <VisitsList />
    </div>
  ),
});

