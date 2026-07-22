// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import Prospects from "@/components/prospects-page";

export const Route = createFileRoute("/rep/prospectos")({
  component: () => <Prospects scopeToMe />,
});
