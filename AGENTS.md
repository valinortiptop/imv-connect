
- All address geocoding goes through `geocodeWithCache` (src/lib/geocoding.server.ts), which checks the `address_geocodes` table (key = SQL `geocode_address_key`) before calling Google via Valinor; why: each address is billed once and no-result addresses are never retried.
- Lists and maps never geocode automatically; clientes/prospects carry `geocode_status` (ok/pendiente/sin_resultado) set by triggers on address change; why: prevents repeated paid lookups on every render.
