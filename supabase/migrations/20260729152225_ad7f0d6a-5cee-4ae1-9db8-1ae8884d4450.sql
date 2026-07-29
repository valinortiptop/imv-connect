
DO $mig$
DECLARE
  layout text;
  logo text := 'https://app.imv.lat/__l5e/assets-v1/a1c9ed21-14da-4707-9632-705242990ce4/imv-logo-full-white.png';
  r record;
  html text;
  cta text;
BEGIN
  layout :=
'<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fb">'
||'<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f6fb;padding:24px 12px"><tr><td align="center">'
||'<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">'
||'<tr><td style="background:#0b1f5c;padding:18px 24px"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>'
||'<td align="left"><img src="__LOGO__" alt="IMV" width="110" style="display:block;border:0;width:110px;height:auto"></td>'
||'<td align="right" style="color:#7dd3d8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">__CATEGORY__</td>'
||'</tr></table></td></tr>'
||'<tr><td style="padding:28px 24px 4px"><h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0b1f5c">__TITLE__</h1>'
||'<div style="font-size:14px;line-height:1.6;color:#374151">__BODY__</div></td></tr>'
||'<tr><td style="padding:18px 24px 28px">__CTA__</td></tr>'
||'<tr><td style="background:#f4f6fb;border-top:1px solid #e5e7eb;padding:18px 24px;color:#6b7280;font-size:11px;line-height:1.7">'
||'<strong style="color:#0b1f5c">IMV — Insumos Médicos</strong><br>'
||'Este es un correo automático de la plataforma IMV. Puedes ajustar qué avisos recibes en Configuración → Notificaciones.<br>'
||'<a href="https://app.imv.lat" style="color:#0b1f5c;text-decoration:none">app.imv.lat</a>'
||'</td></tr></table></td></tr></table></body></html>';

  CREATE TEMP TABLE _tpl (
    key text, channel text, category text, name text, subject text,
    title text, body_inner text, cta_label text, body_text text, description text
  ) ON COMMIT DROP;

  INSERT INTO _tpl VALUES
  ('notificacion_generica','email','sistema','Aviso general','{{title}}','{{title}}',
   '<p style="margin:0 0 12px">{{description}}</p>','Abrir en la plataforma',
   '{{title}} — {{description}} {{link}}','Plantilla base usada por el centro de notificaciones cuando no hay una específica.'),

  ('usuario_bienvenida','email','sistema','Bienvenida de usuario','Bienvenido a IMV, {{nombre}}','Bienvenido a IMV, {{nombre}}',
   '<p style="margin:0 0 12px">Tu cuenta ya está activa. Tu rol asignado es <strong>{{rol}}</strong>.</p><p style="margin:0">Desde la plataforma podrás consultar la información de tu área y recibir avisos automáticos.</p>','Entrar a la plataforma',
   'Bienvenido a IMV, {{nombre}}. Rol: {{rol}}. {{link}}','Correo de alta de usuario.'),

  ('usuario_rol_actualizado','email','sistema','Cambio de rol o permisos','Tu acceso en IMV fue actualizado','Tu acceso fue actualizado',
   '<p style="margin:0 0 12px">Hola {{nombre}}, tu rol en la plataforma cambió de <strong>{{rol_anterior}}</strong> a <strong>{{rol_nuevo}}</strong>.</p>','Ver mi cuenta',
   'Hola {{nombre}}: tu rol cambió de {{rol_anterior}} a {{rol_nuevo}}. {{link}}','Aviso al usuario cuando cambia su rol o permisos.'),

  ('cobranza_recordatorio','email','cobranza','Recordatorio de pago','Recordatorio de pago — {{cliente}}','Recordatorio de pago',
   '<p style="margin:0 0 12px">Hola {{cliente}}, tienes un saldo pendiente de <strong>{{monto}}</strong> correspondiente al documento {{folio}}.</p><p style="margin:0 0 12px">Fecha de vencimiento: <strong>{{fecha_vencimiento}}</strong> ({{dias_vencido}} días).</p>','Ver estado de cuenta',
   'Hola {{cliente}}: saldo pendiente de {{monto}} con vencimiento {{fecha_vencimiento}} ({{folio}}).','Recordatorio automático de facturas por vencer o vencidas.'),

  ('cobranza_estado_cuenta','email','cobranza','Estado de cuenta','Estado de cuenta — {{cliente}}','Estado de cuenta al {{fecha_corte}}',
   '<p style="margin:0 0 12px">Cliente: <strong>{{cliente}}</strong></p><p style="margin:0 0 12px">Saldo total: <strong>{{saldo_total}}</strong> · Vencido: <strong>{{saldo_vencido}}</strong></p>{{tabla_documentos}}','Ver detalle en la plataforma',
   'Estado de cuenta de {{cliente}} al {{fecha_corte}}. Saldo {{saldo_total}}, vencido {{saldo_vencido}}.','Envío de estado de cuenta al cliente.'),

  ('cobranza_promesa_pago','email','cobranza','Confirmación de promesa de pago','Promesa de pago registrada — {{cliente}}','Promesa de pago registrada',
   '<p style="margin:0 0 12px">Se registró una promesa de pago de <strong>{{monto}}</strong> para el <strong>{{fecha_promesa}}</strong>.</p><p style="margin:0">{{notas}}</p>','Ver promesa',
   'Promesa de pago de {{cliente}}: {{monto}} para el {{fecha_promesa}}.','Se envía al registrar una promesa de pago.'),

  ('credito_autorizacion_solicitud','email','cobranza','Solicitud de autorización de crédito','Nueva solicitud de autorización — {{cliente}}','Nueva solicitud de autorización',
   '<p style="margin:0 0 12px">{{solicitante}} solicitó una autorización de tipo <strong>{{tipo}}</strong> para <strong>{{cliente}}</strong> por <strong>{{monto}}</strong>.</p><p style="margin:0">Motivo: {{motivo}}</p>','Revisar solicitud',
   'Nueva solicitud de autorización ({{tipo}}) para {{cliente}} por {{monto}}.','Aviso a administración/cobranza cuando se solicita una autorización.'),

  ('credito_autorizacion_resuelta','email','cobranza','Resolución de autorización de crédito','Autorización {{resultado}} — {{cliente}}','Autorización {{resultado}}',
   '<p style="margin:0 0 12px">Tu solicitud de <strong>{{tipo}}</strong> para <strong>{{cliente}}</strong> fue <strong>{{resultado}}</strong>.</p><p style="margin:0">{{respuesta}}</p>','Ver detalle',
   'Tu solicitud de {{tipo}} para {{cliente}} fue {{resultado}}. {{respuesta}}','Aviso al solicitante cuando se aprueba o rechaza.'),

  ('cliente_bloqueado_credito','email','cobranza','Cliente bloqueado por crédito','Cliente bloqueado — {{cliente}}','Cliente bloqueado por crédito',
   '<p style="margin:0 0 12px">El cliente <strong>{{cliente}}</strong> fue bloqueado automáticamente.</p><p style="margin:0 0 12px">Motivo: {{motivo}} · Saldo vencido: <strong>{{saldo_vencido}}</strong></p>','Ver expediente del cliente',
   'Cliente {{cliente}} bloqueado por crédito. Motivo: {{motivo}}.','Aviso a cobranza y al representante cuando un cliente se bloquea.'),

  ('pago_registrado','email','cobranza','Pago registrado','Pago registrado — {{cliente}}','Pago registrado',
   '<p style="margin:0 0 12px">Se aplicó un pago de <strong>{{monto}}</strong> del cliente <strong>{{cliente}}</strong> el {{fecha}}.</p><p style="margin:0">Documentos afectados: {{documentos}}</p>','Ver pago',
   'Pago de {{monto}} registrado para {{cliente}} el {{fecha}}.','Aviso a cobranza cuando se aplica un pago.'),

  ('complemento_pago_emitido','email','contabilidad','Complemento de pago emitido','Complemento de pago {{folio}} — {{cliente}}','Complemento de pago emitido',
   '<p style="margin:0 0 12px">Se timbró el complemento de pago <strong>{{folio}}</strong> por <strong>{{monto}}</strong> para {{cliente}}.</p><p style="margin:0">UUID: {{uuid}}</p>','Ver complemento',
   'Complemento de pago {{folio}} por {{monto}} emitido para {{cliente}}.','Aviso al timbrar un REP.'),

  ('factura_emitida','email','contabilidad','Factura emitida','Factura {{folio}} — {{cliente}}','Factura {{folio}} emitida',
   '<p style="margin:0 0 12px">Se emitió la factura <strong>{{folio}}</strong> por <strong>{{total}}</strong> el {{fecha}}.</p><p style="margin:0">UUID fiscal: {{uuid}}</p>','Descargar factura',
   'Factura {{folio}} por {{total}} emitida el {{fecha}}.','Envío de CFDI al cliente.'),

  ('factura_cancelada','email','contabilidad','Factura cancelada','Factura {{folio}} cancelada','Factura cancelada',
   '<p style="margin:0 0 12px">La factura <strong>{{folio}}</strong> de {{cliente}} fue cancelada ante el SAT.</p><p style="margin:0">Motivo: {{motivo}}</p>','Ver factura',
   'Factura {{folio}} de {{cliente}} cancelada. Motivo: {{motivo}}.','Aviso al cancelar un CFDI.'),

  ('pedido_creado','email','ventas','Pedido creado','Nuevo pedido {{folio}}','Nuevo pedido registrado',
   '<p style="margin:0 0 12px">Se registró el pedido <strong>{{folio}}</strong> de <strong>{{cliente}}</strong> por <strong>{{total}}</strong>.</p><p style="margin:0">Registrado por: {{origen}}</p>','Ver pedido',
   'Nuevo pedido {{folio}} de {{cliente}} por {{total}}.','Aviso a ventas cuando entra un pedido nuevo.'),

  ('pedido_confirmado','email','ventas','Pedido confirmado','Pedido {{folio}} confirmado','Pedido confirmado',
   '<p style="margin:0 0 12px">Hola {{cliente}}, tu pedido <strong>{{folio}}</strong> por <strong>{{total}}</strong> quedó confirmado.</p><p style="margin:0 0 12px">Entrega estimada: <strong>{{fecha_entrega}}</strong></p>{{tabla_items}}','Ver pedido',
   'Pedido {{folio}} confirmado por {{total}}. Entrega estimada {{fecha_entrega}}.','Confirmación de pedido al cliente.'),

  ('pedido_cancelado','email','ventas','Pedido cancelado','Pedido {{folio}} cancelado','Pedido cancelado',
   '<p style="margin:0 0 12px">El pedido <strong>{{folio}}</strong> de {{cliente}} fue cancelado.</p><p style="margin:0">Motivo: {{motivo}}</p>','Ver pedido',
   'Pedido {{folio}} de {{cliente}} cancelado. Motivo: {{motivo}}.','Aviso de cancelación de pedido.'),

  ('cotizacion_enviada','email','ventas','Cotización enviada','Cotización {{folio}} — {{cliente}}','Cotización lista',
   '<p style="margin:0 0 12px">Se generó la cotización <strong>{{folio}}</strong> para <strong>{{cliente}}</strong> por <strong>{{total}}</strong>.</p><p style="margin:0">Vigencia: {{vigencia}}</p>','Ver cotización',
   'Cotización {{folio}} para {{cliente}} por {{total}}.','Aviso al generar una cotización.'),

  ('pedido_en_ruta','email','logistica','Pedido en ruta','Tu pedido {{folio}} va en camino','Tu pedido va en camino',
   '<p style="margin:0 0 12px">Hola {{cliente}}, el pedido <strong>{{folio}}</strong> salió a ruta con {{repartidor}}.</p><p style="margin:0">Llegada estimada: <strong>{{eta}}</strong></p>','Seguir entrega',
   'Pedido {{folio}} en ruta. Llegada estimada {{eta}}.','Aviso de salida a ruta.'),

  ('pedido_entregado','email','logistica','Pedido entregado','Pedido {{folio}} entregado','Pedido entregado',
   '<p style="margin:0 0 12px">El pedido <strong>{{folio}}</strong> se entregó el {{fecha_entrega}}.</p><p style="margin:0">Recibió: <strong>{{recibio}}</strong></p>','Ver comprobante',
   'Pedido {{folio}} entregado el {{fecha_entrega}}. Recibió {{recibio}}.','Confirmación de entrega.'),

  ('oc_creada','email','compras','Orden de compra creada','Orden de compra {{folio}} — {{proveedor}}','Orden de compra creada',
   '<p style="margin:0 0 12px">Se generó la orden <strong>{{folio}}</strong> para <strong>{{proveedor}}</strong> por <strong>{{total}}</strong>.</p><p style="margin:0">Fecha estimada de recepción: {{fecha_estimada}}</p>','Ver orden de compra',
   'Orden de compra {{folio}} para {{proveedor}} por {{total}}.','Aviso a compras al emitir una OC.'),

  ('oc_recibida','email','compras','Orden de compra recibida','Recepción de OC {{folio}}','Orden de compra recibida',
   '<p style="margin:0 0 12px">Se registró la recepción de la orden <strong>{{folio}}</strong> de {{proveedor}}.</p><p style="margin:0">Estado: <strong>{{estado}}</strong> · Piezas recibidas: {{piezas}}</p>','Ver recepción',
   'Recepción de OC {{folio}} de {{proveedor}}: {{estado}}.','Aviso a compras y almacén al recibir una OC.'),

  ('compras_alerta','email','compras','Alerta de compra / faltante','Alerta de abasto — {{producto}}','Alerta de abasto',
   '<p style="margin:0 0 12px">Producto: <strong>{{producto}}</strong> ({{sku}})</p><p style="margin:0 0 12px">Existencia actual: <strong>{{existencia}}</strong> · Mínimo: <strong>{{minimo}}</strong></p><p style="margin:0">Motivo: {{motivo}}</p>','Ver alerta',
   'Alerta de abasto: {{producto}} ({{sku}}), existencia {{existencia}} vs mínimo {{minimo}}.','Aviso a compras por faltantes o mínimos.'),

  ('almacen_recepcion','email','almacen','Recepción registrada','Recepción {{folio}} registrada','Recepción registrada',
   '<p style="margin:0 0 12px">Se registró la recepción <strong>{{folio}}</strong> en {{almacen}}.</p><p style="margin:0">Proveedor: {{proveedor}} · Piezas: <strong>{{piezas}}</strong></p>','Ver recepción',
   'Recepción {{folio}} registrada en {{almacen}} ({{piezas}} piezas).','Aviso al equipo de almacén por una recepción.'),

  ('almacen_traspaso','email','almacen','Traspaso entre almacenes','Traspaso {{folio}} — {{origen}} → {{destino}}','Traspaso registrado',
   '<p style="margin:0 0 12px">Traspaso <strong>{{folio}}</strong> de <strong>{{origen}}</strong> a <strong>{{destino}}</strong>.</p><p style="margin:0">Piezas: {{piezas}}</p>','Ver traspaso',
   'Traspaso {{folio}}: {{origen}} → {{destino}} ({{piezas}} piezas).','Aviso al ejecutar un traspaso entre almacenes.'),

  ('almacen_stock_bajo','email','almacen','Stock por debajo del mínimo','Stock bajo — {{producto}}','Stock por debajo del mínimo',
   '<p style="margin:0 0 12px"><strong>{{producto}}</strong> ({{sku}}) tiene <strong>{{existencia}}</strong> piezas, por debajo del mínimo de {{minimo}}.</p>','Ver inventario',
   'Stock bajo: {{producto}} ({{sku}}) {{existencia}} vs mínimo {{minimo}}.','Aviso de existencias bajo mínimo.'),

  ('almacen_caducidad','email','almacen','Alerta de caducidad','Lotes por caducar — {{almacen}}','Lotes próximos a caducar',
   '<p style="margin:0 0 12px">En <strong>{{almacen}}</strong> hay <strong>{{piezas}}</strong> piezas próximas a caducar.</p>{{tabla_lotes}}','Ver reporte de caducidades',
   'Lotes por caducar en {{almacen}}: {{piezas}} piezas.','Alerta diaria de corta caducidad.'),

  ('devolucion_registrada','email','almacen','Devolución registrada','Devolución {{folio}} — {{cliente}}','Devolución registrada',
   '<p style="margin:0 0 12px">Se registró la devolución <strong>{{folio}}</strong> de <strong>{{cliente}}</strong> por <strong>{{total}}</strong>.</p><p style="margin:0">Motivo: {{motivo}}</p>','Ver devolución',
   'Devolución {{folio}} de {{cliente}} por {{total}}.','Aviso al registrar o aplicar una devolución.'),

  ('rep_ruta_asignada','email','rep','Ruta asignada al representante','Ruta del {{fecha}} asignada','Ruta del {{fecha}}',
   '<p style="margin:0 0 12px">Hola {{representante}}, tienes <strong>{{num_clientes}}</strong> visitas programadas.</p>{{tabla_paradas}}','Abrir mi ruta',
   'Ruta del {{fecha}}: {{num_clientes}} visitas.','Aviso de plan de ruta al representante.'),

  ('visita_registrada','email','rep','Visita registrada','Visita registrada — {{cliente}}','Visita registrada',
   '<p style="margin:0 0 12px">{{representante}} registró una visita en <strong>{{cliente}}</strong> el {{fecha}}.</p><p style="margin:0">Resultado: {{resultado}}</p>','Ver visita',
   '{{representante}} visitó a {{cliente}} el {{fecha}}. Resultado: {{resultado}}.','Aviso al supervisor cuando un rep hace check-in/out.'),

  ('tarea_asignada','email','sistema','Tarea asignada','Nueva tarea: {{titulo}}','Se te asignó una tarea',
   '<p style="margin:0 0 12px"><strong>{{titulo}}</strong></p><p style="margin:0 0 12px">{{descripcion}}</p><p style="margin:0">Tablero: {{tablero}} · Vence: {{vence}}</p>','Abrir tarea',
   'Nueva tarea asignada: {{titulo}} (vence {{vence}}).','Aviso al asignar una tarjeta del tablero de tareas.');

  FOR r IN SELECT * FROM _tpl LOOP
    cta := '<a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:13px;font-weight:bold">'||r.cta_label||'</a>';
    html := replace(replace(replace(replace(replace(layout,
      '__LOGO__', logo),
      '__CATEGORY__', upper(r.category)),
      '__TITLE__', r.title),
      '__BODY__', r.body_inner),
      '__CTA__', cta);

    INSERT INTO public.message_templates
      (key, channel, category, name, subject, body_html, body_text, variables, description, is_system, is_active)
    VALUES
      (r.key, r.channel::text, r.category, r.name, r.subject, html, r.body_text,
       (SELECT to_jsonb(COALESCE(array_agg(DISTINCT m[1]), '{}'::text[]))
          FROM regexp_matches(html||' '||COALESCE(r.subject,'')||' '||COALESCE(r.body_text,''), '\{\{\s*([\w.]+)\s*\}\}', 'g') AS m),
       r.description, true, true)
    ON CONFLICT (key, channel) DO UPDATE SET
      category = EXCLUDED.category,
      name = EXCLUDED.name,
      subject = EXCLUDED.subject,
      body_html = EXCLUDED.body_html,
      body_text = EXCLUDED.body_text,
      variables = EXCLUDED.variables,
      description = EXCLUDED.description,
      is_system = true,
      updated_at = now();
  END LOOP;
END
$mig$;

INSERT INTO public.message_templates (key, channel, category, name, subject, body_html, body_text, variables, description, is_system, is_active)
VALUES
 ('sms_pedido_entregado','sms','logistica','SMS pedido entregado',NULL,NULL,'IMV: tu pedido {{folio}} fue entregado el {{fecha_entrega}}.','["folio","fecha_entrega"]'::jsonb,'Aviso corto de entrega.',true,true),
 ('sms_tarea_asignada','sms','sistema','SMS tarea asignada',NULL,NULL,'IMV: se te asignó la tarea "{{titulo}}" (vence {{vence}}).','["titulo","vence"]'::jsonb,'Aviso corto de tarea asignada.',true,true)
ON CONFLICT (key, channel) DO UPDATE SET
  body_text = EXCLUDED.body_text, variables = EXCLUDED.variables, updated_at = now();
