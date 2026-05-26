// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import WarehousePage from "@/components/warehouse-page";

export const Route = createFileRoute("/admin/almacen")({
  component: WarehousePage,
});
