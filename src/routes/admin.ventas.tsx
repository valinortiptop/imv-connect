// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import VentasPage from "@/components/ventas-page";

export const Route = createFileRoute("/admin/ventas")({
  component: VentasPage,
});
