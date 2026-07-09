import { createFileRoute } from "@tanstack/react-router";
import RouteMap from "@/components/rep/RouteMap";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/ruta")({
  component: () => (
    <>
      <AIPageInsights module="rep-ruta" />
      <RouteMap />
    </>
  ),
});
