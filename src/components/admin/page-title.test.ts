// @ts-nocheck — run with `bun test` (bun:test types are not installed in this project)
import { describe, expect, it } from "bun:test";
import { resolveAdminPageTitle } from "./page-title";

describe("resolveAdminPageTitle", () => {
  it("dashboard only on exact /admin", () => {
    expect(resolveAdminPageTitle("/admin")).toEqual({ title: "Dashboard", section: "General", detail: null });
  });
  it("uses the menu label of the page being visited", () => {
    expect(resolveAdminPageTitle("/admin/pedidos").title).toBe("Pedidos");
    expect(resolveAdminPageTitle("/admin/pedidos").section).toBe("Ventas");
  });
  it("marks record pages as detail", () => {
    const t = resolveAdminPageTitle("/admin/clientes/7b0c3c3e-1111-4a4a-9999-000000000000");
    expect(t.title).toBe("Clientes");
    expect(t.detail).toBe("Detalle");
  });
  it("falls back when the page is not in the menu", () => {
    expect(resolveAdminPageTitle("/admin/no-existe").title).toBe("Panel de administración");
  });
});
