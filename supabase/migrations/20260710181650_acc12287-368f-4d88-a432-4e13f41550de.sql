DELETE FROM public.almacenes WHERE id = '0808c55e-db25-49b2-ab0e-1b1e447d3d09';

DROP INDEX IF EXISTS public.almacenes_principal_uniq;

CREATE UNIQUE INDEX almacenes_principal_por_empresa_uniq
  ON public.almacenes (empresa_id)
  WHERE principal;