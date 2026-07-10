ALTER TABLE public.purchase_alerts
  ADD COLUMN IF NOT EXISTS responsable_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prioridad text CHECK (prioridad IN ('baja','media','alta','critica'));

CREATE INDEX IF NOT EXISTS purchase_alerts_responsable_idx ON public.purchase_alerts(responsable_user_id) WHERE resuelto = false;
CREATE INDEX IF NOT EXISTS purchase_alerts_prioridad_idx ON public.purchase_alerts(prioridad) WHERE resuelto = false;