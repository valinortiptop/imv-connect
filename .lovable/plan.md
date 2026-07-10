# Calendario 360 + Mapa de accesos de representantes

## 1. Backend

### 1.1 Nueva tabla `rep_access_events` (migración)
Registra cada inicio de sesión de un representante.
- `user_id uuid` (auth.users), `representante_id uuid` (nullable, resuelto por trigger o desde el cliente), `signed_in_at timestamptz default now()`, `lat numeric`, `lng numeric`, `accuracy numeric`, `has_location boolean`, `user_agent text`, `ip inet` (opcional).
- Índices por `(representante_id, signed_in_at desc)` y `(signed_in_at desc)`.
- GRANTs: `INSERT` para `authenticated` (registrar su propio acceso), `SELECT` para `service_role`; policies:
  - INSERT: `auth.uid() = user_id`.
  - SELECT: solo admin/supervisor vía `has_role(auth.uid(),'admin')` OR el propio usuario.

### 1.2 Extender `getRepCalendarEventsFn`
Añadir a `inputValidator`:
- `clienteId?: string` — filtra `rep_visits.cliente_id`, `pedidos.cliente_id`, agreements por sus visitas, y omite entregas/llamadas no ligadas.
- `repId?: string` — atajo equivalente a `repIds: [repId]`.
Sin romper llamadas existentes (todos opcionales).

### 1.3 Nuevo `listRepAccessEventsFn` (server fn)
`.middleware([requireSupabaseAuth])` + verificación `has_role('admin')`.
- Input: `{ from: string; to: string; repIds?: string[] }`.
- Devuelve `[{ id, representante_id, representante_nombre, signed_in_at, lat, lng, accuracy, has_location }]`.

## 2. Logger de accesos (cliente)

- Nuevo `src/lib/access-logger.ts` con `logPlatformAccess()`:
  - Corre una vez por sesión (flag en `sessionStorage`).
  - Pide `navigator.geolocation.getCurrentPosition` con timeout corto.
  - Inserta fila en `rep_access_events` (con o sin lat/lng).
- Se llama desde `src/routes/__root.tsx` dentro de `onAuthStateChange` cuando `event === "SIGNED_IN"` y del boot si hay sesión activa.

## 3. UI

### 3.1 Cliente 360 — nueva tab "Calendario"
`src/components/clients/Client360Drawer.tsx`: agregar `TabsTrigger value="calendario"` y `TabsContent` que renderiza un nuevo `<ClientCalendarPanel clienteId={c.id} />` (miniversión reutilizable extraída de `CalendarView`, filtrando por `clienteId`).

### 3.2 Vendedor 360 — nuevo drawer
Nuevo `src/components/vendedores/Rep360Drawer.tsx` con tabs:
- **Resumen**: KPIs (clientes, pedidos, ventas, comisión, último acceso).
- **Clientes**: lista de clientes asignados.
- **Pedidos**: últimos pedidos del rep.
- **Calendario**: `CalendarView` filtrado por `repId`.
Se abre desde `vendedores-page.tsx` al hacer click en el nombre/fila (nuevo botón "Ver 360"), sin quitar el modal de edición existente.

### 3.3 Refactor menor de `CalendarView`
Aceptar props opcionales `{ clienteId?: string; repId?: string; embedded?: boolean }`. Cuando `embedded`, oculta el header grande y usa alto acotado. Pasa el filtro al `fetchEvents`.

### 3.4 Supervisor — mapa de accesos
Nuevo `src/components/rep/RepAccessMap.tsx`:
- Usa `loadGoogleMapsViaValinor()` como `RouteMap.tsx`.
- Controles: rango de fechas (hoy/7d/30d), multiselect de reps, toggle "solo con ubicación".
- Renderiza `google.maps.Marker` por evento; color por recencia; `InfoWindow` con rep, fecha/hora y precisión.
- Panel lateral con lista de accesos (incluye los sin ubicación).
Se añade a `src/routes/rep.supervisor.tsx` como sección debajo de `SupervisorDashboard`.

## 4. Notas técnicas

- Todas las llamadas a Google Maps siguen usando `loadGoogleMapsViaValinor` (proxy Valinor), como pediste.
- Trigger opcional en migración: al insertar en `rep_access_events`, si `representante_id` es null, resolverlo con `SELECT id FROM representantes WHERE user_id = NEW.user_id`.
- No se modifica el auth flow ni el layout `_authenticated`.
- `rep_visits` ya tiene lat/lng por visita — no lo tocamos; los accesos son eventos separados.

## 5. Archivos afectados

Crear:
- `supabase/migrations/<ts>_rep_access_events.sql`
- `src/lib/access-logger.ts`
- `src/lib/rep-access.functions.ts`
- `src/components/clients/ClientCalendarPanel.tsx`
- `src/components/vendedores/Rep360Drawer.tsx`
- `src/components/rep/RepAccessMap.tsx`

Editar:
- `src/lib/rep-calendar.functions.ts` (filtros `clienteId` / `repId`)
- `src/components/rep/CalendarView.tsx` (props embebidas)
- `src/components/clients/Client360Drawer.tsx` (tab Calendario)
- `src/components/vendedores-page.tsx` (abrir Rep360Drawer)
- `src/routes/__root.tsx` (registrar logger en `onAuthStateChange`)
- `src/routes/rep.supervisor.tsx` (montar `RepAccessMap`)
