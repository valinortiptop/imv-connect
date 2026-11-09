alter table public.onboarding_items
  add column if not exists area text,
  add column if not exists responsable_rol text,
  add column if not exists responsable_nombre text,
  add column if not exists fecha_compromiso date,
  add column if not exists plantilla_clave text,
  add column if not exists validado_por uuid,
  add column if not exists validado_at timestamptz;

create or replace function public.onboarding_items_validation_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.validado_at is distinct from old.validado_at or new.validado_por is distinct from old.validado_por) then
    if not public.has_any_role(auth.uid(), array['admin','contabilidad']::public.app_role[]) then
      raise exception 'Solo admin o contabilidad pueden validar documentos';
    end if;
  end if;
  return new;
end; $$;
create trigger onboarding_items_validation_guard_trg before update on public.onboarding_items
  for each row execute function public.onboarding_items_validation_guard();

-- Programa (una fila)
create table public.onboarding_programa (
  id integer primary key default 1 check (id = 1),
  fecha_corte date,
  fase text not null default 'preparacion' check (fase in ('preparacion','sesiones','cargas','paralelo','apagado')),
  decision_netsuite text not null default 'manual' check (decision_netsuite in ('manual','api_paralelo')),
  nota_decision text,
  apagado_aprobado_por uuid,
  apagado_aprobado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.onboarding_sesiones (
  id uuid primary key default gen_random_uuid(),
  orden integer not null,
  titulo text not null,
  participantes text,
  duracion text,
  objetivo text,
  fecha_hora timestamptz,
  estado text not null default 'por_agendar' check (estado in ('por_agendar','agendada','realizada')),
  acuerdos text,
  pendientes text,
  responsables text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.onboarding_tareas_dev (
  id uuid primary key default gen_random_uuid(),
  orden integer not null,
  titulo text not null,
  descripcion text,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_proceso','listo')),
  fecha_compromiso date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.onboarding_paralelo_semanas (
  id uuid primary key default gen_random_uuid(),
  semana_inicio date not null unique,
  ventas_app numeric(14,2), ventas_netsuite numeric(14,2),
  cartera_app numeric(14,2), cartera_netsuite numeric(14,2),
  inventario_app numeric(14,2), inventario_netsuite numeric(14,2),
  moneda text not null default 'MXN',
  comentario text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['onboarding_programa','onboarding_sesiones','onboarding_tareas_dev','onboarding_paralelo_semanas'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "Staff read" on public.%I for select to authenticated using (public.has_any_role(auth.uid(), array['admin','ventas','almacen','logistica','contabilidad','viewer','compras','facturacion','cobranza']::public.app_role[]))$p$, t);
    execute format($p$create policy "Admin insert" on public.%I for insert to authenticated with check (public.has_role(auth.uid(),'admin'))$p$, t);
    execute format($p$create policy "Admin update" on public.%I for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'))$p$, t);
    execute format($p$create policy "Admin delete" on public.%I for delete to authenticated using (public.has_role(auth.uid(),'admin'))$p$, t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

insert into public.onboarding_programa (id) values (1);

insert into public.onboarding_sesiones (orden,titulo,participantes,duracion,objetivo,responsables) values
(1,'Arranque y fecha de corte','Dirección, Maresi, Contador','1 h','Acordar fecha de corte, periodo paralelo y responsables','{direccion,maresi,contador,valinor}'),
(2,'Comercial: clientes y precios','Maresi','2 h','Validar cartera, listas de precios, crédito y representantes','{maresi,valinor}'),
(3,'Comercial: pedido a factura','Maresi, Facturación, Almacén','2 h','Recorrer pedido → remisión → factura → entrega → cobro','{maresi,almacen,valinor}'),
(4,'Comisiones y metas','Maresi','1 h','Confirmar reglas de cálculo','{maresi,valinor}'),
(5,'Cobranza y bancos','Cobranza, Tesorería','1.5 h','Cartera inicial, complementos de pago y conciliación','{cobranza,valinor}'),
(6,'Contabilidad','Contador','2 h','Catálogo, pólizas automáticas, balanza y contabilidad electrónica','{contador,valinor}'),
(7,'Almacén y compras','Almacén, Compras','1.5 h','Inventario inicial, recepciones y proveedores','{almacen,valinor}'),
(8,'Capacitación por rol','Todos los usuarios','1 h por área','Uso diario por área','{direccion,maresi,contador,cobranza,almacen,valinor}'),
(9,'Revisión de paralelo','Dirección, Contador, Maresi','1 h semanal','Comparar cifras y aprobar el apagado de NetSuite','{direccion,maresi,contador,valinor}');

insert into public.onboarding_tareas_dev (orden,titulo,descripcion) values
(1,'Asistente de carga inicial','Saldos de apertura: inventario, cartera, proveedores, bancos y contabilidad, con validación y bitácora'),
(2,'Cierre de mes contable','Bloqueo de periodos y reporte de cuadre contra NetSuite'),
(3,'Facturación productiva','Llave productiva de Facturapi, CSD, series/folios; pruebas de factura, nota de crédito, complemento de pago y cancelación'),
(4,'Ajustes de sesiones','Cambios acordados con Maresi y el contador'),
(5,'Revisión de permisos y seguridad','Permisos por rol y alertas heredadas'),
(6,'Desconectar NetSuite','Tras el apagado: desactivar sincronización y ruta de carga histórica');

insert into public.onboarding_items (categoria,clave,titulo,descripcion,requerido,requiere_archivo,estado,orden,area,responsable_rol,plantilla_clave) values
('catalogos','ns_clientes','Catálogo de clientes activos','RFC, régimen fiscal, uso CFDI, CP fiscal, dirección, representante, lista de precios, límite y días de crédito',true,true,'pendiente',101,'comercial','maresi','clientes'),
('precios','ns_precios','Listas de precios vigentes y precios especiales','Precio por SKU por lista y precios especiales por cliente',true,true,'pendiente',102,'comercial','maresi','precios'),
('catalogos','ns_productos','Catálogo de productos','SKU, clave SAT, unidad SAT, IVA, costo, precio, laboratorio',true,true,'pendiente',103,'comercial','maresi','productos'),
('otros','ns_pedidos_abiertos','Pedidos abiertos sin facturar','Listado al corte',true,true,'pendiente',104,'comercial','maresi',null),
('otros','ns_comisiones','Reglas de comisiones y metas','Por representante',true,true,'pendiente',105,'comercial','maresi',null),
('otros','ns_cartera','Antigüedad de saldos por factura','Folio, UUID, fecha, vencimiento y saldo por cliente',true,true,'pendiente',201,'finanzas','cobranza','cartera'),
('otros','ns_anticipos','Anticipos y notas de crédito pendientes','Pendientes de aplicar al corte',true,true,'pendiente',202,'finanzas','cobranza',null),
('otros','ns_bancos','Estados de cuenta bancarios del mes de corte','Con saldo por cuenta',true,true,'pendiente',203,'finanzas','cobranza',null),
('otros','ns_inventario','Inventario físico al corte','Por almacén, lote y caducidad',true,true,'pendiente',301,'almacen','almacen','inventario'),
('otros','ns_proveedores','Catálogo de proveedores','RFC y condiciones de pago',true,true,'pendiente',302,'almacen','almacen','proveedores'),
('otros','ns_cxp','Cuentas por pagar y OC abiertas','Por factura de proveedor',true,true,'pendiente',303,'almacen','almacen','cxp'),
('otros','ns_catalogo_cuentas','Catálogo de cuentas con código agrupador SAT','',true,true,'pendiente',401,'contabilidad','contador','catalogo_cuentas'),
('otros','ns_balanza','Balanza de comprobación al corte','',true,true,'pendiente',402,'contabilidad','contador','balanza'),
('otros','ns_impuestos','Saldos de IVA, ISR y retenciones pendientes','',true,true,'pendiente',403,'contabilidad','contador',null),
('documentos_legales','ns_csd','Certificado de Sello Digital (CSD)','.cer, .key y contraseña para facturar',true,true,'pendiente',501,'fiscal','direccion',null),
('otros','ns_folios','Series y folio inicial','Folio siguiente al último emitido en NetSuite',true,false,'pendiente',502,'fiscal','contador',null),
('documentos_legales','ns_csf','Constancia de situación fiscal de IMV','',true,true,'pendiente',503,'fiscal','direccion',null)
on conflict do nothing;

update public.onboarding_items set area = 'configuracion' where area is null;