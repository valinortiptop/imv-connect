
# Rep panel mobile responsive plan

Scope: every `/rep/*` route + shared components. Admin panel is a separate plan (later).

Approach: **single component tree, Tailwind `md:` breakpoints + `useIsMobile()` where the DOM differs too much**. Cards on mobile, tables on desktop. Base breakpoint: `md` (768px) — matches existing `RepLayout`.

---

## 1. Global chrome (`RepLayout.tsx`)

Fixes that pay off on every page:

- **Bottom nav "Más" slot.** Replace the 5th item (`Inventario`) with a `Más` button that opens a full-height `Sheet` (bottom → top). Sheet lists every desktop-only route grouped by section: *Ventas* (Cotizaciones, Cobranza, Devoluciones, Prospectos), *Operación* (Calendario, Catálogo, Inventario, Plan semanal, Cierre de día), *Inteligencia* (Laboratorios, Competencia, Metas, Coach IA, Supervisor). Auto-close on nav.
- **Bottom nav polish.** Add `pb-[env(safe-area-inset-bottom)]`, active-state accent bar above the icon, `min-h-14` touch target, hide labels only when there are 6+ items (keep 5 slots → labels stay).
- **Mobile header.** Widen to `h-14`, drop the raw geo coords (`lat, lng`) — replace with a `MapPin` icon that pulses when active, tap to refresh. Keeps room for AI toggle + bell without overflow. Add a page-title slot so each route can inject its own H1 there (removes duplicate titles below).
- **Main padding.** Increase mobile bottom padding from `pb-20` to `pb-24` to clear the taller nav.
- **Body scroll containment.** Add `min-h-0` to the main column so long lists inside cards can scroll independently.
- **Sidebar (desktop only).** Unchanged — already fixed last turn.

---

## 2. `rep.index.tsx` — Home / Dashboard (`RepDashboard.tsx`)

- **Stat cards:** currently `grid-cols-2 md:grid-cols-4`. Change to a horizontal **scroll-snap rail** on mobile (`flex overflow-x-auto snap-x snap-mandatory` with `snap-start` cards, `w-[45%]`), grid on `md:`. Frees vertical space above the AI plan.
- **AI Plan list:** each row grows a **swipe-hint chevron** and increases padding to `p-3` → `p-4` on mobile. `text-xs` reason clamped to 3 lines on mobile (currently 2), badge wraps below name if width < 380px (already handled by flex-wrap).
- **"Laboratorios en riesgo" + "Recompras próximas"** — stack on mobile (already `md:grid-cols-2`), but wrap both in a **tabs component** on mobile (`Tabs` with two triggers) to reduce vertical scroll. Desktop unchanged.

---

## 3. `rep.clientes.index.tsx` — `ClientList.tsx`

- Filters bar (search + segment chips) becomes **sticky** on mobile: `sticky top-14 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur`.
- Segment chips become a **horizontal scroll rail** with snap; add a "Filtros" button that opens a `Sheet` for advanced filters (segmento, riesgo, laboratorio).
- Client rows already render as cards — verify `truncate` on name, `shrink-0` on avatar/badge; add `line-clamp-1` on the address line.
- **FAB** (`+` new prospect) fixed bottom-right, above bottom nav (`bottom-24 right-4`).

## 4. `rep.clientes.$id.tsx` — `ClientDetail360.tsx`

Biggest offender. Currently multiple side-by-side panels.

- **Header:** switch to `grid-cols-[minmax(0,1fr)_auto]` with `truncate` on `nombre_comercial`, action buttons collapse into an overflow `DropdownMenu` on mobile (Check-in, Cotización, Pedido, Compartir).
- **Sticky mobile action bar** at bottom (above nav): primary CTA **"Check-in"**, secondary **"Nuevo pedido"** — always accessible while scrolling long detail.
- **Tabs:** convert the current section grid into a `Tabs` on mobile — *Resumen · Compras · Precios · Comportamiento · Notas*. Keeps single-scroll behavior. Desktop keeps the multi-column grid.
- **Behavior panel, missed opps, subs, coll priority** — each already Card-based; add `min-w-0` where needed, tighten padding on `<md`.
- **Money figures**: use `tabular-nums` and reduce from `text-2xl` to `text-xl` on mobile.

## 5. `rep.ruta.tsx` — `RouteMap.tsx`

- **Map full-bleed** on mobile: `-mx-4 h-[60vh]` with the toolbar (Optimizar, Ruta con IA, contador) collapsed into a **floating pill** overlay at top of the map.
- **Client list beneath map**: becomes a `Sheet` triggered by a "Ver clientes (N)" bottom-sheet handle (drag handle visible). Desktop keeps side-by-side layout.
- **AI rationale block**: on mobile appears inside the sheet, not pushing the map down.

## 6. `rep.visitas.tsx` — `VisitsList.tsx`

- Add a **date-grouped list** with sticky day headers on mobile (`Hoy`, `Ayer`, `dd MMM`).
- Cards get a small colored left-bar mapped to `outcome` (venta, sin_venta, seguimiento).
- Duration + timestamp on one line with `tabular-nums`.

## 7. `rep.cotizaciones.tsx`

- Header CTA "Nueva desde cliente" → icon-only on `<sm`, full label on `md+`.
- Grid `md:grid-cols-2` already fine. Add `flex-wrap` guard for the total row; use `tabular-nums`.
- Action buttons (`ShareTicketButton`, "Convertir a pedido") stack vertically on `<sm` with full width.

## 8. `rep.cobranza.tsx`

- Table → **card list on mobile**. Each card: cliente + saldo (right, bold, tabular), badge for antigüedad (0-30 / 31-60 / 60+), row of actions (Registrar pago, Recordatorio) as icon buttons.
- Summary chips (total vencido / por cobrar) → horizontal scroll rail on mobile.
- Desktop keeps existing table.

## 9. `rep.devoluciones.tsx`

- Wizard-like flow already; on mobile use a **single-column stepper** (`Steps` component) with a sticky bottom "Siguiente / Guardar" bar.

## 10. `rep.prospectos.tsx`

- Same treatment as `rep.clientes.index.tsx`: sticky filter, card list, FAB.
- The "convert to client" dialog becomes a `Sheet` on mobile (full height).

## 11. `rep.calendario.tsx` — `CalendarView.tsx`

- Month grid unreadable at <640px. On mobile: **agenda-list view** (day rows with events grouped) by default; add a small toggle chip [Mes | Semana | Agenda] where **Agenda is default on mobile, Mes on desktop**.
- Day cells on mobile force `aspect-square` with only a dot per event count.

## 12. `rep.catalogo.tsx`

- Product grid: `grid-cols-2` on mobile (currently likely `md:grid-cols-3` or 4). Ensure image `aspect-square object-cover`, name `line-clamp-2`, price `tabular-nums`, add-to-cart as a full-width button at card bottom.
- Search + filters → sticky sub-header with `Sheet` for filters.
- Cart drawer already used; verify it opens as a full-height `Sheet` on mobile with a sticky "Enviar cotización / pedido" CTA.

## 13. `rep.inventario.tsx` — `InventoryQuickLookup.tsx`

- Search input full-width, sticky on mobile.
- Result rows: card format (SKU + nombre + stock badges per almacén). Table only on `md+`.
- Barcode-scan button (if present) becomes a large FAB.

## 14. `rep.plan.tsx` — Weekly plan

- Board of 7 columns doesn't fit mobile. Convert to a **tab bar of day chips** (Lun–Dom) with sticky top, one day visible at a time. Desktop unchanged.
- Client cards within a day: horizontal drag disabled on mobile, use "Mover" menu instead.

## 15. `rep.laboratorios.tsx` — `LabRiskPanel`

- Already card-based; ensure charts inside cards use `ResponsiveContainer` with `min-w-0`. Legend below chart on mobile, right side on desktop.

## 16. `rep.competencia.tsx` — `CompetitiveLandscape.tsx`

- Any table converts to cards (competitor name, share %, trend arrow, last-seen). Filter chips → scroll rail.
- Capture dialog (`CompetitorCaptureDialog`) → open as full-screen `Sheet` on mobile so the camera + form fit.

## 17. `rep.metas.tsx`

- Big number KPIs stack single-column on mobile with progress bars full-width. Reduce hero number from `text-4xl` to `text-3xl` on `<sm`.

## 18. `rep.cierre.tsx` — Day close

- Multi-section summary → collapsible `Accordion` sections on mobile (default first section open). Sticky bottom "Cerrar día" CTA.

## 19. `rep.coach.tsx` — Coach IA

- Chat surface: input row becomes fixed bottom (`fixed inset-x-0 bottom-16 md:static`) above bottom nav, respecting `env(safe-area-inset-bottom)`. Message list uses `min-h-0 flex-1 overflow-y-auto`.
- Suggestion chips scroll horizontally above input.

## 20. `rep.supervisor.tsx` — `SupervisorDashboard.tsx`

- Table converts to cards on mobile: one card per rep with the 7 metrics rendered as a compact 2-col grid (`Visitas: 42 · Pedidos: 12 · Ratio: 29% · …`). Desktop keeps table.
- Period toggle (7/30/90d) stays as chips (already fine).

---

## Shared component polish

- **`ShareTicketButton`** — ensure the resulting share sheet triggers Web Share API on mobile (`navigator.share`) and falls back to the current dropdown on desktop.
- **`CheckInDialog`, `VisitFormFiller`, `OrderQuickCreate`, `ShelfPhotoUploader`, `SignaturePad`, `EvidenceUploader`** — every dialog opens as a **full-height `Sheet` on mobile** (`side="bottom"` with `h-[100dvh]`), keeps `Dialog` on desktop. Add a thin `useIsMobile()` wrapper (`ResponsiveDialog`) so we don't duplicate content.
- **`NotificationBell`** dropdown → `Sheet` on mobile so items are tap-friendly.
- **`AICopilotDrawer`** — already a drawer; verify it uses `100dvh` and has safe-area padding.

---

## Cross-cutting rules to apply everywhere

- Add `min-w-0` on any flex/grid text container, `shrink-0` on icons/avatars, `truncate` or `line-clamp-*` on any headline that can overflow.
- Replace ad-hoc `text-2xl` headlines with `text-xl md:text-2xl`.
- Money and counts → `tabular-nums`.
- Every fixed bottom element → `pb-[env(safe-area-inset-bottom)]`.
- Every scroll rail → `snap-x snap-mandatory` + `[&>*]:snap-start`.
- Every table wrapped for mobile → `hidden md:table` desktop, `md:hidden` card list mobile, both fed by the same query result.
- Preview device switched to mobile at the start of the build so we can verify each page (`preview_ui--set_preview_device_viewport`).

---

## Technical notes (for the record)

- No new deps required — `Sheet`, `Tabs`, `Accordion`, `DropdownMenu`, `Drawer` already available via shadcn.
- New shared file: `src/components/rep/mobile/MoreSheet.tsx` (the "Más" drawer nav).
- New shared file: `src/components/ui/responsive-dialog.tsx` (Dialog on desktop / Sheet on mobile wrapper) — used by all rep dialogs.
- No server function / DB changes. No business logic changes. Frontend + presentation only.
- No changes to admin panel routes.
- Verify each page in a mobile viewport via Playwright screenshots after implementation, in batches of ~5 pages.

## Build order

1. Global chrome (RepLayout + MoreSheet + ResponsiveDialog) — unlocks everything else.
2. Home, Clientes (index + detail), Ruta, Visitas — highest-traffic field pages.
3. Ventas cluster: Cotizaciones, Cobranza, Devoluciones, Prospectos.
4. Operación: Calendario, Catálogo, Inventario, Plan, Cierre.
5. Inteligencia: Laboratorios, Competencia, Metas, Coach, Supervisor.
6. Shared dialogs migrated to `ResponsiveDialog`.
7. Screenshot verification pass at 375×812.
