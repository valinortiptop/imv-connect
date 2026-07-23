## Problem

The last change made client navigation worse:
- `defaultPreload: "intent"` + `defaultPreloadDelay: 50` in `src/router.tsx` triggers route-module preloading for every card the cursor passes over on the (2,200-line) clients page. Combined with `defaultPreloadStaleTime: 0`, it thrashes on the big list.
- `pendingMs: 100` on `/admin/clientes/$id` shows the skeleton fast but does nothing to speed up the actual data load — the perceived "stall" is still there because the detail page fires three heavy queries (client + orders + a second orders-then-items-then-products chain) and then does all revenue/top-product aggregation client-side over thousands of rows.
- Nothing in the last change actually reduced work; it only preloaded chunks and painted a skeleton earlier, which made the first click feel slower.

## Plan

### 1. Revert the router / route changes that regressed navigation
- `src/router.tsx`: remove `defaultPreload: "intent"` and `defaultPreloadDelay: 50`. Keep `defaultPreloadStaleTime: 0` (required by Query integration) and `scrollRestoration`.
- `src/routes/admin.clientes.$id.tsx`: keep the skeleton but drop `pendingMs: 100` (default is fine) so the transition behaves like it did before.

### 2. Cut the real cost in `src/components/client-detail-page.tsx`
The stall is dominated by the "items" query and its downstream `useMemo`s. Replace the current three-step chain (orders → order_items → products → client-side aggregate) with a single lightweight fetch that returns only what the KPI strip and Top Products tab need:

- Consolidate into one query that:
  - fetches `orders` (already needed for the Pedidos tab)
  - fetches `order_items` filtered by `order_id in (...)` in one round-trip
  - fetches the referenced `products` in one round-trip
  - returns `{ orders, items, products }` as a single cached object
- Keep the existing `useMemo` aggregations but run them over the already-fetched arrays (no extra queries).
- Cap the initial load: only fetch items for the most recent N orders (e.g. 200) for the KPI/Top Products view; the Pedidos tab can lazy-load older items on demand. This is the single biggest win for clients with thousands of orders.
- Leave `staleTime`/`gcTime` at the previously added values so back-navigation stays cached.

### 3. Verification
- Open a heavy client (e.g. one with many orders) from `/admin/clientes` and confirm:
  - Row click no longer stalls; skeleton appears immediately and content fills in.
  - Repeat navigation is instant (cache hit).
  - KPI totals and Top Products still match previous values.

## Notes for the technical reviewer

- No schema / RPC changes in this pass — this is a pure client-side fix so it can ship immediately. If the "recent N orders" cap is not acceptable for KPIs, the follow-up is a `client_detail_stats` RPC that returns totals + top products server-side; happy to do that as a phase 2.
- `Client360Drawer` is unchanged; it already uses its own scoped queries.
