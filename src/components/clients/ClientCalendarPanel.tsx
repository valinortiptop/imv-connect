// @ts-nocheck
import CalendarView from "@/components/rep/CalendarView";

export default function ClientCalendarPanel({ clienteId }: { clienteId: string }) {
  return (
    <div className="pt-2">
      <CalendarView clienteId={clienteId} embedded />
    </div>
  );
}
