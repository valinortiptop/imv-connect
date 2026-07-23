import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyRepFn, getMyClientsFn } from "@/lib/rep.functions";
import Clients from "@/components/clients-page";
import { Skeleton } from "@/components/ui/skeleton";
import AIPageInsights from "@/components/ai/AIPageInsights";

function Page() {
  const fetchMyRep = useServerFn(getMyRepFn);
  const fetchClients = useServerFn(getMyClientsFn);
  const meQ = useQuery({ queryKey: ["my-rep"], queryFn: () => fetchMyRep() });
  const isAdmin = !!meQ.data?.isAdmin;
  const hasRep = !!meQ.data?.rep;

  const q = useQuery({
    queryKey: ["rep-clients"],
    queryFn: () => fetchClients(),
    enabled: !isAdmin && hasRep,
  });

  if (meQ.isLoading || (!isAdmin && q.isLoading)) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Admins ven todos los clientes; los reps se limitan a los suyos.
  const restrictClientIds = isAdmin
    ? undefined
    : (q.data?.clients ?? []).map((c: any) => c.id);

  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-clientes" />
      <Clients restrictClientIds={restrictClientIds} />
    </div>
  );
}

export const Route = createFileRoute("/rep/clientes/")({ component: Page });
