import { createFileRoute } from "@tanstack/react-router";
import InventoryQuickLookup from "@/components/rep/InventoryQuickLookup";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/inventario")({
  component: () => (
    <>
      <AIPageInsights module="rep-inventario" />
      <InventoryQuickLookup />
    </>
  ),
});
