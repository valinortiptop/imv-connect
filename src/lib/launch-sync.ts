/**
 * Pure helpers for the Valinor launch-sync endpoint
 * (src/routes/api/public/valinor-launch-sync.ts). No I/O here so they can be tested.
 */
import { z } from "zod";

export const LaunchSyncBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("summary") }),
  z.object({
    action: z.literal("confirm_session"),
    orden: z.number().int().positive(),
    titulo: z.string().trim().min(1).max(300),
    fecha_hora: z.string().datetime({ offset: true }).nullable(),
  }),
]);
export type LaunchSyncBody = z.infer<typeof LaunchSyncBody>;

/** Constant-time comparison of the shared launch key. */
export function launchKeyMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const enc = new TextEncoder();
  const x = enc.encode(provided);
  const y = enc.encode(expected);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Effective document status, same rule as the onboarding page (estadoDoc). */
export function itemEstado(
  it: { estado: string; validado_at: string | null },
  hasFile: boolean,
): string {
  if (it.estado === "no_aplica") return "no_aplica";
  if (it.validado_at) return "validado";
  if (it.estado === "entregado" || hasFile) return "entregado";
  return it.estado;
}

/**
 * New session status after Valinor confirms/clears a time.
 * A date → 'agendada' (a 'realizada' session stays 'realizada').
 * No date → back to 'por_agendar' only if it was 'agendada'.
 */
export function sesionEstadoTrasConfirmar(actual: string, fechaHora: string | null): string {
  if (actual === "realizada") return actual;
  if (fechaHora) return "agendada";
  return actual === "agendada" ? "por_agendar" : actual;
}

/** Parallel-run week status from which app/NetSuite pairs are filled (amounts are never returned). */
export function semanaEstado(w: {
  ventas_app: number | null; ventas_netsuite: number | null;
  cartera_app: number | null; cartera_netsuite: number | null;
  inventario_app: number | null; inventario_netsuite: number | null;
}): "pendiente" | "parcial" | "capturada" {
  const pares = [
    w.ventas_app != null && w.ventas_netsuite != null,
    w.cartera_app != null && w.cartera_netsuite != null,
    w.inventario_app != null && w.inventario_netsuite != null,
  ].filter(Boolean).length;
  return pares === 3 ? "capturada" : pares === 0 ? "pendiente" : "parcial";
}
