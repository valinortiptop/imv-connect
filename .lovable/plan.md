## Goal

Make clicking a client → detail → back feel instant. Today it hangs because the router doesn't preload, the detail page refetches heavy data every visit, and it pulls thousands of rows the header doesn't need.

## Root causes found

1. `src/router.tsx` sets `defaultPreloadStaleTime: 0` but never sets `defaultPreload`, so hovering a client row triggers nothing. The route module + data only start loading on click.
2. `src/components/client-detail-page.tsx` runs three `useQuery` calls with no `staleTime`. Closing and reopening the same client (or bouncing between clients) refetches everything from scratch.
3. The `client-detail-items` query loads **every** `order_items` row for the client (up to ~1,100 rows for top clients), then all referenced products, only to compute header KPIs (revenue, bultos, avg ticket, top products). This is the single biggest stall.
4. `Client360Drawer` embeds a Google Maps `<iframe>` unconditionally — it reloads on every drawer open even though the drawer is used from list rows.
5. `clients-page.tsx` static-imports `html2canvas` (~200 KB) at the top of the list module, inflating first paint of the list itself.

## Fix plan (frontend only)

### 1. Enable hover/intent preloading
`src/router.tsx`: add `defaultPreload: "intent"` and `defaultPreloadDelay: 50`. Route chunk + loaders start on hover/touchstart, so click feels instant.

### 2. Cache detail queries across mounts
In `client-detail-page.tsx`, add `staleTime: 60_000` and `gcTime: 5 * 60_000` to the three `useQuery` calls (`client-detail`, `client-detail-orders`, `client-detail-items`). Reopening the same client is then a cache hit; back-nav to the list keeps its own cache too.

### 3. Move heavy aggregates server-side
Replace the "load all items to compute KPIs" pattern with a lightweight RPC `client_detail_stats(client_id)` returning `{ total_revenue, total_bultos, avg_ticket, last_order_date, orders_count, top_products (top 10) }`. The page then only needs:
- `orders` list (already cheap, one row per pedido)
- `client_detail_stats` (single round-trip, aggregated in Postgres)
- Items fetched **lazily** only when the "Pedidos" tab is opened and a specific order is expanded (fetch that order's items on demand instead of all items upfront).

Result: initial detail render goes from ~1,100-row fetch + product join to a single aggregate row.

### 4. Lazy-mount the drawer's map iframe
In `Client360Drawer.tsx`, only render the Google Maps `<iframe>` when the user is on the "General" tab (which is the default) AND after a small mount delay, or gate it behind a "Ver mapa" toggle. Prevents iframe network cost on every quick open/close.

### 5. Code-split heavy imports on the list
In `clients-page.tsx`, convert `html2canvas` and `exportOrderAsImage` to dynamic `import()` inside the export handlers. Same for `ClientsImportDialog` / `ClientsMapView` via `React.lazy` + `Suspense` (they only mount when the user opens them). Keeps the list route lean.

### 6. Small navigation polish
- Add a lightweight `pendingComponent` on `/admin/clientes/$id` (skeleton header + tab shell) so the transition shows immediate feedback instead of the previous page freezing.
- On the list, use `<Link preload="intent">` explicitly for the client row anchors that currently rely on `useNavigate`, so keyboard and hover both trigger preload.

## Files to touch

- `src/router.tsx` — preload defaults.
- `src/components/client-detail-page.tsx` — query cache options, drop full-items fetch, use new RPC, lazy per-order items.
- `src/components/clients/Client360Drawer.tsx` — gate map iframe.
- `src/components/clients-page.tsx` — dynamic imports for html2canvas/import/map dialogs; ensure row link uses `<Link>` with `preload="intent"`.
- `src/routes/admin.clientes.$id.tsx` — add `pendingComponent`.
- One new SQL migration for `public.client_detail_stats(uuid)` RPC + grants.

## Out of scope

No business-logic changes: totals, discounts, tier resolution, CFDI upload, and tab contents behave identically. Only fetch shape, caching, and code-splitting change.
