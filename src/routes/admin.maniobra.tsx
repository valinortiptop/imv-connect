// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import ManiobraPage from "@/components/maniobra-page";

export const Route = createFileRoute("/admin/maniobra")({
  component: ManiobraPage,
});
