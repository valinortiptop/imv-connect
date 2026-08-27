import { createFileRoute } from "@tanstack/react-router";
import AccountSettingsPage from "@/components/account-settings-page";

export const Route = createFileRoute("/admin/cuenta")({
  component: AccountSettingsPage,
});
