// @ts-nocheck — run with `bun test` (bun:test types are not installed in this project)
import { describe, expect, it } from "bun:test";
import { LaunchSyncBody, itemEstado, launchKeyMatches, mergeDisponibilidad, sesionEstadoTrasConfirmar } from "./launch-sync";

describe("launch sync rules", () => {
  it("rejects a missing or wrong launch key", () => {
    expect(launchKeyMatches(null, "abc")).toBe(false);
    expect(launchKeyMatches("abd", "abc")).toBe(false);
    expect(launchKeyMatches("abc", undefined)).toBe(false);
    expect(launchKeyMatches("abc", "abc")).toBe(true);
  });

  it("document is validado when validado_at is set, even with a file", () => {
    expect(itemEstado({ estado: "pendiente", validado_at: "2026-11-01T00:00:00Z" }, true)).toBe("validado");
  });

  it("document is entregado when it has a file", () => {
    expect(itemEstado({ estado: "pendiente", validado_at: null }, true)).toBe("entregado");
    expect(itemEstado({ estado: "pendiente", validado_at: null }, false)).toBe("pendiente");
  });

  it("setting a session date marks it agendada", () => {
    expect(sesionEstadoTrasConfirmar("por_agendar", "2026-11-20T16:00:00-06:00")).toBe("agendada");
  });

  it("confirm_session requires orden, titulo and an ISO date or null", () => {
    expect(LaunchSyncBody.safeParse({ action: "confirm_session", orden: 2, titulo: "x", fecha_hora: null }).success).toBe(true);
    expect(LaunchSyncBody.safeParse({ action: "confirm_session", orden: 2, titulo: "x", fecha_hora: "mañana" }).success).toBe(false);
    expect(LaunchSyncBody.safeParse({ action: "confirm_session", titulo: "x", fecha_hora: null }).success).toBe(false);
  });

  it("import_availability validates rol and 30-minute slot format", () => {
    const ok = { action: "import_availability", personas: [{ persona: " Doris ", rol: "ti", slots: ["2026-11-16T09:00", "2026-11-16T09:30"] }] };
    expect(LaunchSyncBody.safeParse(ok).success).toBe(true);
    const badSlot = { action: "import_availability", personas: [{ persona: "Doris", rol: "ti", slots: ["2026-11-16T09:15"] }] };
    expect(LaunchSyncBody.safeParse(badSlot).success).toBe(false);
    const badRol = { action: "import_availability", personas: [{ persona: "Doris", rol: "TI", slots: [] }] };
    expect(LaunchSyncBody.safeParse(badRol).success).toBe(false);
    const tooMany = { action: "import_availability", personas: Array.from({ length: 201 }, () => ({ persona: "x", rol: "ti", slots: [] })) };
    expect(LaunchSyncBody.safeParse(tooMany).success).toBe(false);
  });

  it("same rol and same name ignoring case, accents and spaces adds slots to the existing row", () => {
    const r = mergeDisponibilidad(
      [{ persona: "Marisol Pérez", rol: "marisol", slots: ["2026-11-16T10:00", "2026-11-16T09:00"] }],
      [{ persona: "  marisol perez ", rol: "marisol", slots: ["2026-11-16T09:00", "2026-11-17T08:30"] }],
    );
    expect(r.insert).toEqual([]);
    expect(r.update).toEqual([{ persona: "Marisol Pérez", rol: "marisol", slots: ["2026-11-16T09:00", "2026-11-16T10:00", "2026-11-17T08:30"] }]);
  });

  it("never removes existing slots, and an unchanged row is not updated", () => {
    const r = mergeDisponibilidad(
      [{ persona: "Doris", rol: "ti", slots: ["2026-11-16T09:00", "2026-11-16T09:30"] }],
      [{ persona: "Doris", rol: "ti", slots: ["2026-11-16T09:00"] }],
    );
    expect(r.update).toEqual([]);
    expect(r.insert).toEqual([]);
  });

  it("same name with a different rol is a new row with sorted slots and no updated_by", () => {
    const r = mergeDisponibilidad(
      [{ persona: "Doris", rol: "ti", slots: ["2026-11-16T09:00"] }],
      [{ persona: "Doris", rol: "usuarios", slots: ["2026-11-18T12:00", "2026-11-16T08:00", "2026-11-16T08:00"] }],
    );
    expect(r.update).toEqual([]);
    expect(r.insert).toEqual([{ persona: "Doris", rol: "usuarios", slots: ["2026-11-16T08:00", "2026-11-18T12:00"], updated_by: null }]);
  });

  it("the same new person sent twice becomes one row", () => {
    const r = mergeDisponibilidad([], [
      { persona: "José", rol: "facturacion", slots: ["2026-11-16T09:00"] },
      { persona: "jose", rol: "facturacion", slots: ["2026-11-16T10:00"] },
    ]);
    expect(r.insert).toEqual([{ persona: "José", rol: "facturacion", slots: ["2026-11-16T09:00", "2026-11-16T10:00"], updated_by: null }]);
  });
});
