// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import AdminMgmtPage from "@/components/admin-mgmt-page";
import AdminOnly from "@/components/admin-only";

export const Route = createFileRoute("/admin/administracion")({
  component: () => (
    <AdminOnly>
      <AdminMgmtPage />
    </AdminOnly>
  ),
});
