# IVA + IEPS en importación de catálogo

Hoy `productos` guarda solo `iva_pct` (por defecto 16%) y la importación no reconoce IEPS ni la etiqueta "ITEM NORMAL". Con esta actualización el catálogo interpretará las 4 clasificaciones de SuiteTax y calculará precios y facturas con los impuestos correctos.

## Clasificaciones a soportar

Vienen en la columna "Código de artículo de SuiteTax Latam Engine":

| Etiqueta SuiteTax | IVA | IEPS |
|---|---|---|
| ITEM NORMAL | 16% | 0% |
| ITEM IVA 0% | 0% | 0% |
| ITEM IEPS 6% + IVA 0% | 0% | 6% |
| ITEM IEPS 6% + IVA 16% | 16% | 6% |

Fórmula estándar SAT: primero se suma IEPS al precio y sobre esa base se calcula IVA — `precio_final = precio_lista × (1 + IEPS) × (1 + IVA)`.

## Base de datos

Migración con dos columnas nuevas en `productos`:

- `ieps_pct numeric NOT NULL DEFAULT 0` — tasa IEPS del producto (0 o 6).
- `tax_regime text` — etiqueta original ("ITEM NORMAL", etc.) para trazabilidad y para poder re-importar sin ambigüedad.

Retro-relleno: los productos existentes quedan con `ieps_pct = 0` y `tax_regime = NULL` hasta que se re-suba el catálogo.

## Importación (`src/lib/onboarding-import.ts`)

`mapProductRow` ampliada:

1. Lee la columna SuiteTax normalizada (`codigo_de_articulo_de_suitetax_latam_engine`).
2. Detecta el régimen con regex sobre la etiqueta completa:
   - "ITEM NORMAL" → IVA 16, IEPS 0
   - "IVA 0%" sin IEPS → IVA 0, IEPS 0
   - "IEPS 6% + IVA 0%" → IVA 0, IEPS 6
   - "IEPS 6% + IVA 16%" → IVA 16, IEPS 6
3. Si la fila trae `iva` / `ieps` explícitos, esos ganan sobre la etiqueta.
4. Guarda `iva_pct`, `ieps_pct` y `tax_regime` en el upsert.

Fallback: si no viene columna SuiteTax ni columnas explícitas, mantiene el comportamiento actual (IVA 16, IEPS 0).

## UI del catálogo

- **`admin.productos.tsx`**: agregar columna/filtro por régimen fiscal ("Normal", "IVA 0%", "IEPS 6%+IVA 0%", "IEPS 6%+IVA 16%") y mostrar el precio con impuestos usando la nueva fórmula.
- **`Product360Drawer.tsx`**: además del badge "IVA %", agregar badge "IEPS %" cuando `ieps_pct > 0`, y mostrar el desglose (subtotal → +IEPS → +IVA → total) en la sección de precios.
- **Portal cliente (`portal.$token.tsx`)**: mismo desglose en el detalle del producto y en el carrito.

## Facturación

- **`facturacion-page.tsx`** y `facturapi.functions.ts`: al armar los items de la factura, si el producto tiene `ieps_pct > 0`, añadir un `tax` adicional `{ type: "IEPS", rate: ieps_pct/100 }` al lado del IVA. La base del IEPS es el subtotal del renglón; el IVA se calcula sobre `subtotal + IEPS`.
- Preservar el comportamiento actual (IVA 16%) para productos sin IEPS.

## Verificación

1. Re-importar el catálogo adjunto y confirmar en `productos` que las 4 etiquetas quedan clasificadas correctamente (query de conteo por `tax_regime`).
2. Abrir un producto ITEM NORMAL, uno IVA 0%, y uno IEPS 6% + IVA 16% en el 360 drawer y verificar que el desglose de precio coincide.
3. Emitir una factura de prueba con un producto IEPS 6% + IVA 16% y confirmar que Facturapi recibe ambos impuestos con la base correcta.

## Archivos afectados

- Migración: `ALTER TABLE productos ADD COLUMN ieps_pct`, `tax_regime`.
- `src/lib/onboarding-import.ts` — parseo del régimen.
- `src/routes/admin.productos.tsx` — columna/filtro/desglose.
- `src/components/catalog/Product360Drawer.tsx` — badges y desglose.
- `src/routes/portal.$token.tsx` — desglose visible al cliente.
- `src/components/facturacion-page.tsx` + `src/lib/facturapi.functions.ts` — IEPS en la factura.
