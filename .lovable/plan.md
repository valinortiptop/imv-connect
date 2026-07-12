## Problem

En la importación de historial de ventas NetSuite:

1. La vista previa muestra `+046134-01` bajo **Fecha** — eso es un ID interno de NetSuite, no una fecha. El parser `pickRaw` usa alias difusos (`"fecha_de_creacion", "fecha", "date", "invoice_date"`) y termina agarrando una columna que contiene la palabra "fecha" en el header pero cuyo contenido es un ID.
2. El fallback `new Date(s)` en `toDate()` acepta cualquier string que parezca válido para JS y produce fechas absurdas (año 46134) o `Invalid Date` silencioso, así que filas mal mapeadas se cuelan como fechas "válidas".
3. No hay soporte explícito para formato mexicano **DD/MM/YYYY** con validación estricta (día 1-31, mes 1-12, cero fila si no cuadra).
4. El reporte NetSuite que se está subiendo ahora tiene 62,010 líneas — variante con columnas extra. La detección de encabezado también necesita ser estricta.

## Fix Plan

### 1. Reemplazar `toDate()` en `src/lib/sales-history-import.ts`

Parser explícito, sin fallback a `new Date(string)`:

- Acepta **ISO** `YYYY-MM-DD[T...]` → devuelve `YYYY-MM-DD`.
- Acepta **DD/MM/YYYY** y **DD-MM-YYYY** (formato mexicano) con año de 2 o 4 dígitos.
  - Valida rango día 1–31, mes 1–12.
  - Construye en UTC con `Date.UTC(y, m-1, d)` y verifica que `getUTCDate/getUTCMonth` coincidan (rechaza 31/02, etc.).
- Acepta **serial de Excel** (número) usando `XLSX.SSF.parse_date_code` cuando el cell viene como `Number`.
- Si nada matchea → `null` (la fila se descarta en `parseNetSuiteSalesFile`).

### 2. Encabezado de fecha estricto

En `HEADER_ALIASES._date` cambiar a match exacto contra estos labels normalizados:
- `fecha_de_creacion`
- `fecha_de_transaccion`
- `fecha_de_documento`
- `fecha_de_factura`
- `fecha`

Eliminar `date` e `invoice_date` (traen falsos positivos con IDs). Además, en `extractRows`, cuando el header contenga varias columnas con "fecha" en el nombre, preferir "Fecha de creación" > "Fecha".

### 3. Validación al parsear

En `parseNetSuiteSalesFile`:
- Contar filas descartadas por fecha inválida y exponerlas.
- Si más del 5% de filas se descartan por fecha, lanzar error con muestra de valores encontrados en la columna de fecha para diagnosticar rápido.

### 4. Mostrar la fecha bien formateada en preview

Usar `fmtDateShort` de `src/lib/date-utils.ts` en `SalesHistoryImportDialog.tsx` para que la tabla muestre `dd/MM/yy` local sin corrimiento de zona horaria.

### 5. Verificación

Con archivo que ya está en importación (62,010 líneas): correr localmente el parser y confirmar que:
- Todas las fechas caen en 2025-2026.
- Ninguna fila tiene `+046134-01` u otros IDs bajo Fecha.
- El resumen post-import muestra 0 filas descartadas por fecha inválida.

## Archivos a tocar

- `src/lib/sales-history-import.ts` — parser de fecha, aliases estrictos, contador de descartes.
- `src/components/empresas/SalesHistoryImportDialog.tsx` — formato de fecha en preview + mostrar descartes.

Sin cambios de base de datos ni de otras páginas.