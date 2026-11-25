CREATE TABLE public.oc_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  campo text NOT NULL,
  valor_anterior text,
  valor_nuevo text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oc_changes TO authenticated;
GRANT ALL ON public.oc_changes TO service_role;
ALTER TABLE public.oc_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read oc_changes" ON public.oc_changes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE INDEX oc_changes_oc_idx ON public.oc_changes(oc_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.oc_changes_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f text; o text; n text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.oc_changes(oc_id, campo, valor_nuevo, changed_by) VALUES (NEW.id, 'creada', NEW.estado, auth.uid());
    RETURN NEW;
  END IF;
  FOREACH f IN ARRAY ARRAY['estado','fecha_esperada','fecha_recepcion','total','notas','factura_proveedor','laboratorio_id','almacen_id'] LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f) INTO o, n USING OLD, NEW;
    IF o IS DISTINCT FROM n THEN
      INSERT INTO public.oc_changes(oc_id, campo, valor_anterior, valor_nuevo, changed_by) VALUES (NEW.id, f, o, n, auth.uid());
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.oc_changes_trigger() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_oc_changes AFTER INSERT OR UPDATE ON public.ordenes_compra FOR EACH ROW EXECUTE FUNCTION public.oc_changes_trigger();

CREATE TABLE public.oc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.oc_documents TO authenticated;
GRANT ALL ON public.oc_documents TO service_role;
ALTER TABLE public.oc_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read oc_documents" ON public.oc_documents FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff add oc_documents" ON public.oc_documents FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "owner or admin delete oc_documents" ON public.oc_documents FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "staff read oc-documentos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'oc-documentos' AND public.is_staff(auth.uid()));
CREATE POLICY "staff upload oc-documentos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'oc-documentos' AND public.is_staff(auth.uid()));
CREATE POLICY "owner or admin delete oc-documentos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'oc-documentos' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));