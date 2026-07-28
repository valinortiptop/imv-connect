import { createFileRoute } from "@tanstack/react-router";
import NotificationPreferencesPage from "@/components/notifications/NotificationPreferencesPage";

export const Route = createFileRoute("/admin/configuracion/notificaciones")({
  component: NotificationPreferencesPage,
});
