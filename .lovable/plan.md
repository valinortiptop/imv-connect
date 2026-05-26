
## Resumen corto

Valinor Studio ya tiene toda la infraestructura lista para esto. Su edge function `api-proxy` actúa como **gateway central**: recibe llamadas autenticadas con un `x-proxy-token` por proyecto, las reenvía al proveedor real (OpenAI, Anthropic, Gemini, Perplexity, Resend, Google Maps, y proveedores dinámicos como Stripe/Hotelbeds), y registra cada llamada en `api_usage_logs` con tokens, costo estimado, duración y `project_id`.

**No hay que reimplementar nada en Valinor.** Solo hay que:
1. Registrar este proyecto (IMV Portal) dentro de Valinor y emitirle un `proxy_token`.
2. En IMV, guardar ese token como secret y llamar al proxy en vez de a las APIs directamente.

Así Valinor cobra/audita el uso y IMV no tiene que mantener claves de OpenAI, Resend, Twilio (cuando se agregue), etc.

---

## Cómo funciona el proxy de Valinor (resumen técnico)

- Endpoint: `POST https://<valinor-supabase-ref>.functions.supabase.co/api-proxy`
- Header obligatorio: `x-proxy-token: <token emitido por Valinor>`
- Body:
  ```json
  {
    "provider": "openai" | "anthropic" | "gemini" | "perplexity" | "resend" | "google" | "<dinámico>",
    "endpoint": "/v1/chat/completions",
    "method": "POST",         // opcional, default POST (GET para Maps)
    "payload": { ... }        // se reenvía al proveedor
  }
  ```
- Valinor valida el token contra `project_api_keys` (`service_name='Valinor'`, `key_label='proxy_token'`), inyecta la clave real del proveedor desde sus secrets, hace la llamada, y guarda en `api_usage_logs`:
  - `project_id` (el de IMV) → así Valinor sabe quién consumió
  - `provider`, `model`, `input_tokens`, `output_tokens`, `estimated_cost`, `duration_ms`, `status`, `endpoint`
- Resend: reescribe automáticamente el `from` a `noreply@valinor.studio` si el dominio no está verificado (con `reply_to` al original). Para usar tu propio dominio (`imv.mx` p.ej.) hay que verificarlo en Resend de Valinor o agregarlo a `VERIFIED_DOMAINS`.

---

## Plan de implementación

### Paso 1 — En Valinor (lo hace el admin de Valinor, fuera de este proyecto)
1. Abrir Valinor → admin/projects → crear/seleccionar el proyecto **"IMV Portal"**.
2. Generar un registro en `project_api_keys`:
   - `project_id` = id del proyecto IMV en Valinor
   - `service_name = 'Valinor'`
   - `key_label = 'proxy_token'`
   - `key_value` = token aleatorio (UUID o `crypto.randomUUID()`)
   - `is_active = true`
3. Copiar ese token — se entrega a IMV una sola vez.

(Si Valinor no tiene UI para esto todavía, se hace por SQL directo en su Supabase.)

### Paso 2 — En IMV Portal (este proyecto)
1. **Guardar secrets** (vía `secrets--add_secret`):
   - `VALINOR_PROXY_URL` — URL completa del edge function de Valinor
   - `VALINOR_PROXY_TOKEN` — el token emitido en el paso 1
2. **Crear un cliente proxy** `src/lib/valinor-proxy.server.ts`:
   ```ts
   export async function callValinor<T>(opts: {
     provider: string;
     endpoint: string;
     payload?: unknown;
     method?: 'GET' | 'POST';
   }): Promise<T> {
     const res = await fetch(process.env.VALINOR_PROXY_URL!, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'x-proxy-token': process.env.VALINOR_PROXY_TOKEN!,
       },
       body: JSON.stringify(opts),
     });
     if (!res.ok) throw new Error(`Valinor proxy ${res.status}: ${await res.text()}`);
     return res.json() as Promise<T>;
   }
   ```
3. **Server functions tipadas por servicio** en `src/lib/ai.functions.ts`, `src/lib/email.functions.ts`, etc., que usen `callValinor` internamente. Ej.: enviar email de confirmación de pedido vía `provider: 'resend'`, generar resumen de cobranza vía `provider: 'openai'`.
4. **Marcar en el checklist de onboarding** (`onboarding_items`, módulo 10) los items `resend_api_key`, `twilio_credentials`, etc., como **"servido por Valinor"** en vez de pedirlos al cliente IMV — el cliente final ya no tiene que crear cuentas de Resend/Twilio si va a usar el plan de Valinor.

### Paso 3 — Visibilidad de uso para el cliente IMV
En `/admin` agregar una página **"Uso de APIs (Valinor)"** que muestre el consumo del proyecto. Dos opciones:
- **A (rápida):** un edge function en Valinor que exponga `api_usage_logs` filtrado por `project_id` + `proxy_token` y aquí solo se renderiza la tabla/gráfica.
- **B (más limpia):** Valinor expone un endpoint REST `GET /api/usage` autenticado con el mismo `x-proxy-token`. IMV lo consume desde un server function y muestra totales por día/proveedor/modelo y costo estimado.

Recomiendo **B**: requiere agregar un edge function chico en Valinor (`usage-report`), pero deja a IMV completamente desacoplado del esquema interno de Valinor.

---

## Lo que NO se cambia
- No se tocan los módulos 1-9 ni la UI existente.
- No se quita la opción de que el cliente IMV use sus propias claves de Resend/Twilio/NetSuite si así lo prefiere — el onboarding sigue pidiéndolas, solo se marca como opcional cuando Valinor las provee.

## Lo que queda pendiente (fuera de este plan)
- Verificación de dominio `imv.mx` en la cuenta Resend de Valinor (para que los correos salgan desde `@imv.mx` y no `@valinor.studio`).
- Twilio: el proxy actual de Valinor **no** incluye Twilio en `PROVIDERS`. Hay que agregarlo en el registry dinámico (`integrations_registry`) o pedir a Valinor que lo añada al switch built-in. Esto va con los módulos diferidos.
- NetSuite: igual, requiere registrarse como provider dinámico en Valinor con `auth_type: 'signature'` (OAuth 1.0a TBA).

## Decisión que necesito de ti
¿Procedo con el endpoint de visibilidad **opción B** (requiere coordinar con Valinor para crear un edge function `usage-report`), o prefieres **opción A** rápida leyendo directo de la tabla por ahora?
