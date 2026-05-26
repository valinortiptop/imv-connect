// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import DamagedPage from "@/components/damaged-page";

export const Route = createFileRoute("/admin/danados")({
  component: DamagedPage,
});
