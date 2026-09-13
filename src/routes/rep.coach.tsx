import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import CoachingPanel from "@/components/rep/CoachingPanel";
import TeamCoachingPanel from "@/components/rep/TeamCoachingPanel";
import AIPageInsights from "@/components/ai/AIPageInsights";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoles } from "@/lib/use-roles";

function CoachPage() {
  const { isAdmin, isLoading } = useRoles();
  const [tab, setTab] = useState("equipo");

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Cargando…</p>;
  }

  if (!isAdmin) {
    return (
      <>
        <AIPageInsights module="rep-coach" />
        <CoachingPanel />
      </>
    );
  }

  return (
    <>
      <AIPageInsights module="rep-coach" />
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="equipo" className="flex-1 sm:flex-none">
            Equipo
          </TabsTrigger>
          <TabsTrigger value="mio" className="flex-1 sm:flex-none">
            Mi coach
          </TabsTrigger>
        </TabsList>
        <TabsContent value="equipo" className="mt-0">
          <TeamCoachingPanel />
        </TabsContent>
        <TabsContent value="mio" className="mt-0">
          <CoachingPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}

export const Route = createFileRoute("/rep/coach")({
  head: () => ({
    meta: [
      { title: "Coach IA · Panel Rep" },
      {
        name: "description",
        content:
          "Coach IA con lectura semanal del equipo comercial, metas y representantes que requieren atención.",
      },
    ],
  }),
  component: CoachPage,
});
