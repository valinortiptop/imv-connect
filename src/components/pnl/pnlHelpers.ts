/**
 * Shared helpers for the P&L page and all tab components.
 * Keeping these centralized prevents drift between KPI calculations
 * in the summary cards vs the detail tabs.
 */

export const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
export const mxnFull = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
/** Format a per-unit rate. Keeps up to 2 decimals so $3.5 doesn't round to $4. */
export const mxnRate = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(n);
export const pct = (n: number) => `${n.toFixed(1)}%`;

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parses a `YYYY-MM-DD` date without timezone drift. */
export function parseDate(s: string): Date {
  return new Date(s + "T12:00:00");
}

export function monthKey(d: string): string {
  return d.slice(0, 7);
}

/** Shift a YYYY-MM-DD by N months, clamped to the 1st of the month. */
export function shiftMonth(s: string, months: number): string {
  const d = parseDate(s);
  d.setMonth(d.getMonth() + months);
  return dateStr(d);
}

/** Returns the previous period of the same length as [from..to], for comparisons. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const a = parseDate(from);
  const b = parseDate(to);
  const days = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const prevTo = new Date(a.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: dateStr(prevFrom), to: dateStr(prevTo) };
}

export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export const ROLE_OPTIONS = ["Ventas", "Cobranza", "Logistica", "Administracion", "Gerencia", "Otro"] as const;
export const FREQUENCY_OPTIONS = ["por_dia", "semanal", "quincenal", "mensual"] as const;
export const PAYMENT_METHOD_OPTIONS = ["efectivo", "transferencia", "tarjeta", "otro"] as const;
export const PAYMENT_TYPE_OPTIONS = ["sueldo", "comision", "aguinaldo", "bono", "prestamo", "otro"] as const;

export const EXPENSE_CATEGORIES: Record<string, string[]> = {
  Nomina: ["Sueldos fijos", "Comisiones", "Aguinaldo", "IMSS / prestaciones"],
  Logistica: ["Transporte", "Maniobra", "Gasolina", "Casetas", "Mantenimiento", "Llantas", "Seguros"],
  Oficina: ["Renta", "Luz", "Agua", "Internet", "Telefono", "Papeleria", "Limpieza"],
  Financieros: ["Comisiones bancarias", "Intereses", "Terminales POS"],
  Software: ["Supabase", "Lovable", "Dominios", "Otras herramientas"],
  Impuestos: ["ISR", "IVA a pagar", "Predial", "Nomina"],
  Mercadotecnia: ["Publicidad", "Muestras", "Regalos clientes"],
  Legal: ["Contador", "Abogado", "Tramites"],
  Otros: ["Reparaciones", "Equipo nuevo", "Viajes", "Misc"],
};

export const MAIN_CATEGORIES = Object.keys(EXPENSE_CATEGORIES);

/** Frequency display label */
export function freqLabel(f: string): string {
  switch (f) {
    case "por_dia": return "Por día";
    case "semanal": return "Semanal";
    case "quincenal": return "Quincenal";
    case "mensual": return "Mensual";
    default: return f;
  }
}

/** Role display label (handles accent-free storage) */
export function roleLabel(r: string): string {
  switch (r) {
    case "Logistica": return "Logística";
    case "Administracion": return "Administración";
    default: return r;
  }
}

/** Payment method label */
export function methodLabel(m: string | null | undefined): string {
  if (!m) return "—";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** Payment type label */
export function typeLabel(t: string): string {
  switch (t) {
    case "sueldo": return "Sueldo";
    case "comision": return "Comisión";
    case "aguinaldo": return "Aguinaldo";
    case "bono": return "Bono";
    case "prestamo": return "Préstamo";
    default: return "Otro";
  }
}
