import { createFileRoute } from "@tanstack/react-router";
import RouteMap from "@/components/rep/RouteMap";
import AIPageInsights from "@/components/ai/AIPageInsights";
import SavedRoutesList from "@/components/rep/SavedRoutesList";

export const Route = createFileRoute("/rep/ruta")({
  component: () => (
    <div className="space-y-4">
      <AIPageInsights module="rep-ruta" />
      <RouteMap />
      <SavedRoutesList />
    </div>
  ),
});
