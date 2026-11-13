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
  z.object({
    action: z.literal("import_availability"),
    personas: z
      .array(
        z.object({
          persona: z.string().trim().min(1).max(80),
          rol: z.string().regex(/^[a-z0-9_]{2,40}$/),
          rol_label: z.string().max(80).optional(),
          /** America/Mexico_City local 30-min slots, same format as onboarding_disponibilidad.slots. */
          slots: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30)$/)).max(800),
        }),
      )
      .max(200),
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

export type DispRow = { persona: string; rol: string; slots: string[] };

/** Trimmed, lower-case, accent-free name used to match the same person. */
export function personaKey(persona: string): string {
  return persona.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Merges painted hours sent by Valinor into onboarding_disponibilidad rows.
 * Same rol + same persona (case/accent-insensitive, trimmed) → union of slots, deduped and sorted;
 * slots are never removed and rows are never deleted. Unmatched people become new rows.
 * Matched rows keep their stored `persona` so an upsert on (persona, rol) hits the same row;
 * matched rows that gain no new slot are left out of `update`.
 */
export function mergeDisponibilidad(
  existing: DispRow[],
  incoming: DispRow[],
): { insert: (DispRow & { updated_by: null })[]; update: DispRow[] } {
  const key = (r: { persona: string; rol: string }) => `${r.rol}\u0000${personaKey(r.persona)}`;
  const stored = new Map<string, DispRow>();
  for (const e of existing) if (!stored.has(key(e))) stored.set(key(e), e);

  const inserts = new Map<string, DispRow & { updated_by: null }>();
  const updates = new Map<string, DispRow>();
  for (const inc of incoming) {
    const k = key(inc);
    const base = stored.get(k);
    if (base) {
      const prev = updates.get(k)?.slots ?? base.slots;
      const merged = [...new Set([...prev, ...inc.slots])].sort();
      const original = new Set(base.slots);
      if (merged.some((s) => !original.has(s))) updates.set(k, { persona: base.persona, rol: base.rol, slots: merged });
    } else {
      const prev = inserts.get(k);
      inserts.set(k, {
        persona: prev?.persona ?? inc.persona.trim(),
        rol: inc.rol,
        slots: [...new Set([...(prev?.slots ?? []), ...inc.slots])].sort(),
        updated_by: null,
      });
    }
  }
  return { insert: [...inserts.values()], update: [...updates.values()] };
}
