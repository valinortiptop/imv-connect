import { createFileRoute } from "@tanstack/react-router";
import RepLayout from "@/components/rep/RepLayout";
import CoachingPanel from "@/components/rep/CoachingPanel";

export const Route = createFileRoute("/rep/coach")({
  head: () => ({ meta: [{ title: "Coach IA · Panel Rep" }] }),
  component: () => (
    <RepLayout>
      <CoachingPanel />
    </RepLayout>
  ),
});
