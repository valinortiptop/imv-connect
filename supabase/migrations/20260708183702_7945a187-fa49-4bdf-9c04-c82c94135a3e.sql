
-- === bank_accounts ===
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  banco text NOT NULL,
  alias text NOT NULL,
  moneda text NOT NULL DEFAULT 'MXN',
  clabe text,
  numero_cuenta text,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  cuenta_contable_id uuid REFERENCES public.cuentas_contables(id) ON DELETE SET NULL,
  activa boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_accounts staff manage" ON public.bank_accounts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));

-- === bank_statements ===
CREATE TABLE public.bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cuenta_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  periodo text,                       -- YYYY-MM
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  status text NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  bank_name text,
  saldo_inicial numeric,
  saldo_final numeric,
  total_credits numeric DEFAULT 0,
  total_debits numeric DEFAULT 0,
  error_message text,
  raw_data jsonb,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statements TO authenticated;
GRANT ALL ON public.bank_statements TO service_role;
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_statements staff manage" ON public.bank_statements FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));
CREATE INDEX idx_bank_statements_empresa ON public.bank_statements(empresa_id, periodo DESC);

-- === bank_movements ===
CREATE TYPE public.bank_movement_kind AS ENUM ('entrada','salida','traspaso_in','traspaso_out','nomina','comision','interes','ajuste');

CREATE TABLE public.bank_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cuenta_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tipo public.bank_movement_kind NOT NULL,
  monto numeric NOT NULL,               -- always positive; signo lo determina 'tipo'
  descripcion text,
  referencia text,
  contraparte text,
  categoria text,
  ai_categoria text,
  ai_confianza numeric,
  statement_id uuid REFERENCES public.bank_statements(id) ON DELETE SET NULL,
  transfer_id uuid,                     -- FK circular, se agrega abajo
  payroll_payment_id uuid REFERENCES public.payroll_payments(id) ON DELETE SET NULL,
  uuid_cfdi text,
  conciliado boolean NOT NULL DEFAULT false,
  conciliado_at timestamptz,
  conciliado_by uuid REFERENCES auth.users(id),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_movements TO authenticated;
GRANT ALL ON public.bank_movements TO service_role;
ALTER TABLE public.bank_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_movements staff manage" ON public.bank_movements FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));
CREATE INDEX idx_bank_movements_cuenta_fecha ON public.bank_movements(cuenta_id, fecha DESC);
CREATE INDEX idx_bank_movements_empresa_fecha ON public.bank_movements(empresa_id, fecha DESC);
CREATE INDEX idx_bank_movements_statement ON public.bank_movements(statement_id);

-- === bank_transfers ===
CREATE TABLE public.bank_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cuenta_origen_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  cuenta_destino_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  monto numeric NOT NULL CHECK (monto > 0),
  referencia text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT bank_transfers_distintas CHECK (cuenta_origen_id <> cuenta_destino_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transfers TO authenticated;
GRANT ALL ON public.bank_transfers TO service_role;
ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_transfers staff manage" ON public.bank_transfers FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','contabilidad']::app_role[]));

-- FK circular: bank_movements.transfer_id -> bank_transfers.id
ALTER TABLE public.bank_movements
  ADD CONSTRAINT bank_movements_transfer_fk FOREIGN KEY (transfer_id)
  REFERENCES public.bank_transfers(id) ON DELETE CASCADE;

-- Trigger: al crear un traspaso, genera los 2 movimientos
CREATE OR REPLACE FUNCTION public.tg_bank_transfer_create_movements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.bank_movements(empresa_id, cuenta_id, fecha, tipo, monto, descripcion, referencia, transfer_id, created_by)
  VALUES
    (NEW.empresa_id, NEW.cuenta_origen_id, NEW.fecha, 'traspaso_out', NEW.monto,
     COALESCE('Traspaso a otra cuenta — ' || NEW.notas, 'Traspaso a otra cuenta'),
     NEW.referencia, NEW.id, NEW.created_by),
    (NEW.empresa_id, NEW.cuenta_destino_id, NEW.fecha, 'traspaso_in',  NEW.monto,
     COALESCE('Traspaso recibido — ' || NEW.notas, 'Traspaso recibido'),
     NEW.referencia, NEW.id, NEW.created_by);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_bank_transfer_create_movements
  AFTER INSERT ON public.bank_transfers
  FOR EACH ROW EXECUTE FUNCTION public.tg_bank_transfer_create_movements();

-- updated_at triggers (reutilizamos función genérica si existe; si no, creamos una)
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_bank_accounts_touch   BEFORE UPDATE ON public.bank_accounts   FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_bank_movements_touch  BEFORE UPDATE ON public.bank_movements  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_bank_transfers_touch  BEFORE UPDATE ON public.bank_transfers  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_bank_statements_touch BEFORE UPDATE ON public.bank_statements FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Vista de saldo por cuenta
CREATE OR REPLACE VIEW public.bank_account_balances AS
SELECT
  a.id AS cuenta_id,
  a.empresa_id,
  a.saldo_inicial
    + COALESCE(SUM(CASE WHEN m.tipo IN ('entrada','traspaso_in','interes','ajuste') THEN m.monto
                        WHEN m.tipo IN ('salida','traspaso_out','nomina','comision') THEN -m.monto
                        ELSE 0 END), 0) AS saldo_actual,
  COALESCE(SUM(CASE WHEN m.tipo IN ('entrada','traspaso_in','interes') THEN m.monto ELSE 0 END), 0) AS total_entradas,
  COALESCE(SUM(CASE WHEN m.tipo IN ('salida','traspaso_out','nomina','comision') THEN m.monto ELSE 0 END), 0) AS total_salidas,
  COUNT(m.id) AS movimientos
FROM public.bank_accounts a
LEFT JOIN public.bank_movements m ON m.cuenta_id = a.id
GROUP BY a.id, a.empresa_id, a.saldo_inicial;

GRANT SELECT ON public.bank_account_balances TO authenticated;
