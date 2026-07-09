
-- =====================================================================
-- 0025 — Módulo de Compras (extensión completa)
-- Idempotente
-- =====================================================================

-- ---------- Parámetros de stock por producto ----------
create table if not exists public.product_stock_params (
  producto_id uuid primary key references public.productos(id) on delete cascade,
  stock_min numeric(12,2) not null default 0,
  stock_max numeric(12,2),
  punto_reorden numeric(12,2),
  dias_cobertura_objetivo int not null default 30,
  dias_seguridad int not null default 7,
  lead_time_dias int not null default 14,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.product_stock_params to authenticated;
grant all on public.product_stock_params to service_role;
alter table public.product_stock_params enable row level security;
drop policy if exists "auth_rw_psp" on public.product_stock_params;
create policy "auth_rw_psp" on public.product_stock_params
  for all to authenticated using (true) with check (true);

-- ---------- Lotes de producto (control caducidad) ----------
create table if not exists public.product_batches (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  almacen_id uuid not null references public.almacenes(id) on delete restrict,
  lote text,
  caducidad date,
  cantidad numeric(12,2) not null default 0,
  costo_unitario numeric(12,2),
  oc_id uuid references public.ordenes_compra(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_batches_producto_idx on public.product_batches(producto_id, caducidad);
create index if not exists product_batches_caducidad_idx on public.product_batches(caducidad) where cantidad > 0;
grant select, insert, update, delete on public.product_batches to authenticated;
grant all on public.product_batches to service_role;
alter table public.product_batches enable row level security;
drop policy if exists "auth_rw_batches" on public.product_batches;
create policy "auth_rw_batches" on public.product_batches
  for all to authenticated using (true) with check (true);

-- ---------- Métricas de proveedor (snapshot mensual) ----------
create table if not exists public.supplier_metrics (
  id uuid primary key default gen_random_uuid(),
  laboratorio_id uuid not null references public.laboratorios(id) on delete cascade,
  periodo date not null, -- primer día del mes
  ocs int not null default 0,
  on_time_pct numeric(6,2) not null default 0,
  fill_rate_pct numeric(6,2) not null default 0,
  lead_time_prom_dias numeric(6,2) not null default 0,
  incidencias int not null default 0,
  updated_at timestamptz not null default now(),
  unique (laboratorio_id, periodo)
);
grant select, insert, update, delete on public.supplier_metrics to authenticated;
grant all on public.supplier_metrics to service_role;
alter table public.supplier_metrics enable row level security;
drop policy if exists "auth_rw_smetrics" on public.supplier_metrics;
create policy "auth_rw_smetrics" on public.supplier_metrics
  for all to authenticated using (true) with check (true);

-- ---------- Incidencias de proveedor ----------
create table if not exists public.supplier_incidents (
  id uuid primary key default gen_random_uuid(),
  laboratorio_id uuid not null references public.laboratorios(id) on delete cascade,
  oc_id uuid references public.ordenes_compra(id) on delete set null,
  tipo text not null, -- retraso, faltante, dano, calidad, otro
  motivo text,
  cantidad numeric(12,2),
  monto numeric(14,2),
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sup_inc_lab_idx on public.supplier_incidents(laboratorio_id, created_at desc);
grant select, insert, update, delete on public.supplier_incidents to authenticated;
grant all on public.supplier_incidents to service_role;
alter table public.supplier_incidents enable row level security;
drop policy if exists "auth_rw_sinc" on public.supplier_incidents;
create policy "auth_rw_sinc" on public.supplier_incidents
  for all to authenticated using (true) with check (true);

-- ---------- Motivos de faltante (catálogo) ----------
create table if not exists public.shortage_reasons (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  label text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.shortage_reasons to authenticated;
grant all on public.shortage_reasons to service_role;
alter table public.shortage_reasons enable row level security;
drop policy if exists "auth_rw_sreasons" on public.shortage_reasons;
create policy "auth_rw_sreasons" on public.shortage_reasons
  for all to authenticated using (true) with check (true);

insert into public.shortage_reasons (codigo, label) values
  ('prov_sin_stock', 'Proveedor sin stock'),
  ('orden_tardia', 'Orden colocada tarde'),
  ('caducidad', 'Producto caducado'),
  ('dano_transito', 'Dañado en tránsito'),
  ('error_captura', 'Error de captura'),
  ('demanda_inesperada', 'Demanda inesperada'),
  ('otro', 'Otro')
on conflict (codigo) do nothing;

-- ---------- Eventos de faltante ----------
create table if not exists public.shortage_events (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  pedido_id uuid references public.pedidos(id) on delete set null,
  motivo_id uuid references public.shortage_reasons(id) on delete set null,
  cantidad numeric(12,2),
  fecha date not null default current_date,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shortage_events_fecha_idx on public.shortage_events(fecha desc);
create index if not exists shortage_events_producto_idx on public.shortage_events(producto_id);
grant select, insert, update, delete on public.shortage_events to authenticated;
grant all on public.shortage_events to service_role;
alter table public.shortage_events enable row level security;
drop policy if exists "auth_rw_sevents" on public.shortage_events;
create policy "auth_rw_sevents" on public.shortage_events
  for all to authenticated using (true) with check (true);

-- ---------- Historial de costos ----------
create table if not exists public.cost_history (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  laboratorio_id uuid references public.laboratorios(id) on delete set null,
  costo_unitario numeric(12,2) not null,
  costo_anterior numeric(12,2),
  variacion_pct numeric(8,2),
  oc_id uuid references public.ordenes_compra(id) on delete set null,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists cost_history_producto_idx on public.cost_history(producto_id, fecha desc);
grant select, insert, update, delete on public.cost_history to authenticated;
grant all on public.cost_history to service_role;
alter table public.cost_history enable row level security;
drop policy if exists "auth_rw_costh" on public.cost_history;
create policy "auth_rw_costh" on public.cost_history
  for all to authenticated using (true) with check (true);

-- ---------- Alertas de compras (centro unificado) ----------
create table if not exists public.purchase_alerts (
  id uuid primary key default gen_random_uuid(),
  tipo text not null, -- ruptura, sobreinventario, caducidad, incremento_costo, prov_incumple, baja_rotacion, oc_vencida, promo_sin_stock
  severidad text not null default 'media', -- baja, media, alta, critica
  producto_id uuid references public.productos(id) on delete cascade,
  laboratorio_id uuid references public.laboratorios(id) on delete cascade,
  oc_id uuid references public.ordenes_compra(id) on delete cascade,
  titulo text not null,
  detalle text,
  payload jsonb,
  resuelto boolean not null default false,
  resuelto_por uuid references auth.users(id) on delete set null,
  resuelto_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists purchase_alerts_estado_idx on public.purchase_alerts(resuelto, severidad, created_at desc);
create index if not exists purchase_alerts_tipo_idx on public.purchase_alerts(tipo, resuelto);
grant select, insert, update, delete on public.purchase_alerts to authenticated;
grant all on public.purchase_alerts to service_role;
alter table public.purchase_alerts enable row level security;
drop policy if exists "auth_rw_palerts" on public.purchase_alerts;
create policy "auth_rw_palerts" on public.purchase_alerts
  for all to authenticated using (true) with check (true);

-- ---------- Configuración de compras ----------
create table if not exists public.purchase_config (
  clave text primary key,
  valor jsonb not null,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.purchase_config to authenticated;
grant all on public.purchase_config to service_role;
alter table public.purchase_config enable row level security;
drop policy if exists "auth_rw_pconfig" on public.purchase_config;
create policy "auth_rw_pconfig" on public.purchase_config
  for all to authenticated using (true) with check (true);

insert into public.purchase_config (clave, valor) values
  ('caducidad_dias_alerta', '{"verde": 180, "amarillo": 90, "rojo": 30}'::jsonb),
  ('costo_variacion_umbral_pct', '10'::jsonb),
  ('baja_rotacion_dias', '{"nivel1": 60, "nivel2": 90, "nivel3": 180}'::jsonb),
  ('cobertura_objetivo_dias_default', '30'::jsonb),
  ('lead_time_default_dias', '14'::jsonb)
on conflict (clave) do nothing;

-- =====================================================================
-- VISTAS
-- =====================================================================

-- ---------- Planeación de compras (consumo, cobertura, sugerido) ----------
create or replace view public.v_compras_planeacion as
with ventas as (
  select
    m.producto_id,
    sum(case when m.created_at >= now() - interval '30 days' then m.cantidad else 0 end)  as v_30d,
    sum(case when m.created_at >= now() - interval '60 days' then m.cantidad else 0 end)  as v_60d,
    sum(case when m.created_at >= now() - interval '90 days' then m.cantidad else 0 end)  as v_90d,
    sum(case when m.created_at >= now() - interval '365 days' then m.cantidad else 0 end) as v_365d
  from public.movimientos_inventario m
  where m.tipo = 'venta'
  group by m.producto_id
),
stock_agg as (
  select producto_id, coalesce(sum(cantidad),0) as stock_fisico
    from public.stock group by producto_id
),
pendiente_oc as (
  select oi.producto_id,
         coalesce(sum(oi.cantidad - oi.cantidad_recibida), 0) as en_camino
    from public.oc_items oi
    join public.ordenes_compra o on o.id = oi.oc_id
   where o.estado in ('enviada','parcial')
   group by oi.producto_id
)
select
  p.id as producto_id,
  p.sku, p.nombre,
  p.laboratorio_id, l.nombre as laboratorio,
  p.categoria,
  p.precio_lista, p.costo,
  p.promo,
  coalesce(sa.stock_fisico, 0) as stock_fisico,
  coalesce(p.stock_comprometido, 0) as stock_comprometido,
  coalesce(po.en_camino, 0) as en_camino,
  greatest(coalesce(sa.stock_fisico,0) - coalesce(p.stock_comprometido,0), 0) as stock_disponible,
  coalesce(v.v_30d, 0)  as ventas_30d,
  coalesce(v.v_60d, 0)  as ventas_60d,
  coalesce(v.v_90d, 0)  as ventas_90d,
  coalesce(v.v_365d, 0) as ventas_365d,
  round(coalesce(v.v_30d, 0) / 30.0, 3) as consumo_diario,
  case when coalesce(v.v_60d,0) > 0
       then round(((coalesce(v.v_30d,0) * 2.0) - coalesce(v.v_60d,0)) / nullif(coalesce(v.v_60d,0),0) * 100, 2)
       else null end as tendencia_pct,
  case when coalesce(v.v_30d,0) > 0
       then round((greatest(coalesce(sa.stock_fisico,0) - coalesce(p.stock_comprometido,0), 0)) / (v.v_30d / 30.0), 1)
       else null end as dias_cobertura,
  coalesce(psp.dias_cobertura_objetivo, 30) as dias_cobertura_objetivo,
  coalesce(psp.stock_min, p.stock_minimo, 0) as stock_min,
  coalesce(psp.punto_reorden, p.stock_minimo, 0) as punto_reorden,
  coalesce(psp.lead_time_dias, 14) as lead_time_dias,
  greatest(
    0,
    ceil(
      (coalesce(psp.dias_cobertura_objetivo, 30) + coalesce(psp.dias_seguridad, 7))
      * (coalesce(v.v_30d,0) / 30.0)
      - (greatest(coalesce(sa.stock_fisico,0) - coalesce(p.stock_comprometido,0), 0) + coalesce(po.en_camino,0))
    )
  )::numeric as cantidad_sugerida
from public.productos p
left join public.laboratorios l on l.id = p.laboratorio_id
left join stock_agg sa on sa.producto_id = p.id
left join pendiente_oc po on po.producto_id = p.id
left join ventas v on v.producto_id = p.id
left join public.product_stock_params psp on psp.producto_id = p.id
where p.activo = true;

grant select on public.v_compras_planeacion to authenticated;

-- ---------- KPIs de proveedor ----------
create or replace view public.v_supplier_kpis as
with oc_stats as (
  select
    o.laboratorio_id,
    count(*) filter (where o.estado in ('recibida','parcial')) as ocs_terminadas,
    count(*) filter (where o.estado = 'recibida' and o.fecha_recepcion is not null and o.fecha_esperada is not null and o.fecha_recepcion <= o.fecha_esperada) as ocs_on_time,
    avg(case when o.fecha_recepcion is not null then o.fecha_recepcion - o.fecha_emision end)::numeric as lead_time_prom
  from public.ordenes_compra o
  where o.created_at >= now() - interval '365 days'
  group by o.laboratorio_id
),
fill as (
  select o.laboratorio_id,
         coalesce(sum(oi.cantidad_recibida),0) as recibido,
         coalesce(sum(oi.cantidad),0) as pedido
    from public.ordenes_compra o
    join public.oc_items oi on oi.oc_id = o.id
   where o.estado in ('recibida','parcial')
     and o.created_at >= now() - interval '365 days'
   group by o.laboratorio_id
),
inc as (
  select laboratorio_id, count(*) as incidencias
    from public.supplier_incidents
   where created_at >= now() - interval '365 days'
   group by laboratorio_id
)
select
  l.id as laboratorio_id,
  l.nombre as laboratorio,
  coalesce(s.ocs_terminadas, 0) as ocs_12m,
  case when coalesce(s.ocs_terminadas,0) > 0
       then round((s.ocs_on_time::numeric / s.ocs_terminadas) * 100, 2)
       else 0 end as on_time_pct,
  case when coalesce(f.pedido,0) > 0
       then round((f.recibido / f.pedido) * 100, 2)
       else 0 end as fill_rate_pct,
  coalesce(round(s.lead_time_prom, 1), 0) as lead_time_prom_dias,
  coalesce(inc.incidencias, 0) as incidencias_12m
from public.laboratorios l
left join oc_stats s on s.laboratorio_id = l.id
left join fill f on f.laboratorio_id = l.id
left join inc on inc.laboratorio_id = l.id
where l.activo = true;

grant select on public.v_supplier_kpis to authenticated;

-- ---------- Caducidades ----------
create or replace view public.v_caducidades as
select
  b.id as batch_id,
  b.producto_id, p.sku, p.nombre,
  l.nombre as laboratorio,
  b.almacen_id, a.nombre as almacen,
  b.lote, b.caducidad, b.cantidad,
  coalesce(b.costo_unitario, p.costo, 0) as costo_unitario,
  (b.caducidad - current_date) as dias_restantes,
  round(b.cantidad * coalesce(b.costo_unitario, p.costo, 0), 2) as valor_economico,
  case
    when b.caducidad is null then 'sin_fecha'
    when (b.caducidad - current_date) <= 30 then 'rojo'
    when (b.caducidad - current_date) <= 90 then 'amarillo'
    else 'verde'
  end as semaforo
from public.product_batches b
join public.productos p on p.id = b.producto_id
left join public.laboratorios l on l.id = p.laboratorio_id
left join public.almacenes a on a.id = b.almacen_id
where b.cantidad > 0;

grant select on public.v_caducidades to authenticated;

-- ---------- Clientes recomendados para lotes por caducar ----------
create or replace view public.v_caducidades_clientes as
select
  pi.producto_id,
  ped.cliente_id,
  c.razon_social as cliente,
  c.nombre_comercial,
  count(distinct ped.id) as pedidos_count,
  max(ped.created_at) as ultima_compra,
  round(avg(pi.cantidad)::numeric, 2) as cantidad_prom,
  sum(pi.cantidad) as total_comprado,
  c.representante_id,
  r.nombre as representante
from public.pedido_items pi
join public.pedidos ped on ped.id = pi.pedido_id
join public.clientes c on c.id = ped.cliente_id
left join public.representantes r on r.id = c.representante_id
where ped.created_at >= now() - interval '365 days'
  and ped.estado in ('confirmado','enviado','entregado')
group by pi.producto_id, ped.cliente_id, c.razon_social, c.nombre_comercial, c.representante_id, r.nombre;

grant select on public.v_caducidades_clientes to authenticated;

-- ---------- Baja rotación ----------
create or replace view public.v_baja_rotacion as
with ult as (
  select producto_id, max(created_at) as ultima_venta
    from public.movimientos_inventario
   where tipo = 'venta'
   group by producto_id
),
stock_agg as (
  select producto_id, coalesce(sum(cantidad),0) as stock_fisico
    from public.stock group by producto_id
)
select
  p.id as producto_id, p.sku, p.nombre,
  l.nombre as laboratorio,
  coalesce(sa.stock_fisico, 0) as stock_fisico,
  coalesce(p.costo, 0) as costo,
  round(coalesce(sa.stock_fisico,0) * coalesce(p.costo,0), 2) as valor_inmovilizado,
  ult.ultima_venta,
  case
    when ult.ultima_venta is null then 999
    else extract(day from (now() - ult.ultima_venta))::int
  end as dias_sin_venta,
  case
    when ult.ultima_venta is null then 'sin_venta'
    when now() - ult.ultima_venta >= interval '180 days' then '180d'
    when now() - ult.ultima_venta >= interval '90 days' then '90d'
    when now() - ult.ultima_venta >= interval '60 days' then '60d'
    else 'activo'
  end as clasificacion
from public.productos p
left join public.laboratorios l on l.id = p.laboratorio_id
left join stock_agg sa on sa.producto_id = p.id
left join ult on ult.producto_id = p.id
where p.activo = true and coalesce(sa.stock_fisico,0) > 0;

grant select on public.v_baja_rotacion to authenticated;

-- =====================================================================
-- Trigger: registrar histórico de costos al recibir OC
-- =====================================================================
create or replace function public.oc_items_cost_history_trigger()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  v_prev numeric(12,2);
  v_lab uuid;
  v_var numeric(8,2);
begin
  -- solo cuando aumenta lo recibido y hay costo
  if new.cantidad_recibida > coalesce(old.cantidad_recibida, 0) and new.costo_unitario > 0 then
    select laboratorio_id into v_lab from public.ordenes_compra where id = new.oc_id;
    select costo_unitario into v_prev from public.cost_history
      where producto_id = new.producto_id order by fecha desc, created_at desc limit 1;
    if v_prev is null or v_prev = 0 then
      v_var := null;
    else
      v_var := round(((new.costo_unitario - v_prev) / v_prev) * 100, 2);
    end if;
    insert into public.cost_history (producto_id, laboratorio_id, costo_unitario, costo_anterior, variacion_pct, oc_id)
    values (new.producto_id, v_lab, new.costo_unitario, v_prev, v_var, new.oc_id);
  end if;
  return new;
end $$;

drop trigger if exists oc_items_cost_history on public.oc_items;
create trigger oc_items_cost_history
  after update on public.oc_items
  for each row execute function public.oc_items_cost_history_trigger();
