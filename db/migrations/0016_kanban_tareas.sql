-- Kanban / Tareas tables for /admin/tareas

CREATE TABLE IF NOT EXISTS public.kanban_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kanban_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kanban_columns_board_idx ON public.kanban_columns(board_id, sort_order);

CREATE TABLE IF NOT EXISTS public.kanban_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid,
  assigned_name text,
  priority text NOT NULL DEFAULT 'media',
  due_date date,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kanban_cards_column_idx ON public.kanban_cards(column_id, sort_order);

CREATE TABLE IF NOT EXISTS public.kanban_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  user_id uuid,
  user_name text,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kanban_comments_card_idx ON public.kanban_comments(card_id, created_at);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_boards   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_columns  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_cards    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_comments TO authenticated;
GRANT ALL ON public.kanban_boards, public.kanban_columns, public.kanban_cards, public.kanban_comments TO service_role;

-- RLS
ALTER TABLE public.kanban_boards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY kanban_boards_all   ON public.kanban_boards   FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY kanban_columns_all  ON public.kanban_columns  FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY kanban_cards_all    ON public.kanban_cards    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY kanban_comments_all ON public.kanban_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed: one default board with 4 columns
DO $$
DECLARE
  v_board_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.kanban_boards) THEN
    INSERT INTO public.kanban_boards (name, role) VALUES ('General', NULL) RETURNING id INTO v_board_id;
    INSERT INTO public.kanban_columns (board_id, title, sort_order, color) VALUES
      (v_board_id, 'Por hacer',   0, '#94a3b8'),
      (v_board_id, 'En progreso', 1, '#3b82f6'),
      (v_board_id, 'En revisión', 2, '#f59e0b'),
      (v_board_id, 'Listo',       3, '#10b981');
  END IF;
END $$;
