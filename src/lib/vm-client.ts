// Helpers for "Venta Mostrador" (VM) client detection and display.
// VM clients are walk-in / generic-RFC clients that don't require an
// official invoice (just a nota or recibo).
export const GENERIC_RFC = "XAXX010101000";
export const GENERIC_RFCS = new Set([GENERIC_RFC, "XEXX010101000"]);

const VM_PREFIX_RE = /^\s*VM[\s.\-:_]+/i;

export function stripVmPrefix(name: string | null | undefined): string {
  if (!name) return "";
  return String(name).replace(VM_PREFIX_RE, "").trim();
}

export function hadVmPrefix(name: string | null | undefined): boolean {
  return !!name && VM_PREFIX_RE.test(String(name));
}

export function isGenericRfc(rfc: string | null | undefined): boolean {
  if (!rfc) return false;
  return GENERIC_RFCS.has(String(rfc).toUpperCase().trim());
}

export function isVmClient(c: {
  name?: string | null;
  company?: string | null;
  razon_social?: string | null;
  nombre_comercial?: string | null;
  rfc?: string | null;
}): boolean {
  return (
    hadVmPrefix(c.name) ||
    hadVmPrefix(c.company) ||
    hadVmPrefix(c.razon_social) ||
    hadVmPrefix(c.nombre_comercial) ||
    isGenericRfc(c.rfc)
  );
}
