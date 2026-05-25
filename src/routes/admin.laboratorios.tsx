import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/laboratorios")({
  component: () => (
    <section>
      <h1 className="text-2xl font-bold">Laboratorios</h1>
      <p className="mt-2 text-sm text-muted-foreground">CRUD en próxima iteración.</p>
    </section>
  ),
});
