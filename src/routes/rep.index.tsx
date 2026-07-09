import { createFileRoute } from "@tanstack/react-router";
import RepDashboard from "@/components/rep/RepDashboard";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/")({
  component: () => (
    <>
      <AIPageInsights module="rep-home" />
      <RepDashboard />
    </>
  ),
});
