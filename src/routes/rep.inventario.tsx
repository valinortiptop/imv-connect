import { createFileRoute } from "@tanstack/react-router";
import Inventory from "@/components/inventory-page";

export const Route = createFileRoute("/rep/inventario")({
  head: () => ({ meta: [{ title: "Inventario · Panel Rep" }] }),
  component: Inventory,
});
