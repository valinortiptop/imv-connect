
# Panel de Representantes — Asistente comercial IA en campo

Módulo nuevo, responsive (móvil + escritorio), pensado para que el representante en campo tenga en tiempo real: historial de compra del cliente, inventario, oportunidades sugeridas por IA, ruta inteligente y control de visitas con geolocalización. Toda IA y Google Maps pasan por el **proxy Valinor** ya integrado (`src/lib/valinor-proxy.server.ts` + `src/lib/valinor.functions.ts`).

Reutiliza:
- Tabla `representantes` (existente) para identificar al usuario en campo (link `representantes.user_id → auth.uid()`).
- Tabla `clientes.representante_id` (existente) para filtrado por RLS.
- Server fns de Valinor ya funcionando: `aiChatFn` (OpenAI), `geminiGenerateInline`, `googlePlacesAutocompleteFn`, `googleGeocode`.

La ruta actual `/admin/representantes` es la vista *admin* (gestión de vendedores). Este módulo vive en **`/rep`** — un layout propio, sin `admin.` prefix, pensado como app de campo.

---

## Fase 1 (implementar ahora) — MVP funcional

### Rutas
```
src/routes/
├── _authenticated/
│   └── rep.tsx                    # layout con nav bottom (mobile) / sidebar (desktop)
├── _authenticated/rep.index.tsx   # dashboard del día (KPIs + plan sugerido)
├── _authenticated/rep.clientes.tsx           # lista de mis clientes (con filtros IA)
├── _authenticated/rep.clientes.$id.tsx       # ficha 360° del cliente
├── _authenticated/rep.ruta.tsx               # mapa + ruta del día
├── _authenticated/rep.visitas.tsx            # historial de check-ins
└── _authenticated/rep.inventario.tsx         # consulta rápida de stock
```

### Base de datos (nueva)
```sql
-- Check-in / check-out con geolocalización
CREATE TABLE public.rep_visits (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.representantes(id),
  cliente_id uuid not null references public.clientes(id),
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  check_in_lat numeric, check_in_lng numeric,
  check_out_lat numeric, check_out_lng numeric,
  duration_minutes int generated always as (
    extract(epoch from (check_out_at - check_in_at))/60
  ) stored,
  notes text,
  outcome text, -- 'pedido', 'sin_pedido', 'seguimiento', 'incidencia'
  created_at timestamptz default now()
);

-- Acuerdos y compromisos derivados de la visita
CREATE TABLE public.rep_visit_agreements (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references public.rep_visits(id) on delete cascade,
  description text not null,
  due_date date,
  status text default 'pending', -- pending, done, cancelled
  created_at timestamptz default now()
);

-- Caché de insights IA por cliente (para no gastar tokens en cada abrir ficha)
CREATE TABLE public.rep_client_insights (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  generated_at timestamptz not null default now(),
  model text,                       -- 'openai:gpt-4o-mini' | 'gemini-...'
  churn_risk_score numeric,         -- 0..1
  churn_reasons jsonb,
  reorder_predictions jsonb,        -- [{producto_id, probable_date, qty}]
  cross_sell jsonb,                 -- [{producto_id, reason}]
  lost_labs jsonb,                  -- [{laboratorio_id, drop_pct, suspected_competitor}]
  summary text,                     -- resumen ejecutivo IA en español
  raw jsonb
);
```
Con `GRANT`s a `authenticated` + `service_role` y RLS: un representante solo ve visitas/insights de clientes cuyo `representante_id` coincida con su registro en `representantes`.

### Server functions nuevas (`src/lib/rep.functions.ts`)
Todas con `.middleware([requireSupabaseAuth])`. Reutilizan `aiChatFn`/`geminiGenerateInline` internamente vía `valinor-proxy.server.ts`.

- `getMyRepFn` → devuelve `representantes` ligado al `auth.uid()`.
- `getMyClientsFn` → clientes asignados + métricas base (último pedido, ticket promedio, frecuencia).
- `getClientDashboardFn({ clienteId })` → historial 12m por producto/marca/laboratorio, series de tendencia, top productos, productos abandonados.
- `getClientInventoryOfferFn({ clienteId })` → inventario disponible/comprometido/tránsito para productos que suele comprar (JOIN `stock` + `stock_entries` en tránsito + sustitutos por `productos.substitute_ids` si existe, si no por laboratorio).
- `generateClientInsightsFn({ clienteId, force? })` → si `rep_client_insights.generated_at < 24h` regresa cache; si no, arma prompt con historial + ventas 12m y llama `aiChatFn` (`gpt-4o-mini`) para obtener churn / reorder / cross-sell / lost_labs / summary. Guarda en caché.
- `buildDailyPlanFn({ date? })` → llama Gemini con lista de clientes + métricas + geolocalización actual → devuelve orden sugerido de visitas con razón por cliente (urgente / oportunidad / seguimiento).
- `checkInFn({ clienteId, lat, lng })` / `checkOutFn({ visitId, lat, lng, notes, outcome, agreements[] })`.
- `optimizeRouteFn({ visitIds[], startLat, startLng })` → Google Directions vía Valinor (`provider: "google"`, endpoint `/maps/api/directions/json`) para calcular orden + polyline.
- `geocodeClientFn({ clienteId })` → reusa `googleGeocode` para completar `lat/lng` de clientes sin coordenadas (los persiste en `clientes`).

### Cliente / componentes (`src/components/rep/`)
- `RepLayout.tsx` — sidebar desktop / bottom nav en móvil (Dashboard, Clientes, Ruta, Visitas, Inventario). Guardado del `representantes.id` en context.
- `RepDashboard.tsx` — KPIs del día (visitas hechas, pendientes, pedidos, monto), tarjeta "Plan sugerido por IA" con clientes priorizados.
- `ClientList.tsx` — filtros: Urgente / Oportunidad / Riesgo pérdida / Sin visita 30d. Buscador por nombre o RFC.
- `ClientDetail360.tsx` — tabs:
  1. **Resumen IA** (usa `generateClientInsightsFn`) — churn score, resumen, top productos, laboratorios en riesgo.
  2. **Historial** — tablas + gráficos (Recharts): compras por mes, por laboratorio, por marca. Detecta productos abandonados (comprados 3 meses seguidos y últimos 60 días sin comprar).
  3. **Oportunidades** — cross-sell / up-sell / reabastecimiento (de `rep_client_insights.reorder_predictions` + `cross_sell`).
  4. **Inventario** — para cada producto sugerido: disponible / comprometido / tránsito / ETA / sustituto.
  5. **Visitas** — historial + botón "Iniciar visita" (check-in con `navigator.geolocation.getCurrentPosition`).
  6. **Acuerdos** — pendientes/completados.
- `RouteMap.tsx` — carga Maps JS con `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` (ya configurada); markers de clientes del día con color por prioridad IA; botón "Optimizar ruta" (llama `optimizeRouteFn`); "Ir con Google Maps" abre navegación nativa.
- `CheckInDialog.tsx` — pide permiso de geolocalización, muestra distancia al cliente registrado, guarda check-in.
- `CheckOutDialog.tsx` — captura outcome, notas, acuerdos (repetibles).
- `InventoryQuickLookup.tsx` — buscador global de productos con disponibilidad + próximas entradas (`stock_entries` en tránsito).

### Móvil
- `viewport meta` con `viewport-fit=cover`; safe areas.
- Bottom nav de 5 iconos en `< md`.
- Botones grandes, listas con acciones swipe (call, WhatsApp, ubicar).
- `capacitor`-friendly (no requerido, pero geolocalización web funciona).

### Menú admin
Añadir enlace "Panel Representante" en el sidebar admin (para admins que quieran probar) sin quitar `admin.representantes` (gestión).

---

## Fase 2 — Inteligencia comercial avanzada

- Detección automática de **migración a competencia** por laboratorio: si el consumo mensual de un laboratorio cae >60% durante 2 meses sostenidos, marca "sospecha de migración" y sugiere competidor probable con Gemini (usando `clientes.zona` + laboratorios activos en la región).
- Predicción de recompra por producto con serie temporal simple (media móvil + IA para interpretar) → alerta "debe pedir X en ~5 días".
- Panel "Laboratorios en riesgo" agregado a nivel representante / zona.
- Alertas push in-app (Supabase Realtime en `notifications`).

## Fase 3 — Ruta y territorio

- Optimización de ruta multi-parada real (Google Routes API `computeRoutes` vía Valinor).
- Heatmap de clientes por oportunidad en Maps.
- Detección de clientes visitados en exceso sin resultado (>3 visitas sin pedido en 60 días).
- Ruta sugerida semanal (no solo diaria) con balanceo carga.

## Fase 4 — Ejecución en visita

- Levantamiento de pedido dentro de la ficha 360° (reutilizar flujo de pedidos existente, pre-cargar con `reorder_predictions`).
- Cotización rápida on-the-fly con precios personalizados (`client_price_overrides`).
- Foto/evidencia de visita subida a Storage.
- Firma digital de acuerdos.

## Fase 5 — Analítica y coaching

- Dashboard supervisor: rendimiento por representante, mapa de calor de visitas, ratio visita→pedido, tiempo promedio en cliente.
- Coach IA semanal: reporte generado con Gemini que analiza el desempeño del rep y sugiere focos.
- Comparativas contra objetivo, ranking, gamificación básica.

---

## Detalles técnicos

- **Auth**: rutas bajo `_authenticated/rep.*`; se valida además que `auth.uid()` tenga registro en `representantes` (si no, mostrar "no eres representante"). Admins con rol `admin` acceden vía RLS bypass mediante `has_role`.
- **IA**: llamadas siempre server-side (`createServerFn` → Valinor). Nunca exponer el `x-proxy-token`. Se cachean insights por 24h en `rep_client_insights`.
- **Maps**: JS API en cliente usa `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` (browser). Directions/Geocoding server-side vía Valinor `provider: "google"`.
- **Geolocalización**: `navigator.geolocation.watchPosition` en `RepLayout` guardado en context (opcional, solo al iniciar check-in). Manejo explícito de permisos denegados.
- **Prompt IA**: system prompt reusable en `src/lib/rep-prompts.ts` en español, formato JSON estricto, `response_format: json_object`, Zod para validar antes de guardar.
- **Rendimiento**: queries a Supabase con vistas materializadas donde ya existen; agregaciones de 12 meses cacheadas en `rep_client_insights.raw`.
- **Errores**: si Valinor falla, la UI muestra el resumen calculado sin IA (fallback determinístico: churn = días desde última compra / promedio de frecuencia).

## Fuera de alcance de fase 1

- App nativa (Capacitor).
- Firma digital / captura de fotos.
- Cotizador en línea completo.
- Dashboard supervisor multi-representante.

Al aprobar, en modo build implemento fase 1 completa (migración SQL, 8 server fns, 6 componentes, 6 rutas, enlace en menú) y dejo las fases 2-5 documentadas en `docs/panel-representantes.md`.
