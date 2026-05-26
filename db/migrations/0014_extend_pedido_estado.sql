-- =====================================================================
-- 0014 — Extender enum pedido_estado con valores del fork (orders module)
-- Add values needed by the ported Orders UI:
-- 'Pendiente portal', 'Pendiente aprobación', 'Reservado', 'Nuevo',
-- 'Confirmado', 'En preparacion', 'En ruta', 'Entregado', 'Cancelado'.
-- The original lowercase values stay (pendiente, confirmado, enviado, etc).
-- Idempotent.
-- =====================================================================

do $$
declare
  v text;
  new_values text[] := array[
    'Pendiente portal',
    'Pendiente aprobación',
    'Reservado',
    'Nuevo',
    'Confirmado',
    'En preparacion',
    'En ruta',
    'Entregado',
    'Cancelado'
  ];
begin
  foreach v in array new_values loop
    if not exists (
      select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'pedido_estado' and e.enumlabel = v
    ) then
      execute format('alter type public.pedido_estado add value %L', v);
    end if;
  end loop;
end $$;
