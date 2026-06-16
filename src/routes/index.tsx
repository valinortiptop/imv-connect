import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { logoFullDark } from "@/assets/logos";

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
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <AnimatedGridPattern
        className="inset-x-0 inset-y-[-20%] h-[180%] [mask-image:radial-gradient(900px_circle_at_center,white,transparent_85%)]"
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-20">
        {/* Logo — full lockup on brand navy, presented as a finished badge */}
        <div className="overflow-hidden rounded-3xl shadow-xl shadow-slate-900/10 ring-1 ring-black/5">
          <img
            src={logoFullDark}
            alt="IMV — Integradora de Medicamentos Veterinarios"
            className="block h-28 w-auto"
          />
        </div>

        <h1 className="mt-10 text-center text-5xl font-semibold tracking-tight sm:text-6xl">
          <span className="bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 bg-clip-text text-transparent">
            IMV Portal
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-center text-base text-muted-foreground sm:text-lg">
          Plataforma integral de medicina veterinaria — catálogo, pedidos, almacén y operaciones.
        </p>

        <div className="mt-14 grid w-full gap-5 sm:grid-cols-2">
          <Link
            to="/admin"
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-white/60 p-6 text-left shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="text-xs font-medium uppercase tracking-wider text-primary/70">
                Equipo IMV
              </div>
              <h2 className="mt-2 text-xl font-semibold">Administración</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Gestiona laboratorios, productos, clientes, pedidos y almacén.
              </p>
              <div className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Entrar
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </div>
          </Link>

          <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-white/60 p-6 text-left shadow-sm backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-200/40 to-transparent" />
            <div className="relative">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Clientes
              </div>
              <h2 className="mt-2 text-xl font-semibold">Portal de cliente</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Cada cliente accede con su enlace privado{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  /portal/&lt;token&gt;
                </code>
                .
              </p>
            </div>
          </div>
        </div>

        <p className="mt-16 text-xs text-muted-foreground">
          © {new Date().getFullYear()} IMV — Innovación en Medicina Veterinaria
        </p>
      </div>
    </main>
  );
}
