
ALTER TABLE public.laboratorios
  ADD COLUMN IF NOT EXISTS rfc text,
  ADD COLUMN IF NOT EXISTS tipo_tercero text NOT NULL DEFAULT '04',
  ADD COLUMN IF NOT EXISTS tipo_operacion text NOT NULL DEFAULT '85',
  ADD COLUMN IF NOT EXISTS pais text,
  ADD COLUMN IF NOT EXISTS nacionalidad text,
  ADD COLUMN IF NOT EXISTS id_fiscal_extranjero text;
