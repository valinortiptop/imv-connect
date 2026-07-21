## Goal
Rebuild the two "General" dashboards (`/admin/clientes-dashboard`, `/admin/almacen-dashboard`) so they visually match the ALPHA ERP reference sketches: colorful 3D icons instead of monochrome Lucide glyphs, cleaner arrow layout, and the same node/edge topology already wired to live counts and routes.

## 1. Icon library (`src/assets/flow-icons/`)

Use the user's 8 uploaded 3D icons via Lovable Assets pointers, then generate the remaining nodes in the same 3D-clay style (isometric, soft shadows, blue/teal/orange palette, transparent background).

Mapping of uploaded icons:
- Address book (person) → **Clientes** / **Prospectos** (tinted variant)
- Invoice with $ → **Facturas** / **Notas de venta**
- Doc with % + refresh → **Devoluciones, descuentos y anticipos** / **Cotizaciones**
- Hand truck with box → **Remisiones**
- Doc with person + box check → **Pedidos**
- Warehouse → **Almacenes**
- Forklift → **Movimientos**
- (spare) → reuse for **Inventario físico** check clipboard

Icons to generate (fast tier, transparent PNG, matching 3D-clay style):
Clientes dashboard: Seguimientos de notas, Seguimiento de cotizaciones, Consignaciones, Devolución de consignaciones, Mapas de entrega, Guías de embarque, Productos/servicios, Seguimiento de CxC, Relación masiva de depósitos, Aplicación de cobranza, Notas de cargo.
Almacén dashboard: Integración de costos, Inventario físico, Consulta de inventario, Guías de embarque (reuse), Productos/servicios (reuse).

Each icon saved as `src/assets/flow-icons/<slug>.png` with matching `.asset.json` pointer.

## 2. `FlowDiagram` component update

Extend `FlowNode` to accept either a `LucideIcon` or an image URL:
```ts
icon: LucideIcon | { src: string; alt?: string };
```
Renderer picks `<img>` (h-12 w-12, drop-shadow) when object, else the existing Lucide path. Node card gets slightly bigger padding and a taller minRow to give the 3D icons room. Everything else (grid, edges, counts, accents) stays.

## 3. Route rewires

Update `src/routes/admin.clientes-dashboard.tsx` and `src/routes/admin.almacen-dashboard.tsx`:
- Swap each node's `icon:` to the corresponding image asset.
- Keep current `col`/`row`, `to`, `count`, `accent`, edges (topology already matches the reference).
- Bump card size (via FlowDiagram) so the diagram breathes like the sketch.

## 4. Out of scope
No route/data/logic changes. No sidebar changes. Business rules (inventory/accounting triggers) untouched.

## Technical notes
- Icon generation via `imagegen--generate_image` fast tier, 1024×1024, `transparent_background=true`, prompt template: *"3D clay-style app icon, soft matte plastic, isometric, blue/teal/orange palette, subtle drop shadow, centered on a clean transparent background — <subject>"* to keep the set visually consistent.
- Assets registered with `lovable-assets create` so binaries stay out of the repo; imported as `import icon from "@/assets/flow-icons/xxx.png.asset.json"` and passed as `{ src: icon.url }`.
