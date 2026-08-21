// Reglas de normalización de nombres de clientes.
//
// En NetSuite / los excels de ventas los clientes llegan como:
//   "ALEJANDRO A BALDERAS CARREÑO : 1928 VM VETERINARIA AALAK"
// donde lo que está antes de ":" es el cliente principal y lo que sigue es
// una subcuenta (con un código interno opcional y las siglas "VM").
//
// Reglas:
//   - los ":" nunca quedan en el nombre; parten padre / subcuenta
//   - se quitan los códigos numéricos al inicio (1928, 2223, ...)
//   - se quitan las siglas "VM" (venta mostrador) en cualquier posición

const VM_TOKEN_RE = /(^|\s)VM(?=\s|$)/gi;
const LEADING_CODE_RE = /^\s*\d{3,5}\s+/;

export const stripVmTokens = (raw: string | null | undefined): string =>
  String(raw ?? "")
    .replace(VM_TOKEN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

export const hasVmToken = (raw: string | null | undefined): boolean =>
  /(^|\s)VM(\s|$)/i.test(String(raw ?? ""));

export const cleanClientName = (raw: string | null | undefined): string =>
  stripVmTokens(String(raw ?? "").replace(LEADING_CODE_RE, ""));

export type ParsedClientName = {
  /** nombre limpio de la cuenta (subcuenta si venía con ":") */
  name: string;
  /** nombre del cliente principal, o null si no es subcuenta */
  parentName: string | null;
  /** venía marcado como venta mostrador */
  wasVm: boolean;
};

export function parseClientName(raw: string | null | undefined): ParsedClientName {
  const s = String(raw ?? "").trim();
  if (!s) return { name: "", parentName: null, wasVm: false };
  const wasVm = hasVmToken(s);
  const idx = s.indexOf(":");
  if (idx === -1) return { name: cleanClientName(s), parentName: null, wasVm };
  const parentName = cleanClientName(s.slice(0, idx));
  const sub = cleanClientName(s.slice(idx + 1));
  return {
    name: sub || parentName,
    parentName: parentName || null,
    wasVm,
  };
}

/** llave para comparar nombres sin acentos, mayúsculas ni signos */
export const clientNameKey = (raw: string | null | undefined): string =>
  cleanClientName(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
