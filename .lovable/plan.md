## Plan — Carga del catálogo (1,084 productos) + importador reusable

### Paso 1 — Importar el catálogo ahora (bulk, una sola corrida)

Origen: `Catalogo productos 29 mayo.xlsx`, hoja `ResultadosBGCatproductos`.

Mapeo:

| Columna del archivo | Campo en `productos` |
|---|---|
| `Nombre` | `sku` |
| `Nombre para mostrar` | `nombre` |
| `Clase` | `marca` + se resuelve/crea `laboratorios.nombre` → `laboratorio_id` |
| `Tipo de producto` | `categoria` |
| `Grupo` | se concatena al final de `descripcion` (ej. "Receta Simple") |
| `Código de artículo de SuiteTax Latam Engine` | si contiene "IVA 0" → `iva_pct = 0`; cualquier otro → `16` |
| (no presente) | `precio_lista = 0`, `costo = null`, `activo = true`, `unidad = 'pieza'` |

Proceso:
1. Leer el XLSX en el sandbox.
2. Extraer `Clase` únicos → upsert en `laboratorios` (por `nombre`, activo, `orden` consecutivo).
3. Construir filas de `productos` resolviendo `laboratorio_id` por nombre.
4. Insertar con `ON CONFLICT (sku) DO UPDATE` para que sea re-ejecutable sin duplicar.
5. Reporte final: cuántos laboratorios creados, productos insertados/actualizados, y filas omitidas (SKU o nombre vacío).

Esto se hace vía la herramienta de inserts a la base (no es migración de esquema, son datos).

### Paso 2 — Dejar el importador del Onboarding listo para este formato

Editar `src/lib/onboarding-import.ts` → `mapProductRow`:

- Aceptar `Nombre` como SKU **solo** cuando exista también `Nombre para mostrar` (heurística: si la fila tiene `nombre_para_mostrar`, entonces `nombre` = SKU; si no, mantener el comportamiento actual donde `nombre` es el nombre del producto).
- Añadir alias de cabeceras: `clase` → `marca`/laboratorio; `tipo_de_producto` → `categoria`; `grupo` → se anexa a `descripcion`.
- Añadir derivación de IVA: si alguna columna contiene la cadena "IVA 0" (típicamente `codigo_de_articulo_de_suitetax_latam_engine`), `iva_pct = 0`; si contiene "IVA 16", `iva_pct = 16`; si no, dejar como está.
- En `importProductos`: cuando el mapeo trae `marca` y no existe laboratorio con ese nombre, crearlo en `laboratorios` y asignar `laboratorio_id` al producto.

Sin cambios en UI: el botón existente de "Cargar catálogo" del módulo Onboarding seguirá funcionando, ahora reconociendo este formato exacto para futuras cargas.

### Paso 3 — Verificación

- `SELECT count(*) FROM productos;` → debe ser ≈ 1,084 (más el que ya existía).
- `SELECT count(*) FROM laboratorios;` → número de `Clase` únicos del archivo.
- Abrir `/admin/productos` y `/admin/catalogo` para confirmar que se ven correctamente agrupados por laboratorio.

### Lo que NO se hace en este paso
- No se cargan precios ni costos (vienen en el siguiente archivo, lista de precios).
- No se tocan políticas RLS ni esquema.
- No se borra ningún producto existente.
