import { createFileRoute } from "@tanstack/react-router";
import TemplateLibraryPage from "@/components/notifications/TemplateLibraryPage";

export const Route = createFileRoute("/admin/configuracion/plantillas")({
  component: TemplateLibraryPage,
});
