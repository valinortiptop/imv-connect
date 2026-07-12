
CREATE TABLE public.sales_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'netsuite',
  import_batch_id uuid,
  invoice_no text NOT NULL,
  invoice_date date NOT NULL,
  rep_name_raw text,
  representante_id uuid REFERENCES public.representantes(id) ON DELETE SET NULL,
  lab_name_raw text,
  laboratorio_id uuid REFERENCES public.laboratorios(id) ON DELETE SET NULL,
  client_name_raw text,
  client_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  sku text,
  product_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  description text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  revenue numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT sales_history_unique_line UNIQUE
    (empresa_id, invoice_no, sku, client_name_raw, rep_name_raw)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_history TO authenticated;
GRANT ALL ON public.sales_history TO service_role;

ALTER TABLE public.sales_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_history_auth_read" ON public.sales_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_history_auth_write" ON public.sales_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sales_history_auth_update" ON public.sales_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_history_auth_delete" ON public.sales_history FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX sales_history_empresa_date_idx ON public.sales_history (empresa_id, invoice_date);
CREATE INDEX sales_history_client_idx ON public.sales_history (client_id);
CREATE INDEX sales_history_product_idx ON public.sales_history (product_id);
CREATE INDEX sales_history_rep_idx ON public.sales_history (representante_id);
CREATE INDEX sales_history_lab_idx ON public.sales_history (laboratorio_id);
CREATE INDEX sales_history_batch_idx ON public.sales_history (import_batch_id);

CREATE OR REPLACE FUNCTION public.sales_history_resolve_fks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_norm_client text;
  v_norm_rep text;
  v_norm_lab text;
BEGIN
  NEW.updated_at := now();

  IF NEW.product_id IS NULL AND NEW.sku IS NOT NULL AND NEW.sku <> '' THEN
    SELECT id INTO NEW.product_id FROM public.productos WHERE sku = NEW.sku LIMIT 1;
  END IF;

  IF NEW.client_id IS NULL AND NEW.client_name_raw IS NOT NULL THEN
    v_norm_client := lower(btrim(regexp_replace(NEW.client_name_raw, '^\s*\d+\s+', '')));
    IF v_norm_client <> '' THEN
      SELECT id INTO NEW.client_id FROM public.clientes
       WHERE lower(coalesce(nombre_comercial, '')) = v_norm_client
          OR lower(coalesce(razon_social, ''))     = v_norm_client
       ORDER BY created_at ASC LIMIT 1;
    END IF;
  END IF;

  IF NEW.representante_id IS NULL AND NEW.rep_name_raw IS NOT NULL THEN
    v_norm_rep := lower(btrim(NEW.rep_name_raw));
    IF v_norm_rep <> '' THEN
      SELECT id INTO NEW.representante_id FROM public.representantes
       WHERE lower(btrim(nombre)) = v_norm_rep LIMIT 1;
    END IF;
  END IF;

  IF NEW.laboratorio_id IS NULL AND NEW.lab_name_raw IS NOT NULL THEN
    v_norm_lab := lower(btrim(NEW.lab_name_raw));
    IF v_norm_lab <> '' THEN
      SELECT id INTO NEW.laboratorio_id FROM public.laboratorios
       WHERE lower(btrim(nombre)) = v_norm_lab LIMIT 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_history_resolve_fks ON public.sales_history;
CREATE TRIGGER trg_sales_history_resolve_fks
  BEFORE INSERT OR UPDATE ON public.sales_history
  FOR EACH ROW EXECUTE FUNCTION public.sales_history_resolve_fks();

CREATE OR REPLACE VIEW public.v_ventas_unified AS
SELECT
  'historico'::text                  AS fuente,
  sh.id                              AS id,
  sh.invoice_date                    AS fecha,
  sh.empresa_id                      AS empresa_id,
  sh.client_id                       AS client_id,
  COALESCE(NULLIF(btrim(regexp_replace(sh.client_name_raw, '^\s*\d+\s+', '')), ''), sh.client_name_raw) AS client_name,
  sh.representante_id                AS representante_id,
  sh.rep_name_raw                    AS rep_name,
  sh.laboratorio_id                  AS laboratorio_id,
  sh.lab_name_raw                    AS lab_name,
  sh.product_id                      AS product_id,
  sh.sku                             AS sku,
  sh.description                     AS description,
  sh.quantity                        AS quantity,
  sh.revenue                         AS revenue,
  sh.invoice_no                      AS invoice_no
FROM public.sales_history sh

UNION ALL

SELECT
  'pedido'::text                     AS fuente,
  pi.id                              AS id,
  COALESCE(p.delivery_date, p.created_at::date) AS fecha,
  NULL::uuid                         AS empresa_id,
  p.cliente_id                       AS client_id,
  COALESCE(c.nombre_comercial, c.razon_social) AS client_name,
  p.representante_id                 AS representante_id,
  r.nombre                           AS rep_name,
  pr.laboratorio_id                  AS laboratorio_id,
  l.nombre                           AS lab_name,
  pi.producto_id                     AS product_id,
  pi.sku_snapshot                    AS sku,
  pi.nombre_snapshot                 AS description,
  pi.cantidad                        AS quantity,
  ROUND(pi.cantidad * pi.precio_unitario, 2) AS revenue,
  p.folio                            AS invoice_no
FROM public.pedido_items pi
JOIN public.pedidos p ON p.id = pi.pedido_id
LEFT JOIN public.clientes c ON c.id = p.cliente_id
LEFT JOIN public.representantes r ON r.id = p.representante_id
LEFT JOIN public.productos pr ON pr.id = pi.producto_id
LEFT JOIN public.laboratorios l ON l.id = pr.laboratorio_id
WHERE p.estado IN ('confirmado','enviado','entregado');

GRANT SELECT ON public.v_ventas_unified TO authenticated;
GRANT ALL ON public.v_ventas_unified TO service_role;

COMMENT ON VIEW public.v_ventas_unified IS
  'Ventas unificadas: pedidos confirmados/entregados + sales_history importado. revenue viene sin IVA cuando la fuente es histórica (NetSuite).';
