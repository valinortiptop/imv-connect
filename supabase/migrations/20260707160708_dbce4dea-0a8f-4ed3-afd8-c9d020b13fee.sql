
-- =========================================================================
-- CONTABILIDAD (Mexican SAT-compliant accounting) — Fase 1 schema + seed
-- =========================================================================

-- ── Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.cta_naturaleza AS ENUM ('deudora', 'acreedora');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.poliza_tipo AS ENUM ('ingreso', 'egreso', 'diario');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.poliza_estado AS ENUM ('borrador', 'asentada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.periodo_estado AS ENUM ('abierto', 'cerrado', 'enviado_sat');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.impuesto_tipo AS ENUM (
    'iva_trasladado_cobrado', 'iva_trasladado_pendiente',
    'iva_acreditable_pagado', 'iva_acreditable_pendiente',
    'ieps_trasladado_cobrado', 'ieps_trasladado_pendiente',
    'ieps_acreditable_pagado', 'ieps_acreditable_pendiente',
    'ret_isr', 'ret_iva'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 1. Código agrupador SAT (lookup) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sat_codigo_agrupador (
  codigo         text PRIMARY KEY,
  nombre         text NOT NULL,
  nivel          int  NOT NULL,
  naturaleza     public.cta_naturaleza NOT NULL,
  padre          text REFERENCES public.sat_codigo_agrupador(codigo),
  created_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sat_codigo_agrupador TO authenticated;
GRANT ALL    ON public.sat_codigo_agrupador TO service_role;
ALTER TABLE public.sat_codigo_agrupador ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sat_codigo_agrupador_read" ON public.sat_codigo_agrupador FOR SELECT TO authenticated USING (true);


-- ── 2. Cuentas contables por empresa ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cuentas_contables (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  codigo               text NOT NULL,                       -- código local jerárquico ej: 105-01-001
  codigo_agrupador     text REFERENCES public.sat_codigo_agrupador(codigo),
  nombre               text NOT NULL,
  naturaleza           public.cta_naturaleza NOT NULL,
  nivel                int  NOT NULL CHECK (nivel BETWEEN 1 AND 6),
  padre_id             uuid REFERENCES public.cuentas_contables(id) ON DELETE RESTRICT,
  permite_movimientos  boolean NOT NULL DEFAULT true,
  moneda               text NOT NULL DEFAULT 'MXN',
  activa               boolean NOT NULL DEFAULT true,
  saldo_inicial        numeric(16,2) NOT NULL DEFAULT 0,
  descripcion          text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_cuentas_empresa ON public.cuentas_contables(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_padre   ON public.cuentas_contables(padre_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_agrup   ON public.cuentas_contables(codigo_agrupador);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuentas_contables TO authenticated;
GRANT ALL ON public.cuentas_contables TO service_role;
ALTER TABLE public.cuentas_contables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuentas_read_conta" ON public.cuentas_contables FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "cuentas_write_conta" ON public.cuentas_contables FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'));


-- ── 3. Ejercicios fiscales y periodos mensuales ─────────────────────────
CREATE TABLE IF NOT EXISTS public.ejercicios_fiscales (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  anio         int  NOT NULL,
  cerrado      boolean NOT NULL DEFAULT false,
  fecha_cierre date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, anio)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ejercicios_fiscales TO authenticated;
GRANT ALL ON public.ejercicios_fiscales TO service_role;
ALTER TABLE public.ejercicios_fiscales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ej_all_conta" ON public.ejercicios_fiscales FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'));

CREATE TABLE IF NOT EXISTS public.periodos_contables (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejercicio_id  uuid NOT NULL REFERENCES public.ejercicios_fiscales(id) ON DELETE CASCADE,
  empresa_id    uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  anio          int  NOT NULL,
  mes           int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado        public.periodo_estado NOT NULL DEFAULT 'abierto',
  fecha_envio   date,
  UNIQUE (empresa_id, anio, mes)
);
CREATE INDEX IF NOT EXISTS idx_periodos_empresa ON public.periodos_contables(empresa_id, anio, mes);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.periodos_contables TO authenticated;
GRANT ALL ON public.periodos_contables TO service_role;
ALTER TABLE public.periodos_contables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "per_all_conta" ON public.periodos_contables FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'));


-- ── 4. Pólizas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.polizas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  periodo_id     uuid REFERENCES public.periodos_contables(id) ON DELETE RESTRICT,
  tipo           public.poliza_tipo NOT NULL,
  folio          text NOT NULL,
  fecha          date NOT NULL DEFAULT current_date,
  concepto       text NOT NULL DEFAULT '',
  estado         public.poliza_estado NOT NULL DEFAULT 'borrador',
  total_cargos   numeric(16,2) NOT NULL DEFAULT 0,
  total_abonos   numeric(16,2) NOT NULL DEFAULT 0,
  origen         text,                       -- 'factura' | 'pago' | 'oc' | 'devolucion' | 'manual'
  origen_id      uuid,
  cancelada_por  uuid REFERENCES public.polizas(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  posted_at      timestamptz,
  posted_by      uuid,
  UNIQUE (empresa_id, tipo, folio)
);
CREATE INDEX IF NOT EXISTS idx_polizas_empresa_fecha ON public.polizas(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_polizas_periodo       ON public.polizas(periodo_id);
CREATE INDEX IF NOT EXISTS idx_polizas_estado        ON public.polizas(estado);
CREATE INDEX IF NOT EXISTS idx_polizas_origen        ON public.polizas(origen, origen_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.polizas TO authenticated;
GRANT ALL ON public.polizas TO service_role;
ALTER TABLE public.polizas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "polizas_all_conta" ON public.polizas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'));


CREATE TABLE IF NOT EXISTS public.poliza_movimientos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id      uuid NOT NULL REFERENCES public.polizas(id) ON DELETE CASCADE,
  cuenta_id      uuid NOT NULL REFERENCES public.cuentas_contables(id) ON DELETE RESTRICT,
  cargo          numeric(16,2) NOT NULL DEFAULT 0 CHECK (cargo  >= 0),
  abono          numeric(16,2) NOT NULL DEFAULT 0 CHECK (abono  >= 0),
  concepto       text,
  uuid_cfdi      text,
  factura_id     uuid,
  pago_id        uuid,
  oc_id          uuid,
  devolucion_id  uuid,
  orden          int NOT NULL DEFAULT 0,
  CHECK (cargo = 0 OR abono = 0)
);
CREATE INDEX IF NOT EXISTS idx_mov_poliza ON public.poliza_movimientos(poliza_id);
CREATE INDEX IF NOT EXISTS idx_mov_cuenta ON public.poliza_movimientos(cuenta_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.poliza_movimientos TO authenticated;
GRANT ALL ON public.poliza_movimientos TO service_role;
ALTER TABLE public.poliza_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movs_all_conta" ON public.poliza_movimientos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'));


CREATE TABLE IF NOT EXISTS public.poliza_impuestos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id    uuid NOT NULL REFERENCES public.polizas(id) ON DELETE CASCADE,
  tipo         public.impuesto_tipo NOT NULL,
  tasa         numeric(5,4) NOT NULL,       -- 0.16, 0.08, 0.06, 0.00, 0.265, etc.
  base         numeric(16,2) NOT NULL DEFAULT 0,
  monto        numeric(16,2) NOT NULL DEFAULT 0,
  uuid_cfdi    text,
  notas        text
);
CREATE INDEX IF NOT EXISTS idx_imp_poliza ON public.poliza_impuestos(poliza_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.poliza_impuestos TO authenticated;
GRANT ALL ON public.poliza_impuestos TO service_role;
ALTER TABLE public.poliza_impuestos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imp_all_conta" ON public.poliza_impuestos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'));


-- ── 5. Reportes financieros personalizados ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.reportes_personalizados (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  descripcion  text,
  configuracion jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { grupos: [{ label, cuentas: [ids], signo }], filtros: {...} }
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reportes_personalizados TO authenticated;
GRANT ALL ON public.reportes_personalizados TO service_role;
ALTER TABLE public.reportes_personalizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rep_all_conta" ON public.reportes_personalizados FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contabilidad'));


-- ── 6. Vincular pólizas a documentos existentes (idempotente) ───────────
ALTER TABLE public.facturas        ADD COLUMN IF NOT EXISTS poliza_id uuid REFERENCES public.polizas(id) ON DELETE SET NULL;
ALTER TABLE public.pagos           ADD COLUMN IF NOT EXISTS poliza_id uuid REFERENCES public.polizas(id) ON DELETE SET NULL;
ALTER TABLE public.ordenes_compra  ADD COLUMN IF NOT EXISTS poliza_id uuid REFERENCES public.polizas(id) ON DELETE SET NULL;
ALTER TABLE public.devoluciones    ADD COLUMN IF NOT EXISTS poliza_id uuid REFERENCES public.polizas(id) ON DELETE SET NULL;


-- ── 7. Triggers: totales, balance, periodo cerrado ──────────────────────

CREATE OR REPLACE FUNCTION public.polizas_recalc(_poliza uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE v_c numeric(16,2); v_a numeric(16,2);
BEGIN
  SELECT coalesce(sum(cargo),0), coalesce(sum(abono),0)
    INTO v_c, v_a
    FROM public.poliza_movimientos WHERE poliza_id = _poliza;
  UPDATE public.polizas
     SET total_cargos = v_c, total_abonos = v_a, updated_at = now()
   WHERE id = _poliza;
END $fn$;

CREATE OR REPLACE FUNCTION public.poliza_movimientos_after_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  PERFORM public.polizas_recalc(coalesce(new.poliza_id, old.poliza_id));
  RETURN coalesce(new, old);
END $fn$;

DROP TRIGGER IF EXISTS trg_poliza_mov_iud ON public.poliza_movimientos;
CREATE TRIGGER trg_poliza_mov_iud
AFTER INSERT OR UPDATE OR DELETE ON public.poliza_movimientos
FOR EACH ROW EXECUTE FUNCTION public.poliza_movimientos_after_change();


-- Guard: al pasar a 'asentada' debe cuadrar y el periodo estar abierto.
CREATE OR REPLACE FUNCTION public.polizas_before_update_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE v_estado public.periodo_estado;
BEGIN
  IF NEW.estado = 'asentada' AND OLD.estado IS DISTINCT FROM 'asentada' THEN
    IF NEW.total_cargos <> NEW.total_abonos OR NEW.total_cargos = 0 THEN
      RAISE EXCEPTION 'poliza_no_cuadra: cargos=% abonos=%', NEW.total_cargos, NEW.total_abonos;
    END IF;
    IF NEW.periodo_id IS NOT NULL THEN
      SELECT estado INTO v_estado FROM public.periodos_contables WHERE id = NEW.periodo_id;
      IF v_estado IN ('cerrado', 'enviado_sat') THEN
        RAISE EXCEPTION 'periodo_cerrado';
      END IF;
    END IF;
    NEW.posted_at := now();
    NEW.posted_by := auth.uid();
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_polizas_guard ON public.polizas;
CREATE TRIGGER trg_polizas_guard
BEFORE UPDATE ON public.polizas
FOR EACH ROW EXECUTE FUNCTION public.polizas_before_update_guard();


-- Auto-folio por empresa/tipo si viene vacío
CREATE OR REPLACE FUNCTION public.polizas_auto_folio()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE n int; prefix text;
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    prefix := CASE NEW.tipo WHEN 'ingreso' THEN 'PI' WHEN 'egreso' THEN 'PE' ELSE 'PD' END;
    SELECT coalesce(max((regexp_replace(folio, '^[A-Z]+-', '', 'g'))::int), 0) + 1
      INTO n FROM public.polizas
      WHERE empresa_id = NEW.empresa_id AND tipo = NEW.tipo AND folio ~ ('^' || prefix || '-[0-9]+$');
    NEW.folio := prefix || '-' || lpad(n::text, 5, '0');
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_polizas_folio ON public.polizas;
CREATE TRIGGER trg_polizas_folio
BEFORE INSERT ON public.polizas
FOR EACH ROW EXECUTE FUNCTION public.polizas_auto_folio();


-- ── 8. Libro mayor y balanza (vistas / RPC) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.balanza_de_comprobacion(
  _empresa uuid, _desde date, _hasta date
) RETURNS TABLE (
  cuenta_id uuid, codigo text, nombre text, codigo_agrupador text, naturaleza public.cta_naturaleza,
  nivel int, saldo_inicial numeric, cargos numeric, abonos numeric, saldo_final numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH movs AS (
    SELECT m.cuenta_id,
           sum(CASE WHEN p.fecha < _desde THEN m.cargo ELSE 0 END) AS cargo_prev,
           sum(CASE WHEN p.fecha < _desde THEN m.abono ELSE 0 END) AS abono_prev,
           sum(CASE WHEN p.fecha BETWEEN _desde AND _hasta THEN m.cargo ELSE 0 END) AS cargo_per,
           sum(CASE WHEN p.fecha BETWEEN _desde AND _hasta THEN m.abono ELSE 0 END) AS abono_per
      FROM public.poliza_movimientos m
      JOIN public.polizas p ON p.id = m.poliza_id
     WHERE p.empresa_id = _empresa AND p.estado = 'asentada'
     GROUP BY m.cuenta_id
  )
  SELECT c.id,
         c.codigo, c.nombre, c.codigo_agrupador, c.naturaleza, c.nivel,
         (c.saldo_inicial
           + CASE WHEN c.naturaleza = 'deudora'
                  THEN coalesce(mv.cargo_prev,0) - coalesce(mv.abono_prev,0)
                  ELSE coalesce(mv.abono_prev,0) - coalesce(mv.cargo_prev,0) END) AS saldo_inicial,
         coalesce(mv.cargo_per, 0)  AS cargos,
         coalesce(mv.abono_per, 0)  AS abonos,
         (c.saldo_inicial
           + CASE WHEN c.naturaleza = 'deudora'
                  THEN coalesce(mv.cargo_prev,0) + coalesce(mv.cargo_per,0)
                       - coalesce(mv.abono_prev,0) - coalesce(mv.abono_per,0)
                  ELSE coalesce(mv.abono_prev,0) + coalesce(mv.abono_per,0)
                       - coalesce(mv.cargo_prev,0) - coalesce(mv.cargo_per,0) END) AS saldo_final
    FROM public.cuentas_contables c
    LEFT JOIN movs mv ON mv.cuenta_id = c.id
   WHERE c.empresa_id = _empresa AND c.activa = true
   ORDER BY c.codigo;
$fn$;


CREATE OR REPLACE FUNCTION public.libro_mayor_cuenta(
  _cuenta uuid, _desde date, _hasta date
) RETURNS TABLE (
  fecha date, folio text, tipo public.poliza_tipo, concepto text,
  cargo numeric, abono numeric, saldo numeric, poliza_id uuid, uuid_cfdi text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH cta AS (SELECT saldo_inicial, naturaleza FROM public.cuentas_contables WHERE id = _cuenta),
  prev AS (
    SELECT coalesce(sum(m.cargo),0) AS c, coalesce(sum(m.abono),0) AS a
      FROM public.poliza_movimientos m JOIN public.polizas p ON p.id = m.poliza_id
     WHERE m.cuenta_id = _cuenta AND p.estado = 'asentada' AND p.fecha < _desde
  ),
  base AS (
    SELECT c.saldo_inicial
         + CASE WHEN c.naturaleza = 'deudora' THEN prev.c - prev.a ELSE prev.a - prev.c END AS s
      FROM cta c, prev
  ),
  detalle AS (
    SELECT p.fecha, p.folio, p.tipo, coalesce(m.concepto, p.concepto) AS concepto,
           m.cargo, m.abono, p.id AS poliza_id, m.uuid_cfdi,
           row_number() OVER (ORDER BY p.fecha, p.folio, m.orden, m.id) AS rn,
           c.naturaleza
      FROM public.poliza_movimientos m
      JOIN public.polizas p ON p.id = m.poliza_id
      JOIN public.cuentas_contables c ON c.id = m.cuenta_id
     WHERE m.cuenta_id = _cuenta AND p.estado = 'asentada'
       AND p.fecha BETWEEN _desde AND _hasta
  )
  SELECT d.fecha, d.folio, d.tipo, d.concepto, d.cargo, d.abono,
         (SELECT s FROM base) + sum(
           CASE WHEN d.naturaleza = 'deudora' THEN d.cargo - d.abono ELSE d.abono - d.cargo END
         ) OVER (ORDER BY d.rn) AS saldo,
         d.poliza_id, d.uuid_cfdi
    FROM detalle d
   ORDER BY d.rn;
$fn$;


CREATE OR REPLACE FUNCTION public.iva_ieps_saldos(_empresa uuid, _hasta date)
RETURNS TABLE (tipo public.impuesto_tipo, tasa numeric, base numeric, monto numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT i.tipo, i.tasa, sum(i.base) AS base, sum(i.monto) AS monto
    FROM public.poliza_impuestos i
    JOIN public.polizas p ON p.id = i.poliza_id
   WHERE p.empresa_id = _empresa AND p.estado = 'asentada' AND p.fecha <= _hasta
   GROUP BY i.tipo, i.tasa
   ORDER BY i.tipo, i.tasa;
$fn$;


-- ── 9. Seed del código agrupador SAT (Anexo 24, extracto operativo) ─────
INSERT INTO public.sat_codigo_agrupador (codigo, nombre, nivel, naturaleza, padre) VALUES
  ('100','Activo',1,'deudora',NULL),
    ('101','Caja',2,'deudora','100'),
    ('102','Bancos',2,'deudora','100'),
    ('103','Inversiones',2,'deudora','100'),
    ('105','Clientes',2,'deudora','100'),
    ('107','Deudores diversos',2,'deudora','100'),
    ('115','Inventario',2,'deudora','100'),
    ('118','IVA acreditable pagado',2,'deudora','100'),
    ('119','IVA acreditable pendiente de pago',2,'deudora','100'),
    ('120','IEPS acreditable pagado',2,'deudora','100'),
    ('121','IEPS acreditable pendiente de pago',2,'deudora','100'),
    ('151','Terrenos',2,'deudora','100'),
    ('152','Edificios',2,'deudora','100'),
    ('154','Equipo de transporte',2,'deudora','100'),
    ('156','Mobiliario y equipo de oficina',2,'deudora','100'),
    ('158','Equipo de cómputo',2,'deudora','100'),
  ('200','Pasivo',1,'acreedora',NULL),
    ('201','Proveedores',2,'acreedora','200'),
    ('205','Acreedores diversos',2,'acreedora','200'),
    ('208','Impuestos trasladados cobrados',2,'acreedora','200'),
    ('209','Impuestos trasladados pendientes de cobro',2,'acreedora','200'),
    ('210','IEPS trasladado cobrado',2,'acreedora','200'),
    ('211','IEPS trasladado pendiente de cobro',2,'acreedora','200'),
    ('213','Impuestos y derechos por pagar',2,'acreedora','200'),
    ('216','Retenciones ISR por pagar',2,'acreedora','200'),
    ('217','Retenciones IVA por pagar',2,'acreedora','200'),
  ('300','Capital contable',1,'acreedora',NULL),
    ('301','Capital social',2,'acreedora','300'),
    ('305','Utilidad del ejercicio',2,'acreedora','300'),
    ('306','Utilidades acumuladas',2,'acreedora','300'),
    ('307','Pérdidas acumuladas',2,'deudora','300'),
  ('400','Ingresos',1,'acreedora',NULL),
    ('401','Ingresos por ventas',2,'acreedora','400'),
    ('402','Ingresos por servicios',2,'acreedora','400'),
    ('405','Devoluciones, descuentos o bonificaciones sobre ventas',2,'deudora','400'),
    ('407','Otros ingresos',2,'acreedora','400'),
  ('500','Costos',1,'deudora',NULL),
    ('501','Costo de ventas',2,'deudora','500'),
  ('600','Gastos',1,'deudora',NULL),
    ('601','Gastos generales',2,'deudora','600'),
    ('602','Gastos de venta',2,'deudora','600'),
    ('603','Gastos de administración',2,'deudora','600'),
    ('604','Gastos financieros',2,'deudora','600'),
  ('700','Resultado integral de financiamiento',1,'deudora',NULL),
    ('701','Intereses a favor',2,'acreedora','700'),
    ('702','Intereses a cargo',2,'deudora','700'),
    ('703','Utilidad cambiaria',2,'acreedora','700'),
    ('704','Pérdida cambiaria',2,'deudora','700'),
  ('800','Cuentas de orden',1,'deudora',NULL)
ON CONFLICT (codigo) DO NOTHING;


-- ── 10. Seed del plan de cuentas por empresa (para empresas existentes) ─
CREATE OR REPLACE FUNCTION public.seed_cuentas_empresa(_empresa uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; v_padre uuid; v_id uuid;
BEGIN
  -- Nivel 1
  FOR r IN SELECT codigo, nombre, naturaleza FROM public.sat_codigo_agrupador WHERE nivel = 1 ORDER BY codigo LOOP
    INSERT INTO public.cuentas_contables
      (empresa_id, codigo, codigo_agrupador, nombre, naturaleza, nivel, permite_movimientos)
      VALUES (_empresa, r.codigo, r.codigo, r.nombre, r.naturaleza, 1, false)
      ON CONFLICT (empresa_id, codigo) DO NOTHING;
  END LOOP;
  -- Nivel 2 (buscamos padre por empresa+codigo)
  FOR r IN SELECT codigo, nombre, naturaleza, padre FROM public.sat_codigo_agrupador WHERE nivel = 2 ORDER BY codigo LOOP
    SELECT id INTO v_padre FROM public.cuentas_contables WHERE empresa_id = _empresa AND codigo = r.padre;
    INSERT INTO public.cuentas_contables
      (empresa_id, codigo, codigo_agrupador, nombre, naturaleza, nivel, padre_id, permite_movimientos)
      VALUES (_empresa, r.codigo, r.codigo, r.nombre, r.naturaleza, 2, v_padre, true)
      ON CONFLICT (empresa_id, codigo) DO NOTHING;
  END LOOP;

  -- Subcuentas típicas IVA/IEPS por tasa
  SELECT id INTO v_padre FROM public.cuentas_contables WHERE empresa_id = _empresa AND codigo = '118';
  IF v_padre IS NOT NULL THEN
    INSERT INTO public.cuentas_contables (empresa_id, codigo, codigo_agrupador, nombre, naturaleza, nivel, padre_id) VALUES
      (_empresa, '118-01', '118', 'IVA acreditable pagado 16%', 'deudora', 3, v_padre),
      (_empresa, '118-02', '118', 'IVA acreditable pagado 8% (frontera)', 'deudora', 3, v_padre),
      (_empresa, '118-03', '118', 'IVA acreditable pagado 0%', 'deudora', 3, v_padre)
    ON CONFLICT (empresa_id, codigo) DO NOTHING;
  END IF;
  SELECT id INTO v_padre FROM public.cuentas_contables WHERE empresa_id = _empresa AND codigo = '119';
  IF v_padre IS NOT NULL THEN
    INSERT INTO public.cuentas_contables (empresa_id, codigo, codigo_agrupador, nombre, naturaleza, nivel, padre_id) VALUES
      (_empresa, '119-01', '119', 'IVA pendiente de acreditar 16%', 'deudora', 3, v_padre),
      (_empresa, '119-02', '119', 'IVA pendiente de acreditar 8%', 'deudora', 3, v_padre)
    ON CONFLICT (empresa_id, codigo) DO NOTHING;
  END IF;
  SELECT id INTO v_padre FROM public.cuentas_contables WHERE empresa_id = _empresa AND codigo = '208';
  IF v_padre IS NOT NULL THEN
    INSERT INTO public.cuentas_contables (empresa_id, codigo, codigo_agrupador, nombre, naturaleza, nivel, padre_id) VALUES
      (_empresa, '208-01', '208', 'IVA trasladado cobrado 16%', 'acreedora', 3, v_padre),
      (_empresa, '208-02', '208', 'IVA trasladado cobrado 8%', 'acreedora', 3, v_padre),
      (_empresa, '208-03', '208', 'IVA trasladado cobrado 0%', 'acreedora', 3, v_padre)
    ON CONFLICT (empresa_id, codigo) DO NOTHING;
  END IF;
  SELECT id INTO v_padre FROM public.cuentas_contables WHERE empresa_id = _empresa AND codigo = '209';
  IF v_padre IS NOT NULL THEN
    INSERT INTO public.cuentas_contables (empresa_id, codigo, codigo_agrupador, nombre, naturaleza, nivel, padre_id) VALUES
      (_empresa, '209-01', '209', 'IVA por trasladar 16%', 'acreedora', 3, v_padre),
      (_empresa, '209-02', '209', 'IVA por trasladar 8%', 'acreedora', 3, v_padre)
    ON CONFLICT (empresa_id, codigo) DO NOTHING;
  END IF;
  SELECT id INTO v_padre FROM public.cuentas_contables WHERE empresa_id = _empresa AND codigo = '120';
  IF v_padre IS NOT NULL THEN
    INSERT INTO public.cuentas_contables (empresa_id, codigo, codigo_agrupador, nombre, naturaleza, nivel, padre_id) VALUES
      (_empresa, '120-06', '120', 'IEPS acreditable pagado 6% (bebidas saborizadas)', 'deudora', 3, v_padre),
      (_empresa, '120-08', '120', 'IEPS acreditable pagado 8%', 'deudora', 3, v_padre)
    ON CONFLICT (empresa_id, codigo) DO NOTHING;
  END IF;
  SELECT id INTO v_padre FROM public.cuentas_contables WHERE empresa_id = _empresa AND codigo = '210';
  IF v_padre IS NOT NULL THEN
    INSERT INTO public.cuentas_contables (empresa_id, codigo, codigo_agrupador, nombre, naturaleza, nivel, padre_id) VALUES
      (_empresa, '210-06', '210', 'IEPS trasladado cobrado 6% (bebidas saborizadas)', 'acreedora', 3, v_padre),
      (_empresa, '210-08', '210', 'IEPS trasladado cobrado 8%', 'acreedora', 3, v_padre)
    ON CONFLICT (empresa_id, codigo) DO NOTHING;
  END IF;

  -- Ejercicio y periodos del año en curso
  INSERT INTO public.ejercicios_fiscales (empresa_id, anio)
    VALUES (_empresa, extract(year from current_date)::int)
    ON CONFLICT (empresa_id, anio) DO NOTHING;

  INSERT INTO public.periodos_contables (ejercicio_id, empresa_id, anio, mes)
  SELECT e.id, _empresa, e.anio, m
    FROM public.ejercicios_fiscales e
    CROSS JOIN generate_series(1, 12) AS m
   WHERE e.empresa_id = _empresa AND e.anio = extract(year from current_date)::int
  ON CONFLICT (empresa_id, anio, mes) DO NOTHING;
END $fn$;

-- Backfill: para cada empresa activa, siembra el catálogo si aún no lo tiene
DO $$
DECLARE e_id uuid;
BEGIN
  FOR e_id IN SELECT id FROM public.empresas WHERE active = true LOOP
    PERFORM public.seed_cuentas_empresa(e_id);
  END LOOP;
END $$;
