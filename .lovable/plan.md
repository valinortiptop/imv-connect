## Goal
Make `/admin/clientes` feel fast again when opening the page, clicking a client, closing drawers/modals, and moving between the list and client detail.

## What I confirmed
- The clients page fetches the client directory and renders every filtered client row at once.
- The desktop list renders an extra expandable row for every client, even when most are collapsed.
- The page also loads order summary data for dashboard cards on initial render.
- The database currently has about 1,249 client rows and 25,481 order rows, so the main issue is front-end rendering/query shape, not needing a Supabase upgrade.
- The full client detail route still fetches all orders for that client before doing recent-order item/product calculations.

## Plan

### 1. Make the client list render lightweight
- Add client-side pagination for the list/table/cards, defaulting to 100 rows per page.
- Keep filters, search, counts, and dashboard stats based on the full filtered dataset, but only render the visible page.
- Render expanded detail rows only for expanded clients instead of creating a hidden expanded row for every client.
- Reset page number when search/filter/type changes.

### 2. Make search and filter interactions feel instant
- Use deferred search/filter values so typing does not block the UI.
- Memoize the visible page slice and map payloads.
- Add longer `staleTime`/`gcTime` to stable client directory and price-list queries so back/close/reopen does not refetch unnecessarily.

### 3. Move dashboard calculations off the hot path
- Stop loading broad order summary rows on the clients page just to calculate cards/top clients.
- Replace that with a small server-side aggregate/RPC or a narrowly scoped query that returns only:
  - ticket promedio
  - pedidos por cliente
  - cliente más frecuente
  - total active clients
  - top clients by sales
- Keep cards showing full data, not just the 100 visible rows.

### 4. Make client click/open smooth
- On row click, open the Client 360 drawer immediately using the already-loaded client row as an instant header/placeholder.
- Let heavier sections load progressively inside the drawer.
- Keep the drawer mounted only when needed and avoid mounting expensive tabs/panels until selected.

### 5. Optimize full client detail route
- Limit the visible orders table to recent orders and fetch total counts/stats separately.
- Avoid fetching all orders just to derive the recent order IDs.
- Keep KPI numbers accurate by using server-side totals where needed.

### 6. Add targeted database indexes if missing
- Check existing indexes first.
- Add only missing indexes for the hot access patterns, likely around client/order detail reads such as `orders.client_id + order_date`, `order_items.order_id`, and equivalent `pedidos/facturas` client/date lookups.

### 7. Validate with the browser
- Open `/admin/clientes`.
- Click a client, close the drawer, click another client, and navigate to the full ficha.
- Confirm the first click shows immediate feedback and repeat interactions do not stall.