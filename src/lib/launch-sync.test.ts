// @ts-nocheck — run with `bun test` (bun:test types are not installed in this project)
import { describe, expect, it } from "bun:test";
import { LaunchSyncBody, itemEstado, launchKeyMatches, sesionEstadoTrasConfirmar } from "./launch-sync";

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
});
