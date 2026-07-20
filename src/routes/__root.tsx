import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { useBuildVersionCheck } from "../hooks/use-build-version-check";
import { AuthProvider } from "../hooks/use-auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const details = [error?.name, error?.message].filter(Boolean).join(": ") || String(error);
  const stack = (error?.stack ?? "").split("\n").slice(0, 8).join("\n");

  const resetAppData = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => !k.startsWith("sb-"))
        .forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch {}
    window.location.href = "/";
  };

  const copyDiagnostics = async () => {
    const payload = `URL: ${window.location.href}\nUA: ${navigator.userAgent}\nTime: ${new Date().toISOString()}\n\n${details}\n\n${stack}`;
    try { await navigator.clipboard.writeText(payload); } catch {}
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. Try again, or reset app data if it keeps happening.
        </p>

        <details className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-left">
          <summary className="cursor-pointer text-xs font-medium text-foreground">
            Error details
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-snug text-muted-foreground">
{details}
{stack ? "\n\n" + stack : ""}
          </pre>
          <button
            onClick={copyDiagnostics}
            className="mt-2 text-[11px] text-primary underline"
          >
            Copy diagnostics
          </button>
        </details>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
          <button
            onClick={resetAppData}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Reset app data
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google", content: "notranslate" },
      { httpEquiv: "Content-Language", content: "es" },
      { title: "IMV" },
      { name: "description", content: "IMV Connect is a wholesale distribution platform for a Mexican veterinary medicine distributor." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "IMV" },
      { property: "og:description", content: "IMV Connect is a wholesale distribution platform for a Mexican veterinary medicine distributor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "IMV" },
      { name: "twitter:description", content: "IMV Connect is a wholesale distribution platform for a Mexican veterinary medicine distributor." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c8313309-cd60-4208-8589-b658b2eba37f/id-preview-4557bc33--e40d4a9c-4930-4ed0-b9a2-854b51d12f79.lovable.app-1779833699720.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c8313309-cd60-4208-8589-b658b2eba37f/id-preview-4557bc33--e40d4a9c-4930-4ed0-b9a2-854b51d12f79.lovable.app-1779833699720.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useBuildVersionCheck();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
