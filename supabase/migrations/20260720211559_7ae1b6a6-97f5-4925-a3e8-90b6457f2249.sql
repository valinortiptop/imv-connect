
CREATE TABLE public.cobranza_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  canal text NOT NULL DEFAULT 'email',
  asunto text,
  cuerpo text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  descripcion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranza_templates TO authenticated;
GRANT ALL ON public.cobranza_templates TO service_role;
ALTER TABLE public.cobranza_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_templates" ON public.cobranza_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.cobranza_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  valor jsonb NOT NULL,
  descripcion text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranza_config TO authenticated;
GRANT ALL ON public.cobranza_config TO service_role;
ALTER TABLE public.cobranza_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_config" ON public.cobranza_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.cobranza_templates (codigo, nombre, canal, asunto, cuerpo, descripcion) VALUES
  ('recordatorio_pre', 'Recordatorio pre-vencimiento', 'email', 'Recordatorio: factura próxima a vencer',
   'Estimado {{cliente}}, su factura {{folio}} por {{monto}} vence el {{fecha_vencimiento}}.', 'Enviado N días antes'),
  ('recordatorio_post', 'Recordatorio post-vencimiento', 'email', 'Factura vencida - {{folio}}',
   'Estimado {{cliente}}, la factura {{folio}} por {{monto}} venció el {{fecha_vencimiento}}.', 'Enviado después del vencimiento'),
  ('estado_cuenta', 'Estado de cuenta', 'email', 'Estado de cuenta - {{cliente}}',
   'Estimado {{cliente}}, adjunto su estado de cuenta al {{fecha}}.', 'Enviado según periodicidad'),
  ('promesa_incumplida', 'Promesa incumplida', 'email', 'Compromiso de pago pendiente',
   'Estimado {{cliente}}, su promesa del {{fecha_promesa}} por {{monto}} no fue cumplida.', 'Promesa vencida sin pago')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.cobranza_config (clave, valor, descripcion) VALUES
  ('dias_recordatorio_pre', '3'::jsonb, 'Días antes del vencimiento'),
  ('dias_recordatorio_post', '[1,7,15,30]'::jsonb, 'Días después del vencimiento'),
  ('umbral_riesgo_critico', '80'::jsonb, 'Score IA crítico'),
  ('umbral_riesgo_alto', '60'::jsonb, 'Score IA alto'),
  ('dias_dso_alerta', '45'::jsonb, 'DSO máximo'),
  ('auto_kanban_alertas', 'true'::jsonb, 'Kanban automático desde alertas')
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE public.cobranza_alertas ADD COLUMN IF NOT EXISTS kanban_card_id uuid REFERENCES public.kanban_cards(id) ON DELETE SET NULL;

CREATE OR REPLACE VIEW public.v_cliente_timeline AS
  SELECT id, cliente_id, created_at AS fecha, 'gestion'::text AS tipo,
         (tipo::text) AS titulo, (resultado::text) AS detalle, monto_comprometido AS monto
  FROM public.cobranza_gestiones
  UNION ALL
  SELECT id, cliente_id, created_at, 'promesa'::text, 'Promesa de pago'::text, (estado::text), monto
  FROM public.cobranza_promesas_pago
  UNION ALL
  SELECT id, cliente_id, created_at, 'comunicacion'::text, COALESCE(asunto,'Comunicación')::text, (canal::text), NULL::numeric
  FROM public.cobranza_comunicaciones
  UNION ALL
  SELECT id, cliente_id, created_at, 'alerta'::text, titulo::text, (nivel::text), NULL::numeric
  FROM public.cobranza_alertas
  UNION ALL
  SELECT id, cliente_id, created_at, 'autorizacion'::text, (tipo::text), (estado::text), monto
  FROM public.credito_autorizaciones;

GRANT SELECT ON public.v_cliente_timeline TO authenticated;
