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

        <h1
          className="mt-10 text-center text-6xl italic tracking-tight sm:text-7xl"
          style={{ fontFamily: '"Exo 2", system-ui, sans-serif', fontWeight: 700, color: "#001D77" }}
        >
          imv<span style={{ color: "#2DE2C5" }}>.</span>{" "}
          <span style={{ fontWeight: 500, color: "#001D77" }}>Portal</span>
        </h1>
        <p
          className="mt-4 max-w-xl text-center text-base sm:text-lg"
          style={{ fontFamily: '"Montserrat", system-ui, sans-serif', fontStyle: "italic", color: "#001D77", opacity: 0.75 }}
        >
          Plataforma integral de medicina veterinaria — catálogo, pedidos, almacén y operaciones.
        </p>

        <div className="mt-14 grid w-full gap-5 sm:grid-cols-2">
          <Link
            to="/admin"
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-white/60 p-6 text-left shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="mt-14 grid w-full gap-5 sm:grid-cols-2">
          <Link
            to="/admin"
            className="group relative overflow-hidden rounded-2xl border bg-white/70 p-6 text-left shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ borderColor: "rgba(0,29,119,0.18)" }}
          >
            <div
              className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
              style={{ background: "linear-gradient(135deg, rgba(45,226,197,0.18), transparent 60%)" }}
            />
            <div className="relative">
              <div
                className="text-xs uppercase tracking-[0.18em]"
                style={{ fontFamily: '"Gotham", system-ui, sans-serif', color: "#2DE2C5", fontWeight: 300 }}
              >
                Equipo IMV
              </div>
              <h2
                className="mt-2 text-2xl italic"
                style={{ fontFamily: '"Exo 2", system-ui, sans-serif', fontWeight: 700, color: "#001D77" }}
              >
                Administración
              </h2>
              <p
                className="mt-2 text-sm italic"
                style={{ fontFamily: '"Montserrat", system-ui, sans-serif', color: "#001D77", opacity: 0.75 }}
              >
                Gestiona laboratorios, productos, clientes, pedidos y almacén.
              </p>
              <div
                className="mt-5 inline-flex items-center gap-1 text-sm italic"
                style={{ fontFamily: '"Exo 2", system-ui, sans-serif', fontWeight: 600, color: "#001D77" }}
              >
                Entrar
                <span className="transition-transform group-hover:translate-x-1" style={{ color: "#2DE2C5" }}>→</span>
              </div>
            </div>
          </Link>

          <div
            className="relative overflow-hidden rounded-2xl border bg-white/70 p-6 text-left shadow-sm backdrop-blur-xl"
            style={{ borderColor: "rgba(0,29,119,0.18)" }}
          >
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(135deg, rgba(0,29,119,0.06), transparent 60%)" }}
            />
            <div className="relative">
              <div
                className="text-xs uppercase tracking-[0.18em]"
                style={{ fontFamily: '"Gotham", system-ui, sans-serif', color: "#2DE2C5", fontWeight: 300 }}
              >
                Clientes
              </div>
              <h2
                className="mt-2 text-2xl italic"
                style={{ fontFamily: '"Exo 2", system-ui, sans-serif', fontWeight: 700, color: "#001D77" }}
              >
                Portal de cliente
              </h2>
              <p
                className="mt-2 text-sm italic"
                style={{ fontFamily: '"Montserrat", system-ui, sans-serif', color: "#001D77", opacity: 0.75 }}
              >
                Cada cliente accede con su enlace privado{" "}
                <code
                  className="rounded px-1.5 py-0.5 text-xs not-italic"
                  style={{ background: "rgba(45,226,197,0.18)", color: "#001D77", fontFamily: "ui-monospace, monospace" }}
                >
                  /portal/&lt;token&gt;
                </code>
                .
              </p>
            </div>
          </div>
        </div>

        <p
          className="mt-16 text-xs italic"
          style={{ fontFamily: '"Montserrat", system-ui, sans-serif', color: "#001D77", opacity: 0.6 }}
        >
          © {new Date().getFullYear()} IMV — Innovación en Medicina Veterinaria
        </p>
      </div>
    </main>
  );
}
