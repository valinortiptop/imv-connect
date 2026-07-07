
CREATE TABLE public.empresa_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT,
  size_bytes BIGINT,
  categoria TEXT NOT NULL DEFAULT 'general',
  etiquetas TEXT[] NOT NULL DEFAULT '{}',
  resumen TEXT,
  ai_analyzed BOOLEAN NOT NULL DEFAULT false,
  notas TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX empresa_documentos_empresa_idx ON public.empresa_documentos(empresa_id);
CREATE INDEX empresa_documentos_categoria_idx ON public.empresa_documentos(empresa_id, categoria);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_documentos TO authenticated;
GRANT ALL ON public.empresa_documentos TO service_role;

ALTER TABLE public.empresa_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_documentos authenticated all"
  ON public.empresa_documentos FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.empresa_documentos_touch()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER empresa_documentos_touch_tg
  BEFORE UPDATE ON public.empresa_documentos
  FOR EACH ROW EXECUTE FUNCTION public.empresa_documentos_touch();
