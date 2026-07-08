import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/admin/bancos/estados")({
  head: () => ({
    meta: [
      { title: "Estados bancarios — Bancos" },
      { name: "description", content: "Sube tus estados de cuenta y categoriza transacciones con IA." },
    ],
  }),
  component: EstadosBancarios,
});

function EstadosBancarios() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-bold">Estados bancarios</h1>
      </div>
      <p className="text-muted-foreground">Sube tu estado de cuenta (PDF o imagen) y la IA extrae y categoriza cada movimiento. Próximamente.</p>
    </div>
  );
}
