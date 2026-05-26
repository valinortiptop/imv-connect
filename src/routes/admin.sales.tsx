// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import SalesPage from "@/components/sales-page";

export const Route = createFileRoute("/admin/sales")({
  component: SalesPage,
});
