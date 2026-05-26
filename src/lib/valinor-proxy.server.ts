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
 * Si el proveedor responde !ok, lanza con el body para que el caller decida.
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
    // Algunos endpoints (Maps staticmap, etc.) devuelven binario/texto.
    return text as unknown as T;
  }
}

/* ───────────────────── Helpers tipados por servicio ───────────────────── */

/** Envía un correo transaccional vía Resend (cuenta de Valinor). */
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

/** Chat completion vía OpenAI por el gateway de Valinor. */
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

/** Generate vía Gemini por el gateway de Valinor. */
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
 * Lee el reporte de uso del proyecto desde Valinor.
 * Espera que Valinor exponga `usage-report` con el mismo `x-proxy-token`.
 * Si aún no existe, devuelve `{ items: [], available: false }` para que la UI
 * muestre estado de "pendiente de habilitar".
 */
export async function getValinorUsage(params: {
  from?: string; // ISO date
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
  // Convertimos .../api-proxy → .../usage-report
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
    if (!res.ok) {
      return { available: false, items: [] };
    }
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
