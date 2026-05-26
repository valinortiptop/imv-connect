// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import PnLPage from "@/components/pnl-page";

export const Route = createFileRoute("/admin/pnl")({
  component: PnLPage,
});
