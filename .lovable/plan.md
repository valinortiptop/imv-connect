## Problem

The current `FlowDiagram` renders its SVG arrow layer with `viewBox="0 0 100 100"` and `preserveAspectRatio="none"`, so strokes get squashed non-uniformly and arrowheads collapse into tiny dashes. Combined with wide grid gaps, the result on `/admin/clientes-dashboard` looks like icons floating with faint hyphens between them — nothing like the ALPHA ERP reference where thick dark arrows visibly connect adjacent icons and each node has a green dropdown chevron beneath it.

## Redesign approach

Rebuild `src/components/dashboards/FlowDiagram.tsx` around a fixed pixel grid so arrows render at real, uniform thickness — matching the reference exactly. No changes to node/edge data in the two dashboard route files; the diagram component alone drives the visual match.

### Layout

- Fixed cell size: `CELL_W = 170px`, `CELL_H = 150px` (icon ~72px + label + chevron).
- Grid container: `width = cols * CELL_W`, `height = rows * CELL_H`, no CSS aspect-ratio hack.
- Wrap in horizontal scroll container so 7×3 Clientes grid stays legible on narrower screens.
- Tight gaps (nodes sit at cell centers; icons ~80px so adjacent icons nearly touch, like the reference).

### Arrows (the main fix)

- SVG overlay sized to exact pixel dimensions of the grid, `viewBox` matching 1:1, `preserveAspectRatio="xMidYMid meet"`.
- Stroke: `hsl(var(--muted-foreground))` at `2.5px`, opacity `0.85`, round caps/joins.
- Real triangular arrowhead marker sized `10×10`, filled same color, placed at path end (and start when bidirectional).
- Orthogonal path builder unchanged in intent (straight for same row/col; L-shape with `hv`/`vh` bend) but computed in pixels with a proper icon-edge padding (`~44px`) so arrows land right at the icon border, short and punchy like the reference.
- For same-row adjacent nodes (the common case), arrows become short horizontal segments between icons — visually dominant, exactly matching the sketch.

### Nodes

- Column-flex: icon (72–80px, drop-shadow), label below (12px, medium), optional sublabel (10px muted).
- Add the small green dropdown chevron indicator (`▽` inside a rounded rectangle) below the label for active/linked nodes — this is the recurring visual motif in the reference under Consignaciones, Pedidos, Facturas, Remisiones, etc. Rendered as a tiny inline SVG, not clickable (decorative parity with reference).
- Count badge: keep, repositioned to top-right of icon (small, primary color).
- Disabled nodes: 45% opacity, no chevron, no link.
- Remove all remaining border/card styling and hover borders — just icon + text.

### Behavior preserved

- Same `FlowNode` / `FlowEdge` types → `admin.clientes-dashboard.tsx` and `admin.almacen-dashboard.tsx` need no data changes.
- Click on node still navigates via `<Link to={n.to}>`.
- Live counts from the existing `useQuery` still flow through.

### Files changed

- `src/components/dashboards/FlowDiagram.tsx` — full rewrite of layout + SVG (single file).

### Out of scope

- Icon assets (already correct).
- Dashboard node/edge topology (already matches the reference structure).
- Almacén dashboard grid — automatically inherits the same visual treatment.

## Verification

After the change I'll capture `/admin/clientes-dashboard` via Playwright at 1400px wide and compare against `image-215.png`: arrows must be visibly thick and connect adjacent icons directly, green chevrons must sit under labels, layout must read as one continuous flowchart instead of a sparse icon grid.
