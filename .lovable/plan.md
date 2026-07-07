
# Módulo Contabilidad — Plan de construcción

Contabilidad electrónica conforme al **Anexo 24 del SAT** (Resolución Miscelánea Fiscal) con generación de XMLs de Catálogo, Balanza y Pólizas, código agrupador SAT, IVA/IEPS en tiempo real y ligado UUID con las facturas existentes.

Es un módulo grande. Lo entrego **en dos fases** para que puedas usarlo cuanto antes: la Fase 1 te da todo lo funcional (captura, libros, estados, IVA/IEPS, integración con facturas). La Fase 2 añade los XMLs sellados y la validación XSD para envío al buzón. Confírmame si te parece o si prefieres invertir el orden.

---

## Nueva sección en el sidebar: "Contabilidad"

```text
CONTABILIDAD
├── Dashboard fiscal        /admin/contabilidad
├── Catálogo de cuentas     /admin/contabilidad/cuentas
├── Pólizas                 /admin/contabilidad/polizas
│   └── Nueva/editar        /admin/contabilidad/polizas/$id
├── Libro diario            /admin/contabilidad/diario
├── Libro mayor             /admin/contabilidad/mayor
├── Balanza de comprobación /admin/contabilidad/balanza
├── Estados financieros     /admin/contabilidad/estados
│   ├── Balance general
│   ├── Estado de resultados
│   └── Reportes personalizados
├── IVA / IEPS              /admin/contabilidad/impuestos
├── Facturas contables      /admin/contabilidad/facturas
└── Cumplimiento SAT        /admin/contabilidad/sat
```

Todo se scope-a por **empresa** (usa la tabla `empresas` que ya existe: cada movimiento contable pertenece a una empresa emisora).

---

## Fase 1 — Contabilidad funcional (esta entrega)

### 1. Base de datos

Nuevas tablas (todas scoped por `empresa_id`, con RLS por rol admin/contador):

- **`cuentas_contables`** — código agrupador SAT + código local, naturaleza (deudora/acreedora), nivel, cuenta padre, permite movimientos (bool), moneda.
- **`ejercicios_fiscales`** — año fiscal, estado (abierto/cerrado), fecha de cierre.
- **`periodos_contables`** — mes del ejercicio, estado (abierto/cerrado/enviado al SAT).
- **`polizas`** — tipo (Ingreso/Egreso/Diario), folio, fecha, concepto, estado (borrador/asentada/cancelada), periodo, empresa, total_cargos, total_abonos, created_by.
- **`poliza_movimientos`** — cuenta, cargo, abono, concepto, referencia (factura_id / pago_id / oc_id / devolucion_id opcionales para ligado), uuid_cfdi (para SAT).
- **`poliza_impuestos`** — desglose IVA acreditable/trasladado 16%/8%/0%/exento, IEPS 6%/otros, retenciones ISR/IVA.
- **`sat_codigo_agrupador`** — catálogo oficial semilla (lookup, read-only).
- **`reportes_personalizados`** — plantillas de estados financieros parciales guardados por el usuario (agrupación de cuentas + filtros).

Extensiones a tablas existentes:
- `facturas.poliza_id` — link opcional a la póliza que la asentó.
- `pagos.poliza_id`, `ordenes_compra.poliza_id`, `devoluciones.poliza_id` — idem.

Validación por trigger: una póliza no se puede pasar de "borrador" a "asentada" si `total_cargos ≠ total_abonos` o si el periodo está cerrado.

### 2. Catálogo de cuentas SAT (seed)

Semilla del Anexo 24 con código agrupador oficial: 100 Activo, 200 Pasivo, 300 Capital, 400 Ingresos, 500 Costos, 600 Gastos, 700 Resultado integral de financiamiento, 800 Cuentas de orden. Con desglose típico:

- 118.01 IVA acreditable pagado
- 119.01 IVA acreditable pendiente de pagar
- 208.01 IVA trasladado cobrado
- 209.01 IVA trasladado pendiente de cobrar
- 118.02 / 208.02 IEPS acreditable / trasladado (con subcuentas 6%, 8%, 26.5%, etc.)
- Retenciones ISR/IVA
- Bancos, clientes, proveedores, ventas, costos, gastos operativos

El usuario puede agregar subcuentas ilimitadas conservando el código agrupador padre.

### 3. Pólizas

- Tres tipos: **Ingreso, Egreso, Diario** (los tres tipos requeridos por SAT).
- Editor tipo hoja de cargos/abonos con auto-cuadre en vivo, autocompletar de cuenta, plantillas.
- Ligado UUID CFDI en cada movimiento (obligatorio para pólizas que involucren IVA acreditable/trasladado según SAT).
- Estados: borrador → asentada → cancelada (nunca se borra, siempre queda huella).
- Búsqueda por folio, cuenta, referencia, fecha, monto, UUID.

### 4. Integración manual con módulos existentes

Botón **"Contabilizar"** en:
- `facturas/$id` → sugiere póliza de ingreso (Cliente / Ventas + IVA trasladado).
- `pagos` → sugiere póliza de ingreso (Banco / Cliente + traspaso IVA pendiente → cobrado).
- `ordenes_compra/$id` (recibidas) → póliza de egreso (Inventario + IVA acreditable pendiente / Proveedor).
- `devoluciones/$id` → póliza de diario en reversa.

La póliza se abre pre-cargada; el usuario ajusta cuentas y confirma. Al asentar se guarda el `poliza_id` en el documento fuente para no duplicar.

### 5. Libros

- **Libro diario** — cronológico de todas las pólizas asentadas, filtro por periodo/tipo/empresa, exportable CSV/PDF.
- **Libro mayor** — por cuenta, saldo inicial + cargos + abonos + saldo final, drill-down a movimientos, gráfica de saldo.

### 6. Balanza de comprobación

Reporte con saldo inicial, cargos, abonos, saldo final por cuenta, agrupado por nivel (1º / 2º / 3º). Filtro por mes/rango, empresa. Vista de detalle "solo cuentas de mayor" vs "todo el detalle".

### 7. Estados financieros

- **Balance general** — Activo / Pasivo / Capital automático desde balanzas.
- **Estado de resultados** — Ventas − Costos − Gastos = Utilidad. Con desglose por mes y comparativo año anterior.
- **Reportes personalizados / parciales** — el usuario selecciona qué cuentas incluir, cómo agruparlas, y guarda la plantilla. Ejemplos típicos: "Estado de resultados por línea de negocio", "Balance parcial de bancos", "Gastos por departamento".

### 8. IVA / IEPS en tiempo real

Página dedicada `/admin/contabilidad/impuestos` con tres bloques:

- **IVA acreditable** — pendiente de pagar vs pagado (efectos de flujo), con traspaso automático al pagar facturas de proveedor.
- **IVA trasladado** — pendiente de cobrar vs cobrado, con traspaso automático al cobrar facturas de cliente.
- **IEPS 6%** (bebidas saborizadas) y otras tasas — mismo esquema acreditable/trasladado.

Los "traspasos en tiempo real" son movimientos automáticos entre las cuentas **pendiente** ↔ **cobrado/pagado** cada vez que se registra un pago o una devolución, disparados por triggers al asentar las pólizas correspondientes. Vista de saldos actualizados al segundo con desglose por tasa (16 / 8 / 0 / exento / IEPS 6%).

Reporte mensual DIOT-ready (proveedores) exportable.

### 9. Facturas contables

Vista que cruza el módulo de facturas actual con el estado contable: qué facturas ya se contabilizaron, cuáles están pendientes, cuál es el saldo cliente por cuenta, y el efecto IVA. Es la conexión visible entre "facturación" y "contabilidad".

### 10. Reglas del SAT (norma)

Página `/admin/contabilidad/sat` con:
- Configuración del RFC emisor, régimen fiscal, código postal por empresa (ya lo tenemos en `empresas`, aquí lo mostramos como panel de cumplimiento).
- Validaciones activas: nivel de cuenta ≥ 3, código agrupador presente en todas las cuentas de movimiento, UUID en pólizas con impuestos, pólizas cuadradas, periodo no cerrado.
- Semáforo mensual: "¿tu contabilidad de este mes cumple para envío?"
- Referencia inline a las obligaciones (RMF 2.8.1.6, Anexo 24) para que el usuario sepa qué le está pidiendo la app.

---

## Fase 2 — Cumplimiento SAT completo (siguiente entrega)

Cuando la Fase 1 esté estable y probada con datos reales:

- **XMLs Anexo 24 sellados**:
  - Catálogo de cuentas (envío único / cuando cambia).
  - Balanza de comprobación (mensual: normal + complementaria + cierre anual).
  - Pólizas del periodo (a petición del SAT).
- **Validación XSD** oficial contra los esquemas publicados por SAT.
- **Sellado con CSD** (certificado de sello digital) — subida del `.cer` y `.key` en `empresas`, sellado server-side con la llave privada, generación del `Sello` base64 SHA-256.
- **Ligado UUID** completo: cada movimiento con impuestos referencia el UUID del CFDI relacionado.
- **Folio fiscal por operación**, control de secuencia mensual.
- **Exportación mensual empaquetada** (ZIP con XMLs firmados) listo para subir al buzón tributario.
- **Bitácora de envíos** con acuse.

Esta fase requiere que la empresa nos comparta su CSD real para pruebas; no es algo que se pueda simular a fondo.

---

## Detalles técnicos

- **Stack**: TanStack Start + Supabase. Server functions con `requireSupabaseAuth` para todo lo que asienta pólizas o cierra periodos (RLS gate + rol `contador`/`admin`).
- **Rol nuevo**: `contador` en el enum `app_role`, con permisos sobre las rutas `/admin/contabilidad/*` vía `role_permissions`.
- **Migraciones**: una sola migración grande crea tablas + seed de código agrupador SAT + seed de plan de cuentas base. Grants explícitos a `authenticated`/`service_role`; RLS con `has_role(auth.uid(), 'admin' | 'contador')`.
- **Triggers**:
  - Cuadre de póliza al asentar.
  - Bloqueo de periodo cerrado.
  - Traspaso IVA pendiente ↔ cobrado/pagado.
  - Reversa automática al cancelar póliza (asienta póliza espejo, no borra).
- **Cálculos pesados** (balanza, mayor, estados) en funciones Postgres para que aguanten volumen.
- **PDF export**: reusamos el patrón de `ventasPdf.ts` para pólizas y estados financieros.
- **Sellado XML (Fase 2)**: server function con `node:crypto` + WebCrypto para firma RSA-SHA256; el CSD se guarda cifrado en Supabase Storage bucket privado.

---

## Fuera del alcance en esta primera versión

- Nómina y su contabilización (es otro anexo del SAT completo).
- Activos fijos / depreciación automática (podemos añadirlo en fase 3).
- Conciliación bancaria automática vía API bancaria.
- Consolidación multi-empresa (cada empresa lleva su contabilidad aislada; consolidación viene después).

---

¿Empiezo con **Fase 1** completa (te toma 1 sesión larga levantar toda la estructura, catálogos, pólizas, libros, estados, IVA/IEPS y la integración manual con lo existente)? Si prefieres que arranque por un módulo específico primero (p. ej. solo pólizas + libro diario para empezar a capturar hoy mismo), dímelo y lo reordeno.
