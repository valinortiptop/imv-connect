import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight } from "lucide-react";

export const Route = createFileRoute("/admin/bancos/traspasos")({
  head: () => ({
    meta: [
      { title: "Traspasos — Bancos" },
      { name: "description", content: "Traspasos entre tus cuentas bancarias." },
    ],
  }),
  component: BancosTraspasos,
});

function BancosTraspasos() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <ArrowLeftRight className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-bold">Traspasos</h1>
      </div>
      <p className="text-muted-foreground">Registra traspasos entre cuentas propias. Se generan automáticamente los movimientos de salida y entrada. Próximamente.</p>
    </div>
  );
}
