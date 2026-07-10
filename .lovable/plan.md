## Fix "BULTOS DISPONIBLES" white panel on mobile catálogo

### Diagnosis

The stray white panel showing only "BULTOS DISPONIBLES" is the **Availability dialog** (`AvailabilityDownloadDialog`) opened from the catálogo toolbar. It was built for desktop only:

- `DialogContent` uses `max-w-5xl` with `!overflow-hidden` and no mobile width strategy.
- Internal preview uses `<div className="min-w-[700px]">` with a 6-column grid (`grid-cols-[36px_100px_1fr_80px_110px_130px]`). On a ~390px mobile viewport this forces horizontal overflow that gets clipped, leaving mostly whitespace with just a fragment of the header (the "Bultos disponibles" column label) and the last column visible.
- Date picker `SelectTrigger` is `w-[320px]` (fixed) — pushes the dialog wider than needed on small screens.
- Header row and footer buttons are `flex flex-wrap` with desktop spacing.

Nothing else on `/admin/catalogo` renders the phrase "bultos disponibles" (`rg` confirmed), so this is the source.

### Changes (single file: `src/components/AvailabilityDownloadDialog.tsx`)

1. **Dialog shell** — make it phone-friendly:
   - `DialogContent` classes: `w-[calc(100vw-1rem)] sm:w-full sm:max-w-5xl max-h-[90vh] p-4 sm:p-6 flex flex-col`.
   - Keep `!overflow-hidden` so only the middle region scrolls.

2. **Header/date row** — stack on mobile:
   - Wrap the date `Select` and count in `flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end`.
   - `SelectTrigger` becomes `w-full sm:w-[320px]`.
   - Title font: `text-lg sm:text-xl`, allow wrap.

3. **Preview area** — dual layout (mirrors the pattern already used across admin routes):
   - Wrap the current 6-column grid in `<div className="hidden sm:block">` and drop `min-w-[700px]` (or replace with `sm:min-w-[700px]` inside an `overflow-x-auto` wrapper for desktop-only horizontal scroll).
   - Add a `sm:hidden space-y-2` card list below `sm`. Each card:
     ```
     ┌──────────────────────────────────────────┐
     │ [thumb]  CLAVE (mono, primary)           │
     │          Producto name (wraps, 2 lines)  │
     │ ─────────────────────────────────────    │
     │ Peso   ·   Precio   ·   Bultos [badge]   │
     └──────────────────────────────────────────┘
     ```
     Uses the same `bucketTextClass` color for the bultos badge, `tabular-nums` for numbers, `truncate` / `line-clamp-2` for text.
   - Reuse `ProductThumb size="sm"` (leaves size unchanged).

4. **Footer buttons** — reflow:
   - `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 pt-3 border-t border-border`.
   - Buttons become `w-full sm:w-auto`.

### Out of scope

- No changes to catálogo page itself, to logic, to queries, or to Excel/PNG export code. The PNG export renders via `printRef` which we don't touch — it still exports at desktop width (that's intentional for the shareable image).

### Verification

- `bunx tsgo --noEmit`.
- Open `/admin/catalogo` at 390×844, click **Disponibilidad**: confirm dialog fills viewport with padding, date picker is full-width, product rows render as stacked cards (no horizontal clipping, no floating "BULTOS DISPONIBLES" fragment), and the Excel / Imagen buttons stack full-width.
- At `≥sm`, confirm the original table layout and button row are unchanged.
