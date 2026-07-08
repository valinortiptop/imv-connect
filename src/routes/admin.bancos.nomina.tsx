import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/admin/bancos/nomina")({
  head: () => ({
    meta: [
      { title: "Pago de nómina — Bancos" },
      { name: "description", content: "Dispersión y registro de pagos de nómina." },
    ],
  }),
  component: BancosNomina,
});

function BancosNomina() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Wallet className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-bold">Pago de nómina</h1>
      </div>
      <p className="text-muted-foreground">Genera dispersión de nómina y registra los pagos vinculados a la cuenta bancaria. Próximamente.</p>
    </div>
  );
}
