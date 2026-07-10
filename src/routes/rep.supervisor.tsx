import { createFileRoute } from "@tanstack/react-router";
import SupervisorDashboard from "@/components/rep/SupervisorDashboard";
import SupervisorReport from "@/components/rep/SupervisorReport";
import RepAccessMap from "@/components/rep/RepAccessMap";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/supervisor")({
  head: () => ({ meta: [{ title: "Supervisor · Panel Rep" }] }),
  component: () => (
    <div className="space-y-4">
      <AIPageInsights module="rep-supervisor" />
      <SupervisorDashboard />
      <RepAccessMap />
      <SupervisorReport />
    </div>
  ),
});
