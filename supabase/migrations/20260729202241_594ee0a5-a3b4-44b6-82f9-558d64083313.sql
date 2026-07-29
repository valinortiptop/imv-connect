
drop index if exists public.facturas_pedido_uniq;
create unique index facturas_pedido_uniq on public.facturas(pedido_id)
  where pedido_id is not null and estado <> 'cancelada';

create or replace function public.crear_factura_desde_pedido(
  _pedido uuid,
  _dias_credito int default 30,
  _fecha_emision date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos;
  v_factura_id uuid;
  v_emision date;
begin
  select * into v_pedido from public.pedidos where id = _pedido;
  if not found then
    raise exception 'pedido_no_encontrado' using errcode = 'P0001';
  end if;
  if v_pedido.estado::text in ('cancelado','Cancelado') then
    raise exception 'pedido_cancelado' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.facturas where pedido_id = _pedido and estado <> 'cancelada') then
    raise exception 'factura_ya_existe' using errcode = 'P0001';
  end if;

  v_emision := coalesce(_fecha_emision, current_date);

  insert into public.facturas (
    cliente_id, pedido_id, representante_id,
    fecha_emision, fecha_vencimiento, notas
  ) values (
    v_pedido.cliente_id, v_pedido.id, v_pedido.representante_id,
    v_emision, v_emision + coalesce(_dias_credito, 30),
    'Factura del pedido ' || coalesce(v_pedido.folio, v_pedido.order_code, '')
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
end $$;

create or replace function public.list_remisiones_por_facturar()
returns table(
  remision_id uuid, remision_folio text, fecha date,
  pedido_id uuid, folio text, order_code text,
  cliente_id uuid, cliente text, rfc text, estado text,
  subtotal numeric, iva numeric, total numeric, created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    r.id, r.folio, r.fecha,
    p.id, p.folio, p.order_code,
    p.cliente_id,
    coalesce(c.razon_social, c.nombre_comercial),
    c.rfc,
    p.estado::text,
    p.subtotal, p.iva, p.total,
    r.created_at
  from public.remisiones r
  join public.pedidos p on p.id = r.pedido_id
  left join public.clientes c on c.id = p.cliente_id
  where coalesce(r.estado, '') <> 'cancelada'
    and p.estado::text not in ('cancelado','Cancelado')
    and not exists (
      select 1 from public.facturas f
      where f.pedido_id = p.id and f.estado <> 'cancelada'
    )
  order by r.created_at desc;
$$;

create or replace function public.list_remisiones_facturadas()
returns table(
  remision_id uuid, remision_folio text, fecha date,
  pedido_id uuid, folio text, order_code text,
  cliente_id uuid, cliente text, rfc text,
  factura_id uuid, factura_folio text, factura_estado text,
  uuid_fiscal text, pdf_url text, xml_url text, cfdi_status text,
  total numeric, fecha_emision date
)
language sql stable security definer set search_path = public
as $$
  select
    r.id, r.folio, r.fecha,
    p.id, p.folio, p.order_code,
    p.cliente_id,
    coalesce(c.razon_social, c.nombre_comercial),
    c.rfc,
    f.id, f.folio, f.estado::text,
    f.uuid_fiscal, f.pdf_url, f.xml_url, f.cfdi_status,
    f.total, f.fecha_emision
  from public.remisiones r
  join public.pedidos p on p.id = r.pedido_id
  join public.facturas f on f.pedido_id = p.id and f.estado <> 'cancelada'
  left join public.clientes c on c.id = p.cliente_id
  where coalesce(r.estado, '') <> 'cancelada'
  order by f.fecha_emision desc nulls last, r.created_at desc;
$$;

revoke all on function public.list_remisiones_por_facturar() from public;
revoke all on function public.list_remisiones_facturadas() from public;
grant execute on function public.list_remisiones_por_facturar() to authenticated;
grant execute on function public.list_remisiones_facturadas() to authenticated;
