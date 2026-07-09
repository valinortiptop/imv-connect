import { createFileRoute } from "@tanstack/react-router";
import CoachingPanel from "@/components/rep/CoachingPanel";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/coach")({
  head: () => ({ meta: [{ title: "Coach IA · Panel Rep" }] }),
  component: () => (
    <>
      <AIPageInsights module="rep-coach" />
      <CoachingPanel />
    </>
  ),
});
