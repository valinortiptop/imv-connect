# Gap analysis vs la visión del panel

Comparo cada bloque de tu descripción con lo que ya está construido en el panel de rep (fases 1–4).

## Historial y comportamiento del cliente

| Requisito | Estado |
|---|---|
| Historial por producto/marca/laboratorio | ✅ `ClientDetail360` + `getClientDashboardFn` |
| Productos que compra constantemente | ✅ Top SKUs por cliente |
| Ticket promedio | ✅ `avg_ticket` |
| Periodicidad y predicción de recompra | ✅ `getReorderPredictionsFn` a nivel SKU/cliente |
| Riesgo de abandono (cliente) | ✅ churn score |
| **Productos que dejó de comprar (SKU-level)** | ❌ Sólo existe a nivel laboratorio (`LabRiskPanel`) |
| **Variaciones de consumo por SKU (Δ vs periodo previo)** | ❌ No hay panel de tendencia por producto |
| **Tendencia del ticket en el tiempo (sparkline)** | ❌ Sólo valor puntual |
| **Productos con riesgo de abandono (SKU-level)** | ❌ Falta lista explícita |

## Oportunidades comerciales asistidas por IA

| Requisito | Estado |
|---|---|
| Cross-sell / up-sell | ✅ `generateClientInsightsFn` + `ClientInventoryOffer` |
| Reabastecimiento sugerido | ✅ `getReorderPrefillFn` |
| Sugerencias por comportamiento | ✅ |
| **Alertas de oportunidades perdidas** (visita sin pedido, promo activa no ofrecida, SKU histórico no pedido) | ❌ No hay módulo |

## Pérdida de mercado y competencia

| Requisito | Estado |
|---|---|
| Caída de compra por laboratorio | ✅ `LabRiskPanel` |
| Migración probable de laboratorio | ⚠️ Se detecta la caída, no se **atribuye** al competidor |
| **"Virbac ahora lo compra con Ramasa" — competencia atribuida** | ❌ No hay campo ni tabla |
| **Análisis contra qué distribuidor perdemos participación** | ❌ Sin dato de competencia |
| **Sustitución de marcas / productos** | ❌ No hay mapa de sustitutos ni captura de motivo |

## Inventario y abastecimiento en tiempo real

| Requisito | Estado |
|---|---|
| Disponible / comprometido / en tránsito / ETA | ✅ `InventoryQuickLookup` (stock_disponible, comprometido, en_camino, transit_eta) |
| Próximos ingresos por fecha | ⚠️ Se muestra ETA por SKU, falta vista agregada |
| **Productos sustitutos disponibles** | ❌ No hay tabla de sustitutos ni sugerencia cuando algo está agotado |

## Plan de trabajo inteligente

| Requisito | Estado |
|---|---|
| Clientes con visita urgente / baja frecuencia / sobre-visitados | ✅ `buildWeeklyPlanFn`, `detectOverVisitedFn` |
| Priorización por oportunidad y riesgo | ✅ `getOpportunityHeatmapFn` |
| Recomendación por comportamiento + cobranza | ⚠️ CoachingPanel existe pero **no cruza saldo vencido** con la priorización |

## Operativo de visitas

| Requisito | Estado |
|---|---|
| Check-in/out con GPS + geofence anti-fraude | ✅ |
| Tiempo, ruta, evidencia, forms dinámicos, acuerdos, prospectos | ✅ |
| Registro rápido de incidencias | ⚠️ Existe en VisitFormFiller; falta atajo de un tap |

---

# Fase 5 — cerrar los huecos

## 1. Deserción y variación de consumo a nivel SKU
- Server fn `getClientProductBehaviorFn(clienteId)` que devuelve, para cada SKU histórico del cliente:
  - frecuencia media de compra (días), última compra, Δ cantidad vs periodo previo, estatus (`activo | en_baja | dormido | perdido`).
- Nueva pestaña **"Comportamiento SKU"** en `ClientDetail360` con tres listas: *dejó de comprar*, *bajando consumo*, *subiendo consumo*, más sparkline de ticket mensual (últimos 12 meses).

## 2. Alertas de oportunidad perdida
- Server fn `getMissedOpportunitiesFn`:
  - Visita cerrada sin pedido, con SKU en `reorder_predictions` vencido.
  - Promo activa aplicable no ofrecida (`product_promotions` × historial cliente).
  - SKU histórico no incluido en pedido actual (opportunity cost).
- Widget en dashboard rep + tarjeta en `ClientDetail360` + reporte para supervisor.

## 3. Inteligencia competitiva
- Migración: `competitor_migrations` (cliente_id, laboratorio_id, competidor, motivo, evidencia_url, detected_at, source: rep|inferido).
- Captura desde:
  - Botón "¿A quién le compra ahora?" al abrir `LabRiskPanel` en un cliente.
  - Campo automático en `VisitFormFiller` cuando el form incluye la pregunta.
- Server fn `getCompetitiveLandscapeFn`: agregados "laboratorios perdidos" y "principales competidores por zona/rep".
- Nueva ruta `/rep/competencia` (rep) y bloque en `/rep/supervisor`.

## 4. Sustitutos de producto
- Tabla `product_substitutes` (producto_id, sustituto_id, prioridad, motivo).
- Sugerencia automática en `InventoryQuickLookup` y `OrderQuickCreate` cuando `stock_disponible = 0`, priorizando misma indicación / laboratorio.
- Vista agregada **"Próximos ingresos"** en `/rep/inventario`: agrupa `stock_entries` con ETA futura por fecha.

## 5. Coaching + cobranza cruzados
- Extender `buildWeeklyPlanFn` para priorizar clientes con `factura vencida > 15 días` incluso cuando la oportunidad comercial es baja, marcados como `cobranza`.
- Añadir sección "Cobranza sugerida hoy" en `/rep/plan` y `/rep/coach`.

## 6. Atajos operativos
- Botón flotante **"Registrar incidencia"** en `RepLayout` que abre modal rápido (tipo, foto, texto de voz-a-texto) y crea entrada en `visit_form_responses` sin flujo largo.

## Detalles técnicos

- **Migraciones nuevas**: `competitor_migrations`, `product_substitutes`, opcional índice sobre `pedido_items(cliente_id, producto_id, created_at)` para acelerar comportamiento SKU.
- **RLS**: rep sólo ve sus clientes; admin/supervisor ven todo (mismo patrón que `rep_visits`).
- **AI Gateway (Valinor proxy)**: `generateClientInsightsFn` se enriquece con los nuevos vectores (competencia, SKUs en baja) — reutiliza el cliente existente en `src/lib/ai/rep-ai.server.ts`, no se agregan providers.
- **AI Insights por página**: agregar módulos `rep-competencia`, `rep-comportamiento-sku`, `rep-oportunidades-perdidas` a `AIPageInsights`.
- **Archivos nuevos previstos**: `src/lib/rep-behavior.functions.ts`, `src/lib/rep-competencia.functions.ts`, componentes `ClientBehaviorPanel`, `MissedOpportunitiesList`, `CompetitiveLandscape`, `SubstituteSuggestions`, `IncidentQuickButton`, rutas `rep.competencia.tsx`.
- **Sin cambios** a check-in/out, cotizaciones, cobranza, devoluciones, catálogo, prospectos, metas, cierre — ya cumplen el spec.

## Orden sugerido

1. Comportamiento SKU + ticket trend (impacto inmediato, sólo lectura).
2. Oportunidades perdidas.
3. Sustitutos + próximos ingresos.
4. Inteligencia competitiva (requiere captura en campo → 2 semanas para que empiece a haber datos).
5. Coaching+cobranza y botón de incidencia.
