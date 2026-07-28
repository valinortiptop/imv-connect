-- =====================================================================
-- Módulo Almacén: recepciones, traspasos, remisiones, NC proveedor,
-- bloqueo de compra y reportes.
-- =====================================================================

-- ---------- 0. Extensiones a tablas existentes ----------
alter table public.movimientos_inventario
  add column if not exists lote text,
  add column if not exists caducidad date,
  add column if not exists origen_tipo text,
  add column if not exists origen_id uuid;

create index if not exists movs_origen_idx on public.movimientos_inventario(origen_tipo, origen_id);

alter table public.ordenes_compra
  add column if not exists factura_proveedor text,
  add column if not exists factura_proveedor_fecha date;

alter table public.product_stock_params
  add column if not exists bloqueo_compra boolean not null default false,
  add column if not exists bloqueo_motivo text;

-- ---------- 1. Helpers ----------
create or replace function public._alm_next_folio(_prefix text, _table regclass)
returns text language plpgsql security definer set search_path = public as $$
declare v_n integer; v_sql text;
begin
  v_sql := format(
    'select coalesce(max(nullif(regexp_replace(folio, ''^%s-'', ''''), '''')::integer),0)+1 from %s where folio like %L',
    _prefix, _table::text, _prefix || '-%');
  execute v_sql into v_n;
  return _prefix || '-' || lpad(v_n::text, 6, '0');
end $$;

-- Mueve (o crea) un lote en product_batches por delta
create or replace function public._mover_lote(
  _producto uuid, _almacen uuid, _lote text, _caducidad date,
  _delta numeric, _costo numeric default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if _lote is null or btrim(_lote) = '' then return; end if;

  select id into v_id from public.product_batches
   where producto_id = _producto and almacen_id = _almacen and lote = _lote
     and (caducidad is not distinct from _caducidad)
   limit 1;

  if v_id is null then
    insert into public.product_batches(producto_id, almacen_id, lote, caducidad, cantidad, costo_unitario, created_by)
    values (_producto, _almacen, _lote, _caducidad, greatest(_delta, 0), coalesce(_costo, 0), auth.uid());
  else
    update public.product_batches
       set cantidad = greatest(coalesce(cantidad,0) + _delta, 0),
           costo_unitario = coalesce(_costo, costo_unitario),
           updated_at = now()
     where id = v_id;
  end if;
end $$;

-- ---------- 2. Recepciones de compra ----------
create table if not exists public.entradas_recepcion (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  oc_id uuid references public.ordenes_compra(id) on delete set null,
  almacen_id uuid not null references public.almacenes(id) on delete restrict,
  proveedor text,
  fecha date not null default current_date,
  estado text not null default 'registrada',
  factura_proveedor text,
  notas text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entradas_recepcion_items (
  id uuid primary key default gen_random_uuid(),
  recepcion_id uuid not null references public.entradas_recepcion(id) on delete cascade,
  oc_item_id uuid references public.oc_items(id) on delete set null,
  producto_id uuid not null references public.productos(id) on delete restrict,
  lote text,
  caducidad date,
  cantidad numeric(14,2) not null default 0,
  costo_unitario numeric(14,4) not null default 0,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists erec_oc_idx on public.entradas_recepcion(oc_id);
create index if not exists erec_items_rec_idx on public.entradas_recepcion_items(recepcion_id);
create index if not exists erec_items_prod_idx on public.entradas_recepcion_items(producto_id);

grant select, insert, update, delete on public.entradas_recepcion to authenticated;
grant select, insert, update, delete on public.entradas_recepcion_items to authenticated;
grant all on public.entradas_recepcion to service_role;
grant all on public.entradas_recepcion_items to service_role;

alter table public.entradas_recepcion enable row level security;
alter table public.entradas_recepcion_items enable row level security;

create policy "almacen_rw_recepcion" on public.entradas_recepcion
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad']::public.app_role[]));

create policy "almacen_rw_recepcion_items" on public.entradas_recepcion_items
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad']::public.app_role[]));

-- ---------- 3. Traspasos entre almacenes ----------
create table if not exists public.traspasos_almacen (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  almacen_origen_id uuid not null references public.almacenes(id) on delete restrict,
  almacen_destino_id uuid not null references public.almacenes(id) on delete restrict,
  fecha date not null default current_date,
  estado text not null default 'aplicado',
  notas text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.traspasos_almacen_items (
  id uuid primary key default gen_random_uuid(),
  traspaso_id uuid not null references public.traspasos_almacen(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  lote text,
  caducidad date,
  cantidad numeric(14,2) not null check (cantidad > 0),
  created_at timestamptz not null default now()
);

create index if not exists trasp_items_idx on public.traspasos_almacen_items(traspaso_id);

grant select, insert, update, delete on public.traspasos_almacen to authenticated;
grant select, insert, update, delete on public.traspasos_almacen_items to authenticated;
grant all on public.traspasos_almacen to service_role;
grant all on public.traspasos_almacen_items to service_role;

alter table public.traspasos_almacen enable row level security;
alter table public.traspasos_almacen_items enable row level security;

create policy "almacen_rw_traspasos" on public.traspasos_almacen
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad']::public.app_role[]));

create policy "almacen_rw_traspasos_items" on public.traspasos_almacen_items
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad']::public.app_role[]));

-- ---------- 4. Remisiones ----------
create table if not exists public.remisiones (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  pedido_id uuid references public.pedidos(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  almacen_id uuid not null references public.almacenes(id) on delete restrict,
  fecha date not null default current_date,
  estado text not null default 'emitida',
  notas text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.remision_items (
  id uuid primary key default gen_random_uuid(),
  remision_id uuid not null references public.remisiones(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  pedido_item_id uuid references public.pedido_items(id) on delete set null,
  lote text,
  caducidad date,
  ubicacion text,
  cantidad numeric(14,2) not null check (cantidad > 0),
  created_at timestamptz not null default now()
);

create index if not exists remisiones_pedido_idx on public.remisiones(pedido_id);
create index if not exists remision_items_idx on public.remision_items(remision_id);

grant select, insert, update, delete on public.remisiones to authenticated;
grant select, insert, update, delete on public.remision_items to authenticated;
grant all on public.remisiones to service_role;
grant all on public.remision_items to service_role;

alter table public.remisiones enable row level security;
alter table public.remision_items enable row level security;

create policy "almacen_rw_remisiones" on public.remisiones
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad','ventas']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad']::public.app_role[]));

create policy "almacen_rw_remision_items" on public.remision_items
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad','ventas']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','almacen','logistica','contabilidad']::public.app_role[]));

-- ---------- 5. Notas de crédito de proveedor ----------
create table if not exists public.notas_credito_proveedor (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  oc_id uuid references public.ordenes_compra(id) on delete set null,
  laboratorio_id uuid references public.laboratorios(id) on delete set null,
  factura_proveedor text,
  fecha date not null default current_date,
  motivo text,
  total numeric(14,2) not null default 0,
  notas text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notas_credito_proveedor_items (
  id uuid primary key default gen_random_uuid(),
  nc_id uuid not null references public.notas_credito_proveedor(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete set null,
  lote text,
  cantidad numeric(14,2) not null default 0,
  costo_unitario numeric(14,4) not null default 0,
  importe numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.notas_credito_proveedor to authenticated;
grant select, insert, update, delete on public.notas_credito_proveedor_items to authenticated;
grant all on public.notas_credito_proveedor to service_role;
grant all on public.notas_credito_proveedor_items to service_role;

alter table public.notas_credito_proveedor enable row level security;
alter table public.notas_credito_proveedor_items enable row level security;

create policy "almacen_rw_ncp" on public.notas_credito_proveedor
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','almacen','contabilidad']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','almacen','contabilidad']::public.app_role[]));

create policy "almacen_rw_ncp_items" on public.notas_credito_proveedor_items
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','almacen','contabilidad']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','almacen','contabilidad']::public.app_role[]));

-- ---------- 6. Triggers updated_at ----------
create trigger trg_erec_touch before update on public.entradas_recepcion
  for each row execute function public.set_updated_at();
create trigger trg_trasp_touch before update on public.traspasos_almacen
  for each row execute function public.set_updated_at();
create trigger trg_remis_touch before update on public.remisiones
  for each row execute function public.set_updated_at();
create trigger trg_ncp_touch before update on public.notas_credito_proveedor
  for each row execute function public.set_updated_at();

-- ---------- 7. RPC: registrar recepción ----------
create or replace function public.registrar_recepcion(
  _oc uuid, _items jsonb, _factura text default null, _notas text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_alm uuid; v_folio text; v_estado public.oc_estado; v_prov text;
  v_rec uuid; v_it record; v_pending numeric; v_pend_total numeric;
begin
  select oc.almacen_id, oc.folio, oc.estado, l.nombre
    into v_alm, v_folio, v_estado, v_prov
    from public.ordenes_compra oc
    left join public.laboratorios l on l.id = oc.laboratorio_id
   where oc.id = _oc for update;
  if v_alm is null then raise exception 'OC no existe'; end if;
  if v_estado in ('recibida','cancelada') then
    raise exception 'OC ya cerrada (estado %)', v_estado;
  end if;

  insert into public.entradas_recepcion(folio, oc_id, almacen_id, proveedor, factura_proveedor, notas, created_by)
  values (public._alm_next_folio('REC','public.entradas_recepcion'), _oc, v_alm, v_prov, _factura, _notas, auth.uid())
  returning id into v_rec;

  for v_it in
    select (e->>'oc_item_id')::uuid as oc_item_id,
           (e->>'producto_id')::uuid as producto_id,
           nullif(e->>'lote','') as lote,
           nullif(e->>'caducidad','')::date as caducidad,
           (e->>'cantidad')::numeric as cantidad,
           coalesce((e->>'costo_unitario')::numeric, 0) as costo
      from jsonb_array_elements(_items) e
  loop
    if v_it.cantidad is null or v_it.cantidad <= 0 then continue; end if;

    if v_it.oc_item_id is not null then
      select (cantidad - cantidad_recibida) into v_pending
        from public.oc_items where id = v_it.oc_item_id and oc_id = _oc for update;
      if v_pending is null then raise exception 'Item no pertenece a la OC'; end if;
      if v_it.cantidad > v_pending then
        raise exception 'Cantidad % excede pendiente %', v_it.cantidad, v_pending;
      end if;
      update public.oc_items
         set cantidad_recibida = cantidad_recibida + v_it.cantidad
       where id = v_it.oc_item_id;
    end if;

    insert into public.entradas_recepcion_items
      (recepcion_id, oc_item_id, producto_id, lote, caducidad, cantidad, costo_unitario)
    values (v_rec, v_it.oc_item_id, v_it.producto_id, v_it.lote, v_it.caducidad, v_it.cantidad, v_it.costo);

    insert into public.movimientos_inventario
      (tipo, producto_id, almacen_id, cantidad, referencia, notas, created_by, lote, caducidad, origen_tipo, origen_id)
    values ('entrada', v_it.producto_id, v_alm, v_it.cantidad, 'compra:' || v_folio,
            'Recepción OC ' || v_folio, auth.uid(), v_it.lote, v_it.caducidad, 'recepcion', v_rec);

    perform public._mover_lote(v_it.producto_id, v_alm, v_it.lote, v_it.caducidad, v_it.cantidad, nullif(v_it.costo,0));

    if v_it.costo > 0 then
      update public.productos set costo = v_it.costo where id = v_it.producto_id;
    end if;
  end loop;

  select coalesce(sum(cantidad - cantidad_recibida),0) into v_pend_total
    from public.oc_items where oc_id = _oc;
  if v_pend_total <= 0 then
    update public.ordenes_compra set estado='recibida', fecha_recepcion=current_date,
           factura_proveedor = coalesce(_factura, factura_proveedor), updated_at=now()
     where id = _oc;
  else
    update public.ordenes_compra set estado='parcial',
           factura_proveedor = coalesce(_factura, factura_proveedor), updated_at=now()
     where id = _oc;
  end if;

  return v_rec;
end $$;

-- ---------- 8. RPC: cancelar recepción ----------
create or replace function public.cancelar_recepcion(_rec uuid, _motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_alm uuid; v_estado text; v_it record; v_oc uuid; v_folio text;
begin
  select almacen_id, estado, oc_id into v_alm, v_estado, v_oc
    from public.entradas_recepcion where id = _rec for update;
  if v_alm is null then raise exception 'Recepción no existe'; end if;
  if v_estado = 'cancelada' then raise exception 'Recepción ya cancelada'; end if;

  select folio into v_folio from public.entradas_recepcion where id = _rec;

  for v_it in select * from public.entradas_recepcion_items where recepcion_id = _rec loop
    insert into public.movimientos_inventario
      (tipo, producto_id, almacen_id, cantidad, referencia, notas, created_by, lote, caducidad, origen_tipo, origen_id)
    values ('salida', v_it.producto_id, v_alm, v_it.cantidad, 'cancelacion:' || coalesce(v_folio,''),
            coalesce(_motivo,'Cancelación de recepción'), auth.uid(), v_it.lote, v_it.caducidad, 'recepcion_cancel', _rec);

    perform public._mover_lote(v_it.producto_id, v_alm, v_it.lote, v_it.caducidad, -v_it.cantidad, null);

    if v_it.oc_item_id is not null then
      update public.oc_items
         set cantidad_recibida = greatest(cantidad_recibida - v_it.cantidad, 0)
       where id = v_it.oc_item_id;
    end if;
  end loop;

  update public.entradas_recepcion set estado='cancelada', notas = coalesce(_motivo, notas), updated_at=now() where id=_rec;

  if v_oc is not null then
    update public.ordenes_compra oc
       set estado = case when (select coalesce(sum(cantidad_recibida),0) from public.oc_items where oc_id=v_oc) <= 0
                         then 'enviada'::public.oc_estado else 'parcial'::public.oc_estado end,
           updated_at = now()
     where oc.id = v_oc and oc.estado <> 'cancelada';
  end if;
end $$;

-- ---------- 9. RPC: editar recepción (reemplaza renglones) ----------
create or replace function public.editar_recepcion(_rec uuid, _items jsonb, _factura text default null, _notas text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_oc uuid; v_alm uuid; v_new uuid; v_estado text;
begin
  select oc_id, almacen_id, estado into v_oc, v_alm, v_estado
    from public.entradas_recepcion where id=_rec;
  if v_alm is null then raise exception 'Recepción no existe'; end if;
  if v_estado = 'cancelada' then raise exception 'Recepción cancelada; no editable'; end if;

  perform public.cancelar_recepcion(_rec, 'Reemplazada por corrección');

  if v_oc is not null then
    v_new := public.registrar_recepcion(v_oc, _items, _factura, _notas);
  else
    raise exception 'Recepción sin OC asociada no editable';
  end if;

  update public.entradas_recepcion set notas = coalesce(notas,'') || ' (corrige ' || _rec::text || ')' where id = v_new;
  return v_new;
end $$;

-- ---------- 10. RPC: ejecutar traspaso ----------
create or replace function public.ejecutar_traspaso(
  _origen uuid, _destino uuid, _items jsonb, _notas text default null, _fecha date default current_date
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_it record; v_folio text; v_disp numeric;
begin
  if _origen = _destino then raise exception 'Almacén origen y destino deben ser distintos'; end if;

  v_folio := public._alm_next_folio('TRA','public.traspasos_almacen');
  insert into public.traspasos_almacen(folio, almacen_origen_id, almacen_destino_id, fecha, notas, created_by)
  values (v_folio, _origen, _destino, coalesce(_fecha, current_date), _notas, auth.uid())
  returning id into v_id;

  for v_it in
    select (e->>'producto_id')::uuid as producto_id,
           nullif(e->>'lote','') as lote,
           nullif(e->>'caducidad','')::date as caducidad,
           (e->>'cantidad')::numeric as cantidad
      from jsonb_array_elements(_items) e
  loop
    if v_it.cantidad is null or v_it.cantidad <= 0 then continue; end if;

    select coalesce(cantidad,0) into v_disp from public.stock
      where producto_id = v_it.producto_id and almacen_id = _origen;
    if coalesce(v_disp,0) < v_it.cantidad then
      raise exception 'Existencia insuficiente en almacén origen para el producto %', v_it.producto_id;
    end if;

    insert into public.traspasos_almacen_items(traspaso_id, producto_id, lote, caducidad, cantidad)
    values (v_id, v_it.producto_id, v_it.lote, v_it.caducidad, v_it.cantidad);

    insert into public.movimientos_inventario
      (tipo, producto_id, almacen_id, cantidad, referencia, notas, created_by, lote, caducidad, origen_tipo, origen_id)
    values ('salida', v_it.producto_id, _origen, v_it.cantidad, 'traspaso:' || v_folio,
            'Traspaso salida', auth.uid(), v_it.lote, v_it.caducidad, 'traspaso_out', v_id);

    insert into public.movimientos_inventario
      (tipo, producto_id, almacen_id, cantidad, referencia, notas, created_by, lote, caducidad, origen_tipo, origen_id)
    values ('entrada', v_it.producto_id, _destino, v_it.cantidad, 'traspaso:' || v_folio,
            'Traspaso entrada', auth.uid(), v_it.lote, v_it.caducidad, 'traspaso_in', v_id);

    perform public._mover_lote(v_it.producto_id, _origen, v_it.lote, v_it.caducidad, -v_it.cantidad, null);
    perform public._mover_lote(v_it.producto_id, _destino, v_it.lote, v_it.caducidad, v_it.cantidad, null);
  end loop;

  return v_id;
end $$;

-- ---------- 11. RPC: crear / cancelar remisión ----------
create or replace function public.crear_remision(
  _pedido uuid, _almacen uuid, _items jsonb, _notas text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_folio text; v_cliente uuid; v_it record; v_disp numeric;
begin
  select cliente_id into v_cliente from public.pedidos where id = _pedido;

  v_folio := public._alm_next_folio('REM','public.remisiones');
  insert into public.remisiones(folio, pedido_id, cliente_id, almacen_id, notas, created_by)
  values (v_folio, _pedido, v_cliente, _almacen, _notas, auth.uid())
  returning id into v_id;

  for v_it in
    select (e->>'producto_id')::uuid as producto_id,
           nullif(e->>'pedido_item_id','')::uuid as pedido_item_id,
           nullif(e->>'lote','') as lote,
           nullif(e->>'caducidad','')::date as caducidad,
           nullif(e->>'ubicacion','') as ubicacion,
           (e->>'cantidad')::numeric as cantidad
      from jsonb_array_elements(_items) e
  loop
    if v_it.cantidad is null or v_it.cantidad <= 0 then continue; end if;

    select coalesce(cantidad,0) into v_disp from public.stock
      where producto_id = v_it.producto_id and almacen_id = _almacen;
    if coalesce(v_disp,0) < v_it.cantidad then
      raise exception 'Existencia insuficiente para el producto %', v_it.producto_id;
    end if;

    insert into public.remision_items(remision_id, producto_id, pedido_item_id, lote, caducidad, ubicacion, cantidad)
    values (v_id, v_it.producto_id, v_it.pedido_item_id, v_it.lote, v_it.caducidad, v_it.ubicacion, v_it.cantidad);

    insert into public.movimientos_inventario
      (tipo, producto_id, almacen_id, cantidad, pedido_id, referencia, notas, created_by, lote, caducidad, origen_tipo, origen_id)
    values ('salida', v_it.producto_id, _almacen, v_it.cantidad, _pedido, 'remision:' || v_folio,
            'Salida por remisión', auth.uid(), v_it.lote, v_it.caducidad, 'remision', v_id);

    perform public._mover_lote(v_it.producto_id, _almacen, v_it.lote, v_it.caducidad, -v_it.cantidad, null);
  end loop;

  return v_id;
end $$;

create or replace function public.cancelar_remision(_rem uuid, _motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_alm uuid; v_estado text; v_folio text; v_ped uuid; v_it record;
begin
  select almacen_id, estado, folio, pedido_id into v_alm, v_estado, v_folio, v_ped
    from public.remisiones where id = _rem for update;
  if v_alm is null then raise exception 'Remisión no existe'; end if;
  if v_estado = 'cancelada' then raise exception 'Remisión ya cancelada'; end if;

  for v_it in select * from public.remision_items where remision_id = _rem loop
    insert into public.movimientos_inventario
      (tipo, producto_id, almacen_id, cantidad, pedido_id, referencia, notas, created_by, lote, caducidad, origen_tipo, origen_id)
    values ('devolucion', v_it.producto_id, v_alm, v_it.cantidad, v_ped, 'cancelacion:' || coalesce(v_folio,''),
            coalesce(_motivo,'Cancelación de remisión'), auth.uid(), v_it.lote, v_it.caducidad, 'remision_cancel', _rem);

    perform public._mover_lote(v_it.producto_id, v_alm, v_it.lote, v_it.caducidad, v_it.cantidad, null);
  end loop;

  update public.remisiones set estado='cancelada', notas = coalesce(_motivo, notas), updated_at=now() where id=_rem;
end $$;

create or replace function public.editar_remision(_rem uuid, _items jsonb, _notas text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ped uuid; v_alm uuid; v_new uuid;
begin
  select pedido_id, almacen_id into v_ped, v_alm from public.remisiones where id = _rem;
  if v_alm is null then raise exception 'Remisión no existe'; end if;
  perform public.cancelar_remision(_rem, 'Reemplazada por corrección');
  v_new := public.crear_remision(v_ped, v_alm, _items, _notas);
  update public.remisiones set notas = coalesce(notas,'') || ' (corrige ' || _rem::text || ')' where id = v_new;
  return v_new;
end $$;

-- ---------- 12. Bloqueo de compras ----------
create or replace function public.recalcular_bloqueos_compra()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer := 0;
begin
  insert into public.product_stock_params(producto_id)
  select p.id from public.productos p
   where p.activo and not exists (select 1 from public.product_stock_params s where s.producto_id = p.id);

  with existencias as (
    select producto_id, sum(cantidad) as qty from public.stock group by producto_id
  ),
  ventas as (
    select producto_id, max(created_at) as ultima
      from public.movimientos_inventario
     where tipo in ('venta','salida')
     group by producto_id
  )
  update public.product_stock_params sp
     set bloqueo_compra = b.bloquear,
         bloqueo_motivo = b.motivo,
         updated_at = now()
    from (
      select sp2.producto_id,
             (coalesce(e.qty,0) > coalesce(nullif(sp2.stock_max,0), 1e12)
              or coalesce(v.ultima, now() - interval '999 days') < now() - interval '180 days') as bloquear,
             case
               when coalesce(e.qty,0) > coalesce(nullif(sp2.stock_max,0), 1e12) then 'Sobre stock'
               when coalesce(v.ultima, now() - interval '999 days') < now() - interval '180 days' then 'Lento movimiento'
               else null
             end as motivo
        from public.product_stock_params sp2
        left join existencias e on e.producto_id = sp2.producto_id
        left join ventas v on v.producto_id = sp2.producto_id
    ) b
   where b.producto_id = sp.producto_id;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------- 13. Vistas de reportes ----------
create or replace view public.v_entradas_report
with (security_invoker = on) as
select r.id as recepcion_id, r.folio, r.fecha, r.estado, r.proveedor, r.factura_proveedor,
       oc.folio as oc_folio, oc.id as oc_id, a.nombre as almacen,
       i.id as item_id, p.id as producto_id, p.sku as clave, p.nombre as articulo,
       i.lote, i.caducidad, i.cantidad, i.costo_unitario,
       (i.cantidad * i.costo_unitario) as importe, r.created_at
from public.entradas_recepcion r
join public.entradas_recepcion_items i on i.recepcion_id = r.id
join public.productos p on p.id = i.producto_id
left join public.ordenes_compra oc on oc.id = r.oc_id
left join public.almacenes a on a.id = r.almacen_id;

create or replace view public.v_traspasos_report
with (security_invoker = on) as
select t.id as traspaso_id, t.folio, t.fecha, t.estado,
       ao.nombre as almacen_origen, ad.nombre as almacen_destino,
       p.id as producto_id, p.sku as clave, p.nombre as articulo,
       i.lote, i.caducidad, i.cantidad, t.notas, t.created_at
from public.traspasos_almacen t
join public.traspasos_almacen_items i on i.traspaso_id = t.id
join public.productos p on p.id = i.producto_id
left join public.almacenes ao on ao.id = t.almacen_origen_id
left join public.almacenes ad on ad.id = t.almacen_destino_id;

create or replace view public.v_remisiones_report
with (security_invoker = on) as
select r.id as remision_id, r.folio, r.fecha, r.estado,
       c.id as cliente_id, coalesce(c.nombre_comercial, c.razon_social) as cliente,
       ped.folio as pedido_folio, r.pedido_id,
       a.nombre as almacen,
       p.id as producto_id, p.sku as clave, p.nombre as articulo,
       i.lote, i.caducidad, i.ubicacion, i.cantidad, r.created_at
from public.remisiones r
join public.remision_items i on i.remision_id = r.id
join public.productos p on p.id = i.producto_id
left join public.clientes c on c.id = r.cliente_id
left join public.pedidos ped on ped.id = r.pedido_id
left join public.almacenes a on a.id = r.almacen_id;

create or replace view public.v_trazabilidad_compra
with (security_invoker = on) as
select oc.id as oc_id, oc.folio as oc_folio, oc.fecha_emision, oc.estado as oc_estado,
       l.nombre as proveedor,
       r.id as recepcion_id, r.folio as recepcion_folio, r.fecha as fecha_recepcion, r.estado as recepcion_estado,
       coalesce(r.factura_proveedor, oc.factura_proveedor) as factura_proveedor,
       oc.factura_proveedor_fecha,
       oc.total
from public.ordenes_compra oc
left join public.laboratorios l on l.id = oc.laboratorio_id
left join public.entradas_recepcion r on r.oc_id = oc.id;

create or replace view public.v_trazabilidad_venta
with (security_invoker = on) as
select ped.id as pedido_id, ped.folio as pedido_folio, ped.created_at as pedido_fecha,
       coalesce(c.nombre_comercial, c.razon_social) as cliente,
       rem.id as remision_id, rem.folio as remision_folio, rem.fecha as remision_fecha, rem.estado as remision_estado,
       f.id as factura_id, f.folio as factura_folio, f.fecha_emision as factura_fecha, f.total as factura_total, f.estado as factura_estado
from public.pedidos ped
left join public.clientes c on c.id = ped.cliente_id
left join public.remisiones rem on rem.pedido_id = ped.id
left join public.facturas f on f.pedido_id = ped.id;

create or replace view public.v_sin_movimiento_venta
with (security_invoker = on) as
select p.id as producto_id, p.sku as clave, p.nombre as articulo, p.marca, p.categoria,
       l.nombre as laboratorio,
       coalesce((select sum(s.cantidad) from public.stock s where s.producto_id = p.id),0) as existencia,
       (select max(mi.created_at) from public.movimientos_inventario mi
         where mi.producto_id = p.id and mi.tipo in ('venta','salida')) as ultima_venta,
       extract(day from now() - coalesce(
         (select max(mi.created_at) from public.movimientos_inventario mi
           where mi.producto_id = p.id and mi.tipo in ('venta','salida')), p.created_at))::int as dias_sin_venta
from public.productos p
left join public.laboratorios l on l.id = p.laboratorio_id
where p.activo;

create or replace view public.v_corta_caducidad_lento
with (security_invoker = on) as
select b.id as batch_id, p.id as producto_id, p.sku as clave, p.nombre as articulo,
       l.nombre as laboratorio, a.nombre as almacen,
       b.lote, b.caducidad, b.cantidad,
       (b.caducidad - current_date) as dias_para_caducar,
       sm.dias_sin_venta,
       case when (b.caducidad - current_date) <= 90 and coalesce(sm.dias_sin_venta,999) >= 90 then 'critico'
            when (b.caducidad - current_date) <= 90 then 'corta_caducidad'
            when coalesce(sm.dias_sin_venta,999) >= 180 then 'lento_movimiento'
            else 'ok' end as clasificacion
from public.product_batches b
join public.productos p on p.id = b.producto_id
left join public.laboratorios l on l.id = p.laboratorio_id
left join public.almacenes a on a.id = b.almacen_id
left join public.v_sin_movimiento_venta sm on sm.producto_id = p.id
where b.cantidad > 0 and b.caducidad is not null;

grant select on public.v_entradas_report to authenticated;
grant select on public.v_traspasos_report to authenticated;
grant select on public.v_remisiones_report to authenticated;
grant select on public.v_trazabilidad_compra to authenticated;
grant select on public.v_trazabilidad_venta to authenticated;
grant select on public.v_sin_movimiento_venta to authenticated;
grant select on public.v_corta_caducidad_lento to authenticated;

-- ---------- 14. Kardex ampliado ----------
create or replace view public.v_kardex_movements
with (security_invoker = on) as
select mi.id, mi.created_at,
  null::uuid as slot_id, null::text as slot_code,
  mi.producto_id as product_id,
  case when mi.tipo::text = 'salida' then -abs(mi.cantidad)
       when mi.tipo::text = 'entrada' then abs(mi.cantidad)
       else mi.cantidad end as delta,
  coalesce(
    case mi.origen_tipo
      when 'recepcion' then 'recepcion'
      when 'recepcion_cancel' then 'cancelacion'
      when 'traspaso_in' then 'traspaso_entrada'
      when 'traspaso_out' then 'traspaso_salida'
      when 'remision' then 'remision'
      when 'remision_cancel' then 'cancelacion'
      when 'nota_credito' then 'nota_credito'
      when 'devolucion' then 'devolucion'
      else null end,
    case when mi.pedido_id is not null then 'pedido'
         when mi.tipo::text = 'entrada' and coalesce(mi.referencia,'') = 'ajuste' then 'ajuste'
         when mi.tipo::text = 'entrada' then 'entrada'
         when mi.tipo::text = 'salida' then 'pedido'
         when mi.tipo::text = 'devolucion' then 'devolucion'
         else 'ajuste' end) as reason,
  mi.notas as note,
  mi.lote,
  mi.referencia as description,
  p.sku as product_clave, p.nombre as product_name, p.imagen_url as product_image_url,
  'inventario'::text as source
from public.movimientos_inventario mi
left join public.productos p on p.id = mi.producto_id
union all
select sm.id, sm.created_at, sm.slot_id, ws.code as slot_code, sm.product_id,
  case when sm.reason = any (array['pedido','salida']) then -abs(sm.quantity)
       when sm.reason = 'reubicacion' then sm.quantity
       else abs(sm.quantity) end as delta,
  sm.reason, sm.note, sm.lote, null::text as description,
  p.sku, p.nombre, p.imagen_url, 'slot'::text as source
from public.slot_movements sm
left join public.warehouse_slots ws on ws.id = sm.slot_id
left join public.productos p on p.id = sm.product_id;

grant select on public.v_kardex_movements to authenticated;

-- ---------- 15. Alertas al emitir OC ----------
create or replace function public.tg_oc_alerta_almacen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.estado = 'enviada')
     or (tg_op = 'UPDATE' and new.estado = 'enviada' and old.estado is distinct from 'enviada') then
    insert into public.purchase_alerts(tipo, severidad, oc_id, laboratorio_id, titulo, detalle, payload)
    values ('oc_por_recibir', 'info', new.id, new.laboratorio_id,
            'Orden de compra ' || coalesce(new.folio,'') || ' en camino',
            'Se espera recepción el ' || coalesce(new.fecha_esperada::text, 'sin fecha'),
            jsonb_build_object('oc_id', new.id, 'folio', new.folio, 'fecha_esperada', new.fecha_esperada));
  end if;
  return new;
end $$;

drop trigger if exists trg_oc_alerta_almacen on public.ordenes_compra;
create trigger trg_oc_alerta_almacen
  after insert or update of estado on public.ordenes_compra
  for each row execute function public.tg_oc_alerta_almacen();

-- ---------- 16. Revocar anon en las nuevas funciones definer ----------
revoke execute on function public._alm_next_folio(text, regclass) from anon;
revoke execute on function public._mover_lote(uuid, uuid, text, date, numeric, numeric) from anon;
revoke execute on function public.registrar_recepcion(uuid, jsonb, text, text) from anon;
revoke execute on function public.cancelar_recepcion(uuid, text) from anon;
revoke execute on function public.editar_recepcion(uuid, jsonb, text, text) from anon;
revoke execute on function public.ejecutar_traspaso(uuid, uuid, jsonb, text, date) from anon;
revoke execute on function public.crear_remision(uuid, uuid, jsonb, text) from anon;
revoke execute on function public.cancelar_remision(uuid, text) from anon;
revoke execute on function public.editar_remision(uuid, jsonb, text) from anon;
revoke execute on function public.recalcular_bloqueos_compra() from anon;
revoke execute on function public.tg_oc_alerta_almacen() from anon;