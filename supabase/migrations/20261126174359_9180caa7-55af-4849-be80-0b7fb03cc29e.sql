CREATE OR REPLACE FUNCTION public.ejecutar_traspaso(_origen uuid, _destino uuid, _items jsonb, _notas text DEFAULT NULL::text, _fecha date DEFAULT CURRENT_DATE)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid; v_it record; v_folio text; v_disp numeric; v_lote_disp numeric; v_nombre text;
begin
  if _origen = _destino then raise exception 'Almacén origen y destino deben ser distintos'; end if;
  if not public.is_staff(auth.uid()) then raise exception 'Sin permiso'; end if;

  v_folio := public._alm_next_folio('TRA','public.traspasos_almacen');
  insert into public.traspasos_almacen(folio, almacen_origen_id, almacen_destino_id, fecha, notas, created_by)
  values (v_folio, _origen, _destino, coalesce(_fecha, current_date), _notas, auth.uid())
  returning id into v_id;

  for v_it in
    select (e->>'producto_id')::uuid as producto_id, nullif(e->>'lote','') as lote,
           nullif(e->>'caducidad','')::date as caducidad, (e->>'cantidad')::numeric as cantidad
      from jsonb_array_elements(_items) e
  loop
    if v_it.cantidad is null or v_it.cantidad <= 0 then continue; end if;
    if v_it.cantidad <> trunc(v_it.cantidad) then raise exception 'Las piezas deben ser enteras'; end if;
    select coalesce(nombre, sku) into v_nombre from public.productos where id = v_it.producto_id;

    select coalesce(cantidad,0) into v_disp from public.stock
      where producto_id = v_it.producto_id and almacen_id = _origen;
    if coalesce(v_disp,0) < v_it.cantidad then
      raise exception 'Existencia insuficiente de % en almacén origen: hay %, se intentan mover %', v_nombre, coalesce(v_disp,0), v_it.cantidad;
    end if;

    if v_it.lote is not null then
      select coalesce(sum(cantidad),0) into v_lote_disp from public.product_batches
       where producto_id = v_it.producto_id and almacen_id = _origen and lote = v_it.lote
         and (caducidad is not distinct from v_it.caducidad);
      if v_lote_disp < v_it.cantidad then
        raise exception 'El lote % de % solo tiene % piezas en origen; se intentan mover %', v_it.lote, v_nombre, v_lote_disp, v_it.cantidad;
      end if;
    end if;

    insert into public.traspasos_almacen_items(traspaso_id, producto_id, lote, caducidad, cantidad)
    values (v_id, v_it.producto_id, v_it.lote, v_it.caducidad, v_it.cantidad);
    insert into public.movimientos_inventario (tipo, producto_id, almacen_id, cantidad, referencia, notas, created_by, lote, caducidad, origen_tipo, origen_id)
    values ('salida', v_it.producto_id, _origen, v_it.cantidad, 'traspaso:' || v_folio, 'Traspaso salida', auth.uid(), v_it.lote, v_it.caducidad, 'traspaso_out', v_id);
    insert into public.movimientos_inventario (tipo, producto_id, almacen_id, cantidad, referencia, notas, created_by, lote, caducidad, origen_tipo, origen_id)
    values ('entrada', v_it.producto_id, _destino, v_it.cantidad, 'traspaso:' || v_folio, 'Traspaso entrada', auth.uid(), v_it.lote, v_it.caducidad, 'traspaso_in', v_id);
    perform public._mover_lote(v_it.producto_id, _origen, v_it.lote, v_it.caducidad, -v_it.cantidad, null);
    perform public._mover_lote(v_it.producto_id, _destino, v_it.lote, v_it.caducidad, v_it.cantidad, null);
  end loop;
  return v_id;
end $function$;