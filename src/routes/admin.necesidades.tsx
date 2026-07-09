import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/necesidades")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/compras/planeacion" });
  },
});
