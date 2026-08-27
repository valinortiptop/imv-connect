ALTER TABLE public.rep_visits ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES public.prospects(id) ON DELETE SET NULL;
ALTER TABLE public.rep_visits ALTER COLUMN cliente_id DROP NOT NULL;