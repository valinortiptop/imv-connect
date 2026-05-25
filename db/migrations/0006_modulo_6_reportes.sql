-- =====================================================================
-- IMV Portal — Módulo 6: Reportes y dashboard
-- Vistas agregadas para KPIs del panel admin. Idempotente.
-- =====================================================================

-- Ventas por mes (últimos 12 meses) basadas en facturas no canceladas
create or replace view public.v_ventas_por_mes as
select
  to_char(date_trunc('month', f.fecha_emision), 'YYYY-MM') as mes,
  date_trunc('month', f.fecha_emision)::date as mes_inicio,
  count(*)::int as facturas,
  coalesce(sum(f.subtotal), 0)::numeric(14,2) as subtotal,
  coalesce(sum(f.iva), 0)::numeric(14,2) as iva,
  coalesce(sum(f.total), 0)::numeric(14,2) as total,
  coalesce(sum(f.pagado), 0)::numeric(14,2) as pagado
from public.facturas f
where f.estado <> 'cancelada'
  and f.fecha_emision >= (date_trunc('month', now()) - interval '11 months')::date
group by 1, 2
order by 2;

-- Pedidos por mes (todos los estados excepto cancelado)
create or replace view public.v_pedidos_por_mes as
select
  to_char(date_trunc('month', p.created_at), 'YYYY-MM') as mes,
  date_trunc('month', p.created_at)::date as mes_inicio,
  count(*)::int as pedidos,
  coalesce(sum(p.subtotal), 0)::numeric(14,2) as subtotal
from public.pedidos p
where p.estado <> 'cancelado'
  and p.created_at >= (date_trunc('month', now()) - interval '11 months')
group by 1, 2
order by 2;

-- Top productos por unidades e ingreso (últimos 90 días)
create or replace view public.v_top_productos as
select
  pr.id as producto_id,
  pr.sku,
  pr.nombre,
  coalesce(sum(pi.cantidad), 0)::numeric(14,2) as unidades,
  coalesce(sum(pi.cantidad * pi.precio_unitario), 0)::numeric(14,2) as ingreso
from public.pedido_items pi
join public.pedidos p on p.id = pi.pedido_id
join public.productos pr on pr.id = pi.producto_id
where p.estado <> 'cancelado'
  and p.created_at >= now() - interval '90 days'
group by pr.id, pr.sku, pr.nombre
order by ingreso desc;

-- Top clientes por ventas (últimos 90 días)
create or replace view public.v_top_clientes as
select
  c.id as cliente_id,
  c.razon_social,
  c.nombre_comercial,
  count(distinct p.id)::int as pedidos,
  coalesce(sum(p.subtotal), 0)::numeric(14,2) as ventas
from public.pedidos p
join public.clientes c on c.id = p.cliente_id
where p.estado <> 'cancelado'
  and p.created_at >= now() - interval '90 days'
group by c.id, c.razon_social, c.nombre_comercial
order by ventas desc;

-- Comisiones por representante (acumulado y últimos 30 días)
create or replace view public.v_comisiones_representante as
select
  r.id as representante_id,
  r.nombre,
  coalesce(sum(p.comision_monto), 0)::numeric(14,2) as comisiones_total,
  coalesce(sum(p.comision_monto) filter (where p.created_at >= now() - interval '30 days'), 0)::numeric(14,2) as comisiones_30d,
  count(p.id)::int as pedidos_total
from public.representantes r
left join public.pedidos p
  on p.representante_id = r.id and p.estado <> 'cancelado'
group by r.id, r.nombre
order by comisiones_total desc;

-- Stock bajo: productos cuyo stock total <= punto de reorden (si está definido)
create or replace view public.v_stock_bajo as
select
  pr.id as producto_id,
  pr.sku,
  pr.nombre,
  coalesce(sum(s.cantidad), 0)::numeric(14,2) as stock_total,
  pr.stock_minimo
from public.productos pr
left join public.stock s on s.producto_id = pr.id
where pr.activo = true
group by pr.id, pr.sku, pr.nombre, pr.stock_minimo
having coalesce(sum(s.cantidad), 0) <= coalesce(pr.stock_minimo, 0)
order by stock_total asc;

-- KPI resumen general
create or replace view public.v_dashboard_resumen as
select
  (select count(*) from public.pedidos where estado not in ('cancelado','entregado')) as pedidos_abiertos,
  (select count(*) from public.facturas where estado in ('emitida','parcial')) as facturas_pendientes,
  (select coalesce(sum(saldo),0) from public.facturas where estado in ('emitida','parcial'))::numeric(14,2) as saldo_pendiente,
  (select coalesce(sum(total),0)
     from public.facturas
     where estado <> 'cancelada' and fecha_emision >= date_trunc('month', now())::date)::numeric(14,2) as ventas_mes,
  (select coalesce(sum(comision_monto),0)
     from public.pedidos
     where estado <> 'cancelado' and created_at >= date_trunc('month', now()))::numeric(14,2) as comisiones_mes,
  (select count(*) from public.v_stock_bajo) as productos_stock_bajo;

-- Permisos: lectura para usuarios autenticados
grant select on public.v_ventas_por_mes      to authenticated;
grant select on public.v_pedidos_por_mes     to authenticated;
grant select on public.v_top_productos       to authenticated;
grant select on public.v_top_clientes        to authenticated;
grant select on public.v_comisiones_representante to authenticated;
grant select on public.v_stock_bajo          to authenticated;
grant select on public.v_dashboard_resumen   to authenticated;
