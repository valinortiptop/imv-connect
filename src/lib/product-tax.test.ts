// @ts-nocheck — run with `bun test` (bun:test types are not installed in this project)
import { describe, it, expect } from "bun:test";
import { applyCodigo, matchCodigo, normalizeConfig, taxBreakdown, type TaxConfig } from "./product-tax";

const base: TaxConfig = { iva_modo: "producto", iva_pct: 16, objeto_impuesto: true, ieps_pct: 0, ret_iva_modo: "sin", ret_iva_pct: 0, ret_isr_modo: "sin", ret_isr_pct: 0 };
const codigos = [
  { id: "IVA16", ...base },
  { id: "IVA0", ...base, iva_pct: 0 },
  { id: "EXENTO", ...base, iva_modo: "exento" as const, iva_pct: 0 },
  { id: "IEPS6", ...base, iva_pct: 0, ieps_pct: 6 },
  { id: "RET4", ...base, ret_iva_modo: "producto" as const, ret_iva_pct: 4 },
  { id: "RET1067", ...base, ret_iva_modo: "producto" as const, ret_iva_pct: 10.666667 },
  { id: "ISR10", ...base, ret_isr_modo: "producto" as const, ret_isr_pct: 10 },
  { id: "RESICO", ...base, ret_isr_modo: "producto" as const, ret_isr_pct: 1.25 },
];

describe("product tax codes", () => {
  it("matches each of the 8 codes to itself", () => {
    for (const c of codigos) expect(matchCodigo(c, codigos)?.id).toBe(c.id);
  });
  it("a manual change becomes Personalizado", () => {
    expect(matchCodigo({ ...base, ret_isr_pct: 5, ret_isr_modo: "producto" }, codigos)).toBeNull();
  });
  it("exento forces IVA 0", () => {
    expect(applyCodigo({ ...base, iva_modo: "exento" }).iva_pct).toBe(0);
  });
  it("IEPS 6% + IVA 0% on 106 gives subtotal 100", () => {
    const b = taxBreakdown(106, codigos[3]!);
    expect(b.subtotal).toBeCloseTo(100);
    expect(b.iepsAmt).toBeCloseTo(6);
    expect(b.ivaAmt).toBeCloseTo(0);
  });
  it("flete: IVA 16% and retención IVA 4% over subtotal", () => {
    const b = taxBreakdown(116, codigos[4]!);
    expect(b.ivaAmt).toBeCloseTo(16);
    expect(b.retIva).toBeCloseTo(4);
    expect(b.neto).toBeCloseTo(112);
  });
  it("ISR RESICO retains 1.25%", () => {
    expect(taxBreakdown(116, codigos[7]!).retIsr).toBeCloseTo(1.25);
  });
  it("missing values normalize without inventing retentions", () => {
    const c = normalizeConfig({ iva_pct: "16" });
    expect(c.ret_iva_modo).toBe("sin");
    expect(c.iva_pct).toBe(16);
  });
});
