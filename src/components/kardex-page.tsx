// @ts-nocheck
/**
 * Kardex page (`/kardex`)
 *
 * Standalone filterable + paginated viewer over `slot_movements`. The
 * Almacén map answers "where is everything right now?" — this page
 * answers "what happened, and when?" so the warehouse manager can
 * trace a specific SKU or position across a date range and export
 * the results to Excel.
 *
 * Filters live in the URL (?from=YYYY-MM-DD&to=...&slot=...&product=...
 * &reasons=entrada,reubicacion&page=N) so views are bookmarkable and
 * shareable. Changing any filter (except `page`) resets pagination.
 *
 * Date inputs are interpreted in the BROWSER's local timezone: typing
 * "May 8" means "Mexico-local May 8 00:00 → 23:59:59.999", converted
 * to UTC ISO before being sent to Postgres. Otherwise the off-by-six-
 * hours bug would cut off late-evening events in CST.
 */

import { useMemo, useState } from "react";
import { Product360Drawer } from "@/components/catalog/Product360Drawer";
import { Link, useSearchParams } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { BarraHerramientas } from "@/components/barra-herramientas";
import type { TablaExport } from "@/lib/exportar-tabla";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductThumb } from "@/components/ui/product-thumb";
import {
  Download,
  FilterX,
  History,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Search,
  X as XCircleSearch,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const REASON_LABELS: Record<string, string> = {
  seed: "Carga inicial",
  entrada: "Entrada",
  pedido: "Pedido",
  ajuste: "Ajuste",
  reubicacion: "Reubicación",
};

const REASON_BADGE_CLASS: Record<string, string> = {
  seed: "bg-gray-500/10 text-gray-600 border-gray-500/30",
  entrada: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  pedido: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  ajuste: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  reubicacion: "bg-purple-500/10 text-purple-600 border-purple-500/30",
};
const ALL_REASONS: Array<keyof typeof REASON_LABELS> = [
  "entrada",
  "pedido",
  "ajuste",
  "reubicacion",
  "seed",
];

const PAGE_SIZE = 50;

interface MovementRow {
  id: string;
  created_at: string;
  slot_id: string | null;
  slot_code: string | null;
  product_id: string | null;
  description: string | null;
  lote: string | null;
  delta: number;
  reason: string;
  note: string | null;
  product_clave: string | null;
  product_name: string | null;
  product_image_url: string | null;
  source: string;
}

/** Browser-local YYYY-MM-DD → UTC ISO at start-of-day */
function startOfLocalDayUTC(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}
/** Browser-local YYYY-MM-DD → UTC ISO at end-of-day */
function endOfLocalDayUTC(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export default function Kardex() {
  const [prod360, setProd360] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  // Read filters from the URL so the page is shareable / bookmarkable
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const slotId = params.get("slot") ?? "";
  const productId = params.get("product") ?? "";
  const reasonsParam = params.get("reasons") ?? "";
  const reasons = useMemo(
    () => (reasonsParam ? reasonsParam.split(",") : []),
    [reasonsParam],
  );
  const searchQ = params.get("q") ?? "";
  const page = Math.max(0, parseInt(params.get("page") ?? "0", 10) || 0);

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key);
    else next.set(key, value);
    // Any filter change except `page` itself resets pagination
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  const clearFilters = () => setParams({}, { replace: true });

  // Dropdown sources — small enough to fully prefetch
  const { data: slots = [] } = useQuery({
    queryKey: ["kardex-slot-list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("warehouse_slots")
        .select("id, code")
        .eq("active", true)
        .order("code");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; code: string }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: productsList = [] } = useQuery({
    queryKey: ["kardex-product-list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, clave, name")
        .eq("active", true)
        .order("clave");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; clave: string; name: string;
        barcode?: string | null; case_barcode?: string | null;
      }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  /** Resolve the free-text search box to (product_ids, slot_ids) that
   *  match. The slot_movements query then ORs across these plus direct
   *  ilike on lote / note / description. Computed locally from the
   *  already-loaded products + slots dropdowns — no extra round trip. */
  const resolvedSearch = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return null;
    const productIds = productsList
      .filter(p =>
        p.clave.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        (p.case_barcode ?? "").toLowerCase().includes(q),
      )
      .map(p => p.id);
    const slotIds = slots
      .filter(s => s.code.toLowerCase().includes(q))
      .map(s => s.id);
    return { q, productIds, slotIds };
  }, [searchQ, productsList, slots]);

  // Paginated, filtered movements
  const { data: pageData, isLoading } = useQuery({
    queryKey: [
      "kardex-movements",
      { from, to, slotId, productId, reasons: reasonsParam, page, q: searchQ.trim() },
    ],
    queryFn: async () => {
      // If the search box is filled but matches NO product and NO slot
      // and the query text doesn't look like a lote/note candidate,
      // short-circuit with an empty result so we don't return everything.
      const haveResolvedRefs =
        !!resolvedSearch && (resolvedSearch.productIds.length > 0 || resolvedSearch.slotIds.length > 0);
      const haveRawText = !!resolvedSearch && resolvedSearch.q.length > 0;

      let q = (supabase as any)
        .from("v_kardex_movements")
        .select("*", { count: "estimated" })
        .order("created_at", { ascending: false });
      if (from) q = q.gte("created_at", startOfLocalDayUTC(from));
      if (to) q = q.lte("created_at", endOfLocalDayUTC(to));
      if (slotId) q = q.eq("slot_id", slotId);
      if (productId) q = q.eq("product_id", productId);
      if (reasons.length > 0) q = q.in("reason", reasons);

      if (resolvedSearch) {
        // Build an OR condition across product_id IN (...), slot_id IN
        // (...), lote ilike %q%, note ilike %q%, description ilike %q%.
        // PostgREST's .or() takes the comma-separated filter list;
        // .in.(uuid1,uuid2) requires the parens form.
        const parts: string[] = [];
        if (resolvedSearch.productIds.length > 0) {
          parts.push(`product_id.in.(${resolvedSearch.productIds.join(",")})`);
        }
        if (resolvedSearch.slotIds.length > 0) {
          parts.push(`slot_id.in.(${resolvedSearch.slotIds.join(",")})`);
        }
        if (haveRawText) {
          // ilike pattern — escape PostgREST special chars
          const esc = resolvedSearch.q.replace(/[,()]/g, "");
          parts.push(`lote.ilike.*${esc}*`);
          parts.push(`note.ilike.*${esc}*`);
          parts.push(`description.ilike.*${esc}*`);
        }
        // If we built at least one filter, AND it into the query
        if (parts.length > 0) {
          q = q.or(parts.join(","));
        } else {
          // search box is non-empty but no possible matches — force empty
          return { rows: [], total: 0 };
        }
      }

      const offset = page * PAGE_SIZE;
      q = q.range(offset, offset + PAGE_SIZE - 1);
      const { data, count, error } = await q;
      if (error) throw error;
      return {
        rows: (data ?? []) as MovementRow[],
        total: count ?? 0,
      };
    },
    staleTime: 30 * 1000,
    // Keep showing previous data while a new page loads — avoids the
    // skeleton flash on filter / pagination changes.
    placeholderData: (prev: any) => prev,
  });

  const rows = pageData?.rows ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleReason = (r: string) => {
    const next = new Set(reasons);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    setFilter("reasons", next.size === 0 ? null : [...next].join(","));
  };

  const datosKardex = async (): Promise<TablaExport> => {
    {
      // Same filter pipeline as the paginated query, but pull the full set in
      // pages of 1,000 (the API max), capped at 10k rows.
      const armar = () => {
      let q = (supabase as any)
        .from("v_kardex_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (from) q = q.gte("created_at", startOfLocalDayUTC(from));
      if (to) q = q.lte("created_at", endOfLocalDayUTC(to));
      if (slotId) q = q.eq("slot_id", slotId);
      if (productId) q = q.eq("product_id", productId);
      if (reasons.length > 0) q = q.in("reason", reasons);
      // Mirror the free-text search filter so Export honors whatever the
      // user sees on screen
      if (resolvedSearch) {
        const parts: string[] = [];
        if (resolvedSearch.productIds.length > 0)
          parts.push(`product_id.in.(${resolvedSearch.productIds.join(",")})`);
        if (resolvedSearch.slotIds.length > 0)
          parts.push(`slot_id.in.(${resolvedSearch.slotIds.join(",")})`);
        if (resolvedSearch.q.length > 0) {
          const esc = resolvedSearch.q.replace(/[,()]/g, "");
          parts.push(`lote.ilike.*${esc}*`);
          parts.push(`note.ilike.*${esc}*`);
          parts.push(`description.ilike.*${esc}*`);
        }
        if (parts.length > 0) q = q.or(parts.join(","));
        else return null;
      }
      return q;
      };
      const data: any[] = [];
      for (let desde = 0; desde < 10000; desde += 1000) {
        const q = armar();
        if (!q) return { columnas: [], filas: [] };
        const { data: lote, error } = await q.range(desde, desde + 999);
        if (error) throw error;
        data.push(...(lote ?? []));
        if (!lote || lote.length < 1000) break;
      }
      return {
        columnas: ["Fecha", "Posición", "SKU", "Producto", "Lote", "Movimiento", "Razón", "Nota"],
        filas: data.map((r: any) => [
          format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
          r.slot_code ?? "—",
          r.product_clave ?? "",
          r.product_name ?? r.description ?? "",
          r.lote ?? "",
          r.delta,
          REASON_LABELS[r.reason] ?? r.reason,
          r.note ?? "",
        ]),
      };
    }
  };

  const hasAnyFilter = !!(from || to || slotId || productId || reasons.length > 0 || searchQ.trim());

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            to="/almacen"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="h-3 w-3" /> Volver a Almacén
          </Link>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-6 w-6" /> Kardex
          </h1>
          <p className="text-sm text-muted-foreground">
            Historial completo de movimientos de inventario. Filtra por fecha,
            posición, producto o razón y exporta a Excel.
          </p>
        </div>
      </div>

      <BarraHerramientas
        className="mb-0"
        busqueda={{ valor: searchQ, onChange: (v) => setFilter("q", v || null), placeholder: "SKU, código de barras, nombre, lote, posición o nota..." }}
        filtros={[
          { id: "slot", etiqueta: "Posición", valor: slotId || "__all__", onChange: (v) => setFilter("slot", v === "__all__" ? null : v), opciones: [["__all__", "Todas las posiciones"], ...slots.map((s) => [s.id, s.code] as [string, string])] },
          { id: "product", etiqueta: "Producto", valor: productId || "__all__", onChange: (v) => setFilter("product", v === "__all__" ? null : v), opciones: [["__all__", "Todos los productos"], ...productsList.map((p) => [p.id, `${p.clave} · ${p.name}`] as [string, string])] },
        ]}
        filtrosExtra={
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Desde</span>
                <Input type="date" value={from} onChange={(e) => setFilter("from", e.target.value || null)} className="h-9" />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hasta</span>
                <Input type="date" value={to} onChange={(e) => setFilter("to", e.target.value || null)} className="h-9" />
              </label>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Razón</span>
              <div className="flex flex-wrap gap-2">
                {ALL_REASONS.map((r) => {
                  const active = reasons.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleReason(r)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition",
                        active ? REASON_BADGE_CLASS[r] : "border-border text-muted-foreground hover:bg-muted/30",
                      )}
                    >
                      {REASON_LABELS[r]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        }
        chipsExtra={[
          ...(from ? [{ id: "from", texto: `Desde: ${from}`, quitar: () => setFilter("from", null) }] : []),
          ...(to ? [{ id: "to", texto: `Hasta: ${to}`, quitar: () => setFilter("to", null) }] : []),
          ...reasons.map((r) => ({ id: `r-${r}`, texto: `Razón: ${REASON_LABELS[r]}`, quitar: () => toggleReason(r) })),
        ]}
        onLimpiar={clearFilters}
        exportar={{ titulo: "Kardex", datos: datosKardex }}
        resumen={
          isLoading ? undefined : (
            <>
              {total.toLocaleString("es-MX")} movimientos · Página {page + 1} de {totalPages}
              {rows.length > 0 ? ` · Mostrando ${(page * PAGE_SIZE + 1).toLocaleString("es-MX")}–${(page * PAGE_SIZE + rows.length).toLocaleString("es-MX")}` : ""}
            </>
          )
        }
      />

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
              <th className="text-left py-2 px-3 whitespace-nowrap">Fecha</th>
              <th className="text-left py-2 px-3">Posición</th>
              <th className="text-left py-2 px-3 w-12"></th>
              <th className="text-left py-2 px-3">SKU</th>
              <th className="text-left py-2 px-3">Producto</th>
              <th className="text-left py-2 px-3">Lote</th>
              <th className="text-right py-2 px-3">Delta</th>
              <th className="text-left py-2 px-3">Razón</th>
              <th className="text-left py-2 px-3">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="py-2 px-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 text-center text-sm text-muted-foreground italic"
                  >
                    Sin movimientos para estos filtros
                  </td>
                </tr>
              ) : (
                rows.map((m) => {
                  const isIn = m.delta > 0;
                  return (
                    <tr
                      key={m.id}
                      className={cn("hover:bg-muted/30", m.product_id && "cursor-pointer")}
                      tabIndex={m.product_id ? 0 : undefined}
                      role={m.product_id ? "button" : undefined}
                      aria-label={m.product_id ? `Abrir historial de ${m.product_name ?? m.product_clave ?? "producto"}` : undefined}
                      onClick={() => m.product_id && setProd360(m.product_id)}
                      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && m.product_id) { e.preventDefault(); setProd360(m.product_id); } }}
                    >
                      <td className="py-2 px-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {format(new Date(m.created_at), "dd MMM yyyy HH:mm", {
                          locale: es,
                        })}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                        {m.slot_code ?? "—"}
                      </td>
                      <td className="py-2 px-3">
                        <ProductThumb
                          src={m.product_image_url ?? null}
                          size="sm"
                        />
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-primary whitespace-nowrap">
                        {m.product_clave ?? "—"}
                      </td>
                      <td className="py-2 px-3 truncate max-w-[260px]">
                        {m.product_name ?? m.description ?? "—"}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                        {m.lote ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right font-bold tabular-nums whitespace-nowrap",
                          isIn
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400",
                        )}
                      >
                        {isIn ? "+" : ""}
                        {m.delta}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold whitespace-nowrap",
                            REASON_BADGE_CLASS[m.reason] ?? "",
                          )}
                        >
                          {REASON_LABELS[m.reason] ?? m.reason}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-[200px]">
                        {m.note ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setFilter("page", String(Math.max(0, page - 1)))}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground px-2 tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() =>
              setFilter("page", String(Math.min(totalPages - 1, page + 1)))
            }
            className="gap-1"
          >
            Siguiente <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      <Product360Drawer productId={prod360} open={!!prod360} onOpenChange={(o) => !o && setProd360(null)} initialTab="historial" />
    </div>
  );
}
