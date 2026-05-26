// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import KardexPage from "@/components/kardex-page";

export const Route = createFileRoute("/admin/kardex")({
  component: KardexPage,
});
