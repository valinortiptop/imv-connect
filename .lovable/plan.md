
## Goal

Build two new interactive flow-diagram dashboards mirroring Eduardo Islas's reference diagrams and close the wiring gaps he identified around minute 53:00 of the call: **remisión must affect almacén**, **factura must post costo de venta a contabilidad**, and **cobranza must post ingreso a contabilidad**.

---

## Part 1 — New dashboards (visual layer)

### 1.1 Clientes Dashboard (`/admin/clientes-dashboard`)
Interactive node/arrow diagram matching the reference (image-206). Each node is a large icon tile with label + live count badge, connected by SVG arrows, clickable → routes to the existing module.

Nodes and their existing routes:

```text
Prospectos ─┐
            ├─► Clientes ─► Cotizaciones ─► Pedidos ─► Remisiones ─► Facturas ─► Seguimiento CxC ─► Aplicación de cobranza
Seguim. notas ┘                                            │                        │                        │
                                                     Guías embarque         Devoluciones/NC          Notas cargo/cheques dev.
                                                                             Consignaciones
```

Route mapping (all existing):
- Prospectos → `/admin/prospectos`
- Clientes → `/admin/clientes`
- Cotizaciones → `/rep/cotizaciones` (or new placeholder)
- Pedidos → `/admin/pedidos`
- Remisiones → `/admin/logistica`
- Guías de embarque → `/admin/maniobra`
- Facturas → `/admin/facturas`
- Seguimiento CxC → `/admin/credito-cobranza/cartera`
- Aplicación de cobranza → `/admin/credito-cobranza/gestiones`
- Devoluciones/descuentos/anticipos → `/admin/devoluciones/lista`
- Notas de cargo / cheques devueltos → `/admin/credito-cobranza/complementos`

Each tile fetches a live count (pending pedidos, facturas del mes, cartera vencida, etc.) via a single `getClientesDashboardCountsFn` server function.

### 1.2 Almacén Dashboard (`/admin/almacen-dashboard`)
Same treatment for image-207:

```text
                Integración de costos
                        ▲
Almacenes ─► Movimientos ─► Inventario físico ─► Consulta de inventario
                        ▼
                 Guías de embarque
Productos/servicios (standalone tile)
```

Route mapping:
- Almacenes → `/admin/almacenes`
- Movimientos → `/admin/kardex`
- Integración de costos → `/admin/compras/costos`
- Inventario físico → `/admin/inventario`
- Consulta de inventario → `/admin/almacen`
- Guías de embarque → `/admin/maniobra`
- Productos/servicios → `/admin/productos`

Live counts via `getAlmacenDashboardCountsFn` (movimientos hoy, stock crítico, valor inventario, etc.).

### 1.3 Reusable component
`src/components/dashboards/FlowDiagram.tsx` — takes a `nodes[]` and `edges[]` config, renders a responsive SVG-arrow layout with lucide icons, count badges, and hover states using semantic tokens. Both dashboards import it with different configs.

### 1.4 Sidebar
Add two entries at the very top of the General group in `src/components/admin-sidebar.tsx`, and seed them into `permission_routes` via migration:
- `navClientesDashboard` → `/admin/clientes-dashboard` (LayoutDashboard icon)
- `navAlmacenDashboard` → `/admin/almacen-dashboard` (Warehouse icon)

---

## Part 2 — Critical wiring gaps (per Eduardo Islas 00:53:38)

The accountant's flow requires each commercial step to have its accounting/inventory counterpart. Current gaps in the codebase:

### Gap A — Remisión → movimiento de almacén (salida)
**Now:** `stock_deliveries` / `delivery_trips` exist but do not always write a `movimientos_inventario` row when a remisión is closed/entregada.
**Fix:** DB trigger `trg_remision_afecta_almacen` on `delivery_trips` (status → 'entregado'): inserts `movimientos_inventario` rows (tipo='salida_venta') per line and decrements `stock`. Idempotent.

### Gap B — Factura → póliza de costo de venta + IVA trasladado
**Now:** `facturas` posts an income póliza in some paths; costo de venta and IVA are inconsistent.
**Fix:** Server fn `postFacturaContableFn(facturaId)` (idempotent, keyed by `poliza.referencia`) that generates one póliza tipo='ingreso' with movements: DR Clientes / CR Ventas / CR IVA trasladado / DR Costo de venta / CR Inventario. Automatically invoked from Facturapi timbrado success callback. Config for the 4 account codes in `system_config`.

### Gap C — Cobranza → póliza de ingreso
**Now:** `pagos` applied to facturas but no `polizas` row.
**Fix:** Server fn `postPagoContableFn(pagoId)` posts póliza tipo='ingreso': DR Bancos / CR Clientes (+ CR IVA por trasladar → IVA trasladado shift when using flujo de efectivo). Idempotent. Called from `aplicarPagoMultiFn` after success.

### Gap D — Devoluciones / notas de crédito → póliza de egreso + entrada de almacén
**Fix:** Trigger on `devoluciones` estado='recibida' → póliza reversa + `movimientos_inventario` entrada.

### Gap E — Póliza classification (from same call, 00:27:13)
Ensure `polizas.tipo` is one of `ingreso | egreso | diario` and `polizas.estado_origen` is `automatica | manual | modificada`. Add if missing; backfill.

All Part 2 changes are single migration + 3 server functions + hooking them into their existing entry points (Facturapi callback, `aplicarPagoMultiFn`, devoluciones update flow). No UI changes to those modules beyond a small "estado contable" badge on facturas/pagos rows.

---

## Technical details

**Migration `0025_dashboard_routes_and_accounting_hooks.sql`:**
1. `INSERT INTO permission_routes` for the two new dashboards.
2. `ALTER TABLE polizas` add `estado_origen` enum column if missing; default `automatica`.
3. `CREATE TRIGGER trg_remision_afecta_almacen` on `delivery_trips`.
4. `CREATE TRIGGER trg_devolucion_afecta_almacen_y_poliza` on `devoluciones`.
5. `system_config` rows for account codes (`cuenta_clientes`, `cuenta_ventas`, `cuenta_iva_trasladado`, `cuenta_costo_venta`, `cuenta_inventario`, `cuenta_bancos_default`).

**New files:**
- `src/components/dashboards/FlowDiagram.tsx`
- `src/components/dashboards/clientes-dashboard.tsx`
- `src/components/dashboards/almacen-dashboard.tsx`
- `src/routes/admin.clientes-dashboard.tsx`
- `src/routes/admin.almacen-dashboard.tsx`
- `src/lib/dashboard-counts.functions.ts` (both count fns)
- `src/lib/contabilidad-hooks.functions.ts` (`postFacturaContableFn`, `postPagoContableFn`)

**Modified:**
- `src/components/admin-sidebar.tsx` — add two nav entries
- `src/lib/facturapi.functions.ts` — call `postFacturaContableFn` on timbrado success
- `src/lib/cobranza.functions.ts` (or wherever `aplicarPagoMultiFn` lives) — call `postPagoContableFn`
- `src/components/facturacion-page.tsx` — small "Contabilizada" badge

**Design:** Uses semantic tokens (`--primary`, `--muted`, `--card`, `--accent`). Arrows are SVG `<path>` with `stroke="hsl(var(--muted-foreground))"`. Node tiles use existing `Card`. Live in dark and light mode.

---

## Out of scope
- Redesigning existing modules
- New reporting or KPI widgets beyond count badges
- Editing the Facturapi API or Facturapi UI itself
- The other pending items from the call (Facturapi shortcut button, Reportar-fallas button, imports fix) — handled separately.
