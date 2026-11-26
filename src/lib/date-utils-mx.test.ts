// @ts-nocheck — run with `bun test` (bun:test types are not installed in this project)
import { describe, expect, test } from "bun:test";
import { fmtFechaMx, fmtFechaHoraMx } from "./date-utils";

describe("fechas formato México", () => {
  test("fecha sola queda dd/mm/aaaa sin recorrer el día", () => {
    expect(fmtFechaMx("2026-11-26")).toBe("26/11/2026");
  });
  test("timestamp UTC se muestra en hora de Ciudad de México", () => {
    // 02:30 UTC del 27 = 20:30 del 26 en CDMX
    expect(fmtFechaHoraMx("2026-11-27T02:30:00Z")).toBe("26/11/2026, 20:30");
  });
  test("sin valor muestra guion", () => {
    expect(fmtFechaMx(null)).toBe("—");
  });
});
