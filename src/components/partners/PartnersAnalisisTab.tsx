/**
 * PartnersAnalisisTab
 *
 * Cross-channel SKU analytics. Answers "which SKUs are moving where"
 * across the three sales channels:
 *
 *   • Naucalpan — order_items joined with delivered orders.
 *   • Tamemes / GDL — partner_shipment_items.
 *
 * Aggregates per-SKU within the visible ChronoBar range, merges the
 * three channels into one table, and ranks by total bultos.
 *
 * Top section: 3 KPI tiles (top SKU per channel by bultos).
 * Bottom: a single ranked table with one row per SKU, columns per
 * channel, plus a total. Sortable by clicking any column header.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  BarChart3, Building2, Truck, Search, ArrowUp, ArrowDown, ArrowUpDown, Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  dateFrom: string;
  dateTo: string;
}

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fmtMXN = (v: number | null | undefined) => v == null || v === 0 ? "—" : mxnFmt.format(v);
const fmtNum = (v: number | null | undefined) => v == null || v === 0 ? "—" : v.toLocaleString("es-MX");

type SortKey = "total_bultos" | "naucalpan_bultos" | "tam_bultos" | "gdl_bultos" | "total_importe" | "clave";
type SortDir = "asc" | "desc";

interface Row {
  product_id: string;
  clave: string;
  name: string;
  image_url: string | null;
  // Per-channel
  naucalpan_bultos: number;
  naucalpan_importe: number;
  tam_bultos: number;
  tam_importe: number;
  gdl_bultos: number;
  gdl_importe: number;
  // Totals
  total_bultos: number;
  total_importe: number;
}

export function PartnersAnalisisTab({ dateFrom, dateTo }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_bultos");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Naucalpan (order_items × orders) ─────────────────────────────
  const { data: naucalpanRows = [], isLoading: nLoading } = useQuery({
    queryKey: ["analisis-naucalpan", dateFrom, dateTo],
    queryFn: async () => {
      // Pull every delivered line in the range. PostgREST query with a
      // nested filter on orders so we only get delivered ones.
      let q = (supabase as any)
        .from("order_items")
        .select("product_id, quantity, unit_price_override, products!inner(clave, name, image_url, sale_price_with_iva), orders!inner(status, delivery_date)")
        .eq("orders.status", "Entregado");
      if (dateFrom) q = q.gte("orders.delivery_date", dateFrom);
      if (dateTo) q = q.lte("orders.delivery_date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{
        product_id: string;
        quantity: number;
        unit_price_override: number | null;
        products: { clave: string; name: string; image_url: string | null; sale_price_with_iva: number | null };
      }>;
    },
  });

  // ── Partner shipment items (TAM + GDL combined query, filtered
  //    client-side per partner code) ────────────────────────────────
  const { data: partnerRows = [], isLoading: pLoading } = useQuery({
    queryKey: ["analisis-partners", dateFrom, dateTo],
    queryFn: async () => {
      let q = (supabase as any)
        .from("partner_shipment_items")
        .select("product_id, clave, description, quantity, importe, products(clave, name, image_url), partner_shipments!inner(shipment_date, partners!inner(code))");
      if (dateFrom) q = q.gte("partner_shipments.shipment_date", dateFrom);
      if (dateTo) q = q.lte("partner_shipments.shipment_date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{
        product_id: string | null;
        clave: string;
        description: string | null;
        quantity: number;
        importe: number | null;
        products: { clave: string; name: string; image_url: string | null } | null;
        partner_shipments: { shipment_date: string; partners: { code: string } };
      }>;
    },
  });

  const isLoading = nLoading || pLoading;

  // ── Merge: one row per SKU, columns per channel ─────────────────
  const merged: Row[] = useMemo(() => {
    const byKey = new Map<string, Row>();
    const getOrCreate = (key: string, seed: Partial<Row>) => {
      const existing = byKey.get(key);
      if (existing) return existing;
      const row: Row = {
        product_id: seed.product_id ?? key,
        clave: seed.clave ?? key,
        name: seed.name ?? "",
        image_url: seed.image_url ?? null,
        naucalpan_bultos: 0, naucalpan_importe: 0,
        tam_bultos: 0, tam_importe: 0,
        gdl_bultos: 0, gdl_importe: 0,
        total_bultos: 0, total_importe: 0,
      };
      byKey.set(key, row);
      return row;
    };

    for (const oi of naucalpanRows) {
      if (!oi.product_id) continue;
      const r = getOrCreate(oi.product_id, {
        product_id: oi.product_id,
        clave: oi.products?.clave ?? "",
        name: oi.products?.name ?? "",
        image_url: oi.products?.image_url ?? null,
      });
      const qty = Number(oi.quantity) || 0;
      const price = Number(oi.unit_price_override ?? oi.products?.sale_price_with_iva ?? 0);
      r.naucalpan_bultos += qty;
      r.naucalpan_importe += qty * price;
    }

    for (const pi of partnerRows) {
      // Group by product_id when matched, else fall back to clave for
      // unmatched SKUs (rare — covers free-text shipment items).
      const key = pi.product_id ?? `clave:${pi.clave}`;
      const r = getOrCreate(key, {
        product_id: pi.product_id ?? key,
        clave: pi.products?.clave ?? pi.clave,
        name: pi.products?.name ?? pi.description ?? pi.clave,
        image_url: pi.products?.image_url ?? null,
      });
      const code = pi.partner_shipments?.partners?.code;
      const qty = Number(pi.quantity) || 0;
      const importe = Number(pi.importe) || 0;
      if (code === "TAM") {
        r.tam_bultos += qty;
        r.tam_importe += importe;
      } else if (code === "GDL") {
        r.gdl_bultos += qty;
        r.gdl_importe += importe;
      }
    }

    // Totals
    for (const r of byKey.values()) {
      r.total_bultos = r.naucalpan_bultos + r.tam_bultos + r.gdl_bultos;
      r.total_importe = r.naucalpan_importe + r.tam_importe + r.gdl_importe;
    }
    return [...byKey.values()];
  }, [naucalpanRows, partnerRows]);

  // ── Search filter ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return merged;
    return merged.filter(r =>
      r.clave.toLowerCase().includes(term) ||
      r.name.toLowerCase().includes(term),
    );
  }, [merged, search]);

  // ── Sort ────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  // ── KPI: top SKU per channel ───────────────────────────────────
  const topNaucalpan = useMemo(() => {
    return [...merged].sort((a, b) => b.naucalpan_bultos - a.naucalpan_bultos)[0];
  }, [merged]);
  const topTam = useMemo(() => {
    return [...merged].sort((a, b) => b.tam_bultos - a.tam_bultos)[0];
  }, [merged]);
  const topGdl = useMemo(() => {
    return [...merged].sort((a, b) => b.gdl_bultos - a.gdl_bultos)[0];
  }, [merged]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Análisis cruzado por SKU
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Mismo SKU visto desde los tres canales — Naucalpan (pedidos entregados), Tamemes y Guadalajara (embarques ADM). Filtra por fecha arriba.
        </p>
      </div>

      {/* Top-SKU KPIs per channel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Building2 className="h-3.5 w-3.5 text-blue-500" /> Top SKU · Naucalpan
            </div>
            {isLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : topNaucalpan && topNaucalpan.naucalpan_bultos > 0 ? (
              <>
                <div className="text-sm font-mono text-blue-400 truncate">{topNaucalpan.clave}</div>
                <div className="text-2xl font-bold tabular-nums">{fmtNum(topNaucalpan.naucalpan_bultos)} <span className="text-xs font-normal text-muted-foreground">bultos</span></div>
                <div className="text-[11px] text-muted-foreground truncate">{topNaucalpan.name}</div>
              </>
            ) : <div className="text-sm text-muted-foreground">—</div>}
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Truck className="h-3.5 w-3.5 text-purple-500" /> Top SKU · Tamemes
            </div>
            {isLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : topTam && topTam.tam_bultos > 0 ? (
              <>
                <div className="text-sm font-mono text-blue-400 truncate">{topTam.clave}</div>
                <div className="text-2xl font-bold tabular-nums">{fmtNum(topTam.tam_bultos)} <span className="text-xs font-normal text-muted-foreground">bultos</span></div>
                <div className="text-[11px] text-muted-foreground truncate">{topTam.name}</div>
              </>
            ) : <div className="text-sm text-muted-foreground">—</div>}
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Truck className="h-3.5 w-3.5 text-orange-500" /> Top SKU · Guadalajara
            </div>
            {isLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : topGdl && topGdl.gdl_bultos > 0 ? (
              <>
                <div className="text-sm font-mono text-blue-400 truncate">{topGdl.clave}</div>
                <div className="text-2xl font-bold tabular-nums">{fmtNum(topGdl.gdl_bultos)} <span className="text-xs font-normal text-muted-foreground">bultos</span></div>
                <div className="text-[11px] text-muted-foreground truncate">{topGdl.name}</div>
              </>
            ) : <div className="text-sm text-muted-foreground">—</div>}
          </div>
        </GlowCard>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por clave o producto…"
          className="pl-9"
        />
      </div>

      {/* Cross-channel table */}
      <GlowCard>
        <div className="p-4 md:p-6 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-semibold text-foreground">Volúmenes por canal</h3>
              <p className="text-xs text-muted-foreground">
                {sorted.length} SKU{sorted.length === 1 ? "" : "s"} con movimiento en el rango. Click en una columna para ordenar.
              </p>
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <BarChart3 className="h-10 w-10 mx-auto opacity-30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Sin movimientos en el rango seleccionado.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold text-xs">
                      <button onClick={() => onSort("clave")} className="flex items-center gap-1 hover:text-foreground">
                        SKU <SortIcon k="clave" />
                      </button>
                    </TableHead>
                    <TableHead className="font-semibold text-xs">Producto</TableHead>
                    <TableHead className="font-semibold text-xs text-right">
                      <button onClick={() => onSort("naucalpan_bultos")} className="flex items-center gap-1 hover:text-foreground ml-auto">
                        Naucalpan <SortIcon k="naucalpan_bultos" />
                      </button>
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-right">
                      <button onClick={() => onSort("tam_bultos")} className="flex items-center gap-1 hover:text-foreground ml-auto">
                        Tamemes <SortIcon k="tam_bultos" />
                      </button>
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-right">
                      <button onClick={() => onSort("gdl_bultos")} className="flex items-center gap-1 hover:text-foreground ml-auto">
                        GDL <SortIcon k="gdl_bultos" />
                      </button>
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-right">
                      <button onClick={() => onSort("total_bultos")} className="flex items-center gap-1 hover:text-foreground ml-auto">
                        Total <SortIcon k="total_bultos" />
                      </button>
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-right">
                      <button onClick={() => onSort("total_importe")} className="flex items-center gap-1 hover:text-foreground ml-auto">
                        Importe <SortIcon k="total_importe" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(r => (
                    <TableRow key={r.product_id}>
                      <TableCell className="font-mono text-xs text-blue-400 whitespace-nowrap">{r.clave}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          {r.image_url ? (
                            <img src={r.image_url} alt="" className="h-7 w-7 rounded object-contain bg-white border shrink-0" />
                          ) : (
                            <div className="h-7 w-7 rounded bg-muted/40 border flex items-center justify-center shrink-0">
                              <ImageIcon className="h-3 w-3 text-muted-foreground/40" />
                            </div>
                          )}
                          <span className="text-sm truncate">{r.name || <span className="text-muted-foreground italic">(sin nombre)</span>}</span>
                        </div>
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", r.naucalpan_bultos === 0 && "text-muted-foreground")}>
                        {fmtNum(r.naucalpan_bultos)}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", r.tam_bultos > 0 ? "text-purple-400 font-medium" : "text-muted-foreground")}>
                        {fmtNum(r.tam_bultos)}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", r.gdl_bultos > 0 ? "text-orange-400 font-medium" : "text-muted-foreground")}>
                        {fmtNum(r.gdl_bultos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold">{fmtNum(r.total_bultos)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMXN(r.total_importe)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </GlowCard>

      {/* Footer hint */}
      <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <BarChart3 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Esta vista cruza pedidos entregados de Naucalpan con embarques ADM a Tamemes y Guadalajara.
          Útil para detectar SKUs que crecen rápido en un canal y aún no se mueven en otro.
        </div>
      </div>
    </div>
  );
}
