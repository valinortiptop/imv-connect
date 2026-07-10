DROP VIEW IF EXISTS public.clients;
CREATE VIEW public.clients AS
SELECT id,
    razon_social,
    razon_social AS name,
    nombre_comercial AS nickname,
    company,
    central,
    curp,
    codigo_postal,
    nombre_cfdi,
    contact,
    COALESCE(phone, telefono) AS phone,
    email,
    direccion AS address,
    lat,
    lng,
    google_place_id,
    rfc,
    client_type,
    payment_method,
    active,
    cfdi_pdf_path,
    notas AS notes,
    delivery_window_from,
    delivery_window_until,
    delivery_notes,
    price_list_id,
    payment_terms,
    credit_limit,
    token_portal,
    portal_activo,
    created_at,
    updated_at,
    representante_id,
    required_documents
FROM public.clientes;

GRANT SELECT ON public.clients TO anon, authenticated;
GRANT ALL ON public.clients TO service_role;

NOTIFY pgrst, 'reload schema';