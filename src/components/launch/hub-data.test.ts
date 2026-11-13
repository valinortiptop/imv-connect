// @ts-nocheck — run with `bun test`
import { describe, it, expect } from "bun:test";
import { durationMinutes, taskCol, reqState } from "./hub-data";

describe("hub helpers", () => {
  it("parses session durations", () => {
    expect(durationMinutes("1 h")).toBe(60);
    expect(durationMinutes("90 min")).toBe(90);
    expect(durationMinutes("1.5 h")).toBe(90);
    expect(durationMinutes(null)).toBe(60);
  });
  it("maps old task states to kanban columns", () => {
    expect(taskCol("en_proceso")).toBe("en_curso");
    expect(taskCol("listo")).toBe("hecho");
    expect(taskCol("revision")).toBe("revision");
  });
  it("document state follows validation, then the latest AI verdict", () => {
    const r: any = { validado_at: null };
    expect(reqState(r, [])).toBe("falta");
    expect(reqState(r, [{ ai_veredicto: "bien" } as any])).toBe("ok");
    expect(reqState(r, [{ ai_veredicto: "incorrecto" } as any])).toBe("revisar");
    expect(reqState({ validado_at: "x" } as any, [])).toBe("validado");
  });
});
