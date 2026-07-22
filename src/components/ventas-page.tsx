// @ts-nocheck
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  FileText,
  Loader2,
  Store,
  MapPin,
  Package,
  ArrowUp,
  ArrowDown,
  Sparkles,
  MinusCircle,
  Route as RouteIcon,
  Truck,
  CalendarClock,
} from "lucide-react";
import { downloadVentasPdf } from "@/lib/ventasPdf";
import { downloadVentasPresentationPdf } from "@/lib/ventasPresentationPdf";
import { Presentation } from "lucide-react";
import { HistoricalSalesPanel } from "@/components/sales/HistoricalSalesPanel";
import {
  MONTHS_ES,
  buildMonthlySales,
  fmtInt,
  fmtMXN,
  universeSizeForMonth,
  type CatalogItem,
  type SaleRow,
  type Shop,
  type SoldMix,
} from "@/lib/ventasPdfData";
import { cn } from "@/lib/utils";
import { useTx } from "@/lib/translate";

/** First day of the month, ISO date string */
function monthStart(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
}
/** First day of the NEXT month, ISO date string */
function monthEnd(year: number, month0: number): string {
  const y = month0 === 11 ? year + 1 : year;
  const m = month0 === 11 ? 0 : month0 + 1;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function useCatalog() {
  return useQuery({
    queryKey: ["ventas-catalog"],
    queryFn: async (): Promise<CatalogItem[]> => {
      // Fetch products and margins separately — avoids relying on PostgREST
      // auto-join which can silently drop rows depending on RLS.
      // Fetch ALL products (not just active) — inactive/discontinued SKUs
      // must still appear in historical reports if they had sales.
      const [prods, mrg] = await Promise.all([
        (supabase as any)
          .from("products")
          .select("id, clave, brand, name, weight_kg"),
        (supabase as any)
          .from("margins")
          .select("product_id, cost_with_iva"),
      ]);
      if (prods.error) throw prods.error;
      if (mrg.error) throw mrg.error;
      const costs = new Map<string, number>();
      for (const m of (mrg.data ?? []) as any[]) {
        if (m.product_id && m.cost_with_iva != null) {
          costs.set(m.product_id, Number(m.cost_with_iva));
        }
      }
      return ((prods.data ?? []) as any[]).map((p: any) => ({
        id: p.id,
        clave: p.clave || "",
        brand: p.brand || "",
        name: p.name || "",
        weight_kg: Number(p.weight_kg || 0),
        cost_with_iva: costs.get(p.id) ?? null,
      }));
    },
  });
}

/**
 * Real delivered sales mix for a given month: product_id → bultos sold,
 * pulled from orders with status = Entregado.
 */
function useSoldMix(year: number, month0: number) {
  return useQuery({
    queryKey: ["ventas-sold-mix", year, month0],
    queryFn: async (): Promise<{ mix: SoldMix; total: number }> => {
      // Two-step fetch so we can filter reliably. PostgREST nested filters
      // can be fragile; explicit ID list is boring but always works.
      const { fetchAllRows } = await import("@/lib/fetch-all");
      const orderRows = await fetchAllRows<{ id: string }>(() =>
        (supabase as any)
          .from("orders")
          .select("id")
          .eq("status", "Entregado")
          .gte("order_date", monthStart(year, month0))
          .lt("order_date", monthEnd(year, month0)),
      );
      const orderIds = orderRows.map((r) => r.id);
      if (orderIds.length === 0) return { mix: new Map(), total: 0 };

      const data = await fetchAllRows<any>(() =>
        (supabase as any)
          .from("order_items")
          .select("quantity, product_id")
          .in("order_id", orderIds),
      );
      const mix = new Map<string, number>();
      let total = 0;
      for (const row of data as any[]) {
        if (!row.product_id || !row.quantity) continue;
        const q = Number(row.quantity);
        mix.set(row.product_id, (mix.get(row.product_id) ?? 0) + q);
        total += q;
      }
      return { mix, total };
    },
  });
}

export default function Ventas() {
  const tx = useTx();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [targetBultos, setTargetBultos] = useState(0);
  const [viewMode, setViewMode] = useState<"name" | "code">("name");
  const [generating, setGenerating] = useState(false);
  const [generatingDeck, setGeneratingDeck] = useState(false);

  const { data: catalog = [], isLoading } = useCatalog();
  const { data: sold } = useSoldMix(year, month0);

  const soldTotal = sold?.total ?? 0;
  const soldMix: SoldMix = sold?.mix ?? new Map();

  // Effective total: what the user typed, or fall back to real sold (if they
  // click "Usar ventas reales"). If both are 0 we show nothing.
  const effectiveTotal = targetBultos > 0 ? targetBultos : 0;

  const preview = !catalog.length
    ? null
    : buildMonthlySales({ year, month0, catalog, soldMix, totalBultos: effectiveTotal });

  const handleDownload = async () => {
    if (!catalog.length) return;
    setGenerating(true);
    try {
      await new Promise((r) => setTimeout(r, 10));
      downloadVentasPdf({ year, month0, catalog, soldMix, totalBultos: effectiveTotal, viewMode });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadDeck = async () => {
    if (!catalog.length) return;
    setGeneratingDeck(true);
    try {
      await new Promise((r) => setTimeout(r, 10));
      // Fetch prev month data client-side for the deck's MoM delta slide
      const prevYear = month0 === 0 ? year - 1 : year;
      const prevMonth = month0 === 0 ? 11 : month0 - 1;
      const { fetchAllRows } = await import("@/lib/fetch-all");
      const prevOrders = await fetchAllRows<{ id: string }>(() =>
        (supabase as any)
          .from("orders")
          .select("id")
          .eq("status", "Entregado")
          .gte("order_date", monthStart(prevYear, prevMonth))
          .lt("order_date", monthEnd(prevYear, prevMonth)),
      );
      const prevOrderIds = prevOrders.map((r) => r.id);
      const prevSoldMix: SoldMix = new Map();
      let prevTotal = 0;
      if (prevOrderIds.length) {
        const prevRows = await fetchAllRows<any>(() =>
          (supabase as any)
            .from("order_items")
            .select("quantity, product_id")
            .in("order_id", prevOrderIds),
        );
        for (const row of prevRows as any[]) {
          if (!row.product_id || !row.quantity) continue;
          const q = Number(row.quantity);
          prevSoldMix.set(row.product_id, (prevSoldMix.get(row.product_id) ?? 0) + q);
          prevTotal += q;
        }
      }
      downloadVentasPresentationPdf({
        year, month0, catalog, soldMix, totalBultos: effectiveTotal,
        prevSoldMix, prevTotalBultos: prevTotal,
      });
    } finally {
      setGeneratingDeck(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-blue-600" />
          {tx("Ventas — Reporte mensual")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tx("Canal misceláneas ADM · Naucalpan y 4 municipios aledaños.")}
        </p>
      </div>

      <HistoricalSalesPanel />

      {/* Parámetros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tx("Parámetros")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <Label>{tx("Mes")}</Label>
            <Select value={String(month0)} onValueChange={(v) => setMonth0(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS_ES.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{tx("Año")}</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())}
            />
          </div>
          <div>
            <Label>Bultos del mes</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={targetBultos}
                onChange={(e) => setTargetBultos(Number(e.target.value) || 0)}
                placeholder="0"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!soldTotal}
                onClick={() => setTargetBultos(soldTotal)}
                title="Llenar con ventas reales del mes"
              >
                {soldTotal > 0 ? `Usar ${fmtInt(soldTotal)}` : "Sin ventas"}
              </Button>
            </div>
            {soldTotal > 0 && targetBultos !== soldTotal && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Ventas entregadas este mes: <b>{fmtInt(soldTotal)}</b>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {preview && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon={<Package className="h-5 w-5" />}
            label={tx("Bultos del mes")}
            value={fmtInt(preview.totals.bultos)}
          />
          <StatCard
            icon={<Store className="h-5 w-5" />}
            label={tx("Tiendas activas")}
            value={fmtInt(preview.totals.tiendas)}
          />
          <StatCard
            icon={<MapPin className="h-5 w-5" />}
            label={tx("Importe total")}
            value={fmtMXN(preview.totals.importe)}
          />
        </div>
      )}

      {/* Logística de rutas */}
      {preview && <LogisticaCard year={year} month0={month0} preview={preview} />}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Descargar reporte mensual</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              PDF de 7 páginas: portada, resumen, cobertura, mezcla de producto,
              detalle de ventas, indicadores y metodología.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              onClick={handleDownloadDeck}
              disabled={isLoading || generatingDeck || !catalog.length}
              size="lg"
              variant="outline"
              className="gap-2"
            >
              {generatingDeck ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Presentation className="h-4 w-4" />
              )}
              {generatingDeck ? "Generando…" : "Presentación"}
            </Button>
            <Button
              onClick={handleDownload}
              disabled={isLoading || generating || !catalog.length}
              size="lg"
              className="gap-2"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {generating ? "Generando…" : "Descargar PDF"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cobertura por municipio</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Municipio</th>
                  <th className="py-2 font-medium text-right">Tiendas</th>
                  <th className="py-2 font-medium text-right">Bultos</th>
                  <th className="py-2 font-medium text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.totals.porMunicipio)
                  .sort((a, b) => b[1].importe - a[1].importe)
                  .map(([muni, v]) => (
                    <tr key={muni} className="border-t">
                      <td className="py-2">{muni}</td>
                      <td className="py-2 text-right">{fmtInt(v.tiendas)}</td>
                      <td className="py-2 text-right">{fmtInt(v.bultos)}</td>
                      <td className="py-2 text-right">{fmtMXN(v.importe)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {catalog.length > 0 && (
        <ReporteADM
          catalog={catalog}
          currentYear={year}
          currentMonth0={month0}
          currentTotalBultos={effectiveTotal}
          currentSoldMix={soldMix}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      )}

      {!catalog.length && !isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No se encontraron productos activos en el catálogo.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────── Reporte ADM ─────────────────────────── */

type ShopRollup = {
  shop: Shop;
  bultos: number;
  importe: number;
};

function rollupByShop(rows: SaleRow[], shops: Shop[]) {
  const byClave = new Map(shops.map((s) => [s.clave, s]));
  const map = new Map<string, ShopRollup>();
  for (const r of rows) {
    const shop = byClave.get(r.claveCliente);
    if (!shop) continue;
    const cur = map.get(r.claveCliente) || { shop, bultos: 0, importe: 0 };
    cur.bultos += r.piezas;
    cur.importe += r.importe;
    map.set(r.claveCliente, cur);
  }
  return map;
}

function ReporteADM({
  catalog,
  currentYear,
  currentMonth0,
  currentTotalBultos,
  currentSoldMix,
  viewMode,
  setViewMode,
}: {
  catalog: CatalogItem[];
  currentYear: number;
  currentMonth0: number;
  currentTotalBultos: number;
  currentSoldMix: SoldMix;
  viewMode: "name" | "code";
  setViewMode: (m: "name" | "code") => void;
}) {
  const prevDate = new Date(currentYear, currentMonth0 - 1, 1);
  const [bYear, setBYear] = useState(prevDate.getFullYear());
  const [bMonth0, setBMonth0] = useState(prevDate.getMonth());
  const [filterMuni, setFilterMuni] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "new" | "lost" | "grew" | "shrank">("all");
  const [sortBy, setSortBy] = useState<
    "deltaBultos" | "deltaImporte" | "bultosDesc" | "importeDesc" | "cliente"
  >("bultosDesc");

  // Real sales for the comparison month
  const { data: bSold } = useSoldMix(bYear, bMonth0);
  const bSoldMix: SoldMix = bSold?.mix ?? new Map();
  const bTotal = bSold?.total ?? 0;

  const a = useMemo(
    () => buildMonthlySales({
      year: currentYear, month0: currentMonth0, catalog,
      soldMix: currentSoldMix, totalBultos: currentTotalBultos,
    }),
    [currentYear, currentMonth0, catalog, currentSoldMix, currentTotalBultos]
  );
  const b = useMemo(
    () => buildMonthlySales({
      year: bYear, month0: bMonth0, catalog,
      soldMix: bSoldMix, totalBultos: bTotal,
    }),
    [bYear, bMonth0, catalog, bSoldMix, bTotal]
  );

  const rollA = useMemo(() => rollupByShop(a.rows, a.shops), [a]);
  const rollB = useMemo(() => rollupByShop(b.rows, b.shops), [b]);

  const diffRows = useMemo(() => {
    const claves = new Set<string>([...rollA.keys(), ...rollB.keys()]);
    const list = [...claves].map((clave) => {
      const ra = rollA.get(clave);
      const rb = rollB.get(clave);
      const shop = ra?.shop || rb!.shop;
      const ba = ra?.bultos || 0;
      const bb = rb?.bultos || 0;
      const ia = ra?.importe || 0;
      const ib = rb?.importe || 0;
      return {
        shop,
        clave,
        bultosA: ba,
        bultosB: bb,
        deltaBultos: ba - bb,
        importeA: ia,
        importeB: ib,
        deltaImporte: ia - ib,
        isNew: ba > 0 && bb === 0,
        isLost: ba === 0 && bb > 0,
      };
    });
    return list;
  }, [rollA, rollB]);

  const summary = useMemo(() => {
    const newShops = diffRows.filter((r) => r.isNew).length;
    const lost = diffRows.filter((r) => r.isLost).length;
    const grew = diffRows.filter((r) => !r.isNew && !r.isLost && r.deltaBultos > 0).length;
    const shrank = diffRows.filter((r) => !r.isNew && !r.isLost && r.deltaBultos < 0).length;
    const deltaBultosTotal = a.totals.bultos - b.totals.bultos;
    const deltaImporteTotal = a.totals.importe - b.totals.importe;
    return { newShops, lost, grew, shrank, deltaBultosTotal, deltaImporteTotal };
  }, [diffRows, a, b]);

  const filtered = useMemo(() => {
    let list = diffRows;
    if (filterMuni !== "all") list = list.filter((r) => r.shop.municipio === filterMuni);
    if (filterType === "new") list = list.filter((r) => r.isNew);
    else if (filterType === "lost") list = list.filter((r) => r.isLost);
    else if (filterType === "grew") list = list.filter((r) => !r.isNew && !r.isLost && r.deltaBultos > 0);
    else if (filterType === "shrank") list = list.filter((r) => !r.isNew && !r.isLost && r.deltaBultos < 0);

    const sorted = [...list];
    if (sortBy === "deltaBultos") sorted.sort((x, y) => Math.abs(y.deltaBultos) - Math.abs(x.deltaBultos));
    else if (sortBy === "deltaImporte") sorted.sort((x, y) => Math.abs(y.deltaImporte) - Math.abs(x.deltaImporte));
    else if (sortBy === "bultosDesc") sorted.sort((x, y) => y.bultosA - x.bultosA);
    else if (sortBy === "importeDesc") sorted.sort((x, y) => y.importeA - x.importeA);
    else sorted.sort((x, y) => x.shop.nombre.localeCompare(y.shop.nombre));
    return sorted;
  }, [diffRows, filterMuni, filterType, sortBy]);

  const monthLabelA = `${MONTHS_ES[currentMonth0]} ${currentYear}`;
  const monthLabelB = `${MONTHS_ES[bMonth0]} ${bYear}`;

  const municipios = useMemo(
    () => [...new Set(diffRows.map((r) => r.shop.municipio))].sort(),
    [diffRows]
  );

  return (
    <div className="space-y-4">
      {/* Comparison selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparar contra</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <Label>Mes (actual)</Label>
            <div className="h-10 flex items-center px-3 text-sm border rounded-md bg-muted">
              {monthLabelA}
            </div>
          </div>
          <div>
            <Label>Mes (comparación)</Label>
            <Select value={String(bMonth0)} onValueChange={(v) => setBMonth0(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS_ES.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Año (comparación)</Label>
            <Input
              type="number"
              value={bYear}
              onChange={(e) => setBYear(Number(e.target.value) || bYear)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DeltaCard
          label="Nuevas tiendas"
          value={fmtInt(summary.newShops)}
          tone="pos"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <DeltaCard
          label="Tiendas perdidas"
          value={fmtInt(summary.lost)}
          tone="neg"
          icon={<MinusCircle className="h-4 w-4" />}
        />
        <DeltaCard
          label="Δ Bultos totales"
          value={signed(summary.deltaBultosTotal, fmtInt)}
          tone={summary.deltaBultosTotal >= 0 ? "pos" : "neg"}
          icon={summary.deltaBultosTotal >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        />
        <DeltaCard
          label="Δ Importe total"
          value={signed(summary.deltaImporteTotal, fmtMXN)}
          tone={summary.deltaImporteTotal >= 0 ? "pos" : "neg"}
          icon={summary.deltaImporteTotal >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        />
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-3">
        <Label className="text-xs">Ver por</Label>
        <div className="inline-flex border rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode("name")}
            className={cn(
              "px-4 py-1.5 text-sm",
              viewMode === "name" ? "bg-blue-600 text-white" : "bg-background hover:bg-muted"
            )}
          >
            Por nombre
          </button>
          <button
            type="button"
            onClick={() => setViewMode("code")}
            className={cn(
              "px-4 py-1.5 text-sm border-l",
              viewMode === "code" ? "bg-blue-600 text-white" : "bg-background hover:bg-muted"
            )}
          >
            Por ID cliente
          </button>
        </div>
      </div>

      {/* Top movers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MoverList
          title="Top crecimiento"
          tone="pos"
          viewMode={viewMode}
          rows={diffRows
            .filter((r) => !r.isNew && !r.isLost)
            .sort((x, y) => y.deltaBultos - x.deltaBultos)
            .slice(0, 5)}
        />
        <MoverList
          title="Top caídas"
          tone="neg"
          viewMode={viewMode}
          rows={diffRows
            .filter((r) => !r.isNew && !r.isLost)
            .sort((x, y) => x.deltaBultos - y.deltaBultos)
            .slice(0, 5)}
        />
        <MoverList
          title="Nuevas tiendas"
          tone="pos"
          viewMode={viewMode}
          rows={diffRows
            .filter((r) => r.isNew)
            .sort((x, y) => y.bultosA - x.bultosA)
            .slice(0, 5)}
        />
      </div>

      {/* Detail table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Detalle por tienda — {monthLabelA} vs {monthLabelB}
          </CardTitle>
          <div className="flex flex-wrap gap-3 mt-3">
            <div>
              <Label className="text-xs">Municipio</Label>
              <Select value={filterMuni} onValueChange={setFilterMuni}>
                <SelectTrigger className="w-[200px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipios.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
                <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="new">Solo nuevas</SelectItem>
                  <SelectItem value="lost">Solo perdidas</SelectItem>
                  <SelectItem value="grew">Que crecieron</SelectItem>
                  <SelectItem value="shrank">Que bajaron</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Orden</Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-[220px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bultosDesc">Más bultos (mes actual)</SelectItem>
                  <SelectItem value="importeDesc">Más importe (mes actual)</SelectItem>
                  <SelectItem value="deltaBultos">Δ Bultos (magnitud)</SelectItem>
                  <SelectItem value="deltaImporte">Δ Importe (magnitud)</SelectItem>
                  <SelectItem value="cliente">Nombre cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto text-xs text-muted-foreground self-end">
              {fmtInt(filtered.length)} de {fmtInt(diffRows.length)} tiendas
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 px-3 font-medium">Ruta</th>
                  <th className="py-2 px-3 font-medium">Cliente</th>
                  <th className="py-2 px-3 font-medium">Municipio</th>
                  <th className="py-2 px-3 font-medium text-right">Bultos {monthLabelA}</th>
                  <th className="py-2 px-3 font-medium text-right">Bultos {monthLabelB}</th>
                  <th className="py-2 px-3 font-medium text-right">Δ Bultos</th>
                  <th className="py-2 px-3 font-medium text-right">Importe {monthLabelA}</th>
                  <th className="py-2 px-3 font-medium text-right">Δ Importe</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 800).map((r) => (
                  <tr key={r.clave} className="border-b hover:bg-muted/30">
                    <td className="py-1.5 px-3 font-mono">{r.shop.ruta}</td>
                    <td className="py-1.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-mono",
                          r.isLost && "line-through text-muted-foreground"
                        )}>
                          {viewMode === "code" ? r.shop.clave : r.shop.nombre}
                        </span>
                        {r.isNew && (
                          <span className="px-1.5 py-0.5 text-[9px] bg-green-100 text-green-700 rounded">
                            NUEVA
                          </span>
                        )}
                        {r.isLost && (
                          <span className="px-1.5 py-0.5 text-[9px] bg-red-100 text-red-700 rounded">
                            PERDIDA
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        {viewMode === "code" ? r.shop.nombre : r.shop.clave} · {r.shop.colonia}
                      </div>
                    </td>
                    <td className="py-1.5 px-3">{r.shop.municipio}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{fmtInt(r.bultosA)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{fmtInt(r.bultosB)}</td>
                    <td
                      className={cn(
                        "py-1.5 px-3 text-right tabular-nums font-semibold",
                        r.deltaBultos > 0 && "text-green-600",
                        r.deltaBultos < 0 && "text-red-600"
                      )}
                    >
                      {signed(r.deltaBultos, fmtInt)}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{fmtMXN(r.importeA)}</td>
                    <td
                      className={cn(
                        "py-1.5 px-3 text-right tabular-nums font-semibold",
                        r.deltaImporte > 0 && "text-green-600",
                        r.deltaImporte < 0 && "text-red-600"
                      )}
                    >
                      {signed(r.deltaImporte, fmtMXN)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 800 && (
              <div className="p-3 text-center text-xs text-muted-foreground">
                Mostrando 800 de {fmtInt(filtered.length)}. Filtra para ver más específico.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MoverList({
  title,
  tone,
  rows,
  viewMode,
}: {
  title: string;
  tone: "pos" | "neg";
  viewMode: "name" | "code";
  rows: Array<{
    shop: Shop;
    bultosA: number;
    bultosB: number;
    deltaBultos: number;
    isNew: boolean;
  }>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin movimientos.</p>
        )}
        {rows.map((r) => (
          <div key={r.shop.clave} className="flex items-center justify-between text-xs">
            <div className="min-w-0 flex-1">
              <div className={cn("truncate font-medium", viewMode === "code" && "font-mono")}>
                {viewMode === "code" ? r.shop.clave : r.shop.nombre}
              </div>
              <div className="text-muted-foreground text-[10px]">{r.shop.municipio}</div>
            </div>
            <div
              className={cn(
                "tabular-nums font-semibold ml-2 shrink-0",
                tone === "pos" ? "text-green-600" : "text-red-600"
              )}
            >
              {r.isNew ? `+${fmtInt(r.bultosA)}` : signed(r.deltaBultos, fmtInt)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DeltaCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "pos" | "neg";
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div
          className={cn(
            "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
            tone === "pos" ? "text-green-700" : "text-red-700"
          )}
        >
          {icon}
          {label}
        </div>
        <div className="text-xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function signed(n: number, fmt: (n: number) => string): string {
  if (n === 0) return fmt(0);
  const sign = n > 0 ? "+" : "−";
  return `${sign}${fmt(Math.abs(n))}`;
}

/* ────────────── Logística card ────────────── */

/**
 * Projects when the universe growth will push route count past the current
 * value. Uses the same GROWTH_PER_MONTH = 1.5% and ROUTE_TARGET = 190 as the
 * generator, so numbers stay consistent with the PDF.
 */
function computeNextRoute(year: number, month0: number, currentRoutes: number) {
  const GROWTH = 0.015;
  const ROUTE_TARGET = 190;
  const MIN_ROUTES = 15;
  const currentN = universeSizeForMonth(year, month0);
  // Threshold for the next route tier
  const nextTier = Math.max(MIN_ROUTES + 1, currentRoutes + 1);
  const thresholdN = (nextTier - 1) * ROUTE_TARGET + 1;
  if (currentN >= thresholdN) {
    return { months: 0, label: "Este mes" };
  }
  const m = Math.ceil(Math.log(thresholdN / currentN) / Math.log(1 + GROWTH));
  // Compute target month label
  const targetMonth0 = (month0 + m) % 12;
  const targetYear = year + Math.floor((month0 + m) / 12);
  const monthLabel = `${MONTHS_ES[targetMonth0]} ${targetYear}`;
  return { months: m, label: `~${monthLabel}` };
}

function LogisticaCard({
  year,
  month0,
  preview,
}: {
  year: number;
  month0: number;
  preview: ReturnType<typeof buildMonthlySales>;
}) {
  const routeCount = useMemo(
    () => new Set(preview.shops.map((s) => s.ruta).filter(Boolean)).size,
    [preview.shops]
  );

  // Stops per route per week from generated detail rows:
  // distinct (ruta, cliente, fecha) = delivery events. 4.33 weeks per month.
  const stopsPerRoutePerWeek = useMemo(() => {
    if (routeCount === 0) return 0;
    const events = new Set<string>();
    for (const r of preview.rows) {
      events.add(`${r.ruta}::${r.claveCliente}::${r.fecha}`);
    }
    return Math.round(events.size / routeCount / 4.33);
  }, [preview.rows, routeCount]);

  const nextRoute = useMemo(
    () => computeNextRoute(year, month0, routeCount),
    [year, month0, routeCount]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4 text-blue-600" />
          Logística de rutas
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <RouteIcon className="h-4 w-4" />
            Rutas activas
          </div>
          <div className="text-2xl font-bold mt-1">{fmtInt(routeCount)}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            170–210 clientes por ruta
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Store className="h-4 w-4" />
            Paradas / ruta / semana
          </div>
          <div className="text-2xl font-bold mt-1">{fmtInt(stopsPerRoutePerWeek)}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            ≈ {Math.round(stopsPerRoutePerWeek / 5)} por día hábil
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <CalendarClock className="h-4 w-4" />
            Próxima ruta
          </div>
          <div className="text-2xl font-bold mt-1">{nextRoute.label}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {nextRoute.months === 0
              ? "Ya lista para activarse"
              : `En ${nextRoute.months} ${nextRoute.months === 1 ? "mes" : "meses"}`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold mt-2">{value}</div>
      </CardContent>
    </Card>
  );
}
