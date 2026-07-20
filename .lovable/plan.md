## Módulo Crédito y Cobranza — Plan por fases

El alcance descrito es amplio (IA predictiva, timbrado automático de NC por pronto pago, complementos de pago, expediente digital, autorizaciones con workflow, tableros ejecutivos). Propongo entregarlo en **4 fases**, empezando por la base sobre la que hoy ya existe (`/admin/cobranza`, `v_saldos_clientes`, `facturas`, `pagos`, `notas_credito`).

---

### Fase 1 — Base 360° del cliente y gestión operativa

**DB (nuevas tablas):**
- `cliente_credito` — límite de crédito, días autorizados, condición de pago, bloqueado (bool), motivo_bloqueo, riesgo_manual, updated_by/at.
- `cobranza_gestiones` — bitácora: cliente_id, factura_id (opcional), tipo (llamada/correo/whatsapp/visita), resultado, notas, created_by, created_at, next_action_at.
- `cobranza_promesas_pago` — factura_id, cliente_id, monto, fecha_promesa, estado (pendiente/cumplida/incumplida), creado_por, notas.
- `credito_autorizaciones` — cliente_id, tipo (desbloqueo, incremento_limite, excepcion), estado (solicitada/aprobada/rechazada), monto, motivo, solicitado_por, aprobado_por, fecha.
- Vista `v_cliente_credito_360` — junta saldos, promedio de días de pago, utilización de línea, última gestión, promesas activas.

**Nueva ruta:** `/admin/credito-cobranza/` (layout con tabs) reemplaza a `/admin/cobranza` (redirect):
1. **Cartera** — tabla actual mejorada + filtros por vendedor/zona/riesgo, exportación.
2. **Cliente 360** (`/credito-cobranza/clientes/$id`) — un solo tablero con: información fiscal, línea de crédito y utilización, aging, historial de facturas/pagos/NC, bitácora de gestiones, promesas de pago, autorizaciones. Reusa Client360Drawer donde aplique.
3. **Gestiones del día** — cola de trabajo priorizada (mayor riesgo/monto/antigüedad, promesas por vencer, sin seguimiento reciente).
4. **Promesas de pago** — listado con estado y cumplimiento.
5. **Autorizaciones** — solicitudes de desbloqueo/incremento/excepción con flujo aprobación.

**Integración con Cliente 360 existente:** nueva pestaña "Crédito" en `Client360Drawer` mostrando resumen y CTA para abrir el módulo.

---

### Fase 2 — Automatización administrativa

- **Estados de cuenta automáticos:** server function que genera PDF por cliente + envío por Resend (vía Valinor proxy). `pg_cron` diario/semanal según configuración por cliente (nueva columna `enviar_edo_cuenta_cada` en `cliente_credito`).
- **Recordatorios de pago:** cron que dispara email/WhatsApp 5 días antes, día de vencimiento, y a los 7/15/30 días después. Plantillas editables en `configuracion`.
- **Bloqueo automático:** trigger al crear pedido/factura — si saldo vencido > 0 o excede límite, marca `cliente_credito.bloqueado = true` y requiere autorización.
- **Notas de crédito por pronto pago:** al aplicar pago dentro de N días, sugerir NC automática (monto = factura × % pronto pago configurable). Timbrado vía Facturapi (ya existe `facturapi.functions.ts`).
- **Complementos de pago:** generación automática al registrar pago de factura PPD, timbrado vía Facturapi.
- **Aplicación sugerida de pagos:** al registrar pago sin factura seleccionada, sugerir facturas más antiguas / mismo monto.
- **Tareas automáticas:** al detectar promesa incumplida o cliente sin gestión en X días, crear tarjeta en kanban existente asignada al gestor.

---

### Fase 3 — Inteligencia artificial (vía Valinor proxy → Gemini)

- Server function `analizarRiesgoCliente` que calcula un score (0-100) por cliente con:
  - promedio de días de pago vs. condición
  - tendencia últimos 90 días
  - utilización de crédito
  - historial de promesas cumplidas
  - concentración de saldo vencido
- Guarda snapshot diario en `cliente_riesgo_snapshots` para tendencia.
- IA (Gemini) genera **recomendaciones en lenguaje natural**: sugerir ajuste de límite, revisión de condiciones, priorización. Panel "Recomendaciones IA" en Cliente 360 y en cartera.
- Alertas tempranas: cron nocturno que detecta cambios negativos y crea notificaciones para el gestor asignado.

---

### Fase 4 — Expediente digital + Tableros ejecutivos

- **Expediente digital:** reusa `empresa_documentos` pattern → nueva tabla `cliente_documentos` (RFC/constancia, contratos, pagarés, evidencias). Alertas por vencimiento (constancia fiscal anual, etc.).
- **Dashboard ejecutivo** en `/admin/credito-cobranza/dashboard`:
  - KPIs: cartera total, vencida, DSO, recuperación día/semana/mes, cumplimiento de promesas.
  - Gráficos: aging distribution, tendencia recuperación, top 10 exposición, concentración por vendedor/zona.
  - Proyección de ingresos: suma de vencimientos × probabilidad de cobro (basada en score).

---

### Decisiones técnicas comunes

- Server functions con `requireSupabaseAuth` para todo lo transaccional (`src/lib/cobranza.functions.ts`).
- Envíos de email/SMS vía **Valinor proxy** (respetando la regla del proyecto — Resend/Gemini ya están ahí).
- Todas las tablas nuevas con RLS `authenticated` + `service_role`, GRANTs correctos.
- Permisos: agregar rutas a `permission_routes` para que `role_permissions` controle acceso.

---

### Preguntas antes de arrancar

1. **¿Empezamos por Fase 1 completa?** ¿O prefieres que ataque primero **Cliente 360 de cobranza + bitácora de gestiones + promesas de pago** (lo más urgente operacionalmente) y dejemos autorizaciones/bloqueos para una segunda pasada?
2. **Notas de Crédito por pronto pago:** ¿la política es un % fijo global, por cliente, o por lista de precios? ¿Y a partir de cuántos días se considera "pronto pago"?
3. **Envío de estados de cuenta / recordatorios:** ¿usamos Resend (ya conectado vía Valinor) para email y sólo email por ahora, o también WhatsApp desde el inicio?
4. **Score de riesgo IA:** ¿lo calculamos en tiempo real al abrir el cliente, o snapshot nocturno (más barato) con recálculo bajo demanda?

Confirmando estos 4 puntos arranco con Fase 1.