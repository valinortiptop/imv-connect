
# Replicar diagramas de Clientes y Almacén

Los dashboards actuales usan una malla 4×2 genérica que no coincide con los diagramas de referencia del contador. Voy a reconstruirlos nodo a nodo y flecha a flecha para que se lean igual que las capturas de ALPHA ERP.

## 1. Extender `FlowDiagram`

El componente sólo dibuja líneas rectas y no soporta celdas vacías ni flechas dobles. Añado:

- **Ruteo ortogonal (codos)**: cada arista se dibuja como polilínea horizontal→vertical o vertical→horizontal, igual a las flechas grises de la referencia.
- **`bidirectional?: boolean`** en `FlowEdge`: pone punta de flecha en ambos extremos (Consignaciones ↔ Dev. consignaciones, Pedidos ↔ Remisiones, Remisiones ↔ Guías, Cotizaciones ↔ Seguimiento cotizaciones, Movimientos ↔ Integración de costos).
- **`bend?: "hv" | "vh"`**: fuerza el orden del codo cuando el default no encaja.
- Nodos permiten `col`/`row` con huecos (ya lo hacen), y el header del nodo queda más compacto para que quepan 7 columnas.
- Marcadores de flecha del mismo gris (`muted-foreground`) y trazo un poco más fuerte para lectura tipo diagrama.

## 2. Clientes dashboard — malla 7×3

Layout exacto a `image-208.png`:

```text
col:      1                2                3            4                    5                       6                          7
row 1:    Prospectos       Clientes         —            Consignaciones       Dev. consignaciones     Mapas de entrega           Notas de venta
row 2:    Seguim. notas    Cotizaciones     Pedidos      Facturas             Seg. CxC                Relación depósitos banca   Aplicación de cobranza
row 3:    Productos/serv.  Seg. cotiz.      Remisiones   Guías de embarque    Devol/desc/anticipos    —                          Notas de cargo/cheq. dev.
```

Flechas (todas ortogonales, replicando la imagen):

- Prospectos → Clientes
- Clientes → Seguim. notas (baja)
- Clientes → Cotizaciones (baja)
- Clientes → Productos/servicios (baja larga)
- Cotizaciones ↔ Seg. cotizaciones (vertical bidireccional)
- Cotizaciones → Pedidos
- Pedidos → Facturas
- Pedidos → Consignaciones (sube)
- Consignaciones → Facturas (baja)
- Consignaciones ↔ Dev. consignaciones
- Pedidos ↔ Remisiones (vertical bidireccional)
- Remisiones ↔ Guías de embarque (horizontal bidireccional)
- Guías de embarque → Facturas (sube por codo)
- Devol/desc/anticipos → Facturas (sube por codo)
- Facturas → Seg. CxC → Relación depósitos → Aplicación de cobranza
- Notas de cargo → Aplicación de cobranza (sube)

Cada nodo mantiene su `to` (ruta destino), su `count` en vivo desde `getClientesDashboardCountsFn` y su color de acento (primary para el flujo principal, warning para remisión, success para factura, danger para cobranza vencida). Añado rutas destino para los nodos nuevos:

- Consignaciones, Dev. consignaciones → `/admin/consignaciones` (si no existe, apunto a `/admin/pedidos` con un TODO comentado).
- Mapas de entrega → `/admin/logistica/mapa`.
- Notas de venta → `/admin/pos` o `/admin/facturas` (uso `/admin/facturas` mientras).
- Seg. CxC → `/admin/credito-cobranza/cartera`.
- Relación depósitos → `/admin/bancos/depositos`.
- Aplicación de cobranza → `/admin/credito-cobranza/aplicacion` (fallback `/admin/pagos`).
- Notas de cargo/cheques devueltos → `/admin/credito-cobranza/notas-cargo` (fallback `/admin/pagos`).
- Seguimientos de notas y Seguimiento de cotizaciones → sus vistas actuales o placeholders con badge "Próximamente" cuando la ruta no existe.

No creo rutas nuevas en este plan — sólo apunto a las existentes; los destinos faltantes se marcan visualmente como deshabilitados (borde `muted` + tooltip "Próximamente") en lugar de romper el link.

## 3. Almacén dashboard — malla 4×3

Layout exacto a `image-209.png`:

```text
col:    1                    2                        3                    4
row 1:  —                    Integración de costos    —                    —
row 2:  Almacenes            Movimientos              Inventario físico    Consulta de inventario
row 3:  Productos/servicios  Guías de embarque        —                    —
```

Flechas:

- Almacenes → Movimientos
- Movimientos ↔ Integración de costos (vertical bidireccional)
- Movimientos → Inventario físico → Consulta de inventario
- Movimientos → Guías de embarque (baja)
- Productos/servicios → Movimientos (opcional, gris tenue como en la referencia)

Counts en vivo se conservan (`almacenes`, `productos`, `movimientosHoy`, etc.). Añado un nodo/contador para "Integración de costos" reutilizando `entradasHoy` como badge (movimientos valuados hoy).

## 4. Notas contables (banda inferior)

Conservo la banda de "Reglas contables (Eduardo Islas)" en Clientes y "Integración de costos" en Almacén, pero recorto el texto para que quepa junto a un diagrama más ancho.

## Detalles técnicos

- Sólo edito: `src/components/dashboards/FlowDiagram.tsx`, `src/routes/admin.clientes-dashboard.tsx`, `src/routes/admin.almacen-dashboard.tsx`.
- No toco `dashboard-counts.functions.ts` salvo para exponer, si hace falta, `consignaciones` y `notasCargo` como contadores adicionales (una sola query extra, muy barata).
- Responsive: en mobile la malla colapsa a `grid-cols-2` con `overflow-x-auto` para que el diagrama siga siendo legible sin romper el layout.
- Sin cambios de base de datos ni de lógica de triggers.
