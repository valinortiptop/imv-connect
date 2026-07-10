# Compras — Coverage Audit & Gap Closure

## Where we stand

Most of the 13 requirements are shipped. Below is the honest scorecard, followed by the work needed to fully close it out.

**✅ Fully done (7):**
- (2) Inventory admin — física/disp/comprometido/tránsito, cobertura, consumo, seguridad, reorden
- (3) Órdenes de compra — auto-propuesta, editar, historial, estatus, recepción total/parcial → entradas de almacén
- (4) Evaluación de proveedores — lead time, on-time, fill rate, incidencias, drawer con KPIs
- (6) Historial de costos — trigger auto, variación %, página de consulta *(falta la alerta por umbral)*
- (8) Recomendación comercial caducidades — clientes, frecuencia, última compra, vendedor
- (10) Baja rotación — buckets 60/90/180, valor inmovilizado, días sin venta
- (13) Asistente IA — refinamiento de planeación + insight narrativo del dashboard

**🟡 Parcial (5):**
- (1) Planeación — falta considerar **promociones activas/programadas** y **stock máximo** en la fórmula
- (7) Caducidades — vista con thresholds hardcoded (30/90d) en lugar de leer `purchase_config`
- (9) Flujo de efectivo — sólo proyección de saldo; falta **presupuesto**, **mejor fecha de compra** y **alerta de compromiso**
- (11) Centro de alertas — 4 de 9 tipos generados; falta **responsable/prioridad configurable**
- (12) Dashboard — falta **vs presupuesto**, **compras por laboratorio**, **conteo de lotes por vencer**

**❌ Faltante (1):**
- (5) Control de faltantes — tablas `shortage_reasons` / `shortage_events` existen pero **no hay UI ni server fn**; usuario no puede capturar ni ver estadísticas

---

## Plan de cierre (5 tandas)

### Fase 1 — Control de faltantes (req #5)
- `admin.compras.faltantes.tsx`: pantalla con dos tabs
  - **Registrar**: form (producto, cantidad no surtida, motivo del catálogo, pedido opcional, notas) → insert en `shortage_events`
  - **Estadísticas**: agregado por `reason_id` con % y tendencia últimos 90d, top productos afectados
- `admin.compras.faltantes.motivos.tsx`: CRUD del catálogo `shortage_reasons` (activo/inactivo, nombre, descripción)
- Server fns en `compras.functions.ts`: `listShortageReasons`, `upsertShortageReason`, `logShortageEvent`, `shortageStats`
- Sidebar: nueva entrada "Faltantes" bajo Compras

### Fase 2 — Alertas faltantes (req #11) + Costos (req #6)
Ampliar `regenerate-compras-alerts.ts` y `compras.functions.ts` con 4 tipos:
- **`incremento_costo`** — leer `cost_history` últimos 30d, comparar contra `purchase_config.costo_variacion_umbral_pct`
- **`prov_incumple`** — proveedores con fill-rate < 85% o on-time < 80% en 90d (desde `v_supplier_kpis`)
- **`oc_vencida`** — OCs con `fecha_esperada < hoy` y estado ≠ `recibida`
- **`promo_sin_stock`** — promociones activas cuya cobertura de stock proyectado < duración de la promo
- Agregar columna `responsable_user_id` + `prioridad` a `purchase_alerts`; página `admin.compras.alertas.tsx` con filtros y asignación

### Fase 3 — Flujo de efectivo (req #9)
- Nueva tabla `purchase_budgets` (empresa_id, mes, monto_mxn) + CRUD simple en `admin.compras.presupuesto.tsx`
- Server fn `bestPurchaseDate(ocId)`: cruza monto de OC × `bank_movements` proyectados × compromisos → devuelve fecha sugerida con mayor holgura en próximos 30d
- Alerta nueva `flujo_comprometido` cuando una OC borrador supere el saldo proyectado en su semana
- En `admin.compras.$id.tsx`: chip "Sugerimos programar pago: {fecha}" antes de emitir

### Fase 4 — Planeación completa (req #1)
- Extender `v_compras_planeacion`:
  - Sumar `product_promotions.uplift_pct` cuando promo activa/programada cae en la ventana de cobertura
  - Considerar `stock_max` como techo del sugerido (no proponer arriba del máximo configurado)
- Leer `purchase_config` en las vistas `v_caducidades` y `v_baja_rotacion` (thresholds dinámicos)
- Página `admin.compras.configuracion.tsx`: editar `purchase_config` (thresholds, umbrales, días objetivo)

### Fase 5 — Dashboard gerencial (req #12)
En `admin.compras.index.tsx`:
- KPI "Compras del mes vs presupuesto" (bar chart mes actual/anterior con línea de meta)
- Widget "Compras por laboratorio" (top 10, últimos 90d)
- Split "Inventario crítico / Sobreinventario" con MXN separado
- Card caducidades: agregar "N lotes por vencer" además del monto

## Technical notes

- Nuevas tablas siguen el patrón obligatorio: `CREATE TABLE` → `GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated` + `GRANT ALL ... TO service_role` → `ENABLE RLS` → `CREATE POLICY`
- Todas las alertas nuevas usan el enum documentado en `purchase_alerts.tipo` (comentario ya lista los 9 tipos)
- AI (req #13) ya está; los nuevos datos (presupuesto, faltantes, flujo) se agregarán al contexto de `aiInsightCompras` automáticamente porque lee de las vistas

## Questions before I start

1. ¿Empezamos por **Fase 1 (faltantes)** que es el único requisito completamente faltante, o prefieres que aborde todo el listado en orden?
2. Para presupuesto de compras (Fase 3) — ¿un monto global por mes/empresa, o desglosado por laboratorio/proveedor?
3. Para "responsable" de alerta (Fase 2) — ¿asignación manual, o auto-asignar por rol (ej: compras=usuario X)?

