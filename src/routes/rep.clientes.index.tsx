import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyClientsFn } from "@/lib/rep.functions";
import Clients from "@/components/clients-page";
import { Skeleton } from "@/components/ui/skeleton";
import AIPageInsights from "@/components/ai/AIPageInsights";

function Page() {
  const fetchClients = useServerFn(getMyClientsFn);
  const q = useQuery({ queryKey: ["rep-clients"], queryFn: () => fetchClients() });

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const clientIds = (q.data?.clients ?? []).map((c: any) => c.id);

  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-clientes" />
      <Clients restrictClientIds={clientIds} />
    </div>
  );
}

export const Route = createFileRoute("/rep/clientes/")({ component: Page });
