// Facturapi.io REST client (server-only). Docs: https://docs.facturapi.io/api/
// All calls use Bearer auth with FACTURAPI_KEY (test: sk_test_..., live: sk_live_...).

const BASE = "https://www.facturapi.io/v2";

function apiKey(): string {
  const k = process.env.FACTURAPI_KEY;
  if (!k) throw new Error("FACTURAPI_KEY no está configurado");
  return k;
}

async function fx<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Facturapi ${res.status}: ${text || res.statusText}`);
  }
  // Some endpoints return non-JSON (pdf/xml/zip) — handled by caller via fxRaw
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

async function fxRaw(path: string): Promise<{ body: ArrayBuffer; contentType: string }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Facturapi ${res.status}: ${text || res.statusText}`);
  }
  return {
    body: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
}

// ── Customers ──────────────────────────────────────────────────
export type FxCustomerInput = {
  legal_name: string;
  tax_id: string;          // RFC
  tax_system: string;      // régimen fiscal (código SAT ej. "601", "612")
  email?: string;
  phone?: string;
  address: {
    zip: string;
    street?: string;
    exterior?: string;
    interior?: string;
    neighborhood?: string;
    city?: string;
    municipality?: string;
    state?: string;
    country?: string;
  };
};

export const fxCustomers = {
  create: (data: FxCustomerInput) => fx<any>("/customers", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<FxCustomerInput>) =>
    fx<any>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  retrieve: (id: string) => fx<any>(`/customers/${id}`),
  search: (q: string) => fx<any>(`/customers?q=${encodeURIComponent(q)}`),
};

// ── Products ───────────────────────────────────────────────────
export type FxProductInput = {
  description: string;
  product_key: string;   // ClaveProdServ SAT
  price: number;
  sku?: string;
  unit_key?: string;     // ClaveUnidad SAT
  unit_name?: string;
  tax_included?: boolean;
  taxability?: string;
  taxes?: Array<{ type: "IVA" | "ISR" | "IEPS"; rate: number; withholding?: boolean }>;
};

export const fxProducts = {
  create: (data: FxProductInput) => fx<any>("/products", { method: "POST", body: JSON.stringify(data) }),
  retrieve: (id: string) => fx<any>(`/products/${id}`),
  search: (q: string) => fx<any>(`/products?q=${encodeURIComponent(q)}`),
};

// ── Invoices ───────────────────────────────────────────────────
export type FxInvoiceInput = {
  customer: string | FxCustomerInput; // customer id or inline
  items: Array<{
    quantity: number;
    product: string | FxProductInput; // product id or inline
    discount?: number;
  }>;
  use: string;              // Uso CFDI (G03, P01, etc.)
  payment_form: string;     // "01" efectivo, "03" transferencia, "99" por definir...
  payment_method?: "PUE" | "PPD";
  currency?: string;        // MXN
  folio_number?: number;
  series?: string;
  external_id?: string;
};

export const fxInvoices = {
  create: (data: FxInvoiceInput) => fx<any>("/invoices", { method: "POST", body: JSON.stringify(data) }),
  retrieve: (id: string) => fx<any>(`/invoices/${id}`),
  cancel: (id: string, motive: "01" | "02" | "03" | "04", substitution?: string) => {
    const qs = new URLSearchParams({ motive });
    if (substitution) qs.set("substitution", substitution);
    return fx<any>(`/invoices/${id}?${qs.toString()}`, { method: "DELETE" });
  },
  sendByEmail: (id: string, email?: string) =>
    fx<any>(`/invoices/${id}/email`, {
      method: "POST",
      body: JSON.stringify(email ? { email } : {}),
    }),
  downloadPdf: (id: string) => fxRaw(`/invoices/${id}/pdf`),
  downloadXml: (id: string) => fxRaw(`/invoices/${id}/xml`),
  downloadZip: (id: string) => fxRaw(`/invoices/${id}/zip`),
};

// ── Catalogs ───────────────────────────────────────────────────
export const fxCatalogs = {
  products: (q: string) =>
    fx<any>(`/catalogs/products?q=${encodeURIComponent(q)}`),
  units: (q: string) =>
    fx<any>(`/catalogs/units?q=${encodeURIComponent(q)}`),
  taxSystems: () => fx<any>(`/catalogs/tax_systems`),
  usesOfCfdi: () => fx<any>(`/catalogs/uses_cfdi`),
};
