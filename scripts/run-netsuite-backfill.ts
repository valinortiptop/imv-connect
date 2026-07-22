// Sandbox-only runner. Uses IMV_SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runNetsuiteBackfillChunk, type BackfillInvoice } from "../src/lib/backfill-sales.server";

const dir = process.argv[2] ?? "/tmp/backfill/chunks";
const startIdx = Number(process.argv[3] ?? "0");
const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();

const totals: Record<string, number> = {};
const errors: string[] = [];
let processedFiles = 0;

for (let i = startIdx; i < files.length; i++) {
  const f = files[i];
  const raw = await readFile(path.join(dir, f), "utf8");
  const invoices = JSON.parse(raw) as BackfillInvoice[];
  const t0 = Date.now();
  try {
    const c = await runNetsuiteBackfillChunk(invoices);
    for (const [k, v] of Object.entries(c)) {
      if (k === "errors") {
        for (const e of v as string[]) errors.push(`[${f}] ${e}`);
      } else {
        totals[k] = (totals[k] ?? 0) + (v as number);
      }
    }
    processedFiles++;
    const ms = Date.now() - t0;
    console.log(
      `${f} (${i + 1}/${files.length}) ${ms}ms invoices_in=${invoices.length} pedidos=${c.created_pedidos} skip=${c.skipped_existing} err=${c.errors.length}`,
    );
  } catch (e: any) {
    errors.push(`[${f}] FATAL ${e?.message ?? e}`);
    console.error(`${f} FATAL`, e);
  }
}

console.log("\n=== TOTALS ===");
console.log(JSON.stringify({ processedFiles, ...totals, errorCount: errors.length }, null, 2));
if (errors.length) {
  const outPath = "/tmp/backfill/errors.log";
  await Bun.write(outPath, errors.join("\n"));
  console.log(`Errors written to ${outPath} (first 10 below)`);
  for (const e of errors.slice(0, 10)) console.log(e);
}
