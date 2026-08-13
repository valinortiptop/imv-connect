// Cron endpoint — pg_cron llama aquí para la sincronización nocturna de NetSuite.
// El prefijo /api/public/* omite el auth del sitio; validamos con el apikey de Supabase.
import { createFileRoute } from "@tanstack/react-router";

type Entity = "ventas" | "clientes" | "productos" | "inventario";
const VALID: Entity[] = ["ventas", "clientes", "productos", "inventario"];

export const Route = createFileRoute("/api/public/hooks/netsuite-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey =
          request.headers.get("apikey") ??
          request.headers.get("x-api-key") ??
          "";
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { entities?: string[]; days?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const entities = (
          Array.isArray(body.entities) && body.entities.length
            ? body.entities
            : VALID
        ).filter((e): e is Entity => VALID.includes(e as Entity));

        const days = Math.min(Math.max(Number(body.days ?? 1), 1), 90);
        const to = new Date();
        const from = new Date(to.getTime() - (days - 1) * 86_400_000);
        const iso = (d: Date) => d.toISOString().slice(0, 10);

        const { runNetsuiteSync } = await import("@/lib/netsuite-sync.server");
        const results = [];
        for (const entity of entities) {
          try {
            results.push(
              await runNetsuiteSync({
                entity,
                from: iso(from),
                to: iso(to),
                triggerSource: "cron",
              }),
            );
          } catch (e) {
            results.push({
              entity,
              status: "error",
              errors: [e instanceof Error ? e.message : String(e)],
            });
          }
        }

        return Response.json({ ok: true, results });
      },
    },
  },
});
