import { createFileRoute } from "@tanstack/react-router";
import CalendarView from "@/components/rep/CalendarView";

export const Route = createFileRoute("/rep/calendario")({
  head: () => ({ meta: [{ title: "Calendario · Panel Rep" }] }),
  component: CalendarView,
});
