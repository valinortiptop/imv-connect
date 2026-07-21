import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Live counts for the Clientes flow dashboard. All values are best-effort;
 *  any query that fails returns 0 so the dashboard still renders. */
export const getClientesDashboardCountsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const safeCount = async (
      run: () => Promise<{ count: number | null; error: unknown }>,
    ) => {
      try {
        const { count } = await run();
        return count ?? 0;
      } catch {
        return 0;
      }
    };

    const [
      prospectos,
      clientes,
      pedidosAbiertos,
      facturasMes,
      cxcVencida,
      devoluciones,
    ] = await Promise.all([
      safeCount(() =>
        supabase.from("prospects").select("id", { count: "exact", head: true }),
      ),
      safeCount(() =>
        supabase.from("clientes").select("id", { count: "exact", head: true }),
      ),
      safeCount(() =>
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .in("estado", ["pendiente", "confirmado", "en_preparacion"]),
      ),
      safeCount(() => {
        const since = new Date();
        since.setDate(1);
        return supabase
          .from("facturas")
          .select("id", { count: "exact", head: true })
          .gte("fecha_emision", since.toISOString().slice(0, 10));
      }),
      safeCount(() =>
        supabase
          .from("cobranza_alertas")
          .select("id", { count: "exact", head: true })
          .eq("resuelta", false),
      ),
      safeCount(() =>
        supabase
          .from("devoluciones")
          .select("id", { count: "exact", head: true }),
      ),
    ]);

    return { prospectos, clientes, pedidosAbiertos, facturasMes, cxcVencida, devoluciones };
  });

/** Live counts for the Almacén flow dashboard. */
export const getAlmacenDashboardCountsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const safeCount = async (
      run: () => Promise<{ count: number | null; error: unknown }>,
    ) => {
      try {
        const { count } = await run();
        return count ?? 0;
      } catch {
        return 0;
      }
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [almacenes, productos, movimientosHoy, entradasHoy, danados] = await Promise.all([
      safeCount(() =>
        supabase.from("almacenes").select("id", { count: "exact", head: true }),
      ),
      safeCount(() =>
        supabase
          .from("productos")
          .select("id", { count: "exact", head: true })
          .eq("activo", true),
      ),
      safeCount(() =>
        supabase
          .from("movimientos_inventario")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayIso),
      ),
      safeCount(() =>
        supabase
          .from("stock_entries")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayIso),
      ),
      safeCount(() =>
        supabase
          .from("damaged_batches")
          .select("id", { count: "exact", head: true }),
      ),
    ]);

    return { almacenes, productos, movimientosHoy, entradasHoy, danados };
  });
