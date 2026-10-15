CREATE TABLE public.rep_visit_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.rep_visits(id) ON DELETE CASCADE,
  representante_id uuid,
  cliente_id uuid,
  tipo text NOT NULL,
  factura_id uuid,
  pago_id uuid,
  pedido_id uuid,
  monto numeric,
  folio text,
  piezas integer,
  notas text,
  photo_paths text[] NOT NULL DEFAULT '{}',
  signature_path text,
  received_by text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_visit_actions TO authenticated;
GRANT ALL ON public.rep_visit_actions TO service_role;
ALTER TABLE public.rep_visit_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX rep_visit_actions_visit_idx ON public.rep_visit_actions(visit_id);

CREATE OR REPLACE FUNCTION public.rep_visit_actions_validate() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tipo NOT IN ('cobro','receta','entrega') THEN
    RAISE EXCEPTION 'tipo inválido';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rep_visit_actions_validate BEFORE INSERT OR UPDATE ON public.rep_visit_actions
FOR EACH ROW EXECUTE FUNCTION public.rep_visit_actions_validate();

CREATE POLICY "own or admin read" ON public.rep_visit_actions FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));
CREATE POLICY "own insert" ON public.rep_visit_actions FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());
CREATE POLICY "own or admin delete" ON public.rep_visit_actions FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));