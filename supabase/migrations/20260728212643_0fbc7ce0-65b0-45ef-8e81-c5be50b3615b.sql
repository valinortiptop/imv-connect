SELECT cron.schedule(
  'almacen-bloqueos-compra-diario',
  '15 3 * * *',
  $$ SELECT public.recalcular_bloqueos_compra(); $$
);