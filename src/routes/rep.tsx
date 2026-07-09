import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import RepLayout from "@/components/rep/RepLayout";

export const Route = createFileRoute("/rep")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: () => (
    <RepLayout>
      <Outlet />
    </RepLayout>
  ),
});
