# Mobile Responsiveness — Main Admin App

Match the treatment we did in the rep panel: shell adapts to phones, tables collapse into stacked cards below `sm`, headers/toolbars reflow, spacing tightens.

## Scope

**Shell (applies to every admin route):**
- `src/routes/admin.tsx` — header, main padding, mobile trigger.
- `src/components/admin-sidebar.tsx` — offcanvas drawer on mobile, sticky trigger always visible.

**Top 15 routes to hand-tune:**
1. `admin.index` (dashboard)
2. `admin.pedidos` + `admin.pedidos.$id`
3. `admin.clientes` + `admin.clientes.$id`
4. `admin.inventario`
5. `admin.compras.index`
6. `admin.cobranza`
7. `admin.facturas` + `admin.facturas.$id`
8. `admin.productos`
9. `admin.catalogo`
10. `admin.promos`
11. `admin.tareas`
12. `admin.almacen`
13. `admin.bancos.index`
14. `admin.prospectos`
15. `admin.cuenta`

Any other admin route inherits the shell + shared table/card primitive automatically, but is not individually hand-tuned in this pass.

## Approach

### 1. Shared responsive primitives (new)

Create `src/components/ui/responsive-table.tsx` exporting:
- `<ResponsiveTable>` — renders a real `<table>` at `sm+`, and a stacked card list under `sm`.
- Column config: `{ key, label, render?, priority?: 'primary' | 'secondary' }`. Primary column becomes the card title; the rest become label/value rows.
- Row action slot (`renderActions`) rendered as a footer strip in card mode, action cell in table mode.

Create `src/components/ui/page-header.tsx`:
- Responsive header row: title + actions. Uses the grid pattern from responsive-layout knowledge (`grid-cols-[minmax(0,1fr)_auto]` on mobile → `flex` at `sm`). Actions wrap to a second row on mobile.

Create `src/components/ui/filter-bar.tsx`:
- Wraps toolbar filters: horizontally scrolls on mobile (`flex flex-nowrap overflow-x-auto -mx-4 px-4 snap-x`), collapses into a full-width stack when the caller opts in.

### 2. Shell changes

`src/routes/admin.tsx`:
- Header: keep `SidebarTrigger` (already visible with offcanvas).
- Main: `px-3 sm:px-6 py-4 sm:py-8`.
- Add a bottom safe-area padding so the sidebar drawer overlay doesn't clip content.

`admin-sidebar.tsx`:
- Already `collapsible="offcanvas"` — good for mobile. Verify the drawer closes on route change (add `onOpenChange` reset via `useEffect` on pathname if needed).
- Tighten section labels and menu button font sizes at mobile.

### 3. Per-route hand-tuning pattern

For each of the 15 routes:
- Replace ad-hoc `<table>` blocks with `<ResponsiveTable>` (columns declared once).
- Wrap top-of-page title/actions with `<PageHeader>`.
- Wrap filter/search toolbars with `<FilterBar>`.
- Convert grid stat cards to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` with condensed padding on mobile.
- Detail pages (`pedidos.$id`, `clientes.$id`, `facturas.$id`): 2-column layouts become single column under `md`; tab strips become horizontally scrollable.
- Dialogs / sheets: verify `max-h-[90vh] overflow-y-auto` and full-width on mobile.

### 4. Global CSS tweaks

`src/styles.css`:
- Add a utility `.no-scrollbar` for horizontally-scrolling toolbars.
- Ensure body `overflow-x-hidden` to prevent stray horizontal scroll on phones.

## Non-goals

- Not redesigning any module's information architecture.
- Not touching business logic, queries, or server functions.
- Contabilidad, admin utilities, gandalf, estado-apis, and other lower-traffic pages are not hand-tuned this pass — they inherit the shell only.

## Verification

- `bunx tsgo --noEmit` after edits.
- Playwright screenshot check at 390×844 (iPhone) on: `/admin`, `/admin/pedidos`, `/admin/clientes`, `/admin/inventario`, `/admin/compras`, `/admin/cobranza` — confirm no horizontal scroll, drawer opens/closes, tables render as cards.
