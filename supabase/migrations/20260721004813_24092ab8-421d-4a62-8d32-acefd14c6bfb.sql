-- Add cost-of-sales leg to factura póliza
CREATE OR REPLACE FUNCTION public.post_factura_poliza(p_factura_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_fac public.facturas%ROWTYPE; v_empresa uuid; v_periodo uuid;
  v_cta_cli uuid; v_cta_ven uuid; v_cta_iva uuid;
  v_cta_cos uuid; v_cta_inv uuid; v_poliza uuid;
  v_costo_total numeric := 0; v_next_orden int := 4;
  r record;
BEGIN
  SELECT * INTO v_fac FROM public.facturas WHERE id = p_factura_id;
  IF NOT FOUND OR v_fac.poliza_id IS NOT NULL THEN RETURN v_fac.poliza_id; END IF;

  v_empresa := COALESCE(v_fac.empresa_id,(SELECT id FROM public.empresas WHERE is_default=true LIMIT 1));
  IF v_empresa IS NULL THEN RETURN NULL; END IF;

  v_periodo := public._find_periodo(v_empresa, v_fac.fecha_emision);
  v_cta_cli := public._find_cuenta(v_empresa, public._cfg_text('cuenta_clientes'));
  v_cta_ven := public._find_cuenta(v_empresa, public._cfg_text('cuenta_ventas'));
  v_cta_iva := public._find_cuenta(v_empresa, public._cfg_text('cuenta_iva_trasladado'));
  v_cta_cos := public._find_cuenta(v_empresa, public._cfg_text('cuenta_costo_venta'));
  v_cta_inv := public._find_cuenta(v_empresa, public._cfg_text('cuenta_inventario'));

  IF v_periodo IS NULL OR v_cta_cli IS NULL OR v_cta_ven IS NULL OR v_cta_iva IS NULL THEN
    RETURN NULL;
  END IF;

  -- Compute total cost of sale from factura_items using latest cost_history, then productos costs
  SELECT COALESCE(SUM(fi.cantidad * COALESCE(
      (SELECT ch.costo_unitario FROM public.cost_history ch
        WHERE ch.producto_id = fi.producto_id
        ORDER BY ch.fecha DESC, ch.created_at DESC LIMIT 1),
      p.costo_siva, p.costo, 0)), 0)
    INTO v_costo_total
    FROM public.factura_items fi
    LEFT JOIN public.productos p ON p.id = fi.producto_id
   WHERE fi.factura_id = v_fac.id;

  INSERT INTO public.polizas
    (empresa_id, periodo_id, tipo, folio, fecha, concepto, estado,
     total_cargos, total_abonos, origen, origen_id, estado_origen)
  VALUES (v_empresa, v_periodo, 'ingreso',
     public._next_poliza_folio(v_empresa,'ingreso',v_fac.fecha_emision),
     v_fac.fecha_emision,
     'Factura '||coalesce(v_fac.serie,'')||coalesce(v_fac.folio,''),
     'asentada',
     v_fac.total + v_costo_total, v_fac.total + v_costo_total,
     'factura', v_fac.id, 'automatica')
  RETURNING id INTO v_poliza;

  INSERT INTO public.poliza_movimientos
    (poliza_id, cuenta_id, cargo, abono, concepto, uuid_cfdi, factura_id, orden) VALUES
    (v_poliza, v_cta_cli, v_fac.total, 0, 'Cliente por factura '||coalesce(v_fac.folio,''), v_fac.uuid_fiscal, v_fac.id, 1),
    (v_poliza, v_cta_ven, 0, v_fac.subtotal, 'Venta factura '||coalesce(v_fac.folio,''), v_fac.uuid_fiscal, v_fac.id, 2),
    (v_poliza, v_cta_iva, 0, v_fac.iva, 'IVA trasladado '||coalesce(v_fac.folio,''), v_fac.uuid_fiscal, v_fac.id, 3);

  -- Cost of sales leg (only if we have both accounts and non-zero cost)
  IF v_cta_cos IS NOT NULL AND v_cta_inv IS NOT NULL AND v_costo_total > 0 THEN
    INSERT INTO public.poliza_movimientos
      (poliza_id, cuenta_id, cargo, abono, concepto, uuid_cfdi, factura_id, orden) VALUES
      (v_poliza, v_cta_cos, v_costo_total, 0, 'Costo de venta '||coalesce(v_fac.folio,''), v_fac.uuid_fiscal, v_fac.id, 4),
      (v_poliza, v_cta_inv, 0, v_costo_total, 'Salida inventario '||coalesce(v_fac.folio,''), v_fac.uuid_fiscal, v_fac.id, 5);
  END IF;

  UPDATE public.facturas SET poliza_id = v_poliza WHERE id = v_fac.id;
  RETURN v_poliza;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'post_factura_poliza(%): %', p_factura_id, SQLERRM;
  RETURN NULL;
END $$;