# Rediseño de la página de Onboarding: "Salida de NetSuite"

La página de Onboarding pasa a ser el tablero de seguimiento del plan que se envió a IMV. Así IMV y Valinor ven en un solo lugar qué documentos faltan, qué sesiones están agendadas, quién es responsable de cada cosa y qué tan cerca están de apagar NetSuite.

## Qué verá IMV

1. **Encabezado de arranque**
   - Fecha de corte (editable por admin), días restantes y fase actual: Preparación → Sesiones → Cargas iniciales → Paralelo → NetSuite apagado.
   - Avance general (%) y avance por área.
   - Decisión NetSuite: "Cargas manuales" (recomendado) o "API durante el paralelo", con nota.

2. **Pestaña Documentos** (reemplaza la lista actual)
   - Agrupados por área: Comercial, Cobranza y finanzas, Almacén y compras, Contabilidad, Fiscal / Facturación.
   - Cada documento muestra: responsable, fecha compromiso, estado (Pendiente / En proceso / Entregado / Validado / No aplica), archivos subidos, notas.
   - Botón de plantilla descargable (Excel) donde aplica: clientes, precios, productos, cartera por factura, inventario por lote, proveedores, cuentas por pagar, catálogo de cuentas, balanza.
   - "Validado" solo lo marca Valinor o el contador después de revisar.
   - Se conserva el lector con IA y la carga de imágenes de productos.

3. **Pestaña Sesiones**
   - Las 9 sesiones del plan (arranque, clientes y precios, pedido a factura, comisiones, cobranza y bancos, contabilidad, almacén y compras, capacitación, revisión de paralelo).
   - Cada una con participantes, duración, fecha/hora agendada, estado (Por agendar / Agendada / Realizada), acuerdos y pendientes que surgieron.

4. **Pestaña Responsables**
   - Tabla por persona/rol (Dirección, Maresi, Contador, Cobranza, Almacén/Compras, Admin NetSuite, Valinor) con sus documentos y sesiones pendientes y su avance.

5. **Pestaña Desarrollo pendiente**
   - Lista de lo que Valinor debe terminar (asistente de carga inicial, cierre de mes, Facturapi productivo, ajustes de sesiones, revisión de permisos) con estado visible para IMV.

6. **Pestaña Paralelo** (se activa en la fase Paralelo)
   - Revisión semanal: ventas, cartera e inventario en app vs. NetSuite, diferencia y comentario; botón final "Aprobar apagado de NetSuite" (solo Dirección/admin).

Funciona en celular (tarjetas en lugar de tablas) y muestra estados de carga, vacío y error.

## Datos iniciales

Se precargan todos los documentos, sesiones, responsables y tareas del plan enviado. Los elementos actuales del onboarding que sigan siendo útiles (datos de empresa, branding, plantillas) se mueven a un área "Configuración inicial"; sus archivos ya subidos se conservan.

## Detalle técnico

- Migración: ampliar `onboarding_items` con `area`, `responsable_rol`, `responsable_nombre`, `fecha_compromiso`, `plantilla_clave`, estado `validado`, `validado_por/validado_at`. Nuevas tablas `onboarding_programa` (fecha de corte, fase, decisión NetSuite), `onboarding_sesiones`, `onboarding_tareas_dev`, `onboarding_paralelo_semanas`; cada una con GRANTs, RLS (lectura para usuarios internos, edición admin; validación admin/contabilidad) y triggers `updated_at`. Seed con INSERT literales en la misma migración.
- Ruta `admin.onboarding.tsx` reescrita con pestañas y componentes en `src/components/onboarding/`; lecturas con loader + `useSuspenseQuery`; escrituras con server functions autenticadas que validan rol en servidor.
- Plantillas Excel generadas en cliente con columnas que coinciden con los importadores existentes de `onboarding-import.ts`.
- Fechas en hora de Ciudad de México.
- Registrar la decisión de estructura en `AGENTS.md` y la tarea en `roadmap.md`.
