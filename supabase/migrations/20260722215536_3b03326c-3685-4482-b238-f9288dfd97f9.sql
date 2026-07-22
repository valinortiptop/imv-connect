CREATE OR REPLACE FUNCTION public.fn_bloquear_por_credito()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_limite numeric(14,2);
  v_saldo_vencido numeric(14,2);
  v_saldo_total numeric(14,2);
  v_hoy date := current_date;
begin
  select coalesce(limite_credito, 0) into v_limite
    from public.cliente_credito where cliente_id = NEW.cliente_id;

  select coalesce(sum(case when fecha_vencimiento < v_hoy then coalesce(saldo, total - coalesce(pagado,0)) else 0 end), 0),
         coalesce(sum(coalesce(saldo, total - coalesce(pagado,0))), 0)
    into v_saldo_vencido, v_saldo_total
    from public.facturas
    where cliente_id = NEW.cliente_id
      and coalesce(estado::text, '') not in ('cancelada','pagada');

  if v_saldo_vencido > 0 then
    insert into public.cliente_credito (cliente_id, bloqueado, motivo_bloqueo, updated_at)
    values (NEW.cliente_id, true, 'Bloqueo automático: saldo vencido detectado', now())
    on conflict (cliente_id) do update
      set bloqueado = true,
          motivo_bloqueo = coalesce(public.cliente_credito.motivo_bloqueo, 'Bloqueo automático: saldo vencido detectado'),
          updated_at = now();
  elsif v_limite > 0 and v_saldo_total > v_limite then
    insert into public.cliente_credito (cliente_id, bloqueado, motivo_bloqueo, updated_at)
    values (NEW.cliente_id, true, 'Bloqueo automático: excede límite de crédito', now())
    on conflict (cliente_id) do update
      set bloqueado = true,
          motivo_bloqueo = coalesce(public.cliente_credito.motivo_bloqueo, 'Bloqueo automático: excede límite de crédito'),
          updated_at = now();
  end if;
  return NEW;
end $function$;