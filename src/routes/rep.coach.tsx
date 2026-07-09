import { createFileRoute } from "@tanstack/react-router";
import CoachingPanel from "@/components/rep/CoachingPanel";

export const Route = createFileRoute("/rep/coach")({
  head: () => ({ meta: [{ title: "Coach IA · Panel Rep" }] }),
  component: CoachingPanel,
});
