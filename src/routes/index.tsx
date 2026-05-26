import { createFileRoute, Link } from "@tanstack/react-router";
import imvLogo from "@/assets/imv-logo.png";

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
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Ambient gradient blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-cyan-500/30 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-[32rem] w-[32rem] rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 h-[26rem] w-[26rem] rounded-full bg-emerald-500/20 blur-3xl" />
      </div>
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-20">
        {/* Logo glass badge */}
        <div className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <img
            src={imvLogo}
            alt="IMV logo"
            className="h-20 w-auto drop-shadow-[0_4px_20px_rgba(255,255,255,0.25)]"
          />
        </div>

        <h1 className="mt-10 text-center text-5xl font-semibold tracking-tight sm:text-6xl">
          <span className="bg-gradient-to-br from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            IMV Portal
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-center text-base text-slate-300 sm:text-lg">
          Plataforma integral de medicina veterinaria — catálogo, pedidos, almacén y operaciones.
        </p>

        <div className="mt-14 grid w-full gap-5 sm:grid-cols-2">
          <Link
            to="/admin"
            className="group relative overflow-hidden rounded-2xl border border-white/15 bg-white/5 p-6 text-left backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="text-xs font-medium uppercase tracking-wider text-cyan-300/80">
                Equipo IMV
              </div>
              <h2 className="mt-2 text-xl font-semibold text-white">Administración</h2>
              <p className="mt-2 text-sm text-slate-300">
                Gestiona laboratorios, productos, clientes, pedidos y almacén.
              </p>
              <div className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-cyan-200">
                Entrar
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </div>
          </Link>

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/10 to-transparent" />
            <div className="relative">
              <div className="text-xs font-medium uppercase tracking-wider text-indigo-300/80">
                Clientes
              </div>
              <h2 className="mt-2 text-xl font-semibold text-white">Portal de cliente</h2>
              <p className="mt-2 text-sm text-slate-300">
                Cada cliente accede con su enlace privado{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-slate-200">
                  /portal/&lt;token&gt;
                </code>
                .
              </p>
            </div>
          </div>
        </div>

        <p className="mt-16 text-xs text-slate-500">
          © {new Date().getFullYear()} IMV — Innovación en Medicina Veterinaria
        </p>
      </div>
    </main>
  );
}
