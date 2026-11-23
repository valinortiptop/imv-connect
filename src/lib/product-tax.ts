export type IvaModo = "tipo" | "producto" | "exento";
export type RetModo = "tipo" | "producto" | "sin";

export type TaxConfig = {
  iva_modo: IvaModo;
  iva_pct: number;
  objeto_impuesto: boolean;
  ieps_pct: number;
  ret_iva_modo: RetModo;
  ret_iva_pct: number;
  ret_isr_modo: RetModo;
  ret_isr_pct: number;
};

export type CodigoFiscal = TaxConfig & { id: string; clave: string; nombre: string; orden: number; activo: boolean };

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

export function normalizeConfig(raw: Partial<Record<keyof TaxConfig, unknown>>): TaxConfig {
  return {
    iva_modo: (raw.iva_modo as IvaModo) ?? "producto",
    iva_pct: n(raw.iva_pct),
    objeto_impuesto: raw.objeto_impuesto !== false,
    ieps_pct: n(raw.ieps_pct),
    ret_iva_modo: (raw.ret_iva_modo as RetModo) ?? "sin",
    ret_iva_pct: n(raw.ret_iva_pct),
    ret_isr_modo: (raw.ret_isr_modo as RetModo) ?? "sin",
    ret_isr_pct: n(raw.ret_isr_pct),
  };
}

/** Values to write on productos when applying a code. Keeps iva_pct/ieps_pct in sync. */
export function applyCodigo(c: TaxConfig): TaxConfig {
  return {
    ...c,
    iva_pct: c.iva_modo === "exento" ? 0 : c.iva_pct,
    ret_iva_pct: c.ret_iva_modo === "sin" ? 0 : c.ret_iva_pct,
    ret_isr_pct: c.ret_isr_modo === "sin" ? 0 : c.ret_isr_pct,
  };
}

const eq = (a: number, b: number) => Math.abs(a - b) < 0.000001;

export function sameConfig(a: TaxConfig, b: TaxConfig): boolean {
  const x = applyCodigo(a), y = applyCodigo(b);
  return x.iva_modo === y.iva_modo && eq(x.iva_pct, y.iva_pct) && x.objeto_impuesto === y.objeto_impuesto &&
    eq(x.ieps_pct, y.ieps_pct) && x.ret_iva_modo === y.ret_iva_modo && eq(x.ret_iva_pct, y.ret_iva_pct) &&
    x.ret_isr_modo === y.ret_isr_modo && eq(x.ret_isr_pct, y.ret_isr_pct);
}

/** Finds the code that matches the config exactly, or null = "Personalizado". */
export function matchCodigo<T extends TaxConfig & { id: string }>(cfg: TaxConfig, codigos: T[]): T | null {
  return codigos.find((c) => sameConfig(c, cfg)) ?? null;
}

/**
 * Breakdown from a price WITH IVA/IEPS (how precio_lista is stored).
 * Retentions apply over the subtotal and reduce the amount to collect.
 */
export function taxBreakdown(precioConImpuestos: number, cfg: TaxConfig) {
  const c = applyCodigo(cfg);
  const iva = c.objeto_impuesto && c.iva_modo !== "exento" ? c.iva_pct / 100 : 0;
  const ieps = c.ieps_pct / 100;
  const denom = (1 + iva) * (1 + ieps);
  const subtotal = precioConImpuestos / denom;
  const iepsAmt = subtotal * ieps;
  const ivaAmt = (subtotal + iepsAmt) * iva;
  const retIva = subtotal * (c.ret_iva_pct / 100);
  const retIsr = subtotal * (c.ret_isr_pct / 100);
  const total = subtotal + iepsAmt + ivaAmt;
  return { subtotal, iepsAmt, ivaAmt, retIva, retIsr, total, neto: total - retIva - retIsr };
}

export const IVA_MODO_LABEL: Record<IvaModo, string> = { tipo: "Por tipo de cliente/proveedor", producto: "Por producto", exento: "Exento" };
export const RET_MODO_LABEL: Record<RetModo, string> = { tipo: "Por tipo de cliente/proveedor", producto: "Por producto", sin: "Sin retención" };

export function describeIva(c: TaxConfig) {
  if (!c.objeto_impuesto) return "No objeto";
  if (c.iva_modo === "exento") return "Exento";
  if (c.iva_modo === "tipo") return "Por tipo";
  return `${c.iva_pct}%`;
}
export function describeRet(modo: RetModo, pct: number) {
  if (modo === "sin") return "—";
  if (modo === "tipo") return "Por tipo";
  return `${Number(pct.toFixed(6))}%`;
}
