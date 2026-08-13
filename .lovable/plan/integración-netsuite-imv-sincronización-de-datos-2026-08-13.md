# Integración NetSuite → IMV (sincronización de datos)

## Aclaración importante sobre el "Secreto" que creaste

La pantalla *Datos secretos de API* de NetSuite guarda secretos para que los usen **scripts dentro de NetSuite** (SuiteScript). No sirve como credencial para que nuestra app entre a NetSuite. Para leer datos desde fuera necesitamos credenciales de **Token-Based Authentication (TBA)**.

## Lo que necesitas generar en NetSuite (eres Administrador, así que puedes)

1. **Habilitar funciones**: Configuración → Empresa → Habilitar funciones → SuiteCloud:
  - `SERVICIOS WEB DE REST` (REST Web Services)
  - `AUTENTICACIÓN BASADA EN TOKEN` (Token-Based Authentication)
2. **Crear el registro de integración**: Configuración → Integración → Administrar integraciones → Nuevo.
  - Nombre: `IMV Portal Sync`, marcar *Token-Based Authentication*, desmarcar TBA authorization flow y OAuth 2.0.
  - Al guardar, NetSuite muestra **una sola vez**: `Consumer Key` y `Consumer Secret`.
3. **Crear un rol de solo lectura** (ej. `IMV Integration Read`) con permisos: REST Web Services, SuiteAnalytics Workbook, y *View* en Facturas, Clientes, Artículos, Inventario. Asignar el rol a un usuario de integración.
  1. **Crear el token de acceso**: Configuración → Usuarios/Roles → Tokens de acceso → Nuevo (Aplicación = IMV Portal Sync, Usuario, Rol). Muestra **una sola vez**: `Token ID` y `Token Secret`.
4. **Account ID**: Configuración → Empresa → Información de la empresa (ej. `1234567` o `1234567_SB1`).

Estos 5 valores los guardaremos como secretos del proyecto:
`NETSUITE_ACCOUNT_ID`, `NETSUITE_CONSUMER_KEY`, `NETSUITE_CONSUMER_SECRET`, `NETSUITE_TOKEN_ID`, `NETSUITE_TOKEN_SECRET`.

## Qué vamos a construir (solo lectura, NetSuite → IMV)

Sincronización programada + botón manual, para:

- **Ventas / facturas** (líneas de factura → `sales_history`, reemplazando los backfills manuales de .xls)
- **Clientes** (→ `clientes`, emparejando por RFC / nombre / ID de NetSuite)
- **Productos y precios** (→ `productos` y precios, emparejando por SKU con `sku_aliases`)
- **Inventario y lotes** (→ `stock` y `product_batches` por almacén/lote)

### Página nueva: Administración → Integraciones → NetSuite

- Estado de conexión con botón **Probar conexión**.
- Tarjeta por entidad (Ventas, Clientes, Productos, Inventario) con: última sincronización, filas nuevas/actualizadas, errores, y botón **Sincronizar ahora** (con selector de rango de fechas para ventas).
- Bitácora de ejecuciones con detalle de errores y filas no emparejadas (SKUs o clientes desconocidos) para resolver a mano.

### Automatización

- Sincronización nocturna programada (ventas del día anterior + incrementales de clientes/productos/inventario).
- Inventario opcionalmente cada hora.

## Detalles técnicos

- **Transporte**: REST de NetSuite con **SuiteQL** (`POST /services/rest/query/v1/suiteql`), paginado (1000 filas por página). Consultas SQL contra `transaction`, `transactionline`, `customer`, `item`, `inventorybalance`. Un solo endpoint cubre las 4 entidades.
- **Auth**: OAuth 1.0a TBA firmado con HMAC-SHA256 usando `crypto` (compatible con el runtime de Cloudflare Worker). Sin dependencias nuevas.
- **Directo desde nuestro servidor** (no por el proxy de Valinor): la firma OAuth 1.0a es específica de la cuenta y el proxy no la soporta. Google/Gemini/Resend siguen igual por Valinor.
- Archivos nuevos:
  - `src/lib/netsuite.server.ts` — firma OAuth, cliente SuiteQL paginado.
  - `src/lib/netsuite-sync.server.ts` — mapeo/upsert por entidad, reutilizando la lógica de emparejamiento de `backfill-sales.server.ts`.
  - `src/lib/netsuite.functions.ts` — server functions con `requireSupabaseAuth` + verificación de rol `admin`.
  - `src/routes/admin.integraciones.netsuite.tsx` — la página nueva.
  - `src/routes/api/public/hooks/netsuite-sync.ts` — endpoint para el cron nocturno (protegido con `apikey`).
- Migración: tabla `netsuite_sync_runs` (entidad, estado, rango, contadores, errores, inicio/fin) y columnas `netsuite_id` en `clientes`, `productos`, `sales_history` para upserts idempotentes; job `pg_cron`.
- Upserts idempotentes por `netsuite_id` para poder re-ejecutar sin duplicar; las filas que no empatan quedan en la bitácora, nunca se crean clientes/productos fantasma.

## Orden de trabajo

1. Migración (tabla de bitácora, columnas `netsuite_id`, índices).
2. Guardar los 5 secretos de NetSuite.
3. Cliente SuiteQL + prueba de conexión, verificada contra tu cuenta real.
4. Sync de ventas, luego clientes, productos e inventario.
5. Página de administración + cron nocturno.