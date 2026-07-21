import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function safeCount(p: PromiseLike<{ count: number | null }>): Promise<number> {
  try {
    const { count } = await p;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Live counts for the Clientes flow dashboard. */
export const getClientesDashboardCountsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since = new Date();
    since.setDate(1);
    const monthStart = since.toISOString().slice(0, 10);

    const [prospectos, clientes, pedidosAbiertos, facturasMes, cxcVencida, devoluciones] =
      await Promise.all([
        safeCount(supabase.from("prospects").select("id", { count: "exact", head: true })),
        safeCount(supabase.from("clientes").select("id", { count: "exact", head: true })),
        safeCount(
          supabase
            .from("pedidos")
            .select("id", { count: "exact", head: true })
            .in("estado", ["pendiente", "confirmado", "En preparacion"]),
        ),
        safeCount(
          supabase
            .from("facturas")
            .select("id", { count: "exact", head: true })
            .gte("fecha_emision", monthStart),
        ),
        safeCount(
          supabase
            .from("cobranza_alertas")
            .select("id", { count: "exact", head: true })
            .eq("resuelta", false),
        ),
        safeCount(
          supabase.from("devoluciones").select("id", { count: "exact", head: true }),
        ),
      ]);

    return { prospectos, clientes, pedidosAbiertos, facturasMes, cxcVencida, devoluciones };
  });

/** Live counts for the Almacén flow dashboard. */
export const getAlmacenDashboardCountsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [almacenes, productos, movimientosHoy, entradasHoy, danados] = await Promise.all([
      safeCount(supabase.from("almacenes").select("id", { count: "exact", head: true })),
      safeCount(
        supabase
          .from("productos")
          .select("id", { count: "exact", head: true })
          .eq("activo", true),
      ),
      safeCount(
        supabase
          .from("movimientos_inventario")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayIso),
      ),
      safeCount(
        supabase
          .from("stock_entries")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayIso),
      ),
      safeCount(
        supabase.from("damaged_batches").select("id", { count: "exact", head: true }),
      ),
    ]);

    return { almacenes, productos, movimientosHoy, entradasHoy, danados };
  });
