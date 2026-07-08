## Goal
Close the loop **Pedidos → Almacén → Facturación → Contabilidad** so a pedido created in `/pedidos` shows up automatically as an "Orden por surtir" on `/almacen`, moves through picking/dispatch, becomes an invoice on `/facturacion`, and posts a póliza in `/contabilidad`.

## Current state (what I found)

- `pedidos` table has 8 real rows (folios `p-1`…`p-8`), all with `estado = 'Nuevo'`.
- `/almacen` shows "No hay órdenes por surtir" because the RPC `list_orders_to_fulfill` (and ~5 other RPCs the panel uses) **do not exist in the database**. All the buttons on `OrdersToFulfillPanel` + `FulfillOrderDialog` are wired to functions that were never created.
- `crear_factura_desde_pedido(uuid)` already exists — it copies items and creates a `facturas` row. Not called anywhere from the UI right now.
- `polizas` / `poliza_movimientos` tables exist with recalc triggers, but nothing auto-creates a póliza when a factura is issued.
- Estados in `pedidos_stock_trigger` are lowercase (`confirmado`, `enviado`, `entregado`, `cancelado`) but the app writes `'Nuevo'`. Needs unification.

## Plan

### 1. Unify pedido lifecycle (single source of truth)
Introduce the canonical state machine on `pedidos.estado`:

```text
Nuevo → Surtiendo → Surtido → EnRuta ─┐
                              Entregado ─┼→ Facturado → Pagado
                              (Pickup)  ─┘
Cancelado (from any pre-invoice state)
```

- `Nuevo` = created in /pedidos, appears in /almacen as "por surtir".
- `Surtiendo` = at least 1 bulto picked to embarque.
- `Surtido` = all bultos picked, awaiting despacho / pickup.
- `EnRuta` / `Entregado` = physically left warehouse.
- `Facturado` = CFDI emitted (or draft factura created).

### 2. DB migration — Almacén RPCs
Create the missing functions the frontend already calls:

- `list_orders_to_fulfill(p_horizon_days int)` – returns pedidos in `Nuevo|Surtiendo|Surtido` with `delivery_date <= today + horizon`, joins `clientes`, aggregates bultos needed from `pedido_items` and picked from `slot_contents` where `kind='embarque'` and `pedido_id=`.
- `get_order_fulfillment_state(p_order_id uuid)` – per-line: needed vs in-embarque vs remaining.
- `suggest_source_slots_for_picking(...)` – FIFO by caducidad, smallest pile first, from `slot_contents`.
- `pick_order_item_to_embarque(...)` – moves qty from a source slot to the order's embarque slot, writes `slot_movements` (kardex), advances estado to `Surtiendo`.
- `dispatch_order(p_order_id uuid)` – flips estado to `EnRuta`, deletes embarque slot rows, writes final kardex "salida por pedido".
- `mark_pickup_delivered(p_order_id uuid)` – same but flips to `Entregado`.

### 3. DB migration — Facturación wiring
- Add helper `list_pedidos_por_facturar()` (returns pedidos in `Entregado`/`EnRuta` without an existing factura).
- Reuse existing `crear_factura_desde_pedido`; after success, flip `pedidos.estado='Facturado'`.
- Add trigger `facturas_after_stamp` → when `facturas.cfdi_status='timbrada'` (or `uuid_fiscal` fills), auto-create a póliza header + `poliza_movimientos` from a mapping table (fallback: hard-coded 105 Clientes / 401 Ventas / 208 IVA cuentas contables lookup by `codigo`).

### 4. Frontend wiring
- `/pedidos` order-detail sheet: add "Facturar" button (visible only when `estado in (Entregado,EnRuta)` and no factura exists).
- `/facturacion` page: add "Pedidos por facturar" tab using `list_pedidos_por_facturar`; clicking "Timbrar" calls `crear_factura_desde_pedido` → then existing timbrado flow.
- `/almacen` panel: works automatically once RPCs exist. No component changes needed.
- `/contabilidad`: no UI change — pólizas appear via the new trigger. Add a "origen: factura F-123" link in the póliza detail already shown.

### 5. Backfill
One-off SQL: keep the 8 existing pedidos as `Nuevo` so they immediately appear in /almacen.

## Technical notes

- All RPCs `SECURITY DEFINER`, `SET search_path=public`, `GRANT EXECUTE TO authenticated`.
- Kardex uses the existing `slot_contents` + `slot_movements` tables (already present with 12/10 columns). Embarque = a virtual slot per order, or `slot_contents` rows tagged `kind='embarque'` — I will confirm by reading the current slot_contents schema before writing SQL.
- No schema changes to `facturas`; only a new trigger.
- Cuentas contables lookup: read from `cuentas_contables` by SAT `codigo_agrupador` prefix. If a company hasn't seeded their catálogo, the trigger skips póliza creation instead of failing the timbrado.

## Out of scope for this pass
- Real CFDI/PAC integration (already exists via Facturapi fields on `facturas`).
- Pagos automáticos → póliza de ingreso (can be a follow-up).
- Partial invoicing (one factura per pedido for now).

## Rollout order (single approval → 2 migrations + 3-4 file edits)
1. Migration A: almacén RPCs + state machine.
2. Migration B: facturación helper + póliza trigger.
3. UI edits: OrderDetailSheet "Facturar" button, Facturación page "Pedidos por facturar" tab.
