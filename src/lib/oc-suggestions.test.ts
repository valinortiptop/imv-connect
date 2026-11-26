// @ts-nocheck — run with `bun test` (bun:test types are not installed in this project)
import { describe, expect, test } from "bun:test";
import { calcularSugerencias, fechasEntrega, redondearMultiplo } from "./oc-suggestions";

describe("reglas de OC", () => {
  test("redondea al múltiplo de compra", () => {
    expect(redondearMultiplo(7, 6)).toBe(12);
    expect(redondearMultiplo(3.2, 1)).toBe(4);
  });
  test("fecha límite es estimada + 7 días", () => {
    expect(fechasEntrega("2026-11-26", 10)).toEqual({ estimada: "2026-12-06", limite: "2026-12-13" });
  });
  test("sugiere promedio mensual menos existencia", () => {
    const s = calcularSugerencias({
      historial: [
        { producto_id: "a", cantidad: 60, fecha: "2026-10-01", costo: 10, laboratorio_id: "L" },
        { producto_id: "a", cantidad: 60, fecha: "2026-09-01", costo: 10, laboratorio_id: "L" },
      ],
      meses: 3, hoyISO: "2026-11-26", existencia: { a: 10 }, puntoReorden: {}, multiplo: {},
    });
    expect(s[0]?.cantidad).toBe(30);
  });
  test("no sugiere si la existencia supera el punto de reorden", () => {
    const s = calcularSugerencias({
      historial: [{ producto_id: "a", cantidad: 90, fecha: "2026-10-01", costo: 1, laboratorio_id: "L" }],
      meses: 3, hoyISO: "2026-11-26", existencia: { a: 50 }, puntoReorden: { a: 20 }, multiplo: {},
    });
    expect(s.length).toBe(0);
  });
});
