import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/clientes")({
  component: () => (
    <section>
      <h1 className="text-2xl font-bold">Clientes</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        CRUD + generación de token portal en próxima iteración.
      </p>
    </section>
  ),
});
