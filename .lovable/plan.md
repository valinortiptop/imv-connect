# Crédito y Cobranza — Estado actual vs. faltantes

## Ya implementado

**Datos / DB**
- Tablas: `cliente_credito`, `cobranza_gestiones`, `cobranza_promesas_pago`, `credito_autorizaciones`, `cobranza_comunicaciones`, `cliente_riesgo_snapshots`, `cobranza_alertas`, `cliente_documentos`.
- Vista `v_cliente_credito_360` y trigger `fn_bloquear_por_credito` (bloqueo automático por crédito/vencido).
- Bucket privado `cliente-documentos` con RLS.

**UI (/admin/credito-cobranza)**
- Layout con tabs: Dashboard, Cartera, Gestiones, Promesas, Alertas, Autorizaciones.
- Cliente 360 de cobranza + Expediente digital por cliente.
- Dashboard ejecutivo (KPIs, aging, riesgo, tendencia 90d, top-10 exposición).

**Server functions (`cobranza.functions.ts`, `cobranza-alertas.functions.ts`)**
- Envío de estado de cuenta y recordatorios (Resend vía Valinor).
- NC por pronto pago (Facturapi).
- Sugerencia de aplicación de pagos.
- Análisis IA de riesgo en tiempo real (Gemini vía Valinor).
- CRUD de expediente + URLs firmadas.
- Gestión de alertas.

**Automatización (pg_cron)**
- `cobranza-recordatorios` diario.
- `cobranza-edo-cuenta` (semanal/quincenal/mensual por cliente).
- `cobranza-riesgo-nocturno` (recalcula score + alertas).

---

## Faltantes / gaps vs. el requerimiento

### 1. Complementos de pago (REP) — no implementado
El requerimiento pide "Generación y seguimiento de complementos de pago". Hoy timbramos facturas y NCs, pero **no hay flujo automático de REP** al registrar pagos de facturas PPD. Falta:
- Server function `emitirComplementoPagoFn` (Facturapi).
- Trigger o hook al insertar en `pagos` de facturas PPD.
- Vista de seguimiento de complementos pendientes / timbrados.

### 2. Flujo de autorizaciones — solo esqueleto
Existe la tabla y la página, pero falta:
- Formulario para **solicitar** autorización (desbloqueo, incremento límite, excepción de venta bloqueada).
- Workflow de aprobación con roles (quién puede aprobar según monto).
- Notificaciones al solicitante y al aprobador.
- Ligar autorizaciones a pedidos/facturas específicas.

### 3. Historial de modificaciones de crédito — falta auditoría
- Tabla `cliente_credito_historial` (o trigger de audit) para trackear cambios de límite/días/condiciones con usuario, fecha y motivo.
- Vista "Historial de condiciones crediticias" en Cliente 360.

### 4. Generación automática de tareas de cobranza
Requerimiento: "Generación automática de tareas de seguimiento". Hoy `cobranza-riesgo-nocturno` crea alertas, pero no crea **tarjetas en el kanban** (`kanban_cards`) asignadas al gestor. Falta:
- Al detectar promesa incumplida / cliente sin gestión en N días / alerta crítica → crear tarjeta kanban.
- Configurar el board/columna destino en `system_config`.

### 5. Aplicación real de pagos (no solo sugerencia)
`sugerirAplicacionPagoFn` sugiere, pero falta UI para **aplicar** el pago sugerido a las facturas seleccionadas en un click (mutación multi-fila con transacción).

### 6. Concentración de riesgo por vendedor/zona
El dashboard ya muestra top-10 exposición y aging, pero no la **concentración por vendedor y por zona** que pide el requerimiento. Faltan tarjetas/gráficos:
- Cartera vencida por representante.
- Cartera vencida por zona/ruta.

### 7. Proyección de ingresos con probabilidad de cobro
Requerimiento explícito: "Proyección de ingresos con base en vencimientos y comportamiento histórico". Faltaría un panel que multiplique saldo por vencer × probabilidad (derivada del score IA) por semana/mes.

### 8. Plantillas configurables de comunicación
Hoy los HTML de correos están hard-coded en los crons/server functions. Falta:
- Tabla `cobranza_plantillas` (asunto/cuerpo con variables `{{cliente}}`, `{{saldo}}`, `{{facturas}}`).
- UI de administración de plantillas.
- Crons leen plantilla en lugar de string literal.

### 9. Reglas configurables (system_config)
- Días antes/después del vencimiento para disparar recordatorios (hoy hard-coded).
- Umbrales de nivel de riesgo (score → nivel).
- Umbral "sin gestión reciente" (días).
- Política global default de pronto pago (fallback si el cliente no la define).

### 10. Reportes / exportación
- Exportación a Excel de la cartera con filtros aplicados.
- Reporte de gestiones por gestor / periodo.
- Reporte de cumplimiento de promesas.

### 11. Alertas de expediente vencido
La tabla soporta fecha de vencimiento por documento, pero no hay **cron ni alerta automática** cuando un documento está por vencer o vencido. Debe integrarse a `cobranza-riesgo-nocturno`.

### 12. Bitácora de comunicaciones en Cliente 360
`cobranza_comunicaciones` se llena desde los crons pero **no se muestra** un timeline unificado (email + gestiones + promesas + autorizaciones) en Cliente 360.

### 13. Notificaciones in-app
Uso de la tabla `notifications` existente para avisar al gestor cuando: alerta crítica creada, promesa incumplida hoy, autorización solicitada/aprobada, documento vencido.

### 14. Recomendaciones IA persistidas
`analizarRiesgoClienteFn` corre en vivo. Falta guardar las **recomendaciones IA** (ajuste de límite, revisar condiciones) en tabla y mostrarlas en dashboard como "Acciones sugeridas por IA" con botón para aceptar/descartar.

---

## Propuesta de siguientes fases

**Fase 5 — Cierre transaccional (crítico)**
- Complementos de pago (REP) automáticos.
- Aplicación real de pagos multi-factura.
- Flujo de autorizaciones con workflow y notificaciones.
- Historial/auditoría de cambios en condiciones crediticias.

**Fase 6 — Configurabilidad**
- Plantillas de comunicación editables.
- Reglas configurables (días, umbrales, política pronto pago default).
- Alertas de expediente vencido integradas al cron nocturno.

**Fase 7 — Inteligencia y ejecución**
- Kanban auto-generado desde alertas/promesas incumplidas.
- Timeline unificado en Cliente 360.
- Notificaciones in-app.
- Recomendaciones IA persistidas + accionables.
- Concentración de riesgo por vendedor/zona en dashboard.
- Proyección de ingresos por probabilidad de cobro.

**Fase 8 — Reportería**
- Export Excel de cartera / gestiones / promesas.
- Reportes por gestor y periodo.

---

## Preguntas antes de continuar

1. ¿Priorizamos **Fase 5** (complementos de pago + aplicación real + autorizaciones)? Es lo que cierra el ciclo transaccional y bloquea flujo de efectivo real.
2. ¿O prefieres primero **Fase 7** (kanban auto, timeline, notificaciones) para que el equipo lo use a diario aunque falte lo transaccional?
3. Para complementos de pago: ¿emitimos **automáticamente** al registrar pago de PPD, o requiere confirmación manual (checkbox "timbrar REP") en el formulario de pago?
