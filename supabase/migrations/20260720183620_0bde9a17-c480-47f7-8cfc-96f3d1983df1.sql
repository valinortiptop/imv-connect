
-- Balanza with optional draft inclusion
CREATE OR REPLACE FUNCTION public.balanza_de_comprobacion(_empresa uuid, _desde date, _hasta date, _incluir_borradores boolean DEFAULT false)
 RETURNS TABLE(cuenta_id uuid, codigo text, nombre text, codigo_agrupador text, naturaleza cta_naturaleza, nivel integer, saldo_inicial numeric, cargos numeric, abonos numeric, saldo_final numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH movs AS (
    SELECT m.cuenta_id,
           sum(CASE WHEN p.fecha < _desde THEN m.cargo ELSE 0 END) AS cargo_prev,
           sum(CASE WHEN p.fecha < _desde THEN m.abono ELSE 0 END) AS abono_prev,
           sum(CASE WHEN p.fecha BETWEEN _desde AND _hasta THEN m.cargo ELSE 0 END) AS cargo_per,
           sum(CASE WHEN p.fecha BETWEEN _desde AND _hasta THEN m.abono ELSE 0 END) AS abono_per
      FROM public.poliza_movimientos m
      JOIN public.polizas p ON p.id = m.poliza_id
     WHERE p.empresa_id = _empresa
       AND (p.estado = 'asentada' OR (_incluir_borradores AND p.estado = 'borrador'))
     GROUP BY m.cuenta_id
  )
  SELECT c.id, c.codigo, c.nombre, c.codigo_agrupador, c.naturaleza, c.nivel,
         (c.saldo_inicial
           + CASE WHEN c.naturaleza = 'deudora'
                  THEN coalesce(mv.cargo_prev,0) - coalesce(mv.abono_prev,0)
                  ELSE coalesce(mv.abono_prev,0) - coalesce(mv.cargo_prev,0) END) AS saldo_inicial,
         coalesce(mv.cargo_per, 0) AS cargos,
         coalesce(mv.abono_per, 0) AS abonos,
         (c.saldo_inicial
           + CASE WHEN c.naturaleza = 'deudora'
                  THEN coalesce(mv.cargo_prev,0) + coalesce(mv.cargo_per,0) - coalesce(mv.abono_prev,0) - coalesce(mv.abono_per,0)
                  ELSE coalesce(mv.abono_prev,0) + coalesce(mv.abono_per,0) - coalesce(mv.cargo_prev,0) - coalesce(mv.cargo_per,0) END) AS saldo_final
    FROM public.cuentas_contables c
    LEFT JOIN movs mv ON mv.cuenta_id = c.id
   WHERE c.empresa_id = _empresa AND c.activa = true
   ORDER BY c.codigo;
$function$;

-- Libro mayor with optional draft inclusion
CREATE OR REPLACE FUNCTION public.libro_mayor_cuenta(_cuenta uuid, _desde date, _hasta date, _incluir_borradores boolean DEFAULT false)
 RETURNS TABLE(fecha date, folio text, tipo poliza_tipo, concepto text, cargo numeric, abono numeric, saldo numeric, poliza_id uuid, uuid_cfdi text, estado text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cta AS (SELECT saldo_inicial, naturaleza FROM public.cuentas_contables WHERE id = _cuenta),
  prev AS (
    SELECT coalesce(sum(m.cargo),0) AS c, coalesce(sum(m.abono),0) AS a
      FROM public.poliza_movimientos m JOIN public.polizas p ON p.id = m.poliza_id
     WHERE m.cuenta_id = _cuenta
       AND (p.estado = 'asentada' OR (_incluir_borradores AND p.estado = 'borrador'))
       AND p.fecha < _desde
  ),
  base AS (
    SELECT c.saldo_inicial
         + CASE WHEN c.naturaleza = 'deudora' THEN prev.c - prev.a ELSE prev.a - prev.c END AS s
      FROM cta c, prev
  ),
  detalle AS (
    SELECT p.fecha, p.folio, p.tipo, coalesce(m.concepto, p.concepto) AS concepto,
           m.cargo, m.abono, p.id AS poliza_id, m.uuid_cfdi, p.estado::text AS estado,
           row_number() OVER (ORDER BY p.fecha, p.folio, m.orden, m.id) AS rn,
           c.naturaleza
      FROM public.poliza_movimientos m
      JOIN public.polizas p ON p.id = m.poliza_id
      JOIN public.cuentas_contables c ON c.id = m.cuenta_id
     WHERE m.cuenta_id = _cuenta
       AND (p.estado = 'asentada' OR (_incluir_borradores AND p.estado = 'borrador'))
       AND p.fecha BETWEEN _desde AND _hasta
  )
  SELECT d.fecha, d.folio, d.tipo, d.concepto, d.cargo, d.abono,
         (SELECT s FROM base) + sum(
           CASE WHEN d.naturaleza = 'deudora' THEN d.cargo - d.abono ELSE d.abono - d.cargo END
         ) OVER (ORDER BY d.rn) AS saldo,
         d.poliza_id, d.uuid_cfdi, d.estado
    FROM detalle d
   ORDER BY d.rn;
$function$;
