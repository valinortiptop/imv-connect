-- Fase 2 Crédito y Cobranza

-- 1. Extender cliente_credito
alter table public.cliente_credito
  add column if not exists pronto_pago_dias int,
  add column if not exists pronto_pago_porcentaje numeric(5,2),
  add column if not exists email_cobranza text,
  add column if not exists freq_edo_cuenta text not null default 'nunca',
  add column if not exists enviar_recordatorios boolean not null default true,
  add column if not exists ultimo_edo_cuenta_at timestamptz,
  add column if not exists ultimo_score int,
  add column if not exists ultimo_score_at timestamptz;

do $$ begin
  alter table public.cliente_credito
    add constraint cliente_credito_freq_chk
    check (freq_edo_cuenta in ('nunca','semanal','quincenal','mensual'));
exception when duplicate_object then null; end $$;

-- 2. Bitácora de comunicaciones enviadas
create table if not exists public.cobranza_comunicaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  factura_id uuid references public.facturas(id) on delete set null,
  canal text not null default 'email',
  tipo text not null,
  destinatario text,
  asunto text,
  cuerpo_preview text,
  estado text not null default 'enviado',
  provider_id text,
  error text,
  metadata jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cobranza_comunicaciones_cliente_idx
  on public.cobranza_comunicaciones(cliente_id, created_at desc);
create index if not exists cobranza_comunicaciones_factura_idx
  on public.cobranza_comunicaciones(factura_id) where factura_id is not null;

grant select, insert, update, delete on public.cobranza_comunicaciones to authenticated;
grant all on public.cobranza_comunicaciones to service_role;
alter table public.cobranza_comunicaciones enable row level security;
drop policy if exists "auth_rw_cobranza_comunicaciones" on public.cobranza_comunicaciones;
create policy "auth_rw_cobranza_comunicaciones" on public.cobranza_comunicaciones
  for all to authenticated using (true) with check (true);

-- 3. Snapshots de riesgo IA
create table if not exists public.cliente_riesgo_snapshots (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  score int not null,
  nivel public.cliente_riesgo_nivel not null,
  factores jsonb,
  recomendaciones text,
  modelo text,
  saldo_total numeric(14,2),
  saldo_vencido numeric(14,2),
  utilizacion_pct numeric(6,2),
  dias_pago_prom numeric(6,2),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists cliente_riesgo_snapshots_cliente_idx
  on public.cliente_riesgo_snapshots(cliente_id, created_at desc);

grant select, insert, update, delete on public.cliente_riesgo_snapshots to authenticated;
grant all on public.cliente_riesgo_snapshots to service_role;
alter table public.cliente_riesgo_snapshots enable row level security;
drop policy if exists "auth_rw_cliente_riesgo_snapshots" on public.cliente_riesgo_snapshots;
create policy "auth_rw_cliente_riesgo_snapshots" on public.cliente_riesgo_snapshots
  for all to authenticated using (true) with check (true);

-- 4. Trigger de bloqueo automático al emitir factura
create or replace function public.fn_bloquear_por_credito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      and coalesce(estado, '') not in ('cancelada','pagada');

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
end $$;

drop trigger if exists trg_bloquear_por_credito on public.facturas;
create trigger trg_bloquear_por_credito
  after insert on public.facturas
  for each row execute function public.fn_bloquear_por_credito();
