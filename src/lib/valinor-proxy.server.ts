/**
 * Cliente del API Gateway de Valinor Studio.
 *
 * Valinor expone un único edge function (`api-proxy`) que reenvía peticiones
 * a OpenAI, Anthropic, Gemini, Perplexity, Resend, Google Maps y cualquier
 * proveedor registrado dinámicamente. Cada llamada queda registrada en
 * `api_usage_logs` del lado de Valinor con el `project_id` que emitió el
 * `proxy_token`, así Valinor puede facturar/auditar el consumo.
 *
 * Server-only: nunca importar desde el bundle del cliente.
 */

export type ValinorProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "perplexity"
  | "resend"
  | "google"
  | (string & {});

export type ValinorCallOptions = {
  provider: ValinorProvider;
  /** Ruta del proveedor, ej. "/v1/chat/completions" o "/emails". */
  endpoint: string;
  /** Body que se reenvía al proveedor. */
  payload?: unknown;
  /** Default POST (Maps usa GET). */
  method?: "GET" | "POST";
};

function readEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[valinor-proxy] Missing env: ${name}`);
  return v;
}

/**
 * Llama al proxy de Valinor. Devuelve el JSON crudo del proveedor.
 */
export async function callValinor<T = unknown>(
  opts: ValinorCallOptions,
): Promise<T> {
  const url = readEnv("VALINOR_PROXY_URL");
  const token = readEnv("VALINOR_PROXY_TOKEN");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-proxy-token": token,
    },
    body: JSON.stringify(opts),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `[valinor-proxy] ${opts.provider} ${opts.endpoint} → ${res.status}: ${text.slice(0, 500)}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * Like callValinor but returns the raw Response so binary bodies
 * (PNG tiles, static map images) pass through unchanged.
 */
export async function callValinorRaw(opts: ValinorCallOptions): Promise<Response> {
  const url = readEnv("VALINOR_PROXY_URL");
  const token = readEnv("VALINOR_PROXY_TOKEN");
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-proxy-token": token },
    body: JSON.stringify(opts),
  });
}

/* ───────────────────── Helpers tipados por servicio ───────────────────── */

export async function sendEmail(input: {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
}) {
  return callValinor<{ id: string }>({
    provider: "resend",
    endpoint: "/emails",
    payload: input,
  });
}

export async function openaiChat(input: {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
}) {
  return callValinor<{
    choices: { message: { role: string; content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }>({
    provider: "openai",
    endpoint: "/v1/chat/completions",
    payload: input,
  });
}

export async function geminiGenerate(input: {
  model: string;
  contents: unknown;
}) {
  return callValinor({
    provider: "gemini",
    endpoint: `/v1beta/models/${input.model}:generateContent`,
    payload: { contents: input.contents },
  });
}

/**
 * Gemini con archivos inline (PDF/imagen) + prompt de texto.
 * `parts` es la mezcla de bloques { text } y { inline_data: { mime_type, data(base64) } }.
 * Pide JSON estricto al modelo via response_mime_type.
 */
export async function geminiGenerateInline(input: {
  model: string;
  parts: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  >;
  jsonMode?: boolean;
}) {
  const payload: Record<string, unknown> = {
    contents: [{ role: "user", parts: input.parts }],
  };
  if (input.jsonMode) {
    payload.generationConfig = { response_mime_type: "application/json" };
  }
  return callValinor<{
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  }>({
    provider: "gemini",
    endpoint: `/v1beta/models/${input.model}:generateContent`,
    payload,
  });
}

/* ───────────────────── Google Maps (Places + Geocoding) ───────────────── */

function buildMapsEndpoint(path: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") qs.set(k, String(v));
  }
  return `${path}?${qs.toString()}`;
}

export async function googlePlacesAutocomplete(input: {
  query: string;
  sessiontoken?: string;
  country?: string;
  language?: string;
}) {
  const endpoint = buildMapsEndpoint("/maps/api/place/autocomplete/json", {
    input: input.query,
    sessiontoken: input.sessiontoken,
    components: input.country ? `country:${input.country}` : undefined,
    language: input.language ?? "es",
  });
  return callValinor<{
    status: string;
    predictions?: Array<{
      description: string;
      place_id: string;
      structured_formatting?: { main_text?: string; secondary_text?: string };
    }>;
    error_message?: string;
  }>({ provider: "google", endpoint, method: "GET" });
}

export async function googlePlaceDetails(input: {
  place_id: string;
  sessiontoken?: string;
  language?: string;
}) {
  const endpoint = buildMapsEndpoint("/maps/api/place/details/json", {
    place_id: input.place_id,
    sessiontoken: input.sessiontoken,
    language: input.language ?? "es",
    fields: "formatted_address,address_components,geometry,name,place_id",
  });
  return callValinor<{
    status: string;
    result?: {
      formatted_address?: string;
      place_id?: string;
      geometry?: { location?: { lat: number; lng: number } };
      address_components?: Array<{
        long_name: string;
        short_name: string;
        types: string[];
      }>;
    };
    error_message?: string;
  }>({ provider: "google", endpoint, method: "GET" });
}

export async function googleGeocode(input: {
  address: string;
  region?: string;
  language?: string;
}) {
  const endpoint = buildMapsEndpoint("/maps/api/geocode/json", {
    address: input.address,
    region: input.region ?? "mx",
    language: input.language ?? "es",
  });
  return callValinor<{
    status: string;
    results?: Array<{
      formatted_address: string;
      place_id: string;
      geometry?: { location?: { lat: number; lng: number } };
      address_components?: Array<{
        long_name: string;
        short_name: string;
        types: string[];
      }>;
    }>;
    error_message?: string;
  }>({ provider: "google", endpoint, method: "GET" });
}

export async function googleDirections(input: {
  origin: string;
  destination: string;
  waypoints?: string[];
  optimize?: boolean;
  mode?: "driving" | "walking" | "bicycling" | "transit";
  language?: string;
}) {
  const wp =
    input.waypoints && input.waypoints.length > 0
      ? `${input.optimize ? "optimize:true|" : ""}${input.waypoints.join("|")}`
      : undefined;
  const endpoint = buildMapsEndpoint("/maps/api/directions/json", {
    origin: input.origin,
    destination: input.destination,
    waypoints: wp,
    mode: input.mode ?? "driving",
    language: input.language ?? "es",
    region: "mx",
  });
  return callValinor<{
    status: string;
    routes?: Array<{
      overview_polyline?: { points?: string };
      waypoint_order?: number[];
      legs?: Array<{
        distance?: { text?: string; value?: number };
        duration?: { text?: string; value?: number };
        start_address?: string;
        end_address?: string;
      }>;
    }>;
    error_message?: string;
  }>({ provider: "google", endpoint, method: "GET" });
}




/**
 * Lee el reporte de uso del proyecto desde Valinor.
 */
export async function getValinorUsage(params: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<{
  available: boolean;
  items: Array<{
    created_at: string;
    provider: string;
    model: string | null;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost: number;
    duration_ms: number;
    status: string;
    endpoint?: string;
  }>;
  totals?: {
    calls: number;
    total_tokens: number;
    estimated_cost: number;
  };
}> {
  const baseUrl = process.env.VALINOR_PROXY_URL;
  const token = process.env.VALINOR_PROXY_TOKEN;
  if (!baseUrl || !token) {
    return { available: false, items: [] };
  }
  const reportUrl = baseUrl.replace(/\/api-proxy\/?$/, "/usage-report");
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.limit) qs.set("limit", String(params.limit));

  try {
    const res = await fetch(`${reportUrl}?${qs.toString()}`, {
      method: "GET",
      headers: { "x-proxy-token": token },
    });
    if (!res.ok) return { available: false, items: [] };
    const data = (await res.json()) as {
      items?: unknown[];
      totals?: { calls: number; total_tokens: number; estimated_cost: number };
    };
    return {
      available: true,
      items: (data.items ?? []) as never,
      totals: data.totals,
    };
  } catch {
    return { available: false, items: [] };
  }
}

/* ───────────────────── Health-checks por proveedor ───────────────────── */

export type ProviderPing = {
  provider: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
};

async function timed(fn: () => Promise<unknown>): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: (e as Error).message };
  }
}

export async function pingProviders(): Promise<ProviderPing[]> {
  const checks: Array<{ provider: string; run: () => Promise<unknown> }> = [
    {
      provider: "gemini",
      run: () =>
        callValinor({
          provider: "gemini",
          endpoint: "/v1beta/models/gemini-flash-latest:generateContent",
          payload: { contents: [{ role: "user", parts: [{ text: "ping" }] }] },
        }),
    },
    {
      provider: "openai",
      run: () =>
        callValinor({
          provider: "openai",
          endpoint: "/v1/chat/completions",
          payload: {
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          },
        }),
    },
    {
      provider: "anthropic",
      run: () =>
        callValinor({
          provider: "anthropic",
          endpoint: "/v1/messages",
          // claude-3-5-haiku-latest fue retirado; usamos el modelo Sonnet vigente.
          payload: {
            model: "claude-sonnet-4-5",
            max_tokens: 16,
            messages: [{ role: "user", content: "ping" }],
          },
        }),
    },
    {
      provider: "perplexity",
      run: () =>
        callValinor({
          provider: "perplexity",
          endpoint: "/chat/completions",
          // Perplexity exige max_tokens >= 16.
          payload: {
            model: "sonar",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 16,
          },
        }),
    },
    {
      provider: "resend",
      // La llave de Resend está restringida a sending-only, por lo que GET /domains
      // devuelve 401. Probamos un envío "dry-run" al inbox sandbox de Resend.
      run: () =>
        callValinor({
          provider: "resend",
          endpoint: "/emails",
          method: "POST",
          payload: {
            from: "onboarding@resend.dev",
            to: "delivered@resend.dev",
            subject: "Valinor health-check",
            text: "ping",
          },
        }),
    },
    {
      provider: "google",
      run: () =>
        callValinor({
          provider: "google",
          endpoint: "/maps/api/geocode/json?address=Mexico",
          method: "GET",
        }),
    },
  ];

  const results = await Promise.all(
    checks.map(async (c) => {
      const r = await timed(c.run);
      // Extraemos el código HTTP del mensaje de error si existe.
      const statusMatch = r.error?.match(/→ (\d+):/);
      const status = statusMatch ? Number(statusMatch[1]) : r.ok ? 200 : null;
      return {
        provider: c.provider,
        ok: r.ok,
        status,
        ms: r.ms,
        error: r.error,
      } satisfies ProviderPing;
    }),
  );
  return results;
}
