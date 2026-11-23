# Configuración fiscal por producto (IVA, IEPS, retenciones)

Basado en la sesión de Contabilidad del 20 nov: los impuestos se asignan **por código fiscal en cada producto**, no con paquetes fiscales, y deben poder ajustarse en altas manuales futuras. IVA IMMEX ya no está vigente, así que no se incluye.

## 1. Códigos fiscales (catálogo base)
Los 8 códigos que mandó el contador, cada uno con su combinación de impuestos:

| Código | IVA | IEPS | Ret. IVA | Ret. ISR |
|---|---|---|---|---|
| IVA 16% (Item normal) | 16% | — | — | — |
| IVA 0% | 0% | — | — | — |
| EXENTO | Exento | — | — | — |
| IEPS 6% + IVA 0% | 0% | 6% | — | — |
| IVA RET 4% (Flete) | 16% | — | 4% | — |
| IVA RET 10.6667% | 16% | — | 10.666667% | — |
| ISR RET 10% | 16% | — | — | 10% |
| ISR RET 1.25% (RESICO) | 16% | — | — | 1.25% |

Contabilidad puede editar porcentajes o crear códigos nuevos si cambian las reglas fiscales. (Las tasas de IVA en los códigos de retención las dejo en 16%; el contador puede corregirlas.)

## 2. Ficha 360 del producto: nueva pestaña "Fiscal"
- Selector rápido de **código fiscal** (rellena todo de un clic).
- Cuatro tarjetas, como en su sistema anterior, cada una con su color de acento:
  - **IVA**: Por tipo de cliente/proveedor · Por producto (%) · Exento · casilla "No objeto de impuesto".
  - **IEPS**: Sí / No + %.
  - **Retención de IVA**: Por tipo de cliente/proveedor · Por producto (%) · Sin retención.
  - **Retención de ISR**: Por tipo de cliente/proveedor · Por producto (%) · Sin retención.
- Si se cambia una tarjeta a mano, el código se marca como "Personalizado".
- Muestra también Clave SAT de producto y de unidad (ya existen), editables.
- Solo admin y contabilidad pueden guardar; los demás solo ven.
- El desglose de precio actual pasa a usar la configuración nueva (incluye retenciones).

## 3. Nueva página: Contabilidad → "Impuestos por producto"
- Tabla de todos los productos: SKU, nombre, laboratorio, código fiscal, IVA, IEPS, ret. IVA, ret. ISR, clave SAT producto/unidad, activo.
- Filtros por código fiscal, cada impuesto, "sin código asignado", "sin clave SAT", activo/inactivo, laboratorio; búsqueda y orden por cualquier columna.
- Contadores arriba (productos por código, pendientes de configurar).
- Edición masiva: seleccionar varios productos y asignar un código.
- Exportar a Excel.
- Paginada (más de 1,000 productos).

## 4. Datos actuales
Los productos se pre-asignan según su IVA/IEPS actual (16% → IVA 16%, 0% → IVA 0%, IEPS 6% → IEPS 6% + IVA 0%). Ninguno recibe retención automática; quedan para que el contador los revise desde la nueva página.

## Pendiente del contador
- Nuevo documento con los **códigos agrupadores faltantes** (no forma parte de este cambio; se cargará cuando llegue).
- Catálogo de productos actualizado con claves SAT y código fiscal por producto: cuando llegue, se puede importar en la nueva página.

## Detalles técnicos
- Migración: tabla `codigos_fiscales` (clave, nombre, iva_modo, iva_pct, objeto_impuesto, ieps_pct, ret_iva_modo, ret_iva_pct, ret_isr_modo, ret_isr_pct, activo) con GRANTs, RLS: lectura `is_staff`, escritura admin/contabilidad vía `has_any_role`. Insert de los 8 códigos en la misma migración.
- `productos`: columnas `codigo_fiscal_id`, `iva_modo`, `objeto_impuesto`, `ret_iva_modo`, `ret_iva_pct`, `ret_isr_modo`, `ret_isr_pct`. Se mantienen `iva_pct` e `ieps_pct` (los usan facturas y pedidos) y se sincronizan al guardar. Backfill del código desde iva_pct/ieps_pct en la migración.
- Lógica pura `src/lib/product-tax.ts` (aplicar código, detectar personalizado, desglose con retenciones) con pruebas vitest de los 8 códigos.
- Server fns `product-tax.functions.ts` con `requireSupabaseAuth` y verificación de rol para guardar y asignación masiva.
- Ruta `src/routes/admin.contabilidad.productos-fiscal.tsx`, registro en `nav-items.ts`, permisos y tarjeta en el índice de Contabilidad.
- No se cambia todavía el timbrado/Factura API; las retenciones quedan guardadas para conectarlas cuando se haga la facturación.
