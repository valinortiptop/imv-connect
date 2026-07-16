// @ts-nocheck
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/almacen")({
  component: () => <Outlet />,
});
