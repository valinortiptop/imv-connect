
CREATE OR REPLACE FUNCTION public.fn_stock_entry_to_poliza()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa uuid;
  v_qty numeric;
  v_unit_sin numeric;
  v_unit_con numeric;
  v_sin numeric;
  v_con numeric;
  v_iva numeric;
  v_poliza uuid;
  v_cuenta_inv uuid;
  v_cuenta_iva uuid;
  v_cuenta_prov uuid;
  v_concepto text;
  v_delivery_code text;
  v_fecha date;
  v_folio text;
  v_iva_pct numeric;
BEGIN
  DELETE FROM public.polizas
    WHERE origen = 'inventario' AND origen_id = COALESCE(NEW.id, OLD.id);

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  v_qty := COALESCE(NEW.quantity, 0);

  SELECT COALESCE(NEW.cost_without_iva, p.cost_without_iva),
         COALESCE(NEW.cost_with_iva,    p.cost_with_iva),
         COALESCE(p.iva_pct, 16)
    INTO v_unit_sin, v_unit_con, v_iva_pct
    FROM public.products p WHERE p.id = NEW.product_id;

  v_unit_con := COALESCE(v_unit_con, 0);
  -- Derive sin-IVA from con-IVA when missing
  IF (v_unit_sin IS NULL OR v_unit_sin = 0) AND v_unit_con > 0 THEN
    v_unit_sin := v_unit_con / (1 + COALESCE(v_iva_pct,16)/100.0);
  END IF;
  v_unit_sin := COALESCE(v_unit_sin, 0);

  v_sin := v_unit_sin * v_qty;
  v_con := v_unit_con * v_qty;
  v_iva := GREATEST(v_con - v_sin, 0);

  IF v_sin <= 0 AND v_con <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_empresa FROM public.empresas LIMIT 1;
  IF v_empresa IS NULL THEN RETURN NEW; END IF;

  -- Inventario: prefer "Inventario Producto Terminado", fallback to any "Inventario%", then legacy 115
  SELECT id INTO v_cuenta_inv FROM public.cuentas_contables
    WHERE empresa_id = v_empresa AND activa AND permite_movimientos
      AND nombre ILIKE 'Inventario Producto Terminado%'
    ORDER BY codigo LIMIT 1;
  IF v_cuenta_inv IS NULL THEN
    SELECT id INTO v_cuenta_inv FROM public.cuentas_contables
      WHERE empresa_id = v_empresa AND activa AND permite_movimientos
        AND (codigo = '115' OR nombre ILIKE 'Inventario%')
      ORDER BY codigo LIMIT 1;
  END IF;

  -- IVA acreditable: prefer "IVA acreditable pendiente de pago"
  SELECT id INTO v_cuenta_iva FROM public.cuentas_contables
    WHERE empresa_id = v_empresa AND activa AND permite_movimientos
      AND nombre ILIKE 'IVA acreditable pendiente de pago%'
    ORDER BY codigo LIMIT 1;
  IF v_cuenta_iva IS NULL THEN
    SELECT id INTO v_cuenta_iva FROM public.cuentas_contables
      WHERE empresa_id = v_empresa AND activa AND permite_movimientos
        AND (codigo IN ('119-01','119') OR nombre ILIKE 'IVA acreditable%')
      ORDER BY codigo LIMIT 1;
  END IF;

  -- Proveedores: prefer "Proveedores nacionales"
  SELECT id INTO v_cuenta_prov FROM public.cuentas_contables
    WHERE empresa_id = v_empresa AND activa AND permite_movimientos
      AND nombre ILIKE 'Proveedores nacionales%'
    ORDER BY codigo LIMIT 1;
  IF v_cuenta_prov IS NULL THEN
    SELECT id INTO v_cuenta_prov FROM public.cuentas_contables
      WHERE empresa_id = v_empresa AND activa AND permite_movimientos
        AND (codigo = '201' OR nombre ILIKE 'Proveedores%')
      ORDER BY codigo LIMIT 1;
  END IF;

  IF v_cuenta_inv IS NULL OR v_cuenta_prov IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT delivery_code, delivery_date INTO v_delivery_code, v_fecha
    FROM public.stock_deliveries WHERE id = NEW.delivery_id;

  v_fecha := COALESCE(NEW.entry_date, v_fecha, CURRENT_DATE);
  v_concepto := 'Entrada de inventario ' || COALESCE(v_delivery_code, NEW.delivery_id::text);
  v_folio := 'INV-' || to_char(v_fecha, 'YYYYMMDD') || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.polizas (empresa_id, folio, tipo, estado, fecha, concepto, origen, origen_id, total_cargos, total_abonos)
  VALUES (v_empresa, v_folio, 'diario', 'borrador', v_fecha, v_concepto, 'inventario', NEW.id, v_sin + v_iva, v_sin + v_iva)
  RETURNING id INTO v_poliza;

  INSERT INTO public.poliza_movimientos (poliza_id, cuenta_id, cargo, abono, concepto, orden)
  VALUES (v_poliza, v_cuenta_inv, v_sin, 0, v_concepto, 1);

  IF v_iva > 0 AND v_cuenta_iva IS NOT NULL THEN
    INSERT INTO public.poliza_movimientos (poliza_id, cuenta_id, cargo, abono, concepto, orden)
    VALUES (v_poliza, v_cuenta_iva, v_iva, 0, v_concepto || ' - IVA', 2);
  END IF;

  INSERT INTO public.poliza_movimientos (poliza_id, cuenta_id, cargo, abono, concepto, orden)
  VALUES (v_poliza, v_cuenta_prov, 0, v_sin + v_iva, v_concepto, 3);

  RETURN NEW;
END;
$function$;

-- Backfill existing stock entries so their polizas get generated with the new mapping
UPDATE public.stock_entries SET updated_at = updated_at WHERE id IS NOT NULL;
