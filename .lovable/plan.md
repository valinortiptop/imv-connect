## What's off vs. the reference

Comparing the current `/admin/clientes-dashboard` (image-217) to the ALPHA/NetSuite reference (image-216):

1. **Too wide** — 7 columns × 180px overflows the content area, so "Notas de venta" and "Aplicación de cobranza" get clipped and the user has to scroll horizontally. The reference fits the whole flow in one viewport.
2. **Icons too small relative to gaps** — reference icons visually almost touch their neighbors; ours float in the middle of oversized cells, making arrows look like faint dashes.
3. **Arrows too thin and too short** — reference arrows are chunky, dark, and clearly connect icon-to-icon. Ours are 3px muted-foreground at 0.85 opacity, and the padding (`ICON/2 + 6`) leaves a large empty gap so the arrow reads as a hyphen.
4. **Arrowheads undersized** — 7×7 marker on a 3px stroke barely registers; reference arrowheads are big filled triangles.
5. **Green chevron badge** — ours renders as a bordered rectangle with a tiny chevron. Reference is a flatter, wider pill with a bigger ▽ glyph, sitting flush under the label.
6. **Row spacing** — reference rows are tighter vertically; ours has ~160px row height that spreads the three rows too far apart.
7. **Color** — reference arrows are near-black gray (`#555`-ish), not the theme's muted-foreground which reads too light on white.

## Fix (single-file change to `src/components/dashboards/FlowDiagram.tsx`)

**Geometry**
- Shrink cell to `CELL_W = 150`, `CELL_H = 130` → total 1050×390, fits the admin content area without horizontal scroll on a 1280px+ viewport (keep the `overflow-x-auto` fallback for narrow screens).
- Bump icon to `ICON = 88` and shrink arrow padding to `ICON/2 + 2` so arrows start/end right at the icon edge — short, punchy segments like the reference.

**Arrows**
- Stroke: `#4b5563` (slate-600) at `strokeWidth={4}`, opacity `1`, round caps.
- Arrowhead marker: `12×12` viewBox, `markerWidth/Height = 10`, `refX = 9`, filled `#4b5563`. Big enough to read as a real triangle.
- Keep the orthogonal path builder; just verify same-row/same-col paths are truly horizontal/vertical (currently the same-row branch mistakenly uses `p2.y` for the end Y — should be `p1.y`; that's why some arrows look slightly diagonal).

**Green chevron pill**
- Wider flat pill: `h-3.5 w-7`, `rounded-[3px]`, border `emerald-500/70`, bg `emerald-500/15`, chevron `10×6` at `stroke-width 2`. Sits `mt-0.5` under the label so it feels attached, not floating.

**Node**
- Reduce label max-width to `130px`, font `11px`, tighter `leading-tight`, so two-line labels don't push the chevron down and break the grid rhythm.
- Keep count badge, but make it `bg-foreground/90` and slightly smaller (`min-w-[18px]`, `text-[9px]`) so it doesn't compete with the icon.

**No data changes** — `admin.clientes-dashboard.tsx` and `admin.almacen-dashboard.tsx` keep their existing `nodes` / `edges` arrays. Almacén dashboard inherits the same visual polish for free.

## Verification

Load `/admin/clientes-dashboard` at ≥1280px width and confirm:
- Full 7-column flow visible without horizontal scroll.
- Arrows are visibly bold and clearly connect adjacent icons.
- Green chevron pills sit directly under each active label.
- Layout reads as one continuous flowchart, matching image-216.

## Out of scope

- Icon artwork (already correct).
- Node/edge topology (already matches the reference).
- Almacén dashboard node data — it will inherit the visual fix automatically.
