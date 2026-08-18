DROP INDEX IF EXISTS public.sales_history_netsuite_line_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS sales_history_netsuite_line_uidx
  ON public.sales_history (netsuite_line_id);

DROP INDEX IF EXISTS public.clientes_netsuite_id_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS clientes_netsuite_id_uidx
  ON public.clientes (netsuite_id);

DROP INDEX IF EXISTS public.productos_netsuite_id_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS productos_netsuite_id_uidx
  ON public.productos (netsuite_id);