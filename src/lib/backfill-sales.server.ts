// Server-only helpers for the 2026 NetSuite sales backfill.
// Kept in a separate `.server.ts` file so `.functions.ts` handlers stay thin
// wrappers and the tss-serverfn splitter does not lose the helpers.

export const BACKFILL_TAG = "netsuite_2026";

export type BackfillLine = {
  sku: string;
  description: string | null;
  quantity: number;
  revenue: number;
};

export type BackfillInvoice = {
  invoice_no: string;
  invoice_date: string; // YYYY-MM-DD
  rep_name: string | null;
  client_name: string | null; // "1471 NANCY M YAÑEZ SILVA"
  lab_name: string | null;
  lines: BackfillLine[];
};

export function stripClientPrefix(raw: string | null | undefined): {
  clean: string;
  netsuiteId: string | null;
} {
  const s = String(raw ?? "").trim();
  if (!s) return { clean: "", netsuiteId: null };
  const m = s.match(/^(\d{2,8})\s+(.+)$/);
  if (m) return { clean: m[2].trim(), netsuiteId: m[1] };
  return { clean: s, netsuiteId: null };
}

export function normalizeName(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
