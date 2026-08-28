# Mobile polish pass across the Panel Rep (and shared modals)

Goal: no more squeezed one-letter-per-line titles, no rows of icon buttons crushing text, and modals/wizards that fit the screen. Reviewed page by page, applying the same three responsive rules everywhere.

## What is actually broken (confirmed in the code)

- `TodayPlan` ("Ruta de hoy" card): the header is a `flex-row` with the two action buttons marked `shrink-0`, so on a phone the title column collapses and "Ruta de hoy" wraps one word per line — exactly what the screenshot shows.
- `SavedRoutesList` ("Rutas guardadas" rows): each row packs 6 non-shrinking controls (rename, Ver/Editar, print, PDF, duplicate, delete) next to the name, so the route name truncates to "R..." and the metadata wraps into a narrow column.
- Both are the same root cause: fixed-size widgets in a single row with no mobile stacking and no overflow strategy.

## Standard pattern to apply

1. Card headers: title block and actions stack on mobile (`grid` / `flex-col`), promote to a single row at `sm:`. Title gets `min-w-0` + `truncate`; icons get `shrink-0`.
2. Row actions on mobile: keep the 1-2 primary actions visible (Ver / Editar, check-in) and move the secondary ones (print, PDF, duplicate, delete, rename) into a "..." dropdown menu. Full icon row stays on `sm:` and up.
3. Touch targets minimum 36-40px, no `text-[10px]` for primary information, numbers stay `tabular-nums`.

## Pages to go through, in order

1. Visitas (`/rep/visitas`) — `TodayPlan` header, `SavedRoutesList` rows, `VisitsList` items.
2. Supervisor (`/rep/supervisor`) — remaining tabs: Rendimiento table (horizontal scroll wrapper + card layout on mobile), Actividad y dispositivos, Reporte, Asignaciones, Rutas históricas.
3. Inicio (`/rep`) — `RepDashboard` KPI cards and panels.
4. Ruta (`/rep/ruta`) — `RouteMap` toolbar, client picker, stop list, and `NewRouteWizardDialog` steps on small screens.
5. Clientes / Prospectos / Pedidos — table-to-card behavior, filter/sort bars that currently sit in one row.
6. Plan semanal, Calendario, Metas, Cobranza, Catálogo, Inventario, Competencia, Coach, Cuenta — same header/action sweep, lighter touch.
7. Shared dialogs: `CheckInDialog`, `Rep360Drawer`, `RouteDetailsDialog`, `Client360Drawer`, `NewOrderDialog`, `QuickProspectDialog` — verify each fits within `100dvh`, header does not collide with the close button, and footers/actions stay reachable (sticky footer where the body scrolls).

## Verification

Each page is checked at 390px width (phone), 768px (tablet) and desktop with a headless browser pass, looking for horizontal overflow, clipped text, and modals taller than the viewport. Fixes land page by page so nothing else regresses.

## Technical notes

- Presentation-only changes: Tailwind classes, plus adding `DropdownMenu` for the mobile overflow actions and `useIsMobile` where behavior must differ. No data, server-function, or business-logic changes.
- The shared `DialogContent` base already got viewport-safe width/height in the previous change; per-dialog overrides that reintroduce `w-full`/fixed heights get cleaned up as they are encountered.
