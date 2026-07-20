
-- Auto-generate accounting polizas from inventory stock_entries
CREATE OR REPLACE FUNCTION public.fn_stock_entry_to_poliza()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_qty numeric;
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
BEGIN
  -- Delete previous auto-poliza tied to this stock_entry (works for UPDATE/DELETE)
  DELETE FROM public.polizas
    WHERE origen = 'inventario' AND origen_id = COALESCE(NEW.id, OLD.id);

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  v_qty := COALESCE(NEW.quantity, 0);
  v_sin := COALESCE(NEW.cost_without_iva, 0) * v_qty;
  v_con := COALESCE(NEW.cost_with_iva, NEW.cost_without_iva, 0) * v_qty;
  v_iva := GREATEST(v_con - v_sin, 0);

  IF v_sin <= 0 AND v_con <= 0 THEN
    RETURN NEW;
  END IF;

  -- Single-tenant: pick the only empresa
  SELECT id INTO v_empresa FROM public.empresas LIMIT 1;
  IF v_empresa IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_cuenta_inv  FROM public.cuentas_contables WHERE empresa_id = v_empresa AND codigo = '115' LIMIT 1;
  SELECT id INTO v_cuenta_iva  FROM public.cuentas_contables WHERE empresa_id = v_empresa AND codigo IN ('119-01','119') ORDER BY codigo DESC LIMIT 1;
  SELECT id INTO v_cuenta_prov FROM public.cuentas_contables WHERE empresa_id = v_empresa AND codigo = '201' LIMIT 1;

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
$$;

DROP TRIGGER IF EXISTS trg_stock_entry_poliza ON public.stock_entries;
CREATE TRIGGER trg_stock_entry_poliza
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_stock_entry_to_poliza();

-- Backfill existing stock_entries
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.stock_entries LOOP
    PERFORM public.fn_stock_entry_to_poliza_backfill(r.id);
  END LOOP;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Simple backfill: re-touch each row so the trigger fires
UPDATE public.stock_entries SET updated_at = updated_at WHERE true;
