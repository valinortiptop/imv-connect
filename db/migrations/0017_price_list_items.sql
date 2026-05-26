-- Price list items + extras for /admin/listas-precios

-- 1. Add description to price_lists (if not present)
ALTER TABLE public.price_lists
  ADD COLUMN IF NOT EXISTS description text;

-- 2. price_list_items: manual / override prices per product per list
CREATE TABLE IF NOT EXISTS public.price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_with_iva numeric(12,2) NOT NULL CHECK (price_with_iva >= 0),
  manual_override boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (price_list_id, product_id)
);
CREATE INDEX IF NOT EXISTS pli_list_idx    ON public.price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS pli_product_idx ON public.price_list_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_list_items TO authenticated;
GRANT ALL ON public.price_list_items TO service_role;

ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY price_list_items_all ON public.price_list_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- price_lists also needs auth grants if missing
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_lists TO authenticated;
GRANT ALL ON public.price_lists TO service_role;
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY price_lists_all ON public.price_lists
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. resync_price_list RPC — applies markup_pct to all active products
--    Skips rows where manual_override = true.
CREATE OR REPLACE FUNCTION public.resync_price_list(p_list_id uuid)
RETURNS TABLE(updated int, inserted int, skipped_overridden int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_markup numeric;
  v_updated int := 0;
  v_inserted int := 0;
  v_skipped int := 0;
BEGIN
  SELECT markup_pct INTO v_markup FROM public.price_lists WHERE id = p_list_id;
  IF v_markup IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  -- Count locked (overridden) rows we will skip
  SELECT count(*) INTO v_skipped
    FROM public.price_list_items
   WHERE price_list_id = p_list_id AND manual_override = true;

  -- Update existing non-override rows
  WITH upd AS (
    UPDATE public.price_list_items pli
       SET price_with_iva = round(coalesce(p.sale_price_with_iva, 0) * (1 + v_markup/100.0), 2),
           updated_at = now()
      FROM public.products p
     WHERE pli.product_id = p.id
       AND pli.price_list_id = p_list_id
       AND pli.manual_override = false
       AND p.active = true
       AND p.sale_price_with_iva IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  -- Insert formula rows for active products that have no row yet
  WITH ins AS (
    INSERT INTO public.price_list_items (price_list_id, product_id, price_with_iva, manual_override)
    SELECT p_list_id,
           p.id,
           round(coalesce(p.sale_price_with_iva, 0) * (1 + v_markup/100.0), 2),
           false
      FROM public.products p
     WHERE p.active = true
       AND p.sale_price_with_iva IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.price_list_items x
          WHERE x.price_list_id = p_list_id AND x.product_id = p.id
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN QUERY SELECT v_updated, v_inserted, v_skipped;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resync_price_list(uuid) TO authenticated;
