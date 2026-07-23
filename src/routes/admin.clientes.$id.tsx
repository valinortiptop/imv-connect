import { createFileRoute } from "@tanstack/react-router";
import ClientDetail from "@/components/client-detail-page";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/clientes/$id")({
  component: ClientDetail,
  pendingComponent: () => (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  ),
});
