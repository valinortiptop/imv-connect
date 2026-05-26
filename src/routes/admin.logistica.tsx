import { createFileRoute } from "@tanstack/react-router";
import LogisticsPage from "@/components/logistics-page";

export const Route = createFileRoute("/admin/logistica")({
  component: LogisticsPage,
});
