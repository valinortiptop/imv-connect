import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { logoFullDark } from "@/assets/logos";
import { fetchIsRepOnly } from "@/hooks/use-rep-only";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: "Iniciar sesión — IMV" }] }),
  component: LoginPage,
});

/** Only allow same-origin paths; blocks external URLs and /login loops. */
function sanitizeRedirect(path: string | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path === "/login" || path.startsWith("/login?")) return null;
  return path;
}

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveDestination = async () =>
    sanitizeRedirect(redirectTo) ??
    ((await fetchIsRepOnly()) ? "/rep" : "/admin");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      navigate({ to: await resolveDestination() });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: await resolveDestination() });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <Link to="/" aria-label="IMV — inicio" className="block overflow-hidden rounded-2xl shadow-md shadow-slate-900/10 ring-1 ring-black/5">
            <img
              src={logoFullDark}
              alt="IMV — Integradora de Medicamentos Veterinarios"
              className="block h-20 w-auto"
            />
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">Acceso administrativo</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700">
            Falta configurar <code>.env</code> con credenciales de Supabase.
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border bg-card p-6">
          <div>
            <label className="text-sm font-medium">Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Iniciar sesión"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Crea el usuario en Supabase → Authentication → Users.
          </p>
        </form>
      </div>
    </main>
  );
}
