CREATE OR REPLACE FUNCTION public.list_pedidos_por_facturar()
 RETURNS TABLE(id uuid, folio text, order_code text, cliente_id uuid, cliente text, rfc text, estado text, delivery_date date, subtotal numeric, iva numeric, total numeric, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id,
    p.folio,
    p.order_code,
    p.cliente_id,
    coalesce(c.razon_social, c.nombre_comercial) as cliente,
    c.rfc,
    p.estado::text as estado,
    p.delivery_date,
    p.subtotal,
    p.iva,
    p.total,
    p.created_at
  from public.pedidos p
  left join public.clientes c on c.id = p.cliente_id
  where p.estado::text not in ('cancelado','Cancelado','Pendiente portal','Pendiente aprobación')
    and not exists (select 1 from public.facturas f where f.pedido_id = p.id)
    and exists (
      select 1 from public.remisiones r
      where r.pedido_id = p.id
        and coalesce(r.estado, '') <> 'cancelada'
    )
  order by p.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.list_pedidos_sin_remisionar()
 RETURNS TABLE(id uuid, folio text, order_code text, cliente_id uuid, cliente text, rfc text, estado text, delivery_date date, subtotal numeric, iva numeric, total numeric, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id,
    p.folio,
    p.order_code,
    p.cliente_id,
    coalesce(c.razon_social, c.nombre_comercial) as cliente,
    c.rfc,
    p.estado::text as estado,
    p.delivery_date,
    p.subtotal,
    p.iva,
    p.total,
    p.created_at
  from public.pedidos p
  left join public.clientes c on c.id = p.cliente_id
  where p.estado::text not in ('cancelado','Cancelado','Pendiente portal','Pendiente aprobación')
    and not exists (select 1 from public.facturas f where f.pedido_id = p.id)
    and not exists (
      select 1 from public.remisiones r
      where r.pedido_id = p.id
        and coalesce(r.estado, '') <> 'cancelada'
    )
  order by p.created_at desc;
$function$;

REVOKE ALL ON FUNCTION public.list_pedidos_por_facturar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_pedidos_sin_remisionar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pedidos_por_facturar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pedidos_sin_remisionar() TO authenticated;