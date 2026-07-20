import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/cobranza")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/credito-cobranza/cartera" });
  },
});
