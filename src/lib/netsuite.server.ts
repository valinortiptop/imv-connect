/**
 * Cliente NetSuite (solo servidor).
 *
 * Autenticación: Token-Based Authentication (TBA) = OAuth 1.0a firmado con
 * HMAC-SHA256. Se firma directamente aquí porque la firma depende de la cuenta
 * (realm) y el proxy de Valinor no la soporta.
 *
 * Transporte: SuiteQL sobre REST
 *   POST https://{account}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql
 *
 * NUNCA importar desde el bundle del cliente.
 */
import { createHmac, randomBytes } from "node:crypto";

export type NetsuiteCreds = {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
};

export function readNetsuiteCreds(): NetsuiteCreds {
  const accountId = process.env["NETSUITE_ACCOUNT_ID"] ?? "";
  const consumerKey = process.env["NETSUITE_CONSUMER_KEY"] ?? "";
  const consumerSecret = process.env["NETSUITE_CONSUMER_SECRET"] ?? "";
  const tokenId = process.env["NETSUITE_TOKEN_ID"] ?? "";
  const tokenSecret = process.env["NETSUITE_TOKEN_SECRET"] ?? "";
  const missing = [
    !accountId && "NETSUITE_ACCOUNT_ID",
    !consumerKey && "NETSUITE_CONSUMER_KEY",
    !consumerSecret && "NETSUITE_CONSUMER_SECRET",
    !tokenId && "NETSUITE_TOKEN_ID",
    !tokenSecret && "NETSUITE_TOKEN_SECRET",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`[netsuite] Faltan secretos: ${missing.join(", ")}`);
  }
  return { accountId, consumerKey, consumerSecret, tokenId, tokenSecret };
}

export function isNetsuiteConfigured(): boolean {
  try {
    readNetsuiteCreds();
    return true;
  } catch {
    return false;
  }
}

/** El host usa el account id en minúsculas con guiones (1234567_SB1 → 1234567-sb1). */
function accountHost(accountId: string): string {
  return accountId.trim().toLowerCase().replace(/_/g, "-");
}

/** El realm de OAuth usa el account id en MAYÚSCULAS con guion bajo. */
function accountRealm(accountId: string): string {
  return accountId.trim().toUpperCase();
}

function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function oauthHeader(
  creds: NetsuiteCreds,
  method: string,
  url: string,
  extraQuery: Record<string, string>,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.tokenId,
    oauth_version: "1.0",
  };

  // La base de firma incluye TODOS los parámetros de query + los oauth_*
  const allParams = { ...extraQuery, ...oauthParams };
  const paramString = Object.keys(allParams)
    .map((k) => [rfc3986(k), rfc3986(allParams[k])] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    rfc3986(url),
    rfc3986(paramString),
  ].join("&");

  const signingKey = `${rfc3986(creds.consumerSecret)}&${rfc3986(creds.tokenSecret)}`;
  const signature = createHmac("sha256", signingKey).update(baseString).digest("base64");

  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
    realm: accountRealm(creds.accountId),
  };

  return `OAuth ${Object.entries(headerParams)
    .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
    .join(", ")}`;
}

export type SuiteQLPage<T> = {
  items: T[];
  hasMore: boolean;
  totalResults?: number;
};

/** Una página de SuiteQL. `limit` máximo permitido por NetSuite = 1000. */
export async function suiteqlPage<T = Record<string, unknown>>(
  sql: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<SuiteQLPage<T>> {
  const creds = readNetsuiteCreds();
  const limit = Math.min(Math.max(opts.limit ?? 1000, 1), 1000);
  const offset = Math.max(opts.offset ?? 0, 0);

  const baseUrl = `https://${accountHost(creds.accountId)}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;
  const query = { limit: String(limit), offset: String(offset) };
  const url = `${baseUrl}?limit=${limit}&offset=${offset}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: oauthHeader(creds, "POST", baseUrl, query),
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "transient",
    },
    body: JSON.stringify({ q: sql }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `[netsuite] SuiteQL ${res.status}: ${text.slice(0, 800)}`,
    );
  }
  let json: {
    items?: T[];
    hasMore?: boolean;
    totalResults?: number;
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`[netsuite] Respuesta no JSON: ${text.slice(0, 400)}`);
  }
  return {
    items: json.items ?? [],
    hasMore: Boolean(json.hasMore),
    totalResults: json.totalResults,
  };
}

/** Recorre todas las páginas de una consulta SuiteQL. */
export async function suiteqlAll<T = Record<string, unknown>>(
  sql: string,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 1000;
  const maxRows = opts.maxRows ?? 200_000;
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await suiteqlPage<T>(sql, { limit: pageSize, offset });
    out.push(...page.items);
    if (!page.hasMore || page.items.length === 0 || out.length >= maxRows) break;
    offset += page.items.length;
  }
  return out;
}

/** Prueba de conexión ligera. */
export async function pingNetsuite(): Promise<{
  ok: boolean;
  account?: string;
  companyName?: string;
  error?: string;
}> {
  try {
    const creds = readNetsuiteCreds();
    const page = await suiteqlPage<{ companyname?: string; id?: string }>(
      "SELECT companyname, id FROM companyinformation",
      { limit: 1 },
    );
    const row = page.items[0];
    return {
      ok: true,
      account: creds.accountId,
      companyName: row?.companyname ?? undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
