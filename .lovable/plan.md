# Por qué no lo ves

El drawer 360 y los nuevos campos de taxonomía (`linea`, `grupo`, `tipo_producto`, `sat_clave`) se conectaron en dos páginas:

- `/admin/catalogo` (`src/components/catalogo-page.tsx`) — vista tipo tarjetas del catálogo público.
- `/admin/inventario` (`src/components/inventory-page.tsx`) — vista de inventario con stock.

Pero la página que estás viendo, **`/admin/productos`** (`src/routes/admin.productos.tsx`), nunca se tocó. Por eso no aparece el 360 ni las nuevas columnas ahí.

# Plan

Agregar todo lo nuevo a `/admin/productos` para que sea consistente.

## 1. Drawer 360
- Importar `Product360Drawer` desde `@/components/catalog/Product360Drawer`.
- Estado `const [drawerId, setDrawerId] = useState<string | null>(null)`.
- En la tabla, hacer clickeable el SKU (o nombre/thumb) para `setDrawerId(p.id)`.
- Renderizar `<Product360Drawer productId={drawerId} open={!!drawerId} onOpenChange={(o) => !o && setDrawerId(null)} />` al final del componente.

## 2. Columnas de taxonomía en la tabla
- Extender el tipo `Producto` con `linea`, `grupo`, `tipo_producto`, `sat_clave` (todos `string | null`).
- Añadir columnas (toggleables vía un dropdown "Columnas" o siempre visibles, lo más simple primero): **Línea**, **Grupo**, **Tipo**, **SAT**.
- Mostrar como `<Badge variant="outline">` para que sean compactos.

## 3. Filtros adicionales
Junto a los selects existentes (Proveedor, Marca), agregar tres más:
- **Línea** (`lineaFilter`)
- **Grupo** (`grupoFilter`)
- **Tipo de producto** (`tipoFilter`)

Calcular las opciones únicas en el `useMemo` de `marcas/proveedores`.

## 4. Edit drawer / Nuevo producto
En el formulario de edición y creación (más abajo en el archivo, lo reviso al implementar), añadir inputs para los 4 nuevos campos para que el admin pueda editarlos a mano (especialmente `linea` que quedó nulo).

# Archivos a editar
- `src/routes/admin.productos.tsx` — único archivo.

No requiere migraciones ni cambios de backend; los datos ya están en `productos`.
