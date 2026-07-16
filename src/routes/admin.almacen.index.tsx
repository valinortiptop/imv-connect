// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import WarehouseFloorplan from "@/components/warehouse/WarehouseFloorplan";

export const Route = createFileRoute("/admin/almacen/")({
  component: WarehouseFloorplan,
});
