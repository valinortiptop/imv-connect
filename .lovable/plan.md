# Catalog taxonomy + Product 360

Adapt the product catalog to IMV's veterinary taxonomy and add a 360° view modeled after Textile AI Hub's `Product360Drawer`.

## 1. Schema — new taxonomy columns on `productos`

Migration `db/migrations/0025_productos_taxonomy.sql`:

```sql
alter table public.productos
  add column if not exists linea text,            -- e.g. "Pequeñas Especies"
  add column if not exists grupo text,            -- e.g. "Receta Simple"
  add column if not exists tipo_producto text,    -- e.g. "ANTIBIÓTICO"
  add column if not exists sat_clave text;        -- e.g. "42121600 - Productos veterinarios"

create index if not exists productos_linea_idx on public.productos(linea);
create index if not exists productos_grupo_idx on public.productos(grupo);
create index if not exists productos_tipo_idx  on public.productos(tipo_producto);
```

`categoria` stays for legacy/free-form. The view `v_products_with_stock` is extended to expose the new columns (aliases: `linea`, `grupo`, `tipo_producto`).

## 2. Re-import taxonomy from existing catalog file

The uploaded `Catalogo productos 29 mayo.xlsx` headers are:
`Nombre | Nombre para mostrar | Clase | Grupo | Tipo de producto | SAT Clave Producto Servicio | Código de artículo de SuiteTax Latam Engine`

Mapping (one bulk UPDATE by SKU):
- `Clase` → already imported as `laboratorios` (marca). Keep.
- `Grupo` → `productos.grupo`
- `Tipo de producto` → `productos.tipo_producto` (and copy to `categoria` if empty)
- `SAT Clave Producto Servicio` → `productos.sat_clave`
- `Línea` is NOT in the file → left null for now, editable later from the product detail. (Screenshot showed "Pequeñas Especies" as a default — confirm if you want me to default `linea = 'Pequeñas Especies'` for every row.)

## 3. Onboarding importer (`src/lib/onboarding-import.ts`)

Extend `mapProductRow` to also map `linea`, `grupo`, `tipo_producto`, `sat_clave` so future re-imports of the same format populate them automatically.

## 4. Catalog page — `src/components/catalogo-page.tsx`

- Add filter chips: Línea, Grupo, Tipo de producto (driven by distinct values).
- Add optional columns (toggleable) for Grupo / Tipo.
- Row click opens the new Product 360 drawer (replaces current quick-view).

## 5. Product 360 drawer — `src/components/catalog/Product360Drawer.tsx`

Modeled after Textile AI Hub's `Product360Drawer` (Sheet, KPI strip, tabs). Sections:

- **Header**: image, nombre, SKU, marca/laboratorio, badges (Línea · Grupo · Tipo · IVA).
- **KPIs**: Precio c/IVA · Stock disponible · En camino · Comprometido · Margen.
- **Tabs**:
  1. *General* — descripción, presentación, especie, peso, unidad, SAT clave, proveedor.
  2. *Precios* — precio lista, listas de precios (`price_list_items`), overrides por cliente (`client_price_overrides`).
  3. *Stock* — por almacén (`stock`), últimos movimientos (`movimientos_inventario`), entradas (`stock_entries`).
  4. *Pedidos* — últimos `pedido_items` con cliente, cantidad, precio, fecha, estado.
  5. *Promos* — `product_promotions` activas.
- **Footer actions**: Editar producto, Ajustar stock, Ver kardex completo.

Data fetched via a single server function `getProduct360Fn` (`src/lib/products.functions.ts`) returning `{ product, stock_by_almacen, recent_movements, recent_orders, price_overrides, promotions, price_list_entries }`. Component uses `useServerFn` + `useQuery` (key `["product-360", id]`).

## 6. Admin products page

`src/routes/admin.productos.tsx` / `inventory-page.tsx`: add the same 360 drawer trigger from the row pencil/eye action, and surface Línea/Grupo/Tipo columns.

## Technical notes

- Server function lives at `src/lib/products.functions.ts` (client-safe path), with auth via `requireSupabaseAuth`.
- Drawer is reusable: imported by `catalogo-page`, `inventory-page`, and `kardex-page`.
- No destructive schema changes; all `add column if not exists`.

## Question before I build

The screenshot shows `Línea = "Pequeñas Especies"` but the file has no `Línea` column. Should I:
(a) leave `linea` null and let you set it per product later, or
(b) default `linea = 'Pequeñas Especies'` for all 1,084 rows now?
