import { createFileRoute } from "@tanstack/react-router";
import {
  runNetsuiteBackfillChunk,
  type BackfillInvoice,
} from "@/lib/backfill-sales.server";

export const Route = createFileRoute("/api/public/backfill-netsuite-2026")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-backfill-token") ?? "";
        const expected = process.env.NETSUITE_BACKFILL_TOKEN ?? "";
        if (!expected || token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: { invoices?: BackfillInvoice[] };
        try {
          body = (await request.json()) as { invoices?: BackfillInvoice[] };
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const invoices = Array.isArray(body?.invoices) ? body.invoices : [];
        try {
          const counters = await runNetsuiteBackfillChunk(invoices);
          return Response.json(counters);
        } catch (e: any) {
          return new Response(
            `Backfill failed: ${e?.message ?? String(e)}`,
            { status: 500 },
          );
        }
      },
    },
  },
});
