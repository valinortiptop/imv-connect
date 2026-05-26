import { createFileRoute } from "@tanstack/react-router";
import DeliverySignaturePage from "@/components/delivery-signature-page";

export const Route = createFileRoute("/entrega/$token")({
  component: DeliverySignaturePage,
});
