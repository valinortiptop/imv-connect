
CREATE OR REPLACE VIEW public.v_notas_credito_proveedor_report
WITH (security_invoker = on) AS
SELECT
  nc.id            AS nc_id,
  nc.folio,
  nc.fecha,
  nc.factura_proveedor,
  nc.motivo,
  nc.notas,
  nc.total         AS nc_total,
  oc.folio         AS oc_folio,
  oc.id            AS oc_id,
  lab.nombre       AS laboratorio,
  it.id            AS item_id,
  it.producto_id,
  p.sku            AS clave,
  p.nombre         AS articulo,
  it.lote,
  it.cantidad,
  it.costo_unitario,
  it.importe,
  nc.created_at
FROM public.notas_credito_proveedor nc
LEFT JOIN public.ordenes_compra oc ON oc.id = nc.oc_id
LEFT JOIN public.laboratorios lab ON lab.id = nc.laboratorio_id
LEFT JOIN public.notas_credito_proveedor_items it ON it.nc_id = nc.id
LEFT JOIN public.productos p ON p.id = it.producto_id;

CREATE OR REPLACE VIEW public.v_notas_credito_venta_report
WITH (security_invoker = on) AS
SELECT
  nc.id        AS nc_id,
  nc.folio,
  nc.fecha,
  nc.total     AS nc_total,
  nc.notas,
  f.id         AS factura_id,
  f.folio      AS factura_folio,
  f.total      AS factura_total,
  f.estado     AS factura_estado,
  c.id         AS cliente_id,
  COALESCE(c.nombre_comercial, c.razon_social) AS cliente,
  d.id         AS devolucion_id,
  d.folio      AS devolucion_folio,
  nc.created_at
FROM public.notas_credito nc
LEFT JOIN public.facturas f ON f.id = nc.factura_id
LEFT JOIN public.clientes c ON c.id = f.cliente_id
LEFT JOIN public.devoluciones d ON d.id = nc.devolucion_id;

CREATE OR REPLACE VIEW public.v_cardex_material
WITH (security_invoker = on) AS
SELECT
  m.id,
  m.created_at            AS fecha,
  m.producto_id,
  p.sku                   AS clave,
  p.nombre                AS articulo,
  m.lote,
  m.caducidad,
  a.nombre                AS almacen,
  m.tipo::text            AS tipo,
  CASE
    WHEN m.tipo::text IN ('entrada','devolucion') THEN 'Entrada'
    WHEN m.tipo::text IN ('salida','venta')       THEN 'Salida'
    ELSE 'Ajuste'
  END                     AS naturaleza,
  CASE
    WHEN m.tipo::text IN ('entrada','devolucion') THEN ABS(m.cantidad)
    WHEN m.tipo::text IN ('salida','venta')       THEN -ABS(m.cantidad)
    ELSE m.cantidad
  END                     AS cantidad,
  COALESCE(m.origen_tipo, m.tipo::text) AS origen,
  m.referencia,
  m.notas
FROM public.movimientos_inventario m
LEFT JOIN public.productos p ON p.id = m.producto_id
LEFT JOIN public.almacenes a ON a.id = m.almacen_id;

GRANT SELECT ON public.v_notas_credito_proveedor_report TO authenticated;
GRANT SELECT ON public.v_notas_credito_venta_report TO authenticated;
GRANT SELECT ON public.v_cardex_material TO authenticated;
