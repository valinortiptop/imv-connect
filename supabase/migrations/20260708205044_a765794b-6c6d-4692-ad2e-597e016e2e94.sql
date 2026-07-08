
-- =========================================================
-- 1. list_orders_to_fulfill (drives /almacen "Órdenes por surtir")
-- =========================================================
create or replace function public.list_orders_to_fulfill(p_horizon_days integer default 7)
returns table (
  id uuid,
  order_code text,
  client_id uuid,
  client_name text,
  delivery_date date,
  status text,
  fulfillment_method text,
  urgency boolean,
  total_bultos_needed numeric,
  total_bultos_in_embarque numeric,
  item_count integer,
  delivery_offset_days integer,
  delivery_window_from time,
  delivery_window_until time,
  delivery_notes text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.*
    from public.pedidos p
    where p.estado::text not in ('cancelado','Cancelado','entregado','Entregado','enviado')
      and not exists (select 1 from public.facturas f where f.pedido_id = p.id)
      and (p.delivery_date is null
           or p.delivery_date <= current_date + coalesce(p_horizon_days, 7))
  )
  select
    b.id,
    coalesce(b.order_code, b.folio) as order_code,
    b.cliente_id as client_id,
    coalesce(c.nombre_comercial, c.razon_social) as client_name,
    b.delivery_date,
    b.estado::text as status,
    coalesce(b.fulfillment_method, 'delivery') as fulfillment_method,
    coalesce(b.urgency, false) as urgency,
    coalesce((select sum(pi.cantidad) from public.pedido_items pi where pi.pedido_id = b.id), 0) as total_bultos_needed,
    coalesce((select sum(sc.quantity) from public.slot_contents sc where sc.order_id = b.id), 0) as total_bultos_in_embarque,
    coalesce((select count(*)::int from public.pedido_items pi where pi.pedido_id = b.id), 0) as item_count,
    case
      when b.delivery_date is null then 0
      else (b.delivery_date - current_date)::int
    end as delivery_offset_days,
    c.delivery_window_from,
    c.delivery_window_until,
    c.delivery_notes
  from base b
  left join public.clientes c on c.id = b.cliente_id
  order by
    (b.delivery_date is null) asc,
    b.delivery_date asc nulls last,
    coalesce(b.urgency, false) desc,
    b.created_at asc;
$$;

grant execute on function public.list_orders_to_fulfill(integer) to authenticated;

-- =========================================================
-- 2. list_pedidos_por_facturar (drives /facturacion panel)
-- =========================================================
create or replace function public.list_pedidos_por_facturar()
returns table (
  id uuid,
  folio text,
  order_code text,
  cliente_id uuid,
  cliente text,
  rfc text,
  estado text,
  delivery_date date,
  subtotal numeric,
  iva numeric,
  total numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.folio,
    p.order_code,
    p.cliente_id,
    coalesce(c.razon_social, c.nombre_comercial) as cliente,
    c.rfc,
    p.estado::text as estado,
    p.delivery_date,
    p.subtotal,
    p.iva,
    p.total,
    p.created_at
  from public.pedidos p
  left join public.clientes c on c.id = p.cliente_id
  where p.estado::text not in ('cancelado','Cancelado','Pendiente portal','Pendiente aprobación')
    and not exists (select 1 from public.facturas f where f.pedido_id = p.id)
  order by p.created_at desc;
$$;

grant execute on function public.list_pedidos_por_facturar() to authenticated;

-- =========================================================
-- 3. facturar_pedido (thin wrapper around crear_factura_desde_pedido)
--    Returns { factura_id, folio, total }
-- =========================================================
create or replace function public.facturar_pedido(_pedido uuid, _dias_credito integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura_id uuid;
  v_folio text;
  v_total numeric;
begin
  v_factura_id := public.crear_factura_desde_pedido(_pedido, _dias_credito, null);
  select folio, total into v_folio, v_total from public.facturas where id = v_factura_id;
  return jsonb_build_object(
    'factura_id', v_factura_id,
    'folio', v_folio,
    'total', v_total
  );
end
$$;

grant execute on function public.facturar_pedido(uuid, integer) to authenticated;

-- =========================================================
-- 4. Auto-póliza on factura emission
-- =========================================================
create or replace function public._find_cuenta(_empresa uuid, _agrupador text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.cuentas_contables
   where empresa_id = _empresa
     and activa = true
     and permite_movimientos = true
     and (codigo_agrupador = _agrupador or codigo like _agrupador || '%')
   order by nivel desc, codigo
   limit 1;
$$;

create or replace function public.facturas_generate_poliza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_cta_cli uuid;
  v_cta_ven uuid;
  v_cta_iva uuid;
  v_poliza_id uuid;
  v_folio_cliente text;
begin
  -- Skip if we already made a póliza for this factura or estado invalid
  if new.estado in ('borrador','cancelada') then
    return new;
  end if;
  if exists (select 1 from public.polizas where origen = 'factura' and origen_id = new.id) then
    return new;
  end if;
  -- Do NOT trigger if totals still zero (items not inserted yet)
  if coalesce(new.total,0) <= 0 then
    return new;
  end if;

  -- pick empresa (default or first)
  select id into v_empresa from public.empresas where coalesce(is_default,false) order by created_at limit 1;
  if v_empresa is null then
    select id into v_empresa from public.empresas order by created_at limit 1;
  end if;
  if v_empresa is null then
    return new;
  end if;

  v_cta_cli := public._find_cuenta(v_empresa, '105'); -- Clientes
  v_cta_ven := public._find_cuenta(v_empresa, '401'); -- Ventas / Ingresos
  if v_cta_ven is null then
    v_cta_ven := public._find_cuenta(v_empresa, '400');
  end if;
  v_cta_iva := public._find_cuenta(v_empresa, '208'); -- IVA trasladado por cobrar
  if v_cta_iva is null then
    v_cta_iva := public._find_cuenta(v_empresa, '213');
  end if;

  -- If catálogo not seeded, skip silently — factura still emits.
  if v_cta_cli is null or v_cta_ven is null or v_cta_iva is null then
    return new;
  end if;

  select coalesce(c.razon_social, c.nombre_comercial)
    into v_folio_cliente
    from public.clientes c where c.id = new.cliente_id;

  insert into public.polizas (empresa_id, tipo, fecha, concepto, estado, origen, origen_id, created_by)
  values (v_empresa, 'ingreso', new.fecha_emision, 'Factura ' || coalesce(new.folio,'') || ' - ' || coalesce(v_folio_cliente,''),
          'borrador', 'factura', new.id, auth.uid())
  returning id into v_poliza_id;

  insert into public.poliza_movimientos (poliza_id, cuenta_id, cargo, abono, concepto, factura_id, uuid_cfdi, orden)
  values
    (v_poliza_id, v_cta_cli, coalesce(new.total,0), 0,
      'Cliente ' || coalesce(v_folio_cliente,''), new.id, new.uuid_fiscal, 1),
    (v_poliza_id, v_cta_ven, 0, coalesce(new.subtotal,0),
      'Venta factura ' || coalesce(new.folio,''), new.id, new.uuid_fiscal, 2),
    (v_poliza_id, v_cta_iva, 0, coalesce(new.iva,0),
      'IVA trasladado ' || coalesce(new.folio,''), new.id, new.uuid_fiscal, 3);

  -- link the pedido -> factura -> poliza chain
  update public.facturas set poliza_id = v_poliza_id where id = new.id;

  return new;
end
$$;

drop trigger if exists facturas_generate_poliza_trg on public.facturas;
create trigger facturas_generate_poliza_trg
after insert or update of estado, total, uuid_fiscal on public.facturas
for each row execute function public.facturas_generate_poliza();
