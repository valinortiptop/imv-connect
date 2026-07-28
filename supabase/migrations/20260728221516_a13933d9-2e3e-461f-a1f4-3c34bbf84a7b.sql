CREATE TABLE public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  category TEXT NOT NULL DEFAULT 'sistema',
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_templates_channel_chk CHECK (channel IN ('email','sms','whatsapp','in_app')),
  CONSTRAINT message_templates_key_channel_uniq UNIQUE (key, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read templates"
  ON public.message_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage templates insert"
  ON public.message_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage templates update"
  ON public.message_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage templates delete"
  ON public.message_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND is_system = false);

CREATE TRIGGER trg_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_message_templates_channel ON public.message_templates (channel, category);

INSERT INTO public.message_templates (key, name, channel, category, subject, body_html, body_text, variables, description, is_system) VALUES
('notificacion_generica','Aviso general','email','sistema','{{title}}',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><div style="background:#0b1f5c;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0"><strong style="font-size:15px">IMV — {{category_label}}</strong></div><div style="border:1px solid #e5e7eb;border-top:none;padding:18px;border-radius:0 0 8px 8px"><h2 style="margin:0 0 8px;font-size:18px">{{title}}</h2><p style="margin:0 0 14px;color:#374151">{{description}}</p><a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px">Abrir en la plataforma</a><p style="margin:16px 0 0;font-size:11px;color:#6b7280">Ajusta tus avisos en Configuración → Notificaciones.</p></div></div>',
'{{title}} — {{description}} {{link}}','["title","description","category_label","link"]','Plantilla base usada por el centro de notificaciones cuando no hay una específica.',true),

('cobranza_recordatorio','Recordatorio de pago','email','cobranza','Recordatorio de pago — {{cliente}}',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Hola {{cliente}}</h2><p>Te recordamos que tienes un saldo pendiente de <strong>{{monto}}</strong> con vencimiento el <strong>{{fecha_vencimiento}}</strong> ({{dias_vencido}} días).</p><p>Documento: {{folio}}</p><a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Ver detalle</a><p style="font-size:12px;color:#6b7280">Si ya realizaste el pago, ignora este mensaje.</p></div>',
'Hola {{cliente}}: saldo pendiente de {{monto}} con vencimiento {{fecha_vencimiento}} ({{folio}}).','["cliente","monto","fecha_vencimiento","dias_vencido","folio","link"]','Recordatorio automático de facturas por vencer o vencidas.',true),

('cobranza_estado_cuenta','Estado de cuenta','email','cobranza','Estado de cuenta — {{cliente}}',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#111"><h2 style="font-size:18px">Estado de cuenta</h2><p>Cliente: <strong>{{cliente}}</strong><br/>Corte: {{fecha_corte}}</p><p>Saldo total: <strong>{{saldo_total}}</strong><br/>Vencido: <strong>{{saldo_vencido}}</strong></p>{{tabla_documentos}}<p style="font-size:12px;color:#6b7280">Cualquier aclaración, responde a este correo.</p></div>',
'Estado de cuenta de {{cliente}} al {{fecha_corte}}. Saldo {{saldo_total}}, vencido {{saldo_vencido}}.','["cliente","fecha_corte","saldo_total","saldo_vencido","tabla_documentos"]','Envío de estado de cuenta al cliente.',true),

('cobranza_promesa_pago','Confirmación de promesa de pago','email','cobranza','Promesa de pago registrada — {{cliente}}',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Promesa de pago registrada</h2><p>Cliente: <strong>{{cliente}}</strong></p><p>Monto comprometido: <strong>{{monto}}</strong><br/>Fecha comprometida: <strong>{{fecha_promesa}}</strong></p><p>{{notas}}</p></div>',
'Promesa de pago de {{cliente}}: {{monto}} para el {{fecha_promesa}}.','["cliente","monto","fecha_promesa","notas"]','Se envía al registrar una promesa de pago.',true),

('credito_autorizacion_solicitud','Solicitud de autorización de crédito','email','cobranza','Nueva solicitud de autorización — {{cliente}}',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Nueva solicitud de autorización</h2><p>Cliente: <strong>{{cliente}}</strong><br/>Tipo: {{tipo}}<br/>Monto: {{monto}}</p><p>Motivo: {{motivo}}</p><p>Solicitó: {{solicitante}}</p><a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Revisar solicitud</a></div>',
'Nueva solicitud de autorización ({{tipo}}) para {{cliente}} por {{monto}}.','["cliente","tipo","monto","motivo","solicitante","link"]','Aviso a administración/cobranza cuando se solicita una autorización.',true),

('credito_autorizacion_resuelta','Resolución de autorización de crédito','email','cobranza','Autorización {{resultado}} — {{cliente}}',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Tu solicitud fue {{resultado}}</h2><p>Cliente: <strong>{{cliente}}</strong><br/>Tipo: {{tipo}}</p><p>Respuesta: {{respuesta}}</p><a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Ver autorización</a></div>',
'Tu solicitud de {{tipo}} para {{cliente}} fue {{resultado}}. {{respuesta}}','["cliente","tipo","resultado","respuesta","link"]','Aviso al solicitante cuando se aprueba o rechaza.',true),

('pedido_confirmado','Pedido confirmado','email','ventas','Pedido {{folio}} confirmado',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Pedido confirmado</h2><p>Hola {{cliente}}, tu pedido <strong>{{folio}}</strong> quedó confirmado.</p><p>Total: <strong>{{total}}</strong><br/>Entrega estimada: {{fecha_entrega}}</p>{{tabla_items}}<a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Ver pedido</a></div>',
'Pedido {{folio}} confirmado por {{total}}. Entrega estimada {{fecha_entrega}}.','["cliente","folio","total","fecha_entrega","tabla_items","link"]','Confirmación de pedido al cliente.',true),

('pedido_en_ruta','Pedido en ruta','email','logistica','Tu pedido {{folio}} va en camino',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Tu pedido va en camino</h2><p>Hola {{cliente}}, el pedido <strong>{{folio}}</strong> salió a ruta.</p><p>Repartidor: {{repartidor}}<br/>Llegada estimada: {{eta}}</p><a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Seguir entrega</a></div>',
'Pedido {{folio}} en ruta. Llegada estimada {{eta}}.','["cliente","folio","repartidor","eta","link"]','Aviso de salida a ruta.',true),

('pedido_entregado','Pedido entregado','email','logistica','Pedido {{folio}} entregado',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Pedido entregado</h2><p>Hola {{cliente}}, confirmamos la entrega del pedido <strong>{{folio}}</strong> el {{fecha_entrega}}.</p><p>Recibió: {{recibio}}</p><a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Ver comprobante</a></div>',
'Pedido {{folio}} entregado el {{fecha_entrega}}. Recibió {{recibio}}.','["cliente","folio","fecha_entrega","recibio","link"]','Confirmación de entrega.',true),

('factura_emitida','Factura emitida','email','contabilidad','Factura {{folio}} — {{cliente}}',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Factura emitida</h2><p>Hola {{cliente}}, adjuntamos tu factura <strong>{{folio}}</strong>.</p><p>Total: <strong>{{total}}</strong><br/>Fecha: {{fecha}}<br/>UUID: {{uuid}}</p><a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Descargar PDF y XML</a></div>',
'Factura {{folio}} por {{total}} emitida el {{fecha}}.','["cliente","folio","total","fecha","uuid","link"]','Envío de CFDI al cliente.',true),

('almacen_caducidad','Alerta de caducidad','email','almacen','Lotes por caducar — {{almacen}}',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#111"><h2 style="font-size:18px">Lotes próximos a caducar</h2><p>Almacén: <strong>{{almacen}}</strong><br/>Piezas en riesgo: <strong>{{piezas}}</strong></p>{{tabla_lotes}}<a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Ver reporte</a></div>',
'Lotes por caducar en {{almacen}}: {{piezas}} piezas.','["almacen","piezas","tabla_lotes","link"]','Alerta diaria de corta caducidad.',true),

('compras_alerta','Alerta de compra / faltante','email','compras','Alerta de abasto — {{producto}}',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Alerta de abasto</h2><p>Producto: <strong>{{producto}}</strong> ({{sku}})<br/>Existencia: {{existencia}}<br/>Mínimo: {{minimo}}</p><p>{{motivo}}</p><a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Ver alerta</a></div>',
'Alerta de abasto: {{producto}} ({{sku}}), existencia {{existencia}} vs mínimo {{minimo}}.','["producto","sku","existencia","minimo","motivo","link"]','Aviso a compras por faltantes o mínimos.',true),

('rep_ruta_asignada','Ruta asignada al representante','email','rep','Ruta del {{fecha}} asignada',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Ruta asignada</h2><p>Hola {{representante}}, tienes {{num_clientes}} visitas programadas para el <strong>{{fecha}}</strong>.</p>{{tabla_paradas}}<a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Abrir ruta</a></div>',
'Ruta del {{fecha}}: {{num_clientes}} visitas.','["representante","fecha","num_clientes","tabla_paradas","link"]','Aviso de plan de ruta al representante.',true),

('usuario_bienvenida','Bienvenida de usuario','email','sistema','Bienvenido a IMV, {{nombre}}',
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111"><h2 style="font-size:18px">Bienvenido a la plataforma IMV</h2><p>Hola {{nombre}}, tu cuenta fue creada con el rol <strong>{{rol}}</strong>.</p><a href="{{link}}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Entrar a la plataforma</a><p style="font-size:12px;color:#6b7280">Si no reconoces este acceso, avisa a tu administrador.</p></div>',
'Bienvenido a IMV, {{nombre}}. Rol: {{rol}}. {{link}}','["nombre","rol","link"]','Correo de alta de usuario.',true),

('sms_cobranza_recordatorio','SMS recordatorio de pago','sms','cobranza',NULL,NULL,
'IMV: {{cliente}}, tienes {{monto}} pendiente con vencimiento {{fecha_vencimiento}}. Detalle: {{link}}',
'["cliente","monto","fecha_vencimiento","link"]','Versión corta para SMS (canal pendiente de proveedor).',true),

('sms_pedido_en_ruta','SMS pedido en ruta','sms','logistica',NULL,NULL,
'IMV: tu pedido {{folio}} va en camino. Llegada estimada {{eta}}.',
'["folio","eta"]','Aviso corto de salida a ruta.',true),

('sms_rep_ruta','SMS ruta del día','sms','rep',NULL,NULL,
'IMV: tienes {{num_clientes}} visitas programadas hoy {{fecha}}. Abre tu ruta: {{link}}',
'["num_clientes","fecha","link"]','Aviso corto de ruta al representante.',true);