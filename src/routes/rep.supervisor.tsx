import { createFileRoute, redirect } from "@tanstack/react-router";
import SupervisorDashboard from "@/components/rep/SupervisorDashboard";
import SupervisorReport from "@/components/rep/SupervisorReport";
import DailyRoutesSummary from "@/components/rep/DailyRoutesSummary";
import SupervisorRoutesHistory from "@/components/rep/SupervisorRoutesHistory";
import SupervisorAssignments from "@/components/rep/SupervisorAssignments";
import RepAccessMap from "@/components/rep/RepAccessMap";
import RepLabAccessPanel from "@/components/rep/RepLabAccessPanel";
import AIPageInsights from "@/components/ai/AIPageInsights";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/rep/supervisor")({
  head: () => ({ meta: [{ title: "Supervisor · Panel Rep" }] }),
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) {
      throw redirect({ to: "/login", search: { redirect: "/rep/supervisor" } });
    }
    const { data } = await supabase.rpc("has_role", {
      _user_id: uid,
      _role: "admin",
    });
    if (!data) throw redirect({ to: "/rep" });
  },
  component: SupervisorPage,
});

function SupervisorPage() {
  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-supervisor" />

      <Tabs defaultValue="rutas" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="rutas">Rutas del día</TabsTrigger>
          <TabsTrigger value="rendimiento">Rendimiento</TabsTrigger>
          <TabsTrigger value="historial">Rutas históricas</TabsTrigger>
          <TabsTrigger value="asignaciones">Asignaciones</TabsTrigger>
          <TabsTrigger value="actividad">Actividad y dispositivos</TabsTrigger>
          <TabsTrigger value="reporte">Reporte</TabsTrigger>
        </TabsList>

        <TabsContent value="rutas" className="space-y-4">
          <DailyRoutesSummary />
        </TabsContent>

        <TabsContent value="rendimiento" className="space-y-4">
          <SupervisorDashboard />
        </TabsContent>

        <TabsContent value="historial" className="space-y-4">
          <SupervisorRoutesHistory />
        </TabsContent>

        <TabsContent value="asignaciones" className="space-y-4">
          <SupervisorAssignments />
        </TabsContent>

        <TabsContent value="actividad" className="space-y-4">
          <RepAccessMap />
          <RepLabAccessPanel />
        </TabsContent>

        <TabsContent value="reporte" className="space-y-4">
          <SupervisorReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
