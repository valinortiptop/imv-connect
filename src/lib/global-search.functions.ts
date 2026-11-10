import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GlobalSearchHit = {
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
};

export type GlobalSearchResult = {
  clientes: GlobalSearchHit[];
  prospectos: GlobalSearchHit[];
  pedidos: GlobalSearchHit[];
  facturas: GlobalSearchHit[];
  productos: GlobalSearchHit[];
};

/** Quita caracteres que rompen el filtro `or()` de PostgREST. */
export function sanitizeSearchTerm(q: string): string {
  return q
    .replace(/[,()%*\\:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

const money = (n: number | null | undefined) =>
  n == null
    ? null
    : `${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n))} MXN`;

/**
 * Búsqueda general del encabezado (clientes, prospectos, pedidos, facturas y
 * productos). Corre con la sesión del usuario: las políticas RLS deciden qué
 * registros puede ver cada quien.
 */
export const globalSearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        q: z.string().trim().min(2).max(120),
        limit: z.number().int().min(1).max(10).default(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GlobalSearchResult> => {
    const sb = context.supabase;
    const term = sanitizeSearchTerm(data.q);
    const empty: GlobalSearchResult = { clientes: [], prospectos: [], pedidos: [], facturas: [], productos: [] };
    if (term.length < 2) return empty;
    const like = `%${term}%`;
    const n = data.limit;

    const [cli, pro, ped, fac, prd] = await Promise.all([
      sb
        .from("clientes")
        .select("id, razon_social, nombre_comercial, nickname, rfc, active")
        .or(
          `razon_social.ilike.${like},nombre_comercial.ilike.${like},nickname.ilike.${like},rfc.ilike.${like},netsuite_id.ilike.${like}`,
        )
        .order("active", { ascending: false })
        .limit(n),
      sb
        .from("prospects")
        .select("id, name, municipio, status")
        .or(`name.ilike.${like},contact_person.ilike.${like},phone.ilike.${like}`)
        .limit(n),
      sb
        .from("pedidos")
        .select("id, folio, order_code, estado, total, cliente_id, created_at")
        .or(`folio.ilike.${like},order_code.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(n),
      sb
        .from("facturas")
        .select("id, folio, serie, estado, total, cliente_id, fecha_emision")
        .or(`folio.ilike.${like},uuid_fiscal.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(n),
      sb
        .from("productos")
        .select("id, nombre, sku, marca, presentacion, activo")
        .or(`nombre.ilike.${like},sku.ilike.${like},marca.ilike.${like}`)
        .order("activo", { ascending: false })
        .limit(n),
    ]);

    for (const r of [cli, pro, ped, fac, prd]) {
      if (r.error) console.error("[global-search]", r.error.message);
    }

    // Nombres de cliente para pedidos y facturas (una sola consulta).
    const clienteIds = Array.from(
      new Set([...(ped.data ?? []), ...(fac.data ?? [])].map((r) => r.cliente_id).filter(Boolean)),
    ) as string[];
    const nombres = new Map<string, string>();
    if (clienteIds.length) {
      const { data: cs } = await sb
        .from("clientes")
        .select("id, razon_social, nombre_comercial")
        .in("id", clienteIds);
      for (const c of cs ?? []) nombres.set(c.id, c.nombre_comercial || c.razon_social);
    }

    return {
      clientes: (cli.data ?? []).map((c) => ({
        id: c.id,
        title: c.nombre_comercial || c.razon_social,
        subtitle: [c.nombre_comercial ? c.razon_social : null, c.rfc, c.active ? null : "Inactivo"]
          .filter(Boolean)
          .join(" · ") || null,
        url: `/admin/clientes/${c.id}`,
      })),
      prospectos: (pro.data ?? []).map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: [p.municipio, p.status].filter(Boolean).join(" · ") || null,
        url: "/admin/prospectos",
      })),
      pedidos: (ped.data ?? []).map((p) => ({
        id: p.id,
        title: `Pedido ${p.folio}`,
        subtitle: [nombres.get(p.cliente_id) ?? null, p.estado, money(p.total)].filter(Boolean).join(" · ") || null,
        url: `/admin/pedidos/${p.id}`,
      })),
      facturas: (fac.data ?? []).map((f) => ({
        id: f.id,
        title: `Factura ${f.serie ? `${f.serie}-` : ""}${f.folio}`,
        subtitle:
          [f.cliente_id ? (nombres.get(f.cliente_id) ?? null) : null, f.estado, money(f.total)]
            .filter(Boolean)
            .join(" · ") || null,
        url: `/admin/facturas/${f.id}`,
      })),
      productos: (prd.data ?? []).map((p) => ({
        id: p.id,
        title: p.nombre,
        subtitle: [p.sku, p.marca, p.presentacion, p.activo ? null : "Inactivo"].filter(Boolean).join(" · ") || null,
        url: "/admin/productos",
      })),
    };
  });
