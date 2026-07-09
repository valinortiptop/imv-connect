# Panel de Representantes

Módulo de asistente comercial IA para venta en campo, con historial de cliente, inventario en tiempo real, oportunidades sugeridas por IA, ruta inteligente y control de visitas con geolocalización.

## Estado

**Fase 1 — MVP implementado** ✅

- Rutas `/rep`, `/rep/clientes`, `/rep/clientes/$id`, `/rep/ruta`, `/rep/visitas`, `/rep/inventario`
- Tablas nuevas: `rep_visits`, `rep_visit_agreements`, `rep_client_insights` (con RLS por representante).
- Server functions (`src/lib/rep.functions.ts`): `getMyRep`, `getMyClients`, `getClientDashboard`, `getClientInventoryOffer`, `generateClientInsights` (IA con cache 24h), `buildDailyPlan`, `checkIn`/`checkOut`, `listMyVisits`, `optimizeRoute`, `geocodeClient`, `quickInventoryLookup`.
- Google Maps JS en el cliente para el mapa de ruta; Directions/Geocoding vía **Valinor proxy**.
- IA (OpenAI `gpt-4o-mini`) vía **Valinor proxy** — genera resumen, churn score, predicciones de recompra, cross-sell y laboratorios en riesgo.
- Fallback determinístico cuando la IA falla.

## Cómo entrar

- Admin: enlace "Panel Representante" en el sidebar → `/rep`.
- Representante: iniciar sesión con la cuenta ligada a `representantes.user_id`. Ve solo sus clientes.

## Fases pendientes

### Fase 2 — Inteligencia comercial avanzada
- Detección automática de migración a la competencia por laboratorio (caída sostenida >60% × 2 meses → posible competidor sugerido por Gemini con contexto de zona).
- Predicción de recompra por producto con serie temporal (media móvil + IA).
- Panel agregado "Laboratorios en riesgo" (por rep / zona).
- Alertas push in-app con Supabase Realtime en `notifications`.

### Fase 3 — Ruta y territorio
- Optimización multi-parada con Google Routes API `computeRoutes` vía Valinor.
- Heatmap de clientes por oportunidad en el mapa.
- Detección de clientes visitados en exceso sin resultado (>3 visitas sin pedido en 60 días).
- Ruta sugerida semanal con balanceo de carga.

### Fase 4 — Ejecución en visita
- Levantamiento de pedido dentro de la ficha 360° (pre-cargar con `reorder_predictions`).
- Cotización rápida con precios personalizados (`client_price_overrides`).
- Fotos/evidencias subidas a Supabase Storage.
- Firma digital de acuerdos.

### Fase 5 — Analítica y coaching
- Dashboard supervisor: rendimiento por rep, mapa de calor de visitas, ratio visita→pedido, tiempo promedio en cliente.
- Coach IA semanal con Gemini analizando desempeño.
- Ranking / gamificación.

## Notas técnicas

- Todas las llamadas a OpenAI, Gemini y Google Maps van a través de `src/lib/valinor-proxy.server.ts` (server-only). El token `VALINOR_PROXY_TOKEN` nunca sale del backend.
- `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` sí se expone al cliente (es la clave con restricción por referrer para Maps JS).
- Insights por cliente se cachean 24 h en `rep_client_insights`; botón "Regenerar" fuerza recomputo.
- RLS: policies en las 3 tablas nuevas restringen filas al representante propietario o a `has_role('admin')`.

---

## Fase 2 — Inteligencia comercial avanzada ✅ IMPLEMENTADA

### Nuevas server functions (`src/lib/rep.functions.ts`)
- **`getLabRiskPanelFn`** — Compara consumo por laboratorio en ventanas de 60d vs 60d previos. Marca `alto` (>60% caída), `medio` (>30%), `bajo` (>10%), `estable`. Devuelve clientes que dejaron de comprar cada laboratorio (posible migración).
- **`getReorderPredictionsFn`** — Predicción determinística por cadencia (media móvil de intervalos entre pedidos). Requiere ≥3 compras del producto. Marca urgencia: `vencido`, `inmediato` (≤3d), `proximo` (≤N días).
- **`generateRepAlertsFn`** — Inserta notifications para clientes con `churn_risk_score ≥ 0.7`. Idempotente por día (dedup por `route + created_at ≥ hoy`).

### Nuevos componentes
- `LabRiskPanel.tsx`, `ReorderPredictions.tsx`, `NotificationBell.tsx` (Realtime en `notifications`).

### Nueva ruta
- `/rep/laboratorios` — Panel completo de laboratorios en riesgo y recompras próximas 14d, con botón "Correr análisis" que dispara `generateRepAlertsFn`.

### Dashboard
- Añadidas dos tarjetas: top 3 labs en riesgo y top 5 recompras próximas 7d, con enlace a la vista completa.

### RLS y Realtime
- Nueva policy `notif_insert_self` permite al rep insertar sus propias alertas.
- `notifications` añadida a la publicación `supabase_realtime` con `REPLICA IDENTITY FULL`.

### Campana de notificaciones
- Icono con contador de no leídas en sidebar desktop y header móvil.
- Suscripción a `INSERT`/`UPDATE` filtrada por `user_id`.
- Botón "Marcar todo leído".
