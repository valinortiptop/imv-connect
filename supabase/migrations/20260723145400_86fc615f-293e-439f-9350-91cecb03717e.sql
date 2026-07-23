
create or replace function public.orders_dashboard_stats(
  p_from date default null,
  p_to date default null,
  p_client_ids uuid[] default null,
  p_status text default null,
  p_client_type text default null,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
    select *
    from public.order_summary os
    where (p_from is null or os.order_date >= p_from)
      and (p_to is null or os.order_date <= p_to)
      and (p_client_ids is null or os.client_id = any(p_client_ids))
      and (p_status is null or p_status = 'all' or os.status = p_status)
      and (
        p_client_type is null or p_client_type = 'all'
        or (p_client_type = 'mayoreo' and (os.client_type = 'mayoreo' or os.client_type is null))
        or (p_client_type = 'menudeo' and os.client_type = 'menudeo')
      )
      and (
        p_search is null or p_search = ''
        or os.client_name ilike '%' || p_search || '%'
        or os.order_code ilike '%' || p_search || '%'
      )
      and (os.status is null or os.status <> 'Cancelado')
  )
  select
    coalesce(sum(case when status <> 'Entregado' then 1 else 0 end), 0),
    coalesce(sum(case when status <> 'Entregado' then coalesce(line_items,0) else 0 end), 0),
    coalesce(sum(case when status <> 'Entregado' then coalesce(total_with_iva,0) else 0 end), 0),
    coalesce(sum(case when status = 'Entregado' then 1 else 0 end), 0),
    coalesce(avg(case
      when status = 'Entregado' and order_date is not null and delivery_date is not null
      then greatest(0, (delivery_date - order_date))::numeric
    end), 0)
  into activos_count, activos_bultos, valor_transito, entregados_count, tiempo_promedio
  from base;

  with base as (
    select coalesce(status, 'Nuevo') as status
    from public.order_summary os
    where (p_from is null or os.order_date >= p_from)
      and (p_to is null or os.order_date <= p_to)
      and (p_client_ids is null or os.client_id = any(p_client_ids))
      and (p_status is null or p_status = 'all' or os.status = p_status)
      and (
        p_client_type is null or p_client_type = 'all'
        or (p_client_type = 'mayoreo' and (os.client_type = 'mayoreo' or os.client_type is null))
        or (p_client_type = 'menudeo' and os.client_type = 'menudeo')
      )
      and (
        p_search is null or p_search = ''
        or os.client_name ilike '%' || p_search || '%'
        or os.order_code ilike '%' || p_search || '%'
      )
      and (os.status is null or os.status <> 'Cancelado')
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
$$;

grant execute on function public.orders_dashboard_stats(date, date, uuid[], text, text, text) to authenticated, anon, service_role;
