import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IMV Portal — Medicina veterinaria" },
      {
        name: "description",
        content:
          "Portal IMV: catálogo digital de medicamentos veterinarios para clientes y administración interna.",
      },
      { property: "og:title", content: "IMV Portal" },
      { property: "og:description", content: "Catálogo veterinario IMV" },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight">IMV Portal</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Catálogo digital de medicina veterinaria.
        </p>

        <div className="mt-12 grid w-full gap-4 sm:grid-cols-2">
          <Link
            to="/admin/productos"
            className="rounded-lg border border-border bg-card p-6 text-left transition-colors hover:border-primary"
          >
            <h2 className="text-lg font-semibold">Administración</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gestionar laboratorios, productos, clientes y precios.
            </p>
          </Link>

          <div className="rounded-lg border border-border bg-card p-6 text-left">
            <h2 className="text-lg font-semibold">Portal de cliente</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada cliente accede vía <code className="text-xs">/portal/&lt;token&gt;</code>.
            </p>
          </div>
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          Módulo 1 — Catálogo Digital
        </p>
      </div>
    </main>
  );
}
