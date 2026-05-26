// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import DevolucionesPage from "@/components/devoluciones-page";

export const Route = createFileRoute("/admin/devoluciones/lista")({
  component: DevolucionesPage,
});
