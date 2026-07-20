
-- =====================================================================
-- Módulo Crédito y Cobranza — Fase 1
-- =====================================================================

-- ---------- Enums ----------
do $$ begin
  create type public.cobranza_gestion_tipo as enum ('llamada','correo','whatsapp','sms','visita','otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.cobranza_gestion_resultado as enum ('contactado','no_contesta','buzon','promesa_pago','disputa','pago_realizado','sin_respuesta','otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.promesa_estado as enum ('pendiente','cumplida','incumplida','cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.autorizacion_tipo as enum ('desbloqueo','incremento_limite','excepcion_credito','ampliacion_plazo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.autorizacion_estado as enum ('solicitada','aprobada','rechazada','cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.cliente_riesgo_nivel as enum ('bajo','medio','alto','critico');
exception when duplicate_object then null; end $$;

-- ---------- Cliente Crédito ----------
create table if not exists public.cliente_credito (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  limite_credito numeric(14,2) not null default 0,
  dias_credito int not null default 30,
  condicion_pago text,
  bloqueado boolean not null default false,
  motivo_bloqueo text,
  riesgo_manual public.cliente_riesgo_nivel,
  gestor_id uuid references auth.users(id) on delete set null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

grant select, insert, update, delete on public.cliente_credito to authenticated;
grant all on public.cliente_credito to service_role;
alter table public.cliente_credito enable row level security;
drop policy if exists "auth_rw_cliente_credito" on public.cliente_credito;
create policy "auth_rw_cliente_credito" on public.cliente_credito
  for all to authenticated using (true) with check (true);

-- ---------- Gestiones de cobranza ----------
create table if not exists public.cobranza_gestiones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  factura_id uuid references public.facturas(id) on delete set null,
  tipo public.cobranza_gestion_tipo not null default 'llamada',
  resultado public.cobranza_gestion_resultado,
  monto_comprometido numeric(14,2),
  notas text,
  next_action_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cobranza_gestiones_cliente_idx on public.cobranza_gestiones(cliente_id, created_at desc);
create index if not exists cobranza_gestiones_next_idx on public.cobranza_gestiones(next_action_at) where next_action_at is not null;

grant select, insert, update, delete on public.cobranza_gestiones to authenticated;
grant all on public.cobranza_gestiones to service_role;
alter table public.cobranza_gestiones enable row level security;
drop policy if exists "auth_rw_cobranza_gestiones" on public.cobranza_gestiones;
create policy "auth_rw_cobranza_gestiones" on public.cobranza_gestiones
  for all to authenticated using (true) with check (true);

-- ---------- Promesas de pago ----------
create table if not exists public.cobranza_promesas_pago (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  factura_id uuid references public.facturas(id) on delete set null,
  gestion_id uuid references public.cobranza_gestiones(id) on delete set null,
  monto numeric(14,2) not null check (monto > 0),
  fecha_promesa date not null,
  estado public.promesa_estado not null default 'pendiente',
  cumplida_at timestamptz,
  monto_cumplido numeric(14,2) not null default 0,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists promesas_cliente_idx on public.cobranza_promesas_pago(cliente_id, fecha_promesa);
create index if not exists promesas_estado_idx on public.cobranza_promesas_pago(estado, fecha_promesa);

grant select, insert, update, delete on public.cobranza_promesas_pago to authenticated;
grant all on public.cobranza_promesas_pago to service_role;
alter table public.cobranza_promesas_pago enable row level security;
drop policy if exists "auth_rw_promesas" on public.cobranza_promesas_pago;
create policy "auth_rw_promesas" on public.cobranza_promesas_pago
  for all to authenticated using (true) with check (true);

-- ---------- Autorizaciones de crédito ----------
create table if not exists public.credito_autorizaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo public.autorizacion_tipo not null,
  estado public.autorizacion_estado not null default 'solicitada',
  monto numeric(14,2),
  dias int,
  motivo text not null,
  solicitado_por uuid references auth.users(id) on delete set null,
  solicitado_at timestamptz not null default now(),
  resuelto_por uuid references auth.users(id) on delete set null,
  resuelto_at timestamptz,
  respuesta text,
  created_at timestamptz not null default now()
);
create index if not exists autorizaciones_cliente_idx on public.credito_autorizaciones(cliente_id, solicitado_at desc);
create index if not exists autorizaciones_estado_idx on public.credito_autorizaciones(estado);

grant select, insert, update, delete on public.credito_autorizaciones to authenticated;
grant all on public.credito_autorizaciones to service_role;
alter table public.credito_autorizaciones enable row level security;
drop policy if exists "auth_rw_autorizaciones" on public.credito_autorizaciones;
create policy "auth_rw_autorizaciones" on public.credito_autorizaciones
  for all to authenticated using (true) with check (true);

-- ---------- Trigger updated_at para cliente_credito y promesas ----------
create or replace function public.set_updated_at_cobranza()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_cliente_credito_updated on public.cliente_credito;
create trigger trg_cliente_credito_updated before update on public.cliente_credito
  for each row execute function public.set_updated_at_cobranza();

drop trigger if exists trg_promesas_updated on public.cobranza_promesas_pago;
create trigger trg_promesas_updated before update on public.cobranza_promesas_pago
  for each row execute function public.set_updated_at_cobranza();

-- ---------- Vista: comportamiento y 360 crédito ----------
create or replace view public.v_cliente_credito_360 as
with saldos as (
  select
    f.cliente_id,
    coalesce(sum(f.total - f.pagado) filter (where f.estado in ('emitida','parcial')), 0) as saldo_total,
    coalesce(sum(f.total - f.pagado) filter (
      where f.estado in ('emitida','parcial') and f.fecha_vencimiento < current_date
    ), 0) as saldo_vencido,
    count(*) filter (where f.estado in ('emitida','parcial')) as facturas_abiertas,
    count(*) filter (where f.estado in ('emitida','parcial') and f.fecha_vencimiento < current_date) as facturas_vencidas
  from public.facturas f
  group by f.cliente_id
),
pagos_hist as (
  select
    f.cliente_id,
    avg(
      case when p.fecha is not null
        then (p.fecha - f.fecha_emision)::numeric
      end
    ) as dias_pago_prom
  from public.facturas f
  left join public.pagos p on p.factura_id = f.id
  where f.estado = 'pagada'
  group by f.cliente_id
),
ult_gestion as (
  select distinct on (cliente_id) cliente_id, created_at as ultima_gestion_at, tipo as ultima_gestion_tipo
  from public.cobranza_gestiones
  order by cliente_id, created_at desc
),
promesas_act as (
  select cliente_id,
         count(*) filter (where estado = 'pendiente') as promesas_pendientes,
         count(*) filter (where estado = 'incumplida') as promesas_incumplidas,
         count(*) filter (where estado = 'cumplida') as promesas_cumplidas
  from public.cobranza_promesas_pago
  group by cliente_id
)
select
  c.id as cliente_id,
  c.razon_social,
  c.nombre_comercial,
  c.representante_id,
  coalesce(cc.limite_credito, 0) as limite_credito,
  coalesce(cc.dias_credito, 30) as dias_credito,
  coalesce(cc.bloqueado, false) as bloqueado,
  cc.motivo_bloqueo,
  cc.riesgo_manual,
  cc.gestor_id,
  coalesce(s.saldo_total, 0) as saldo_total,
  coalesce(s.saldo_vencido, 0) as saldo_vencido,
  coalesce(s.facturas_abiertas, 0) as facturas_abiertas,
  coalesce(s.facturas_vencidas, 0) as facturas_vencidas,
  case when coalesce(cc.limite_credito, 0) > 0
       then round(coalesce(s.saldo_total, 0) / cc.limite_credito * 100, 2)
       else null end as utilizacion_pct,
  round(coalesce(ph.dias_pago_prom, 0)::numeric, 1) as dias_pago_prom,
  ug.ultima_gestion_at,
  ug.ultima_gestion_tipo,
  coalesce(pa.promesas_pendientes, 0) as promesas_pendientes,
  coalesce(pa.promesas_incumplidas, 0) as promesas_incumplidas,
  coalesce(pa.promesas_cumplidas, 0) as promesas_cumplidas,
  case
    when cc.riesgo_manual is not null then cc.riesgo_manual::text
    when coalesce(s.saldo_vencido, 0) = 0 and coalesce(pa.promesas_incumplidas, 0) = 0 then 'bajo'
    when coalesce(s.saldo_vencido, 0) > 0 and coalesce(s.facturas_vencidas, 0) <= 2 and coalesce(pa.promesas_incumplidas, 0) = 0 then 'medio'
    when coalesce(pa.promesas_incumplidas, 0) >= 2 or coalesce(s.facturas_vencidas, 0) > 5 then 'critico'
    else 'alto'
  end as riesgo_calculado
from public.clientes c
left join public.cliente_credito cc on cc.cliente_id = c.id
left join saldos s on s.cliente_id = c.id
left join pagos_hist ph on ph.cliente_id = c.id
left join ult_gestion ug on ug.cliente_id = c.id
left join promesas_act pa on pa.cliente_id = c.id;

grant select on public.v_cliente_credito_360 to authenticated;

-- ---------- Permission routes ----------
insert into public.permission_routes (route_key, route_path, group_label, sort_order) values
  ('navCreditoCobranza', '/admin/credito-cobranza', 'Cobranza', 400),
  ('navCreditoCartera', '/admin/credito-cobranza/cartera', 'Cobranza', 410),
  ('navCreditoGestiones', '/admin/credito-cobranza/gestiones', 'Cobranza', 420),
  ('navCreditoPromesas', '/admin/credito-cobranza/promesas', 'Cobranza', 430),
  ('navCreditoAutorizaciones', '/admin/credito-cobranza/autorizaciones', 'Cobranza', 440)
on conflict (route_key) do nothing;
