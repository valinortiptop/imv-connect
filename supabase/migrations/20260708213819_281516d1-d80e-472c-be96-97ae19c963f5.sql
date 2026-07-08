
-- Auto-generate an accounting policy (póliza de ingreso, borrador) whenever
-- a factura is created. Mirrors the manual "Contabilizar" flow.
CREATE OR REPLACE FUNCTION public.autogenerate_poliza_from_factura()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_empresa uuid := NEW.empresa_id;
  v_total numeric := COALESCE(NEW.total, 0);
  v_iva numeric;
  v_sub numeric;
  v_poliza_id uuid;
  v_cta_clientes uuid;
  v_cta_ventas uuid;
  v_cta_iva uuid;
BEGIN
  -- Skip if already linked, or no empresa, or zero-value.
  IF NEW.poliza_id IS NOT NULL OR v_empresa IS NULL OR v_total <= 0 THEN
    RETURN NEW;
  END IF;

  -- Resolve accounts (fallback to sensible codes)
  SELECT id INTO v_cta_clientes FROM public.cuentas_contables
    WHERE empresa_id = v_empresa AND codigo = '105' LIMIT 1;
  SELECT id INTO v_cta_ventas   FROM public.cuentas_contables
    WHERE empresa_id = v_empresa AND codigo = '401' LIMIT 1;
  SELECT id INTO v_cta_iva      FROM public.cuentas_contables
    WHERE empresa_id = v_empresa AND codigo IN ('209-01','208-01')
    ORDER BY CASE codigo WHEN '209-01' THEN 0 ELSE 1 END LIMIT 1;

  -- If key accounts are missing, don't fail the factura insert.
  IF v_cta_clientes IS NULL OR v_cta_ventas IS NULL OR v_cta_iva IS NULL THEN
    RETURN NEW;
  END IF;

  v_iva := COALESCE(NEW.iva, ROUND(v_total - v_total / 1.16, 2));
  v_sub := ROUND(v_total - v_iva, 2);

  INSERT INTO public.polizas (
    empresa_id, tipo, fecha, concepto, estado, origen, origen_id
  ) VALUES (
    v_empresa, 'ingreso', NEW.fecha_emision,
    'Factura ' || COALESCE(NEW.folio, NEW.id::text),
    'borrador', 'factura', NEW.id
  ) RETURNING id INTO v_poliza_id;

  INSERT INTO public.poliza_movimientos (poliza_id, cuenta_id, cargo, abono, concepto, orden)
  VALUES
    (v_poliza_id, v_cta_clientes, v_total, 0, 'Cliente', 0),
    (v_poliza_id, v_cta_ventas,   0,       v_sub,   'Ventas', 1),
    (v_poliza_id, v_cta_iva,      0,       v_iva,   'IVA por trasladar 16%', 2);

  -- Link back (avoid recursion: only update the linkage column)
  UPDATE public.facturas SET poliza_id = v_poliza_id WHERE id = NEW.id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_autogenerate_poliza_from_factura ON public.facturas;
CREATE TRIGGER trg_autogenerate_poliza_from_factura
AFTER INSERT ON public.facturas
FOR EACH ROW
EXECUTE FUNCTION public.autogenerate_poliza_from_factura();

-- Backfill: for every existing factura with empresa but no póliza, create one.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.facturas
    WHERE poliza_id IS NULL AND empresa_id IS NOT NULL AND COALESCE(total,0) > 0
  LOOP
    -- Trigger fires only on INSERT, so replay via a no-op update to invoke a
    -- helper: easier to just call the same logic inline.
    PERFORM 1;
  END LOOP;
END $$;

-- Explicit backfill loop (calls logic directly)
DO $$
DECLARE
  f RECORD;
  v_empresa uuid;
  v_total numeric;
  v_iva numeric;
  v_sub numeric;
  v_poliza_id uuid;
  v_cta_clientes uuid;
  v_cta_ventas uuid;
  v_cta_iva uuid;
BEGIN
  FOR f IN
    SELECT * FROM public.facturas
    WHERE poliza_id IS NULL AND empresa_id IS NOT NULL AND COALESCE(total,0) > 0
  LOOP
    v_empresa := f.empresa_id;
    v_total := COALESCE(f.total, 0);

    SELECT id INTO v_cta_clientes FROM public.cuentas_contables
      WHERE empresa_id = v_empresa AND codigo = '105' LIMIT 1;
    SELECT id INTO v_cta_ventas   FROM public.cuentas_contables
      WHERE empresa_id = v_empresa AND codigo = '401' LIMIT 1;
    SELECT id INTO v_cta_iva      FROM public.cuentas_contables
      WHERE empresa_id = v_empresa AND codigo IN ('209-01','208-01')
      ORDER BY CASE codigo WHEN '209-01' THEN 0 ELSE 1 END LIMIT 1;

    IF v_cta_clientes IS NULL OR v_cta_ventas IS NULL OR v_cta_iva IS NULL THEN
      CONTINUE;
    END IF;

    v_iva := COALESCE(f.iva, ROUND(v_total - v_total / 1.16, 2));
    v_sub := ROUND(v_total - v_iva, 2);

    INSERT INTO public.polizas (empresa_id, tipo, fecha, concepto, estado, origen, origen_id)
    VALUES (v_empresa, 'ingreso', f.fecha_emision,
            'Factura ' || COALESCE(f.folio, f.id::text),
            'borrador', 'factura', f.id)
    RETURNING id INTO v_poliza_id;

    INSERT INTO public.poliza_movimientos (poliza_id, cuenta_id, cargo, abono, concepto, orden)
    VALUES
      (v_poliza_id, v_cta_clientes, v_total, 0, 'Cliente', 0),
      (v_poliza_id, v_cta_ventas,   0,       v_sub,   'Ventas', 1),
      (v_poliza_id, v_cta_iva,      0,       v_iva,   'IVA por trasladar 16%', 2);

    UPDATE public.facturas SET poliza_id = v_poliza_id WHERE id = f.id;
  END LOOP;
END $$;
