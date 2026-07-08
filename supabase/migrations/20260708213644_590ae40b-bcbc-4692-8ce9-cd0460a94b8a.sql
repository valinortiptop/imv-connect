
-- Ensure facturas created from pedidos are tagged with the empresa so they
-- surface on the "Facturas contables" page in accounting.
CREATE OR REPLACE FUNCTION public.crear_factura_desde_pedido(
  _pedido uuid,
  _dias_credito integer DEFAULT 30,
  _fecha_emision date DEFAULT NULL::date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_pedido public.pedidos;
  v_factura_id uuid;
  v_emision date;
  v_empresa_id uuid;
begin
  select * into v_pedido from public.pedidos where id = _pedido;
  if not found then
    raise exception 'pedido_no_encontrado' using errcode = 'P0001';
  end if;
  if v_pedido.estado = 'cancelado' then
    raise exception 'pedido_cancelado' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.facturas where pedido_id = _pedido) then
    raise exception 'factura_ya_existe' using errcode = 'P0001';
  end if;

  v_emision := coalesce(_fecha_emision, current_date);

  -- Resolve empresa: default company, else first available.
  select id into v_empresa_id
  from public.empresas
  where is_default = true
  limit 1;

  if v_empresa_id is null then
    select id into v_empresa_id from public.empresas order by created_at asc limit 1;
  end if;

  insert into public.facturas (
    empresa_id, cliente_id, pedido_id, representante_id,
    fecha_emision, fecha_vencimiento, notas
  ) values (
    v_empresa_id, v_pedido.cliente_id, v_pedido.id, v_pedido.representante_id,
    v_emision, v_emision + coalesce(_dias_credito, 30),
    'Factura del pedido ' || v_pedido.folio
  ) returning id into v_factura_id;

  insert into public.factura_items (
    factura_id, producto_id, nombre_snapshot, sku_snapshot,
    unidad_snapshot, cantidad, precio_unitario, iva_pct
  )
  select v_factura_id, pi.producto_id, pi.nombre_snapshot, pi.sku_snapshot,
         pi.unidad_snapshot, pi.cantidad, pi.precio_unitario, pi.iva_pct
  from public.pedido_items pi
  where pi.pedido_id = _pedido;

  return v_factura_id;
end $function$;

-- Backfill: assign existing untagged facturas to the default empresa
UPDATE public.facturas
SET empresa_id = (SELECT id FROM public.empresas WHERE is_default = true LIMIT 1)
WHERE empresa_id IS NULL
  AND EXISTS (SELECT 1 FROM public.empresas WHERE is_default = true);
