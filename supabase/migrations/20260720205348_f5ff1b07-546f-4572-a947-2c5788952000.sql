
CREATE TABLE IF NOT EXISTS public.cliente_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  nombre text NOT NULL,
  storage_path text,
  url text,
  fecha_emision date,
  fecha_vencimiento date,
  notas text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_documentos TO authenticated;
GRANT ALL ON public.cliente_documentos TO service_role;
ALTER TABLE public.cliente_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage cliente_documentos" ON public.cliente_documentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cliente_documentos_cliente ON public.cliente_documentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_documentos_venc ON public.cliente_documentos(fecha_vencimiento) WHERE fecha_vencimiento IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cobranza_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  nivel text NOT NULL DEFAULT 'medio',
  titulo text NOT NULL,
  descripcion text,
  score numeric,
  metadata jsonb,
  resuelta boolean NOT NULL DEFAULT false,
  resuelta_at timestamptz,
  resuelta_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranza_alertas TO authenticated;
GRANT ALL ON public.cobranza_alertas TO service_role;
ALTER TABLE public.cobranza_alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage cobranza_alertas" ON public.cobranza_alertas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cobranza_alertas_cliente ON public.cobranza_alertas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cobranza_alertas_pendientes ON public.cobranza_alertas(created_at DESC) WHERE resuelta = false;

CREATE POLICY "auth read cliente-documentos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'cliente-documentos');
CREATE POLICY "auth write cliente-documentos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'cliente-documentos');
CREATE POLICY "auth update cliente-documentos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'cliente-documentos');
CREATE POLICY "auth delete cliente-documentos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'cliente-documentos');
