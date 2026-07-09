// Proxies Google Maps raster tiles through the Valinor proxy so the browser
// never needs the API key. Path: /api/public/maps/tile/{z}/{x}/{y}
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/maps/tile/$z/$x/$y")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { z, x, y } = params as { z: string; x: string; y: string };
        // Validate all three are non-negative integers within Web Mercator bounds.
        const zn = Number(z), xn = Number(x), yn = Number(y);
        if (
          !Number.isInteger(zn) || zn < 0 || zn > 22 ||
          !Number.isInteger(xn) || xn < 0 ||
          !Number.isInteger(yn) || yn < 0
        ) {
          return new Response("bad tile", { status: 400 });
        }

        const { callValinorRaw } = await import("@/lib/valinor-proxy.server");
        // "lyrs=m" = standard roadmap tiles.
        const upstream = await callValinorRaw({
          provider: "google",
          method: "GET",
          endpoint: `/maps/vt?lyrs=m&x=${xn}&y=${yn}&z=${zn}&hl=es`,
        });

        if (!upstream.ok) {
          return new Response("upstream error", { status: upstream.status });
        }

        const buf = await upstream.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": upstream.headers.get("content-type") ?? "image/png",
            "Cache-Control": "public, max-age=86400, immutable",
          },
        });
      },
    },
  },
});
