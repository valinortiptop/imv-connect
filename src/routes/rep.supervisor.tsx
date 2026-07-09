import { createFileRoute } from "@tanstack/react-router";
import SupervisorDashboard from "@/components/rep/SupervisorDashboard";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/supervisor")({
  head: () => ({ meta: [{ title: "Supervisor · Panel Rep" }] }),
  component: () => (
    <>
      <AIPageInsights module="rep-supervisor" />
      <SupervisorDashboard />
    </>
  ),
});
