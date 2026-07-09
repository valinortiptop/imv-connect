// Serves the Google Maps JavaScript loader through the Valinor proxy.
// Browser code never receives a project-side Google API key.
import { createFileRoute } from "@tanstack/react-router";

const CALLBACK_RE = /^[A-Za-z_$][\w$]{0,80}$/;

export const Route = createFileRoute("/api/public/maps/script")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const callback = url.searchParams.get("callback") ?? "__imvGoogleMapsReady";
        if (!CALLBACK_RE.test(callback)) {
          return new Response("bad callback", { status: 400 });
        }

        const params = new URLSearchParams({
          loading: "async",
          callback,
          v: "weekly",
          language: "es",
          region: "MX",
        });

        const { callValinorRaw } = await import("@/lib/valinor-proxy.server");
        const upstream = await callValinorRaw({
          provider: "google",
          method: "GET",
          endpoint: `/maps/api/js?${params.toString()}`,
        });

        const body = await upstream.text();
        if (!upstream.ok) {
          return new Response(body || "upstream error", { status: upstream.status });
        }

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/javascript; charset=UTF-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
