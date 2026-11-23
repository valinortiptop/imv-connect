// @ts-nocheck — run with `bun test` (bun:test types are not installed in this project)
import { describe, expect, it } from "bun:test";

import { aNumero, limpiarTabla, nombreArchivo, textoPdf } from "./exportar-tabla";

describe("exportar-tabla", () => {
  it("convierte sólo números simples; importes con $ conservan su moneda como texto", () => {
    expect(aNumero("1,234.5")).toBe(1234.5);
    expect(aNumero("-12")).toBe(-12);
    expect(aNumero("$1,234.50")).toBe("$1,234.50");
    expect(aNumero("16%")).toBe("16%");
    expect(aNumero("00123")).toBe("00123");
  });

  it("una celda vacía nunca se vuelve 0", () => {
    expect(aNumero("")).toBe("");
    expect(aNumero(null)).toBeNull();
    expect(textoPdf(null)).toBe("");
  });

  it("quita columnas de casillas/acciones y filas expandidas", () => {
    const t = limpiarTabla({
      columnas: ["", "Cliente", "Total", "Acciones"],
      filas: [["", "Farmacia A", 10, "Editar"], ["detalle expandido"]],
    });
    expect(t.columnas).toEqual(["Cliente", "Total"]);
    expect(t.filas).toEqual([["Farmacia A", 10]]);
  });

  it("nombra el archivo con la fecha de Ciudad de México", () => {
    // 23 nov 2026 03:00 UTC = 22 nov 2026 21:00 en CDMX
    expect(nombreArchivo("Impuestos por producto", new Date("2026-11-23T03:00:00Z"))).toBe("impuestos-por-producto_2026-11-22");
  });

  it("el PDF cambia símbolos que la fuente no tiene", () => {
    expect(textoPdf("✓")).toBe("Sí");
    expect(textoPdf("−$5")).toBe("-$5");
  });
});
