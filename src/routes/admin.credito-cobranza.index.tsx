import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/credito-cobranza/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/credito-cobranza/cartera" });
  },
});
