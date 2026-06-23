## Goal

Turn the three KPI cards on `/admin/productos` (Valor Total en Bodega, Comprometidos, Distribución por Producto) into clickable, "live" cards. Clicking any card opens a rich detail dialog with deeper breakdowns and dynamic charts (using `recharts`, already used elsewhere in the project).

## Changes — `src/routes/admin.productos.tsx` only

### 1. Make KpiCard clickable
- Add `onClick` + hover affordance (cursor-pointer, hover:shadow, subtle ring, "Ver detalle →" hint in corner).
- Keep current visual style intact.

### 2. New state
- `detailOpen: "valor" | "comprometidos" | "distribucion" | null`.

### 3. Derived data (memoized from existing `productos`)
- **Valor card**: top 10 products by `_valor`, value by marca (bar), value by linea (donut), totals (# productos con stock, valor promedio, stock total).
- **Comprometidos card**: top productos con mayor `stock_comprometido`, distribución comprometido vs disponible (stacked bar), totals (productos con compromiso, ratio comprometido/disponible).
- **Distribución card**: full marca ranking (not just top 10), donut chart of all marcas, bar chart productos por línea, productos por tipo, % activos vs inactivos.

### 4. Detail dialog component
- One `<Dialog>` rendered conditionally based on `detailOpen`.
- `max-w-5xl`, scrollable, header with icon + title matching the card.
- Sections: summary stat row + 2–3 charts from `recharts` (`BarChart`, `PieChart`, horizontal bar list for top items) using existing semantic tokens / `colorFor(marca)`.
- "Ver todos los productos" button that closes dialog and applies relevant filter (e.g. comprometidos → `setEstadoFilter("comprometidos")`).

### 5. Live behavior
- Data is already reactive via `useQuery(["productos-catalogo"])`; the dialog reads from the same memoized derivations, so values update on refetch automatically. No new server calls.

## Technical notes
- Reuse already-imported icons (`DollarSign`, `AlertCircle`, `BarChart3`) and `colorFor`, `mxnFmt`, `numFmt`.
- Import `recharts` primitives at top of file (project already depends on it).
- No schema / server / routing changes. Frontend-only.
