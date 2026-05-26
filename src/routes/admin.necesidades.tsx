// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import PurchaseNeedsPage from "@/components/purchase-needs-page";

export const Route = createFileRoute("/admin/necesidades")({
  component: PurchaseNeedsPage,
});
