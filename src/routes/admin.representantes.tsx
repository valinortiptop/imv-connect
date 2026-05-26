import { createFileRoute } from "@tanstack/react-router";
import PartnersPage from "@/components/partners-page";

export const Route = createFileRoute("/admin/representantes")({
  component: PartnersPage,
});
