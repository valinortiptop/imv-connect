import { createFileRoute } from "@tanstack/react-router";
import NotificationsCenter from "@/components/notifications/NotificationsCenter";

export const Route = createFileRoute("/admin/notificaciones")({
  component: NotificationsCenter,
});
