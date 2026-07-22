/**
 * Fetches all rows from a Supabase query builder by paging with `.range()`.
 * PostgREST caps single requests at ~1000 rows; use this whenever a listing
 * must show the full dataset (25k+ pedidos after the NetSuite backfill).
 *
 * Pass a factory that returns a fresh query for each page — Supabase builders
 * are single-use.
 */
export async function fetchAllRows<T = any>(
  makeQuery: () => any,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Hard safety cap to avoid runaway loops.
  for (let i = 0; i < 500; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
