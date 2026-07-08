import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownUp } from "lucide-react";

export const Route = createFileRoute("/admin/bancos/movimientos")({
  head: () => ({
    meta: [
      { title: "Entradas y salidas — Bancos" },
      { name: "description", content: "Registra depósitos, retiros y comisiones bancarias." },
    ],
  }),
  component: BancosMovimientos,
});

function BancosMovimientos() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <ArrowDownUp className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-bold">Entradas y salidas</h1>
      </div>
      <p className="text-muted-foreground">Registra manualmente entradas y salidas por cuenta. Próximamente.</p>
    </div>
  );
}
