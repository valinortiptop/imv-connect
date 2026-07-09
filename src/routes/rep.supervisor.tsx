import { createFileRoute } from "@tanstack/react-router";
import SupervisorDashboard from "@/components/rep/SupervisorDashboard";

export const Route = createFileRoute("/rep/supervisor")({
  head: () => ({ meta: [{ title: "Supervisor · Panel Rep" }] }),
  component: SupervisorDashboard,
});
