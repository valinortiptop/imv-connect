CREATE OR REPLACE FUNCTION public.crear_remision(_pedido uuid, _almacen uuid, _items jsonb, _notas text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid; v_folio text; v_cliente uuid; v_it record; v_disp numeric; v_lote numeric; v_pedido numeric; v_ya numeric; v_nombre text;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Sin permiso'; end if;
  select cliente_id into v_cliente from public.pedidos where id = _pedido;

  v_folio := public._alm_next_folio('REM','public.remisiones');
  insert into public.remisiones(folio, pedido_id, cliente_id, almacen_id, notas, created_by)
  values (v_folio, _pedido, v_cliente, _almacen, _notas, auth.uid())
  returning id into v_id;

  for v_it in
    select (e->>'producto_id')::uuid as producto_id, nullif(e->>'pedido_item_id','')::uuid as pedido_item_id,
           nullif(e->>'lote','') as lote, nullif(e->>'caducidad','')::date as caducidad,
           nullif(e->>'ubicacion','') as ubicacion, (e->>'cantidad')::numeric as cantidad
      from jsonb_array_elements(_items) e
  loop
    if v_it.cantidad is null or v_it.cantidad <= 0 then continue; end if;
    if v_it.cantidad <> trunc(v_it.cantidad) then raise exception 'Las piezas deben ser enteras'; end if;
    select coalesce(nombre, sku) into v_nombre from public.productos where id = v_it.producto_id;

    select coalesce(cantidad,0) into v_disp from public.stock where producto_id = v_it.producto_id and almacen_id = _almacen;
    if coalesce(v_disp,0) < v_it.cantidad then
      raise exception 'Existencia insuficiente de %: hay %, se intentan remisionar %', v_nombre, coalesce(v_disp,0), v_it.cantidad;
    end if;

    if v_it.lote is not null then
      select coalesce(sum(cantidad),0) into v_lote from public.product_batches
       where producto_id = v_it.producto_id and almacen_id = _almacen and lote = v_it.lote and (caducidad is not distinct from v_it.caducidad);
      if v_lote < v_it.cantidad then
        raise exception 'El lote % de % solo tiene % piezas; se intentan remisionar %', v_it.lote, v_nombre, v_lote, v_it.cantidad;
      end if;
    end if;

    if v_it.pedido_item_id is not null then
      select cantidad into v_pedido from public.pedido_items where id = v_it.pedido_item_id;
      select coalesce(sum(ri.cantidad),0) into v_ya from public.remision_items ri join public.remisiones r on r.id = ri.remision_id
       where ri.pedido_item_id = v_it.pedido_item_id and coalesce(r.estado,'') <> 'cancelada';
      if v_pedido is not null and v_ya + v_it.cantidad > v_pedido then
        raise exception 'Se pidieron % piezas de % y ya hay % remisionadas; no se pueden remisionar % más', v_pedido, v_nombre, v_ya, v_it.cantidad;
      end if;
    end if;

    insert into public.remision_items(remision_id, producto_id, pedido_item_id, lote, caducidad, ubicacion, cantidad)
    values (v_id, v_it.producto_id, v_it.pedido_item_id, v_it.lote, v_it.caducidad, v_it.ubicacion, v_it.cantidad);
    insert into public.movimientos_inventario (tipo, producto_id, almacen_id, cantidad, pedido_id, referencia, notas, created_by, lote, caducidad, origen_tipo, origen_id)
    values ('salida', v_it.producto_id, _almacen, v_it.cantidad, _pedido, 'remision:' || v_folio, 'Salida por remisión', auth.uid(), v_it.lote, v_it.caducidad, 'remision', v_id);
    perform public._mover_lote(v_it.producto_id, _almacen, v_it.lote, v_it.caducidad, -v_it.cantidad, null);
  end loop;
  return v_id;
end $function$;