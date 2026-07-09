CREATE TABLE public.competitor_migrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  laboratorio_id UUID REFERENCES public.laboratorios(id) ON DELETE SET NULL,
  competitor_name TEXT NOT NULL,
  motivo TEXT,
  evidence_url TEXT,
  source TEXT NOT NULL DEFAULT 'rep' CHECK (source IN ('rep','inferido','supervisor')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  representante_id UUID REFERENCES public.representantes(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_migrations TO authenticated;
GRANT ALL ON public.competitor_migrations TO service_role;

ALTER TABLE public.competitor_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reps and admins manage competitor migrations"
ON public.competitor_migrations
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.representantes r
    WHERE r.id = competitor_migrations.representante_id
      AND r.user_id = auth.uid()
  )
  OR created_by = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.representantes r
    WHERE r.id = competitor_migrations.representante_id
      AND r.user_id = auth.uid()
  )
  OR created_by = auth.uid()
);

CREATE INDEX idx_competitor_migrations_cliente ON public.competitor_migrations(cliente_id);
CREATE INDEX idx_competitor_migrations_lab ON public.competitor_migrations(laboratorio_id);
CREATE INDEX idx_competitor_migrations_rep ON public.competitor_migrations(representante_id);

CREATE TRIGGER update_competitor_migrations_updated_at
BEFORE UPDATE ON public.competitor_migrations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.product_substitutes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  sustituto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  prioridad INTEGER NOT NULL DEFAULT 1,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_substitutes_not_self CHECK (producto_id <> sustituto_id),
  UNIQUE(producto_id, sustituto_id)
);

GRANT SELECT ON public.product_substitutes TO authenticated;
GRANT ALL ON public.product_substitutes TO service_role;

ALTER TABLE public.product_substitutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read substitutes"
ON public.product_substitutes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage substitutes"
ON public.product_substitutes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_product_substitutes_producto ON public.product_substitutes(producto_id);

CREATE TRIGGER update_product_substitutes_updated_at
BEFORE UPDATE ON public.product_substitutes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE INDEX IF NOT EXISTS idx_pedido_items_producto ON public.pedido_items(producto_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_created ON public.pedidos(cliente_id, created_at DESC);