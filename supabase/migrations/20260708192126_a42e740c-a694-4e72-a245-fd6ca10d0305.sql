
-- 1) Sequential folio -------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.pedidos_folio_seq START WITH 1;

-- Renumber existing pedidos in creation order so the visible folios are
-- p-1, p-2, ... The unique constraint (if any) allows this because we
-- overwrite each folio to a value that does not yet exist.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS n
    FROM public.pedidos
)
UPDATE public.pedidos p
   SET folio = 'p-' || o.n
  FROM ordered o
 WHERE p.id = o.id;

-- Advance the sequence past the largest current folio number.
SELECT setval(
  'public.pedidos_folio_seq',
  GREATEST(
    (SELECT COALESCE(MAX((substring(folio from '^p-([0-9]+)$'))::bigint), 0)
       FROM public.pedidos),
    1
  ),
  true
);

-- New default for pedidos.folio
ALTER TABLE public.pedidos
  ALTER COLUMN folio SET DEFAULT 'p-' || nextval('public.pedidos_folio_seq');


-- 2) Auto-recompute pedido totals from pedido_items ------------------------
CREATE OR REPLACE FUNCTION public.pedidos_recalc_totals(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pedidos p
     SET total    = COALESCE(t.total, 0),
         iva      = COALESCE(t.iva,   0),
         subtotal = COALESCE(t.subtotal, 0)
    FROM (
      SELECT
        pi.pedido_id,
        SUM(pi.importe)                                                  AS total,
        SUM(pi.importe - pi.importe / (1 + pi.iva_pct/100.0))            AS iva,
        SUM(pi.importe / (1 + pi.iva_pct/100.0))                         AS subtotal
      FROM public.pedido_items pi
      WHERE pi.pedido_id = p_pedido_id
      GROUP BY pi.pedido_id
    ) t
   WHERE p.id = p_pedido_id;

  -- If there are no items at all, zero out.
  UPDATE public.pedidos
     SET total = 0, iva = 0, subtotal = 0
   WHERE id = p_pedido_id
     AND NOT EXISTS (SELECT 1 FROM public.pedido_items WHERE pedido_id = p_pedido_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pedido_items_totals_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.pedidos_recalc_totals(OLD.pedido_id);
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM public.pedidos_recalc_totals(NEW.pedido_id);
    IF (OLD.pedido_id IS DISTINCT FROM NEW.pedido_id) THEN
      PERFORM public.pedidos_recalc_totals(OLD.pedido_id);
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.pedidos_recalc_totals(NEW.pedido_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS pedido_items_totals ON public.pedido_items;
CREATE TRIGGER pedido_items_totals
AFTER INSERT OR UPDATE OR DELETE ON public.pedido_items
FOR EACH ROW EXECUTE FUNCTION public.pedido_items_totals_trigger();

-- Backfill totals for every existing pedido
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.pedidos LOOP
    PERFORM public.pedidos_recalc_totals(r.id);
  END LOOP;
END $$;
