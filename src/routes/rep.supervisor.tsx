import { createFileRoute } from "@tanstack/react-router";
import RepLayout from "@/components/rep/RepLayout";
import SupervisorDashboard from "@/components/rep/SupervisorDashboard";

export const Route = createFileRoute("/rep/supervisor")({
  head: () => ({ meta: [{ title: "Supervisor · Panel Rep" }] }),
  component: () => (
    <RepLayout>
      <SupervisorDashboard />
    </RepLayout>
  ),
});
