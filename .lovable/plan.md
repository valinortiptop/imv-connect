# Plan: Valinor end-to-end + IA en Onboarding

## 1. Verificar conexión con Valinor
- Invocar `getUsageReportFn` desde el preview y revisar logs del server.
- Si el fetch a `/usage-report` falla, confirmar que `VALINOR_PROXY_URL` termina en `/api-proxy` (la función reemplaza `/api-proxy` → `/usage-report`). Si no, ajustar el reemplazo para soportar ambos formatos.
- Hacer un ping real al gateway con un `aiChatFn` mínimo (gemini-2.0-flash) para generar al menos 1 registro en `api_usage_logs` de Valinor y validar el flujo completo.

## 2. Mejorar `/admin/uso-apis`
- Filtros de rango: 24h / 7d / 30d / personalizado (envía `from`/`to` a `getUsageReportFn`).
- Botón "Actualizar" + `useQuery` con `staleTime`.
- Desglose por proveedor (tabla agregada: calls, tokens, costo).
- Empty state claro cuando `available=true` pero `items=[]`.
- Indicador de "última actualización".

## 3. Panel de estado de APIs (Settings → Estado de APIs)
- Nueva ruta `src/routes/admin.estado-apis.tsx` y entrada en sidebar bajo "integraciones".
- Nuevo server fn `pingProvidersFn` que, para cada proveedor configurado en Valinor (openai, gemini, anthropic, perplexity, resend, google), hace una llamada *ligera* a través del proxy:
  - openai: `GET /v1/models`
  - gemini: `GET /v1beta/models`
  - anthropic: `POST /v1/messages` con 1 token
  - perplexity: `GET /models` (o chat mínimo)
  - resend: `GET /domains`
  - google maps: `GET /maps/api/geocode/json?address=test`
- Devuelve `{ provider, ok, status, ms, error? }[]`.
- UI con badges verde/rojo/gris y latencia. Auto-refresh manual.

## 4. Flujo concreto: IA en Onboarding (Gemini vía Valinor)
Objetivo: el admin sube un documento (PDF/imagen/texto) o lo arrastra al onboarding, Gemini lo analiza, **propone** la categoría y campos a llenar; el admin **revisa y confirma** antes de persistir.

### 4.1 UI en `/admin/onboarding`
- Dropzone global "Subir documento sin clasificar" arriba del checklist.
- Aceptar PDF, PNG, JPG, DOCX, TXT (≤ 10 MB).
- Mientras analiza: spinner + nombre del archivo.
- Resultado: modal con
  - categoría sugerida + clave de item sugerida (con confianza %),
  - resumen del contenido,
  - campos extraídos (RFC, razón social, dirección, correos, etc.),
  - selector para corregir item destino,
  - botones "Adjuntar al item" / "Guardar como nota" / "Descartar".
- Al confirmar: sube a Storage (`onboarding/<clave>/...`), inserta en `onboarding_archivos`, actualiza `onboarding_items.valor_texto` / `notas` / `estado='entregado'`.

### 4.2 Server fn `analyzeOnboardingDocFn`
- Input (Zod): `{ filename, mime, base64 }` (≤ ~8 MB en base64).
- Flujo:
  1. Cargar lista de items (`clave`, `titulo`, `categoria`) desde Supabase (admin) para que el prompt conozca el catálogo real.
  2. Llamar `callValinor` con `provider:"gemini"`, modelo `gemini-2.0-flash`, endpoint `/v1beta/models/gemini-2.0-flash:generateContent`, enviando el archivo como `inline_data` (Gemini acepta PDFs/imágenes nativamente). DOCX/TXT se mandan como texto extraído (mammoth / texto plano) para evitar binarios no soportados.
  3. Prompt pide JSON estricto:
     ```json
     {
       "categoria": "...",
       "item_clave_sugerida": "...",
       "confianza": 0.0-1.0,
       "resumen": "...",
       "campos": { "rfc": "...", "razon_social": "...", ... },
       "texto_para_notas": "..."
     }
     ```
  4. Devuelve también el `usage` de Gemini para que quede registrado en Valinor.
- No persiste nada: solo devuelve la sugerencia. La escritura ocurre en otra acción tras confirmación del admin para evitar errores.

### 4.3 Persistencia tras confirmar
- Reusar la lógica actual de `uploadFile` en `admin.onboarding.tsx`, pero permitiendo elegir el `item` destino dinámicamente (no atado al input por item).
- Si el admin acepta los `campos`, hacer un `update` en `onboarding_items` con `valor_texto` (serializado JSON corto) y `notas` con el resumen.

## 5. Detalles técnicos
- `src/lib/valinor-proxy.server.ts`: añadir helper `geminiGenerateInline({ model, parts })` que arme el body con `contents:[{ parts:[ {text}, {inline_data:{mime_type, data}} ] }]` y `generationConfig:{ response_mime_type:"application/json" }`.
- Tamaño máximo del archivo en cliente: 10 MB; rechazar antes de enviar.
- DOCX: usar `mammoth` (ya pure-JS, Worker-safe) para extraer texto; PDF e imágenes van directo a Gemini.
- Todas las llamadas a Gemini se hacen **solo** vía `callValinor` para que queden en `api_usage_logs` de Valinor (cero llamadas directas al provider).
- Sidebar: nuevo grupo "Integraciones" con "Uso de APIs" (ya existe) + "Estado de APIs" (nueva).

## 6. Cambios de archivos
- nuevo: `src/routes/admin.estado-apis.tsx`
- nuevo server fns en `src/lib/valinor.functions.ts`: `pingProvidersFn`, `analyzeOnboardingDocFn`
- ampliado: `src/lib/valinor-proxy.server.ts` (`geminiGenerateInline`, `pingProviders`)
- editado: `src/routes/admin.onboarding.tsx` (dropzone global + modal de revisión)
- editado: `src/routes/admin.uso-apis.tsx` (filtros, refresh, desglose)
- editado: `src/components/admin-sidebar.tsx` (link "Estado de APIs")
- dependencia nueva: `mammoth` (extracción DOCX, server-side)

## 7. Fuera de alcance (no tocar ahora)
- Migrar otros envíos de correo a `sendEmailFn` (se hará cuando el módulo de pedidos/facturación lo necesite).
- Crear nuevos endpoints en Valinor: ya están listos según confirmación previa.
