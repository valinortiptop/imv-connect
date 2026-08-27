import { createFileRoute } from "@tanstack/react-router";
import AccountSettingsPage from "@/components/account-settings-page";

export const Route = createFileRoute("/rep/cuenta")({
  component: AccountSettingsPage,
});
