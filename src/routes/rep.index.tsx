import { createFileRoute } from "@tanstack/react-router";
import RepDashboard from "@/components/rep/RepDashboard";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/")({
  component: () => (
    <div className="space-y-5">
      <RepDashboard />
      <AIPageInsights module="rep-home" />
    </div>
  ),
});
