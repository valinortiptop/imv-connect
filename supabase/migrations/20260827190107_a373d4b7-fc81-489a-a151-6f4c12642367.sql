-- 1) Restore INSTEAD OF triggers on the clients view (view has a join => not auto-updatable)
CREATE OR REPLACE FUNCTION public.clients_iud_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
begin
  if tg_op = 'INSERT' then
    insert into public.clientes (
      id, razon_social, nombre_comercial, company, central, curp, codigo_postal, nombre_cfdi,
      contact, phone, telefono, email, direccion,
      lat, lng, google_place_id,
      rfc, client_type, payment_method, active, cfdi_pdf_path, notas,
      delivery_window_from, delivery_window_until, delivery_notes,
      price_list_id, payment_terms, credit_limit,
      representante_id, parent_cliente_id
    ) values (
      coalesce(new.id, gen_random_uuid()),
      coalesce(new.razon_social, new.name, ''),
      new.nickname, new.company, new.central, new.curp, new.codigo_postal, new.nombre_cfdi,
      new.contact, new.phone, new.phone, new.email,
      new.address,
      new.lat, new.lng, new.google_place_id,
      new.rfc, coalesce(new.client_type,'menudeo'), new.payment_method,
      coalesce(new.active, true), new.cfdi_pdf_path, new.notes,
      new.delivery_window_from, new.delivery_window_until, new.delivery_notes,
      new.price_list_id, new.payment_terms, new.credit_limit,
      new.representante_id, new.parent_cliente_id
    ) returning id into new.id;
    return new;
  elsif tg_op = 'UPDATE' then
    update public.clientes set
      razon_social          = coalesce(new.razon_social, new.name, razon_social),
      nombre_comercial      = new.nickname,
      company               = new.company,
      central               = new.central,
      curp                  = new.curp,
      codigo_postal         = new.codigo_postal,
      nombre_cfdi           = new.nombre_cfdi,
      contact               = new.contact,
      phone                 = new.phone,
      telefono              = coalesce(new.phone, telefono),
      email                 = new.email,
      direccion             = new.address,
      lat                   = new.lat,
      lng                   = new.lng,
      google_place_id       = new.google_place_id,
      rfc                   = new.rfc,
      client_type           = coalesce(new.client_type, client_type),
      payment_method        = new.payment_method,
      active                = coalesce(new.active, active),
      cfdi_pdf_path         = new.cfdi_pdf_path,
      notas                 = new.notes,
      delivery_window_from  = new.delivery_window_from,
      delivery_window_until = new.delivery_window_until,
      delivery_notes        = new.delivery_notes,
      price_list_id         = new.price_list_id,
      payment_terms         = new.payment_terms,
      credit_limit          = new.credit_limit,
      representante_id      = new.representante_id,
      parent_cliente_id     = new.parent_cliente_id,
      updated_at            = now()
    where id = old.id;
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.clientes where id = old.id;
    return old;
  end if;
  return null;
end
$fn$;

DROP TRIGGER IF EXISTS clients_instead_of_insert ON public.clients;
DROP TRIGGER IF EXISTS clients_instead_of_update ON public.clients;
DROP TRIGGER IF EXISTS clients_instead_of_delete ON public.clients;

CREATE TRIGGER clients_instead_of_insert INSTEAD OF INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_iud_trigger();
CREATE TRIGGER clients_instead_of_update INSTEAD OF UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_iud_trigger();
CREATE TRIGGER clients_instead_of_delete INSTEAD OF DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_iud_trigger();

-- 2) Merge duplicate sub-accounts that carry the exact same name as their parent
--    and have no distinguishing data of their own.
DO $mig$
DECLARE
  r record;
  fk record;
BEGIN
  FOR r IN
    SELECT c.id AS dup_id, c.parent_cliente_id AS keep_id
    FROM public.clientes c
    JOIN public.clientes p ON p.id = c.parent_cliente_id
    WHERE c.razon_social = p.razon_social
      AND c.direccion IS NULL AND c.rfc IS NULL AND c.email IS NULL
      AND c.telefono IS NULL AND c.phone IS NULL
  LOOP
    FOR fk IN
      SELECT con.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint con
      JOIN unnest(con.conkey) k ON true
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
      WHERE con.confrelid = 'public.clientes'::regclass
        AND con.contype = 'f'
        AND con.conrelid <> 'public.clientes'::regclass
    LOOP
      BEGIN
        EXECUTE format('UPDATE %s SET %I = %L WHERE %I = %L', fk.tbl, fk.col, r.keep_id, fk.col, r.dup_id);
      EXCEPTION WHEN unique_violation THEN
        EXECUTE format('DELETE FROM %s WHERE %I = %L', fk.tbl, fk.col, r.dup_id);
      END;
    END LOOP;

    UPDATE public.clientes SET parent_cliente_id = r.keep_id WHERE parent_cliente_id = r.dup_id;
    DELETE FROM public.clientes WHERE id = r.dup_id;
  END LOOP;
END
$mig$;