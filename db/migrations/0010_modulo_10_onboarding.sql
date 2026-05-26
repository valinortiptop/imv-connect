-- =====================================================================
-- IMV Portal — Módulo 10: Onboarding del cliente IMV
-- Checklist de datos/archivos/credenciales que el cliente debe entregar.
-- Idempotente.
-- =====================================================================

-- ---------- Datos de empresa (single-row) ----------
create table if not exists public.empresa_datos (
  id int primary key default 1,
  razon_social text,
  rfc text,
  regimen_fiscal text,
  cp_fiscal text,
  direccion_fiscal text,
  telefono text,
  email_contacto text,
  sitio_web text,
  representante_legal text,
  moneda_default text default 'MXN',
  iva_default numeric(5,2) default 16.00,
  -- Integraciones / credenciales (referencias, NO secretos)
  netsuite_account_id text,
  netsuite_consumer_key_ref text,   -- nombre del secret en Cloud
  netsuite_token_ref text,
  resend_from_email text,
  resend_api_key_ref text,
  twilio_account_sid text,
  twilio_from_number text,
  twilio_auth_token_ref text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint empresa_singleton check (id = 1)
);

insert into public.empresa_datos(id) values (1) on conflict do nothing;

-- ---------- Categorías y items del checklist ----------
do $$ begin
  create type public.onboarding_categoria as enum (
    'empresa','catalogos','precios','promociones','branding',
    'documentos_legales','integraciones','comunicaciones','otros'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.onboarding_estado as enum ('pendiente','en_proceso','entregado','no_aplica');
exception when duplicate_object then null; end $$;

create table if not exists public.onboarding_items (
  id uuid primary key default gen_random_uuid(),
  categoria public.onboarding_categoria not null,
  clave text not null unique,        -- e.g. 'logo_principal'
  titulo text not null,
  descripcion text,
  requerido boolean not null default true,
  requiere_archivo boolean not null default false,
  estado public.onboarding_estado not null default 'pendiente',
  notas text,                        -- comentarios de IMV o nuestros
  valor_texto text,                  -- para items que son sólo dato (RFC, etc.)
  orden int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index if not exists onboarding_items_cat_idx on public.onboarding_items(categoria, orden);

-- ---------- Archivos subidos por item ----------
create table if not exists public.onboarding_archivos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.onboarding_items(id) on delete cascade,
  storage_path text not null,        -- bucket 'onboarding'
  nombre_original text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id)
);

create index if not exists onboarding_arch_item_idx on public.onboarding_archivos(item_id);

-- ---------- Trigger updated_at ----------
create or replace function public.tg_onboarding_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists onboarding_items_touch on public.onboarding_items;
create trigger onboarding_items_touch before update on public.onboarding_items
  for each row execute function public.tg_onboarding_touch();

drop trigger if exists empresa_datos_touch on public.empresa_datos;
create trigger empresa_datos_touch before update on public.empresa_datos
  for each row execute function public.tg_onboarding_touch();

-- ---------- RLS ----------
alter table public.empresa_datos enable row level security;
alter table public.onboarding_items enable row level security;
alter table public.onboarding_archivos enable row level security;

drop policy if exists "emp_select_auth" on public.empresa_datos;
create policy "emp_select_auth" on public.empresa_datos
  for select to authenticated using (true);

drop policy if exists "emp_update_admin" on public.empresa_datos;
create policy "emp_update_admin" on public.empresa_datos
  for update to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

drop policy if exists "ob_items_select_auth" on public.onboarding_items;
create policy "ob_items_select_auth" on public.onboarding_items
  for select to authenticated using (true);

drop policy if exists "ob_items_write_admin" on public.onboarding_items;
create policy "ob_items_write_admin" on public.onboarding_items
  for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

drop policy if exists "ob_arch_select_auth" on public.onboarding_archivos;
create policy "ob_arch_select_auth" on public.onboarding_archivos
  for select to authenticated using (true);

drop policy if exists "ob_arch_write_auth" on public.onboarding_archivos;
create policy "ob_arch_write_auth" on public.onboarding_archivos
  for all to authenticated
  using (true) with check (true);

-- ---------- Storage bucket 'onboarding' (privado) ----------
insert into storage.buckets (id, name, public)
values ('onboarding','onboarding', false)
on conflict (id) do nothing;

drop policy if exists "ob_storage_read" on storage.objects;
create policy "ob_storage_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'onboarding');

drop policy if exists "ob_storage_write" on storage.objects;
create policy "ob_storage_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'onboarding');

drop policy if exists "ob_storage_delete_admin" on storage.objects;
create policy "ob_storage_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'onboarding' and public.has_role(auth.uid(),'admin'));

-- ---------- Seed del checklist ----------
insert into public.onboarding_items
  (categoria, clave, titulo, descripcion, requerido, requiere_archivo, orden) values
  -- Empresa
  ('empresa','razon_social','Razón social','Nombre legal completo de la empresa',true,false,10),
  ('empresa','rfc','RFC','RFC con homoclave',true,false,20),
  ('empresa','constancia_situacion_fiscal','Constancia de situación fiscal','PDF emitido por el SAT (vigente)',true,true,30),
  ('empresa','regimen_fiscal','Régimen fiscal','Clave SAT del régimen',true,false,40),
  ('empresa','direccion_fiscal','Dirección fiscal','Calle, núm, col, CP, ciudad, estado',true,false,50),
  ('empresa','representante_legal','Representante legal','Nombre y datos de contacto',true,false,60),
  ('empresa','contacto_operativo','Contacto operativo','Persona, email y teléfono para operación diaria',true,false,70),
  -- Documentos legales
  ('documentos_legales','acta_constitutiva','Acta constitutiva','PDF',false,true,10),
  ('documentos_legales','poder_representante','Poder del representante legal','PDF',false,true,20),
  ('documentos_legales','licencia_sanitaria','Licencia sanitaria','Aviso de funcionamiento COFEPRIS',true,true,30),
  ('documentos_legales','responsable_sanitario','Responsable sanitario','Nombre y cédula',true,false,40),
  -- Catálogos
  ('catalogos','catalogo_productos','Catálogo de productos','CSV/XLSX con SKU, descripción, laboratorio, presentación, registro sanitario, caducidad de registro, IVA',true,true,10),
  ('catalogos','catalogo_laboratorios','Catálogo de laboratorios/proveedores','CSV/XLSX',true,true,20),
  ('catalogos','catalogo_clientes','Catálogo de clientes','CSV/XLSX con RFC, dirección, condiciones de pago',true,true,30),
  ('catalogos','catalogo_representantes','Representantes de ventas','Lista con email, zona y comisión base',true,true,40),
  -- Precios
  ('precios','lista_precios_base','Lista de precios base','CSV/XLSX',true,true,10),
  ('precios','listas_especiales','Listas especiales (gobierno, hospital, mayoreo)','CSV/XLSX por lista',false,true,20),
  ('precios','precios_cliente','Precios negociados por cliente','CSV/XLSX',false,true,30),
  ('precios','condiciones_pago','Condiciones de pago por cliente','Días de crédito, descuentos por pronto pago',true,false,40),
  -- Promociones
  ('promociones','promos_vigentes','Promociones vigentes','Descripción, vigencia, productos aplicables',false,true,10),
  ('promociones','descuentos_volumen','Descuentos por volumen','Tabla de escalones',false,true,20),
  ('promociones','bonificaciones','Bonificaciones/regalos','Política de producto gratis',false,true,30),
  -- Branding
  ('branding','logo_principal','Logo principal','PNG/SVG fondo transparente',true,true,10),
  ('branding','logo_secundario','Variantes del logo','Monocromo, negativo',false,true,20),
  ('branding','paleta_colores','Paleta de colores','Códigos HEX',true,false,30),
  ('branding','tipografias','Tipografías oficiales','Nombres / archivos',false,true,40),
  ('branding','manual_marca','Manual de marca','PDF',false,true,50),
  ('branding','plantilla_factura','Plantilla de factura/PDF','Diseño deseado para facturas y remisiones',false,true,60),
  -- Integraciones
  ('integraciones','netsuite_account','NetSuite — Account ID','ID de la cuenta NetSuite',false,false,10),
  ('integraciones','netsuite_credentials','NetSuite — credenciales API','Consumer key/secret + token (subir como secreto, no archivo)',false,false,20),
  ('integraciones','netsuite_mapeo','NetSuite — mapeo de catálogos','Cómo mapean SKUs, clientes, cuentas',false,true,30),
  ('integraciones','resend_cuenta','Resend — cuenta creada','Crear cuenta en resend.com y verificar dominio',true,false,40),
  ('integraciones','resend_api_key','Resend — API key','Generar API key y entregar como secreto',true,false,50),
  ('integraciones','resend_dominio','Resend — dominio verificado','Registros DNS (SPF/DKIM) configurados',true,false,60),
  ('integraciones','twilio_cuenta','Twilio — cuenta creada','Crear cuenta en twilio.com',true,false,70),
  ('integraciones','twilio_credentials','Twilio — Account SID + Auth Token','Entregar como secreto',true,false,80),
  ('integraciones','twilio_whatsapp','Twilio — número WhatsApp Business','Número aprobado y plantillas',false,false,90),
  -- Comunicaciones
  ('comunicaciones','plantillas_email','Plantillas de email','Bienvenida, confirmación de pedido, factura, recordatorio de pago',false,true,10),
  ('comunicaciones','plantillas_whatsapp','Plantillas de WhatsApp','Textos aprobados',false,true,20),
  ('comunicaciones','firma_correo','Firma de correo','HTML/imagen',false,true,30),
  -- Otros
  ('otros','politica_devoluciones','Política de devoluciones','PDF o texto',false,true,10),
  ('otros','politica_credito','Política de crédito','PDF o texto',false,true,20),
  ('otros','horarios_operacion','Horarios de operación','Atención a clientes y entregas',false,false,30)
on conflict (clave) do nothing;
