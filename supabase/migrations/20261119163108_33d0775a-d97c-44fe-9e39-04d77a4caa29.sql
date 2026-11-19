CREATE OR REPLACE FUNCTION public._alm_next_folio(_prefix text, _table regclass)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer;
begin
  if _prefix is null or _prefix !~ '^[A-Za-z0-9_]{1,20}$' then
    raise exception 'Prefijo de folio inválido';
  end if;
  execute format(
    'select coalesce(max(nullif(regexp_replace(folio, %L, ''''), '''')::integer),0)+1 from %s where folio like %L',
    '^' || _prefix || '-', _table::text, _prefix || '-%')
  into v_n;
  return _prefix || '-' || lpad(v_n::text, 6, '0');
end $function$;

REVOKE EXECUTE ON FUNCTION public._alm_next_folio(text, regclass) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._alm_next_folio(text, regclass) TO service_role;