## Objetivo

Subir el archivo NetSuite `IMV VENTAS DESGLOSADAS` (enero–julio 2026, ~2,860 líneas de factura) desde la página de Empresa › Configuración, guardarlo en la base y hacer que todas las pantallas que muestran ventas lo consuman junto con los pedidos nativos.

## Formato del archivo detectado

XML SpreadsheetML de NetSuite con estas columnas por fila:
`Representante | Clase (laboratorio) | Cliente/proyecto | Nº documento (INV…) | Fecha | SKU | Descripción | Cantidad vendida | Ingresos totales`

Reutilizamos `xlsx` (ya en el proyecto) — soporta SpreadsheetML.

## 1. Base de datos (migración)

Nueva tabla **`sales_history`** (una fila por línea de factura histórica):

```text
id uuid pk
empresa_id uuid → empresas (para importar por empresa)
source text  ('netsuite_2026' por ahora)
import_batch_id uuid  (agrupa por importación)
invoice_no text
invoice_date date
rep_name_raw text          representante_id uuid → representantes (nullable, resuelto)
lab_name_raw text          laboratorio_id uuid   → laboratorios   (nullable)
client_name_raw text       client_id uuid        → clientes       (nullable)
sku text                   product_id uuid       → productos      (nullable)
description text
quantity numeric
revenue numeric            (ingresos totales, sin IVA como viene de NetSuite)
created_at, updated_at
UNIQUE (empresa_id, invoice_no, sku, rep_name_raw, client_name_raw)  -- idempotencia
```

Índices: `(empresa_id, invoice_date)`, `(client_id)`, `(product_id)`, `(representante_id)`, `(laboratorio_id)`.
RLS: SELECT/INSERT/UPDATE/DELETE a `authenticated`. GRANT a `authenticated` y `service_role`.
Trigger de resolución que rellena FKs por nombre/SKU al insertar (mismo patrón que `rep_access_events`).

**Vista `v_ventas_unified`** — une pedidos entregados y sales_history en una forma común:
```text
fuente ('pedido' | 'historico')
fecha, empresa_id, client_id, client_name,
representante_id, rep_name, laboratorio_id, lab_name,
product_id, sku, description,
quantity, revenue, invoice_no
```
Sobre esta vista se apoyan los reportes; los pedidos siguen alimentando logística/inventario como hoy.

## 2. Importador

**`src/lib/sales-history-import.ts`** (client-side, como `onboarding-import.ts`):
- `parseNetSuiteSalesXml(file)` → filas normalizadas (detecta las 9 columnas, salta encabezados/totales).
- `importSalesHistory(empresaId, rows)` → inserta en lotes de 500 con upsert por la clave única; devuelve `{inserted, updated, skipped, errors}`.

Resolución de FKs (server-side vía trigger):
- `client_id`: match por `client_name_raw` contra `clientes.nombre_comercial`/`razon_social` (case-insensitive, trim del prefijo numérico "1471 …").
- `product_id`: match exacto de `sku` contra `productos.sku`.
- `representante_id`: match por `rep_name_raw` normalizado contra `representantes.nombre`.
- `laboratorio_id`: match por `lab_name_raw` contra `laboratorios.nombre`.
- Los no resueltos quedan con FK null pero conservan los `*_raw`, para que la UI aún muestre datos.

## 3. UI de importación

En **`src/routes/admin.empresas.tsx` → pestaña Configuración**:
- Nuevo bloque "Historial de ventas" con:
  - Botón **Importar ventas (NetSuite)** que abre un diálogo.
  - Diálogo (`SalesHistoryImportDialog.tsx`): drop-zone .xls/.xlsx, preview de las 5 primeras filas mapeadas, badge de la empresa activa, botón Importar.
  - Resumen post-import: total filas, insertadas, ya existentes, sin cliente/producto resuelto (con lista descargable de rezagos).
  - Tabla de lotes previos (`import_batch_id`, fecha, filas, usuario) con acción "eliminar lote".

## 4. Páginas que se alimentan del histórico

Cambio: consumir `v_ventas_unified` (con filtro de fecha) en lugar de solo `orders/order_items` en:

- **`ventas-page.tsx`** — tabla y KPIs de ventas.
- **`sales-page.tsx`** — ventas por rep/lab/cliente.
- **`pnl-page.tsx`** — ingresos del waterfall y P&L mensual.
- **`dashboard-page.tsx`** — tarjeta "Ventas del mes" / gráfica.
- **`vendedores-page.tsx`** y **`Rep360Drawer.tsx`** — ventas por representante.
- **`Client360Drawer.tsx`** — histórico de compras del cliente.
- **`catalogo-page.tsx` / `Product360Drawer.tsx`** — ventas por SKU.

No se tocan páginas operativas (logística, maniobra, inventario, facturación) — el histórico no debe generar movimientos de stock ni CFDIs.

## 5. Detalles técnicos

- El archivo (~42 MB de XML) se parsea en cliente con `XLSX.read({ type: 'string' })` en modo SpreadsheetML; probamos con streaming si tarda demasiado.
- Inserción en lotes de 500 vía `supabase.from('sales_history').upsert(...)` para no exceder límites.
- Multi-empresa: usa la empresa seleccionada en el selector global (`useSelectedEmpresa`); si no hay, forzamos elegir una antes de importar.
- Todos los importes de NetSuite son "sin IVA"; en `v_ventas_unified` guardamos `revenue` tal cual y agregamos una columna calculada `revenue_con_iva = revenue * 1.16` para las vistas que hoy asumen "con IVA" (documentado en un comentario de la vista).

## Archivos

**Crear**
- `supabase/migrations/<ts>_sales_history.sql`
- `src/lib/sales-history-import.ts`
- `src/components/empresas/SalesHistoryImportDialog.tsx`

**Editar**
- `src/routes/admin.empresas.tsx` (o el tab Configuración correspondiente) para añadir la sección.
- `src/components/ventas-page.tsx`, `sales-page.tsx`, `pnl-page.tsx`, `dashboard-page.tsx`, `vendedores-page.tsx`, `Rep360Drawer.tsx`, `Client360Drawer.tsx`, `catalogo-page.tsx`, `Product360Drawer.tsx` — cambiar la fuente a `v_ventas_unified`.
- `src/integrations/supabase/types.ts` se regenera tras la migración.
