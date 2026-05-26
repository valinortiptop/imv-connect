// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import ManiobraPortalPage from "@/components/maniobra-portal-page";

export const Route = createFileRoute("/maniobra/$token")({
  component: ManiobraPortalPage,
});
