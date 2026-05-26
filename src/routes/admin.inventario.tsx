import { createFileRoute } from "@tanstack/react-router";
import Inventory from "@/components/inventory-page";

export const Route = createFileRoute("/admin/inventario")({
  component: Inventory,
});
