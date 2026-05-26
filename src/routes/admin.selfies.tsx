// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import ManiobraSelfiesPage from "@/components/maniobra-selfies-page";

export const Route = createFileRoute("/admin/selfies")({
  component: ManiobraSelfiesPage,
});
