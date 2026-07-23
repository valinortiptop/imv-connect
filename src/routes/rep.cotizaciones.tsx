import { createFileRoute } from "@tanstack/react-router";
import Orders from "@/components/orders-page";
import AIPageInsights from "@/components/ai/AIPageInsights";

function Page() {
  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-cotizaciones" />
      <Orders hideCotizaciones />
    </div>
  );
}

export const Route = createFileRoute("/rep/cotizaciones")({ component: Page });
