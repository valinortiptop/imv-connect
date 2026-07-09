import { createFileRoute } from "@tanstack/react-router";
import CompetitiveLandscape from "@/components/rep/CompetitiveLandscape";
import AIPageInsights from "@/components/ai/AIPageInsights";

function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inteligencia competitiva</h1>
        <p className="text-sm text-muted-foreground">
          Contra quién estamos perdiendo y qué laboratorios están migrando
        </p>
      </div>
      <AIPageInsights module="rep-competencia" />
      <CompetitiveLandscape />
    </div>
  );
}

export const Route = createFileRoute("/rep/competencia")({
  head: () => ({ meta: [{ title: "Competencia · Panel Rep" }] }),
  component: Page,
});
