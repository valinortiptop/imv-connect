
UPDATE public.system_config SET value = trim(both '"' from value)
  WHERE key IN ('cuenta_clientes','cuenta_ventas','cuenta_iva_trasladado',
                'cuenta_iva_por_trasladar','cuenta_costo_venta',
                'cuenta_inventario','cuenta_bancos_default');

CREATE OR REPLACE FUNCTION public._cfg_text(p_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT trim(both '"' from value) FROM public.system_config WHERE key = p_key;
$$;

CREATE OR REPLACE FUNCTION public._find_cuenta(p_empresa uuid, p_codigo text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id FROM public.cuentas_contables
   WHERE empresa_id = p_empresa AND codigo = p_codigo AND activa = true
   ORDER BY nivel DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._find_periodo(p_empresa uuid, p_fecha date)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id FROM public.periodos_contables
   WHERE empresa_id = p_empresa
     AND anio = EXTRACT(YEAR FROM p_fecha)::int
     AND mes  = EXTRACT(MONTH FROM p_fecha)::int
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._next_poliza_folio(p_empresa uuid, p_tipo poliza_tipo, p_fecha date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT upper(substring(p_tipo::text,1,2)) || '-' ||
         to_char(p_fecha,'YYYYMM') || '-' ||
         lpad(((SELECT count(*)+1 FROM public.polizas
                 WHERE empresa_id=p_empresa AND tipo=p_tipo
                   AND to_char(fecha,'YYYYMM')=to_char(p_fecha,'YYYYMM')))::text, 5, '0');
$$;

-- ---------- Factura → Póliza ----------
CREATE OR REPLACE FUNCTION public.post_factura_poliza(p_factura_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_fac public.facturas%ROWTYPE; v_empresa uuid; v_periodo uuid;
  v_cta_cli uuid; v_cta_ven uuid; v_cta_iva uuid; v_poliza uuid;
BEGIN
  SELECT * INTO v_fac FROM public.facturas WHERE id = p_factura_id;
  IF NOT FOUND OR v_fac.poliza_id IS NOT NULL THEN RETURN v_fac.poliza_id; END IF;

  v_empresa := COALESCE(v_fac.empresa_id,(SELECT id FROM public.empresas WHERE is_default=true LIMIT 1));
  IF v_empresa IS NULL THEN RETURN NULL; END IF;

  v_periodo := public._find_periodo(v_empresa, v_fac.fecha_emision);
  v_cta_cli := public._find_cuenta(v_empresa, public._cfg_text('cuenta_clientes'));
  v_cta_ven := public._find_cuenta(v_empresa, public._cfg_text('cuenta_ventas'));
  v_cta_iva := public._find_cuenta(v_empresa, public._cfg_text('cuenta_iva_trasladado'));

  IF v_periodo IS NULL OR v_cta_cli IS NULL OR v_cta_ven IS NULL OR v_cta_iva IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.polizas
    (empresa_id, periodo_id, tipo, folio, fecha, concepto, estado,
     total_cargos, total_abonos, origen, origen_id, estado_origen)
  VALUES (v_empresa, v_periodo, 'ingreso',
     public._next_poliza_folio(v_empresa,'ingreso',v_fac.fecha_emision),
     v_fac.fecha_emision,
     'Factura '||coalesce(v_fac.serie,'')||coalesce(v_fac.folio,''),
     'asentada', v_fac.total, v_fac.total, 'factura', v_fac.id, 'automatica')
  RETURNING id INTO v_poliza;

  INSERT INTO public.poliza_movimientos
    (poliza_id, cuenta_id, cargo, abono, concepto, uuid_cfdi, factura_id, orden) VALUES
    (v_poliza, v_cta_cli, v_fac.total, 0, 'Cliente por factura '||coalesce(v_fac.folio,''), v_fac.uuid_fiscal, v_fac.id, 1),
    (v_poliza, v_cta_ven, 0, v_fac.subtotal, 'Venta factura '||coalesce(v_fac.folio,''), v_fac.uuid_fiscal, v_fac.id, 2),
    (v_poliza, v_cta_iva, 0, v_fac.iva, 'IVA trasladado '||coalesce(v_fac.folio,''), v_fac.uuid_fiscal, v_fac.id, 3);

  UPDATE public.facturas SET poliza_id = v_poliza WHERE id = v_fac.id;
  RETURN v_poliza;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'post_factura_poliza(%): %', p_factura_id, SQLERRM;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.post_factura_poliza(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_factura_post_poliza()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.estado = 'emitida' AND (OLD.estado IS DISTINCT FROM 'emitida') AND NEW.poliza_id IS NULL THEN
    PERFORM public.post_factura_poliza(NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS factura_post_poliza ON public.facturas;
CREATE TRIGGER factura_post_poliza AFTER UPDATE OF estado ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.trg_factura_post_poliza();

-- ---------- Pago → Póliza ----------
CREATE OR REPLACE FUNCTION public.post_pago_poliza(p_pago_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_pago public.pagos%ROWTYPE; v_fac public.facturas%ROWTYPE;
  v_empresa uuid; v_periodo uuid; v_cta_bnk uuid; v_cta_cli uuid; v_poliza uuid;
BEGIN
  SELECT * INTO v_pago FROM public.pagos WHERE id = p_pago_id;
  IF NOT FOUND OR v_pago.poliza_id IS NOT NULL THEN RETURN v_pago.poliza_id; END IF;

  SELECT * INTO v_fac FROM public.facturas WHERE id = v_pago.factura_id;
  v_empresa := COALESCE(v_fac.empresa_id,(SELECT id FROM public.empresas WHERE is_default=true LIMIT 1));
  IF v_empresa IS NULL THEN RETURN NULL; END IF;

  v_periodo := public._find_periodo(v_empresa, v_pago.fecha);
  v_cta_bnk := public._find_cuenta(v_empresa, public._cfg_text('cuenta_bancos_default'));
  v_cta_cli := public._find_cuenta(v_empresa, public._cfg_text('cuenta_clientes'));
  IF v_periodo IS NULL OR v_cta_bnk IS NULL OR v_cta_cli IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.polizas
    (empresa_id, periodo_id, tipo, folio, fecha, concepto, estado,
     total_cargos, total_abonos, origen, origen_id, estado_origen)
  VALUES (v_empresa, v_periodo, 'ingreso',
     public._next_poliza_folio(v_empresa,'ingreso',v_pago.fecha),
     v_pago.fecha, 'Cobro factura '||coalesce(v_fac.folio,''),
     'asentada', v_pago.monto, v_pago.monto, 'pago', v_pago.id, 'automatica')
  RETURNING id INTO v_poliza;

  INSERT INTO public.poliza_movimientos
    (poliza_id, cuenta_id, cargo, abono, concepto, pago_id, factura_id, orden) VALUES
    (v_poliza, v_cta_bnk, v_pago.monto, 0, 'Cobro '||coalesce(v_pago.referencia,''), v_pago.id, v_fac.id, 1),
    (v_poliza, v_cta_cli, 0, v_pago.monto, 'Aplicación cliente '||coalesce(v_fac.folio,''), v_pago.id, v_fac.id, 2);

  UPDATE public.pagos SET poliza_id = v_poliza WHERE id = v_pago.id;
  RETURN v_poliza;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'post_pago_poliza(%): %', p_pago_id, SQLERRM;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.post_pago_poliza(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_pago_post_poliza()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.poliza_id IS NULL THEN PERFORM public.post_pago_poliza(NEW.id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pago_post_poliza ON public.pagos;
CREATE TRIGGER pago_post_poliza AFTER INSERT ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.trg_pago_post_poliza();

-- ---------- Delivery trip → Movimientos ----------
CREATE OR REPLACE FUNCTION public.create_remision_inventory_movs(p_trip_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ref text := 'remision:'||p_trip_id::text; v_cnt int := 0; v_almacen uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario WHERE referencia = v_ref) THEN RETURN 0; END IF;
  SELECT id INTO v_almacen FROM public.almacenes ORDER BY created_at LIMIT 1;

  INSERT INTO public.movimientos_inventario
    (tipo, producto_id, almacen_id, cantidad, pedido_id, referencia, notas)
  SELECT 'venta', dti.product_id, v_almacen, dti.quantity, dti.order_id, v_ref, 'Salida por remisión'
    FROM public.delivery_trip_items dti WHERE dti.trip_id = p_trip_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;

  UPDATE public.stock s
     SET cantidad = s.cantidad - dti.quantity, updated_at = now()
    FROM public.delivery_trip_items dti
   WHERE dti.trip_id = p_trip_id AND s.producto_id = dti.product_id AND s.almacen_id = v_almacen;

  RETURN v_cnt;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_remision_inventory_movs(%): %', p_trip_id, SQLERRM;
  RETURN 0;
END $$;
GRANT EXECUTE ON FUNCTION public.create_remision_inventory_movs(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_delivery_trip_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('entregado','completado','delivered')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.create_remision_inventory_movs(NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS delivery_trip_inventory ON public.delivery_trips;
CREATE TRIGGER delivery_trip_inventory AFTER UPDATE OF status ON public.delivery_trips
  FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_trip_inventory();

-- ---------- Póliza modificada ----------
CREATE OR REPLACE FUNCTION public.trg_poliza_mark_modificada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.estado_origen = 'automatica'
     AND (OLD.concepto IS DISTINCT FROM NEW.concepto
       OR OLD.fecha IS DISTINCT FROM NEW.fecha
       OR OLD.total_cargos IS DISTINCT FROM NEW.total_cargos
       OR OLD.total_abonos IS DISTINCT FROM NEW.total_abonos) THEN
    NEW.estado_origen := 'modificada';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS poliza_mark_modificada ON public.polizas;
CREATE TRIGGER poliza_mark_modificada BEFORE UPDATE ON public.polizas
  FOR EACH ROW EXECUTE FUNCTION public.trg_poliza_mark_modificada();

CREATE OR REPLACE FUNCTION public.trg_poliza_mov_mark_modificada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pol uuid;
BEGIN
  v_pol := COALESCE(NEW.poliza_id, OLD.poliza_id);
  UPDATE public.polizas SET estado_origen = 'modificada'
   WHERE id = v_pol AND estado_origen = 'automatica';
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS poliza_mov_mark_modificada ON public.poliza_movimientos;
CREATE TRIGGER poliza_mov_mark_modificada
  AFTER INSERT OR UPDATE OR DELETE ON public.poliza_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.trg_poliza_mov_mark_modificada();
