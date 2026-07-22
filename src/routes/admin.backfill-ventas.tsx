import { createFileRoute } from "@tanstack/react-router";
import BackfillVentasPage from "@/components/backfill-ventas-page";

export const Route = createFileRoute("/admin/backfill-ventas")({
  component: BackfillVentasPage,
});
