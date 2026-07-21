
DROP TRIGGER IF EXISTS facturas_generate_poliza_trg ON public.facturas;
DROP TRIGGER IF EXISTS trg_autogenerate_poliza_from_factura ON public.facturas;

INSERT INTO public.cliente_credito (cliente_id, limite_credito, dias_credito)
SELECT c.id, COALESCE(c.credit_limit, 0)::numeric, 30
FROM public.clientes c
WHERE NOT EXISTS (SELECT 1 FROM public.cliente_credito cc WHERE cc.cliente_id = c.id);
