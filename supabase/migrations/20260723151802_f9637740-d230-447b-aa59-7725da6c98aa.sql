CREATE OR REPLACE FUNCTION public.orders_dashboard_stats(
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_client_ids uuid[] DEFAULT NULL::uuid[],
  p_status text DEFAULT NULL::text,
  p_client_type text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  status_json jsonb;
  activos_count int := 0;
  activos_bultos numeric := 0;
  valor_transito numeric := 0;
  entregados_count int := 0;
  tiempo_promedio numeric := 0;
begin
  with base as (
    select
      os.*,
      lower(coalesce(os.status, '')) as status_lc
    from public.order_summary os
    where (p_from is null or os.order_date >= p_from)
      and (p_to is null or os.order_date <= p_to)
      and (p_client_ids is null or os.client_id = any(p_client_ids))
      and (
        p_status is null or p_status in ('all', 'todos')
        or lower(coalesce(os.status, '')) = lower(p_status)
      )
      and (
        p_client_type is null or p_client_type in ('all', 'todos')
        or (p_client_type = 'mayoreo' and (os.client_type = 'mayoreo' or os.client_type is null))
        or (p_client_type = 'menudeo' and os.client_type = 'menudeo')
      )
      and (
        p_search is null or p_search = ''
        or os.client_name ilike '%' || p_search || '%'
        or os.order_code ilike '%' || p_search || '%'
      )
      and lower(coalesce(os.status, '')) <> 'cancelado'
  )
  select
    coalesce(count(*) filter (where status_lc <> 'entregado'), 0)::int,
    coalesce(sum(coalesce(line_items,0)) filter (where status_lc <> 'entregado'), 0),
    coalesce(sum(coalesce(total_with_iva,0)) filter (where status_lc <> 'entregado'), 0),
    coalesce(count(*) filter (where status_lc = 'entregado'), 0)::int,
    coalesce(avg(case
      when status_lc = 'entregado' and order_date is not null and delivery_date is not null
      then greatest(0, (delivery_date - order_date))::numeric
    end), 0)
  into activos_count, activos_bultos, valor_transito, entregados_count, tiempo_promedio
  from base;

  with base as (
    select
      case lower(coalesce(os.status, 'Nuevo'))
        when 'entregado' then 'Entregado'
        when 'cancelado' then 'Cancelado'
        when 'en preparacion' then 'En preparacion'
        when 'en ruta' then 'En ruta'
        when 'confirmado' then 'Confirmado'
        when 'pendiente portal' then 'Pendiente portal'
        when 'pendiente aprobación' then 'Pendiente aprobación'
        when 'reservado' then 'Reservado'
        when 'nuevo' then 'Nuevo'
        else coalesce(os.status, 'Nuevo')
      end as status
    from public.order_summary os
    where (p_from is null or os.order_date >= p_from)
      and (p_to is null or os.order_date <= p_to)
      and (p_client_ids is null or os.client_id = any(p_client_ids))
      and (
        p_status is null or p_status in ('all', 'todos')
        or lower(coalesce(os.status, '')) = lower(p_status)
      )
      and (
        p_client_type is null or p_client_type in ('all', 'todos')
        or (p_client_type = 'mayoreo' and (os.client_type = 'mayoreo' or os.client_type is null))
        or (p_client_type = 'menudeo' and os.client_type = 'menudeo')
      )
      and (
        p_search is null or p_search = ''
        or os.client_name ilike '%' || p_search || '%'
        or os.order_code ilike '%' || p_search || '%'
      )
      and lower(coalesce(os.status, '')) <> 'cancelado'
  )
  select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
  into status_json
  from (select status, count(*)::int as cnt from base group by status) t;

  result := jsonb_build_object(
    'activos_count', activos_count,
    'activos_bultos', activos_bultos,
    'valor_transito', valor_transito,
    'entregados_count', entregados_count,
    'tiempo_promedio', tiempo_promedio,
    'status_counts', status_json
  );

  return result;
end;
$function$;