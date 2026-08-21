import { createFileRoute, redirect } from "@tanstack/react-router";
import SupervisorDashboard from "@/components/rep/SupervisorDashboard";
import SupervisorReport from "@/components/rep/SupervisorReport";
import RepAccessMap from "@/components/rep/RepAccessMap";
import RepLabAccessPanel from "@/components/rep/RepLabAccessPanel";
import AIPageInsights from "@/components/ai/AIPageInsights";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/rep/supervisor")({
  head: () => ({ meta: [{ title: "Supervisor · Panel Rep" }] }),
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw redirect({ to: "/rep" });
    const { data } = await supabase.rpc("has_role", {
      _user_id: uid,
      _role: "admin",
    });
    if (!data) throw redirect({ to: "/rep" });
  },
  component: () => (
    <div className="space-y-4">
      <AIPageInsights module="rep-supervisor" />
      <SupervisorDashboard />
      <RepLabAccessPanel />
      <RepAccessMap />
      <SupervisorReport />
    </div>
  ),
});
