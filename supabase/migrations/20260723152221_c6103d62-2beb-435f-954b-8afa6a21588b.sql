CREATE OR REPLACE FUNCTION public.sales_dashboard_stats(
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_fuente text DEFAULT 'pedido'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  v_totals jsonb;
  v_pending jsonb;
  v_daily jsonb;
  v_by_client jsonb;
  v_by_product jsonb;
  v_by_brand jsonb;
  v_by_order jsonb;
begin
  with lines as (
    select
      v.id,
      v.fecha,
      v.client_id,
      coalesce(nullif(v.client_name, ''), 'Sin cliente') as client_name,
      v.product_id,
      coalesce(nullif(v.sku, ''), pr.sku, '') as sku,
      coalesce(nullif(v.description, ''), pr.nombre, '') as product_name,
      coalesce(nullif(pr.marca, ''), 'Sin marca') as brand,
      pr.imagen_url as image_url,
      coalesce(v.quantity, 0)::numeric as quantity,
      coalesce(v.revenue, 0)::numeric as revenue,
      coalesce(v.invoice_no, '') as invoice_no,
      (coalesce(v.revenue, 0)::numeric / 1.16) as venta_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * coalesce(v.quantity, 0)::numeric) as costo_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * (1 - coalesce(pr.bonificacion_pct, 0)::numeric) * coalesce(v.quantity, 0)::numeric) as costo_bonif_sin_iva
    from public.v_ventas_unified v
    left join public.productos pr on pr.id = v.product_id
    where (p_from is null or v.fecha >= p_from)
      and (p_to is null or v.fecha <= p_to)
      and (p_fuente is null or p_fuente in ('all', 'todos') or v.fuente = p_fuente)
  ), enriched as (
    select
      *,
      (venta_sin_iva - costo_sin_iva) as profit,
      (venta_sin_iva - costo_bonif_sin_iva) as profit_bonif
    from lines
  )
  select jsonb_build_object(
    'totalRevenue', coalesce(sum(revenue), 0),
    'totalCost', coalesce(sum(costo_sin_iva), 0),
    'totalVentaSinIva', coalesce(sum(venta_sin_iva), 0),
    'realizedProfit', coalesce(sum(profit), 0),
    'realizedProfitBonif', coalesce(sum(profit_bonif), 0),
    'impliedProfit', coalesce(sum(profit), 0),
    'impliedProfitBonif', coalesce(sum(profit_bonif), 0),
    'uniqueOrders', coalesce(count(distinct nullif(invoice_no, '')), 0),
    'avgTicket', case when count(distinct nullif(invoice_no, '')) > 0 then coalesce(sum(revenue), 0) / count(distinct nullif(invoice_no, '')) else 0 end,
    'totalUnits', coalesce(sum(quantity), 0),
    'marginPct', case when coalesce(sum(venta_sin_iva), 0) > 0 then (coalesce(sum(profit), 0) / sum(venta_sin_iva)) * 100 else 0 end,
    'marginBonifPct', case when coalesce(sum(venta_sin_iva), 0) > 0 then (coalesce(sum(profit_bonif), 0) / sum(venta_sin_iva)) * 100 else 0 end
  ) into v_totals
  from enriched;

  with pending as (
    select
      os.id,
      coalesce(os.total_with_iva, 0)::numeric as revenue,
      (coalesce(os.total_with_iva, 0)::numeric / 1.16) as profit_est
    from public.order_summary os
    where (p_from is null or os.order_date >= p_from)
      and (p_to is null or os.order_date <= p_to)
      and lower(coalesce(os.status, '')) not in ('entregado', 'cancelado')
  )
  select jsonb_build_object(
    'orders', coalesce(count(distinct id), 0),
    'revenue', coalesce(sum(revenue), 0),
    'profit', coalesce(sum(profit_est), 0)
  ) into v_pending
  from pending;

  with lines as (
    select
      v.fecha,
      coalesce(nullif(v.invoice_no, ''), v.id::text) as invoice_no,
      coalesce(v.revenue, 0)::numeric as revenue,
      (coalesce(v.revenue, 0)::numeric / 1.16) as venta_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * coalesce(v.quantity, 0)::numeric) as costo_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * (1 - coalesce(pr.bonificacion_pct, 0)::numeric) * coalesce(v.quantity, 0)::numeric) as costo_bonif_sin_iva
    from public.v_ventas_unified v
    left join public.productos pr on pr.id = v.product_id
    where (p_from is null or v.fecha >= p_from)
      and (p_to is null or v.fecha <= p_to)
      and (p_fuente is null or p_fuente in ('all', 'todos') or v.fuente = p_fuente)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', fecha,
    'revenue', revenue,
    'profit', profit,
    'profitBonif', profit_bonif,
    'orders', orders
  ) order by fecha), '[]'::jsonb)
  into v_daily
  from (
    select
      fecha,
      sum(revenue) as revenue,
      sum(venta_sin_iva - costo_sin_iva) as profit,
      sum(venta_sin_iva - costo_bonif_sin_iva) as profit_bonif,
      count(distinct invoice_no) as orders
    from lines
    group by fecha
  ) d;

  with lines as (
    select
      v.client_id,
      coalesce(nullif(v.client_name, ''), 'Sin cliente') as name,
      coalesce(nullif(v.invoice_no, ''), v.id::text) as invoice_no,
      coalesce(v.quantity, 0)::numeric as quantity,
      coalesce(v.revenue, 0)::numeric as revenue,
      (coalesce(v.revenue, 0)::numeric / 1.16) as venta_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * coalesce(v.quantity, 0)::numeric) as costo_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * (1 - coalesce(pr.bonificacion_pct, 0)::numeric) * coalesce(v.quantity, 0)::numeric) as costo_bonif_sin_iva
    from public.v_ventas_unified v
    left join public.productos pr on pr.id = v.product_id
    where (p_from is null or v.fecha >= p_from)
      and (p_to is null or v.fecha <= p_to)
      and (p_fuente is null or p_fuente in ('all', 'todos') or v.fuente = p_fuente)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'orders', orders,
    'revenue', revenue,
    'profit', profit,
    'profitBonif', profit_bonif,
    'marginPct', case when venta_sin_iva > 0 then (profit / venta_sin_iva) * 100 else 0 end,
    'marginBonifPct', case when venta_sin_iva > 0 then (profit_bonif / venta_sin_iva) * 100 else 0 end,
    'units', units
  ) order by revenue desc), '[]'::jsonb)
  into v_by_client
  from (
    select
      coalesce(client_id::text, name) as id,
      name,
      count(distinct invoice_no)::int as orders,
      sum(revenue) as revenue,
      sum(venta_sin_iva) as venta_sin_iva,
      sum(venta_sin_iva - costo_sin_iva) as profit,
      sum(venta_sin_iva - costo_bonif_sin_iva) as profit_bonif,
      sum(quantity) as units
    from lines
    group by coalesce(client_id::text, name), name
  ) c;

  with lines as (
    select
      v.product_id,
      coalesce(nullif(v.sku, ''), pr.sku, '') as clave,
      coalesce(nullif(v.description, ''), pr.nombre, '') as name,
      coalesce(nullif(pr.marca, ''), 'Sin marca') as brand,
      pr.imagen_url as image_url,
      coalesce(v.quantity, 0)::numeric as quantity,
      coalesce(v.revenue, 0)::numeric as revenue,
      (coalesce(v.revenue, 0)::numeric / 1.16) as venta_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * coalesce(v.quantity, 0)::numeric) as costo_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * (1 - coalesce(pr.bonificacion_pct, 0)::numeric) * coalesce(v.quantity, 0)::numeric) as costo_bonif_sin_iva
    from public.v_ventas_unified v
    left join public.productos pr on pr.id = v.product_id
    where (p_from is null or v.fecha >= p_from)
      and (p_to is null or v.fecha <= p_to)
      and (p_fuente is null or p_fuente in ('all', 'todos') or v.fuente = p_fuente)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'clave', clave,
    'name', name,
    'brand', brand,
    'image_url', image_url,
    'revenue', revenue,
    'profit', profit,
    'profitBonif', profit_bonif,
    'marginPct', case when venta_sin_iva > 0 then (profit / venta_sin_iva) * 100 else 0 end,
    'marginBonifPct', case when venta_sin_iva > 0 then (profit_bonif / venta_sin_iva) * 100 else 0 end,
    'units', units
  ) order by revenue desc), '[]'::jsonb)
  into v_by_product
  from (
    select
      coalesce(product_id::text, clave, name) as id,
      max(clave) as clave,
      max(name) as name,
      max(brand) as brand,
      max(image_url) as image_url,
      sum(revenue) as revenue,
      sum(venta_sin_iva) as venta_sin_iva,
      sum(venta_sin_iva - costo_sin_iva) as profit,
      sum(venta_sin_iva - costo_bonif_sin_iva) as profit_bonif,
      sum(quantity) as units
    from lines
    group by coalesce(product_id::text, clave, name)
  ) p;

  with lines as (
    select
      coalesce(nullif(pr.marca, ''), 'Sin marca') as brand,
      v.product_id,
      coalesce(v.quantity, 0)::numeric as quantity,
      coalesce(v.revenue, 0)::numeric as revenue,
      (coalesce(v.revenue, 0)::numeric / 1.16) as venta_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * coalesce(v.quantity, 0)::numeric) as costo_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * (1 - coalesce(pr.bonificacion_pct, 0)::numeric) * coalesce(v.quantity, 0)::numeric) as costo_bonif_sin_iva
    from public.v_ventas_unified v
    left join public.productos pr on pr.id = v.product_id
    where (p_from is null or v.fecha >= p_from)
      and (p_to is null or v.fecha <= p_to)
      and (p_fuente is null or p_fuente in ('all', 'todos') or v.fuente = p_fuente)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', brand,
    'revenue', revenue,
    'profit', profit,
    'profitBonif', profit_bonif,
    'marginPct', case when venta_sin_iva > 0 then (profit / venta_sin_iva) * 100 else 0 end,
    'marginBonifPct', case when venta_sin_iva > 0 then (profit_bonif / venta_sin_iva) * 100 else 0 end,
    'units', units,
    'skus', skus
  ) order by revenue desc), '[]'::jsonb)
  into v_by_brand
  from (
    select
      brand,
      sum(revenue) as revenue,
      sum(venta_sin_iva) as venta_sin_iva,
      sum(venta_sin_iva - costo_sin_iva) as profit,
      sum(venta_sin_iva - costo_bonif_sin_iva) as profit_bonif,
      sum(quantity) as units,
      count(distinct product_id)::int as skus
    from lines
    group by brand
  ) b;

  with lines as (
    select
      coalesce(nullif(v.invoice_no, ''), v.id::text) as invoice_no,
      max(v.fecha) as fecha,
      max(coalesce(nullif(v.client_name, ''), 'Sin cliente')) as client_name,
      coalesce(v.quantity, 0)::numeric as quantity,
      coalesce(v.revenue, 0)::numeric as revenue,
      (coalesce(v.revenue, 0)::numeric / 1.16) as venta_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * coalesce(v.quantity, 0)::numeric) as costo_sin_iva,
      (coalesce(pr.costo_siva, pr.costo, 0)::numeric * (1 - coalesce(pr.bonificacion_pct, 0)::numeric) * coalesce(v.quantity, 0)::numeric) as costo_bonif_sin_iva
    from public.v_ventas_unified v
    left join public.productos pr on pr.id = v.product_id
    where (p_from is null or v.fecha >= p_from)
      and (p_to is null or v.fecha <= p_to)
      and (p_fuente is null or p_fuente in ('all', 'todos') or v.fuente = p_fuente)
    group by coalesce(nullif(v.invoice_no, ''), v.id::text), v.id, v.quantity, v.revenue, pr.costo_siva, pr.costo, pr.bonificacion_pct
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', invoice_no,
    'code', invoice_no,
    'date', fecha,
    'clientName', client_name,
    'revenue', revenue,
    'profit', profit,
    'profitBonif', profit_bonif,
    'marginPct', case when venta_sin_iva > 0 then (profit / venta_sin_iva) * 100 else 0 end,
    'marginBonifPct', case when venta_sin_iva > 0 then (profit_bonif / venta_sin_iva) * 100 else 0 end,
    'units', units,
    'items', items
  ) order by fecha desc, invoice_no desc), '[]'::jsonb)
  into v_by_order
  from (
    select
      invoice_no,
      max(fecha) as fecha,
      max(client_name) as client_name,
      sum(revenue) as revenue,
      sum(venta_sin_iva) as venta_sin_iva,
      sum(venta_sin_iva - costo_sin_iva) as profit,
      sum(venta_sin_iva - costo_bonif_sin_iva) as profit_bonif,
      sum(quantity) as units,
      count(*)::int as items
    from lines
    group by invoice_no
  ) o;

  result := jsonb_build_object(
    'kpis', coalesce(v_totals, '{}'::jsonb),
    'pendingKpis', coalesce(v_pending, '{}'::jsonb),
    'dailyTrend', coalesce(v_daily, '[]'::jsonb),
    'byClient', coalesce(v_by_client, '[]'::jsonb),
    'byProduct', coalesce(v_by_product, '[]'::jsonb),
    'byBrand', coalesce(v_by_brand, '[]'::jsonb),
    'byOrder', coalesce(v_by_order, '[]'::jsonb)
  );

  return result;
end;
$function$;