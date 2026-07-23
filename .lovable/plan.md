## Diagnosis

**Data is complete.** Backfill breakdown by month (`delivery_date`):

| Mes | Pedidos | Total |
|---|---|---|
| 2026-01 | 4,195 | $10.68M |
| 2026-02 | 3,951 | $9.87M |
| 2026-03 | 4,266 | $10.68M |
| 2026-04 | 3,692 | $9.97M |
| 2026-05 | 4,325 | $11.99M |
| 2026-06 | 3,884 | $13.26M |
| 2026-07 | 1,161 | $4.05M |
| **Total** | **25,474** | **$70.49M** |

Two things to explain first:
- **"Solo julio" en la UI** — no es que falten datos: es que Pedidos/Ventas ordenan por `created_at desc` (fecha del backfill = hoy) o filtran por rango por default. Se ven los últimos cargados, no los de enero–junio. Hay que ordenar por `delivery_date` y setear rango YTD por default.
- **$140M vs $70M del Excel** — el Sum del Excel incluía filas de subtotal/encabezado además de las líneas (Count=62,011 vs 52,378 líneas reales). Nuestro `$70.49M` = suma de subtotales; con IVA 16% ≈ $81.7M en facturas. La diferencia con el Excel es duplicación en el propio archivo, no datos faltantes. Se puede verificar cruzando contra `SUM(ingresos)` sólo de filas de detalle.

**El crash de `/admin/pedidos`** (screenshot "This page is having a problem, Error code: 5") es Cloudflare/Worker matando la respuesta: `fetchAllRows` trae 25k pedidos + joins de clientes/representantes/items en memoria del navegador y del server. No es sostenible.

## Root cause del enfoque actual

Cambiamos de "cap 500" a "cargar todo" — el otro extremo. Con 25k+ filas ninguna tabla React renderiza bien, y varias vistas hacen `SUM/GROUP BY` en cliente sobre esos datos. Necesitamos **paginación en servidor + agregaciones en Postgres**, no traer todo al cliente.

## Plan (server-side pagination + agregaciones SQL)

### 1. Pedidos (`/admin/pedidos`) — arreglar crash
- Server-side pagination con `range()` + `count: 'exact'` (páginas de 100).
- Filtros (estado, cliente, representante, rango de fechas, búsqueda) van al query, no al array.
- Orden por defecto: `delivery_date desc, created_at desc` (así enero–julio aparecen mezclados por fecha real, no por fecha de carga).
- KPIs de la cabecera (total pedidos, monto, pendientes) → una vista `v_pedidos_resumen` o RPC `pedidos_stats(filtros)` que hace `SUM/COUNT` en Postgres.
- Quitar `fetchAllRows` de esta página.

### 2. Ventas (`/admin/ventas`) y Sales (`/admin/sales`)
- Reemplazar `fetchAllRows` por RPCs:
  - `ventas_por_mes(from, to, cliente_id?, rep_id?)` — devuelve series mensuales (12 filas, no 25k).
  - `ventas_por_producto(...)` y `ventas_por_cliente(...)` — top N con `LIMIT`.
- Rango por defecto: año en curso (`2026-01-01 → hoy`), no "últimos 30 días".
- La tabla de detalle usa paginación server-side igual que pedidos.

### 3. Clientes 360 y Cartera
- Detalle de un cliente: seguir cargando todo (es un cliente, ~decenas/cientos de pedidos).
- Listado de clientes: paginación server-side + búsqueda vía `ilike` en servidor.
- Cartera: ya usa `v_cliente_credito_360`; agregar `LIMIT/OFFSET`.

### 4. Índices para que los filtros sean rápidos
Migración con:
- `pedidos(delivery_date desc)`, `pedidos(created_at desc)`
- `pedidos(cliente_id, delivery_date desc)`
- `pedidos(representante_id, delivery_date desc)`
- `pedidos(estado)` parcial donde `estado in ('nuevo','pendiente aprobación',…)`
- `pedido_items(pedido_id)`, `facturas(pedido_id)`, `facturas(fecha_emision desc)`
- `productos(sku)`, `clientes(razon_social)` para búsquedas
Sin estos índices, la paginación server-side también se cae con 25k filas.

### 5. Vistas / RPCs de agregación (Postgres hace el trabajo pesado)
- `pedidos_stats(filtros jsonb)` → KPIs del header.
- `ventas_mensuales(from,to,filtros)` → chart.
- `top_productos(from,to,limit)` / `top_clientes(from,to,limit)`.
- `v_pedido_listado` — join plano de pedido + cliente + rep para paginar sin N+1.

### 6. Verificación de completitud (una sola vez)
- RPC de auditoría que compara `COUNT(*)` y `SUM(subtotal)` de `netsuite_2026` por mes vs. lo esperado del Excel, y se muestra en `/admin/backfill-ventas` como tabla de control.

## Detalles técnicos

- Ordenar por `delivery_date` (no `created_at`) es lo que hace que enero–junio "aparezcan" de nuevo en la UI. Es el fix visible más importante.
- El shape correcto en tablas grandes es TanStack Query `keepPreviousData: true` + `range()` + `count:'exact'` para el paginador; nunca `fetchAllRows` en listados.
- Los `SUM/COUNT` los devuelve Postgres en <100 ms con los índices; el bundle del cliente deja de mover MB de JSON.
- Nada de esto toca los datos del backfill — sólo cómo se leen y renderizan.

## Fuera de alcance (a menos que lo pidas)
- Migrar a vistas materializadas para dashboards (sólo si con RPCs simples aún se siente lento).
- Cambiar Pedidos a lista virtualizada (`@tanstack/react-virtual`) — sólo hace falta si quieres mostrar >100 filas visibles a la vez sin paginar.

¿Aplico este plan? Si prefieres que primero valide la teoría del $140M vs $70M contra el archivo original antes de tocar UI, dímelo y hago esa auditoría primero.