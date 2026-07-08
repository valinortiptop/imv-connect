import { createFileRoute } from "@tanstack/react-router";
import { Banknote } from "lucide-react";

export const Route = createFileRoute("/admin/bancos/")({
  head: () => ({
    meta: [
      { title: "Cuentas bancarias — Bancos" },
      { name: "description", content: "Administra tus cuentas bancarias y saldos." },
    ],
  }),
  component: BancosIndex,
});

function BancosIndex() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Banknote className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-bold">Cuentas bancarias</h1>
      </div>
      <p className="text-muted-foreground">Panel principal del módulo de Bancos. Próximamente: lista de cuentas con saldo actual, entradas y salidas del mes.</p>
    </div>
  );
}
