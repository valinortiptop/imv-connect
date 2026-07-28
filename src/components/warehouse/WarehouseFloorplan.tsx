// @ts-nocheck
/**
 * WarehouseFloorplan
 *
 * Visual 2D map of IMV's warehouse matching document IMV-D-AL-01/08.
 * Reads `warehouse_slots` + `slot_contents` and shows every rack,
 * zone, and flow area in its real physical position. Clicking any
 * rack slot or zone opens a detail sheet with contents.
 *
 * Includes an action bar wiring the workstation flows: escanear,
 * historial reciente, almacén pasado (as-of viewer), importar Excel,
 * kardex, y un link a la estación completa (WarehousePage) para los
 * flujos avanzados (batch move, fulfill orders, transit zones, etc.).
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  Snowflake,
  ShieldAlert,
  ScanLine,
  Undo2,
  History,
  Download,
  Maximize2,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { BarcodeScannerDialog, type ScannerMode } from "@/components/warehouse/BarcodeScannerDialog";
import { RecentMovementsSheet } from "@/components/warehouse/RecentMovementsSheet";
import { HistoricalInventoryDialog } from "@/components/warehouse/HistoricalInventoryDialog";
import { ImportInventoryDialog } from "@/components/warehouse/ImportInventoryDialog";
import { ScannerPickDialog, type ScannerPickCandidate } from "@/components/warehouse/ScannerPickDialog";

interface Slot {
  id: string;
  code: string;
  block: string | null;
  row_letter: string | null;
  position: number | null;
  zone: string;
  blocked: boolean;
  active: boolean;
}

interface SlotContent {
  id: string;
  slot_id: string;
  product_id: string | null;
  barcode: string | null;
  quantity: number;
  lote: string | null;
  expiration_date: string | null;
  description: string | null;
  products: { id?: string; clave: string; name: string; image_url?: string | null } | null;
}

const ZONE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  storage: { bg: "bg-emerald-500", text: "text-white", label: "Disponible" },
  g1: { bg: "bg-emerald-600", text: "text-white", label: "G1 · Controlados" },
  cuarentena: { bg: "bg-yellow-300", text: "text-neutral-900", label: "Cuarentena" },
  merma: { bg: "bg-neutral-900", text: "text-white", label: "Merma" },
  caduco: { bg: "bg-red-600", text: "text-white", label: "Caduco" },
  "dev-clientes": { bg: "bg-pink-200", text: "text-neutral-900", label: "Dev. Clientes" },
  "dev-proveedores": { bg: "bg-orange-400", text: "text-neutral-900", label: "Dev. Proveedores" },
  "pedidos-reprog": { bg: "bg-pink-500", text: "text-white", label: "Pedidos reprog." },
  "pt-limitado": { bg: "bg-sky-300", text: "text-neutral-900", label: "PT Limitado" },
  "alm-temporal": { bg: "bg-rose-200", text: "text-neutral-900", label: "Almacén temporal" },
  insecticidas: { bg: "bg-orange-300", text: "text-neutral-900", label: "Insecticidas" },
  "camara-fria": { bg: "bg-cyan-300", text: "text-neutral-900", label: "Cámara fría" },
  confinamiento: { bg: "bg-purple-500", text: "text-white", label: "Confinamiento" },
  congelador: { bg: "bg-white border-2 border-neutral-300", text: "text-neutral-900", label: "Congelador" },
  surtido: { bg: "bg-white border-2 border-red-400", text: "text-neutral-900", label: "Surtido de pedidos" },
  "pedidos-surtidos": { bg: "bg-white border-2 border-neutral-400", text: "text-neutral-900", label: "Pedidos surtidos" },
  "material-embalaje": { bg: "bg-pink-100", text: "text-neutral-900", label: "Material embalaje" },
  embarque: { bg: "bg-white border-2 border-red-500", text: "text-neutral-900", label: "Entrega pedidos" },
  recibo: { bg: "bg-white border-2 border-sky-500", text: "text-neutral-900", label: "Recepción proveedores" },
  migracion: { bg: "bg-amber-400", text: "text-neutral-900", label: "Migración (temporal)" },
};

const RACK_POSITIONS: Record<string, number> = { A: 5, B: 5, C: 5, D: 4, E: 4, F: 4 };

function slotStyle(zone: string) {
  return ZONE_STYLES[zone] ?? { bg: "bg-neutral-200", text: "text-neutral-900", label: zone };
}

export default function WarehouseFloorplan() {
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [focusSlotId, setFocusSlotId] = useState<string | null>(null);


  // Action-bar dialog state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<ScannerMode>("buscar");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historicalOpen, setHistoricalOpen] = useState(false);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pickPrompt, setPickPrompt] = useState<{
    barcode: string;
    candidates: ScannerPickCandidate[];
  } | null>(null);

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["floorplan-slots"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("warehouse_slots")
        .select("id, code, block, row_letter, position, zone, blocked, active")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as Slot[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: contents = [] } = useQuery({
    queryKey: ["floorplan-contents"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("slot_contents")
        .select(
          "id, slot_id, product_id, barcode, quantity, lote, expiration_date, description, products(id, clave, name, image_url)",
        );
      if (error) throw error;
      return (data ?? []) as SlotContent[];
    },
    staleTime: 60 * 1000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["floorplan-products-min"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, clave")
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as { id: string; clave: string }[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const contentsBySlot = useMemo(() => {
    const map = new Map<string, SlotContent[]>();
    for (const c of contents) {
      const arr = map.get(c.slot_id) ?? [];
      arr.push(c);
      map.set(c.slot_id, arr);
    }
    return map;
  }, [contents]);

  const slotsByCode = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const s of slots) map.set(s.code, s);
    return map;
  }, [slots]);

  const openSlot = openSlotId ? slots.find((s) => s.id === openSlotId) ?? null : null;
  const focusSlot = focusSlotId ? slots.find((s) => s.id === focusSlotId) ?? null : null;
  const focusRackLetter = focusSlot
    ? focusSlot.zone === "g1"
      ? "G1"
      : /^([A-F])-N\d+-P\d+$/.test(focusSlot.code)
        ? focusSlot.code.charAt(0)
        : null
    : null;

  const openContents = openSlotId ? contentsBySlot.get(openSlotId) ?? [] : [];

  const findByCode = (code: string) => slotsByCode.get(code);

  // Resolve a scanned barcode → open the matching slot (buscar) or the
  // pick dialog (picar).
  const handleScan = async (raw: string, mode: ScannerMode) => {
    const value = raw.trim();
    if (!value) return;
    try {
      let candidates = contents.filter((c) => c.barcode === value);
      let resolvedProduct: { id: string; clave: string; name: string; image_url: string | null } | null = null;
      if (candidates.length === 0) {
        const { data: prods } = await (supabase as any)
          .from("products")
          .select("id, clave, name, image_url")
          .or(`barcode.eq.${value},case_barcode.eq.${value}`)
          .limit(1);
        resolvedProduct = (prods ?? [])[0] ?? null;
        if (resolvedProduct) {
          candidates = contents.filter((c) => c.product_id === resolvedProduct!.id);
        }
      }

      if (candidates.length === 0) {
        toast.error(`Código ${value} no encontrado`);
        return;
      }

      if (mode === "buscar") {
        const slot = slots.find((s) => s.id === candidates[0].slot_id);
        setOpenSlotId(candidates[0].slot_id);
        setScannerOpen(false);
        toast.success(
          resolvedProduct
            ? `${resolvedProduct.clave} en ${slot?.code ?? "posición"}`
            : "Posición encontrada",
        );
        return;
      }

      // picar
      const sorted = [...candidates].sort((a, b) => {
        if (!a.expiration_date && !b.expiration_date) return 0;
        if (!a.expiration_date) return 1;
        if (!b.expiration_date) return -1;
        return a.expiration_date.localeCompare(b.expiration_date);
      });
      const slotMap = new Map(slots.map((s) => [s.id, s] as const));
      setScannerOpen(false);
      setPickPrompt({
        barcode: value,
        candidates: sorted.map((c) => ({
          id: c.id,
          slot_code: slotMap.get(c.slot_id)?.code ?? "—",
          product_clave: c.products?.clave ?? resolvedProduct?.clave ?? null,
          product_name: c.products?.name ?? resolvedProduct?.name ?? c.description ?? null,
          product_image_url: c.products?.image_url ?? resolvedProduct?.image_url ?? null,
          lote: c.lote,
          expiration_date: c.expiration_date,
          quantity: c.quantity,
        })),
      });
    } catch (err: any) {
      toast.error("Error al buscar: " + (err.message ?? "desconocido"));
    }
  };

  /** Small tile for a single rack position. */
  function RackSlot({ code }: { code: string }) {
    const s = findByCode(code);
    if (!s) return <div className="h-6 w-full rounded bg-neutral-200" />;
    const filled = (contentsBySlot.get(s.id)?.length ?? 0) > 0;
    return (
      <button
        onClick={() => setOpenSlotId(s.id)}
        title={`${s.code}${filled ? " · con producto" : " · vacío"}`}
        className={cn(
          "h-6 w-full rounded border border-emerald-900/40 transition-all",
          filled ? "bg-emerald-500 hover:bg-emerald-400" : "bg-emerald-500/40 hover:bg-emerald-400/60",
        )}
      />
    );
  }

  /** A green rack column: 6 levels × N positions, N ∈ {4,5}. */
  function Rack({ letter, positions }: { letter: string; positions: number }) {
    const levels = [6, 5, 4, 3, 2, 1];
    const filled = slots
      .filter((s) => s.block === letter)
      .reduce((n, s) => n + ((contentsBySlot.get(s.id)?.length ?? 0) > 0 ? 1 : 0), 0);
    const total = 6 * positions;
    return (
      <div className="flex flex-col rounded-md bg-emerald-700 p-1.5 shadow-md">
        <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white">
          <span>Rack {letter}</span>
          <span className="opacity-80">
            {filled}/{total}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {levels.map((lvl) => (
            <div key={lvl} className="flex items-center gap-1">
              <span className="w-4 text-center text-[9px] font-mono text-white/70">N{lvl}</span>
              <div
                className="grid flex-1 gap-1"
                style={{ gridTemplateColumns: `repeat(${positions}, minmax(0,1fr))` }}
              >
                {Array.from({ length: positions }, (_, i) => (
                  <RackSlot key={i} code={`${letter}-N${lvl}-P${i + 1}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function Zone({
    zone,
    code,
    className,
    icon,
    tall,
  }: {
    zone: string;
    code?: string;
    className?: string;
    icon?: React.ReactNode;
    tall?: boolean;
  }) {
    const s = code ? findByCode(code) : slots.find((x) => x.zone === zone) ?? null;
    const st = slotStyle(zone);
    const filled = s ? (contentsBySlot.get(s.id)?.length ?? 0) : 0;
    return (
      <button
        onClick={() => s && setOpenSlotId(s.id)}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-md p-2 text-center text-[10px] font-bold uppercase leading-tight shadow-sm transition hover:brightness-110",
          st.bg,
          st.text,
          tall ? "min-h-24" : "min-h-14",
          className,
        )}
      >
        {icon}
        <span>{st.label}</span>
        {s && filled > 0 && (
          <Badge variant="secondary" className="mt-0.5 h-4 px-1 text-[9px]">
            {filled} lote{filled !== 1 ? "s" : ""}
          </Badge>
        )}
      </button>
    );
  }

  function G1Block() {
    const filled = slots
      .filter((s) => s.zone === "g1")
      .reduce((n, s) => n + ((contentsBySlot.get(s.id)?.length ?? 0) > 0 ? 1 : 0), 0);
    return (
      <div className="rounded-md bg-emerald-800 p-1.5 shadow">
        <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase text-white">
          <span>G1 · Controlados</span>
          <span className="opacity-80">{filled}/20</span>
        </div>
        <div className="flex flex-col gap-1">
          {[5, 4, 3, 2, 1].map((lvl) => (
            <div key={lvl} className="grid grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((p) => {
                const s = findByCode(`G1-N${lvl}-P${p}`);
                const isFilled = s ? (contentsBySlot.get(s.id)?.length ?? 0) > 0 : false;
                return (
                  <button
                    key={p}
                    onClick={() => s && setOpenSlotId(s.id)}
                    title={`G1-N${lvl}-P${p}`}
                    className={cn(
                      "h-5 rounded border border-emerald-950/60 text-[8px] font-bold",
                      isFilled ? "bg-emerald-400 text-emerald-950" : "bg-emerald-500/30",
                    )}
                  >
                    G1
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slotsLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Cargando layout…</div>;
  }

  return (
    <div className="space-y-4 p-4">
      {/* HEADER + ACTION BAR */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Almacén IMV</h1>
          <p className="text-xs text-muted-foreground">
            Layout físico según IMV-D-AL-01/08 — Necaxa 125 Bis, Portales
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => { setScannerMode("buscar"); setScannerOpen(true); }}>
            <ScanLine className="h-4 w-4" /> Escanear
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHistoryOpen(true)}>
            <Undo2 className="h-4 w-4" /> Historial reciente
          </Button>
          <Button
            variant={asOf ? "default" : "outline"}
            size="sm"
            className={cn("gap-1.5", asOf && "bg-purple-500 text-white hover:bg-purple-600")}
            onClick={() => setHistoricalOpen(true)}
          >
            <History className="h-4 w-4" /> {asOf ? "Pasado activo" : "Almacén pasado"}
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/admin/kardex">
              <History className="h-4 w-4" /> Kardex
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4 rotate-180" /> Importar Excel
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/admin/almacen/operacion">
              <Wrench className="h-4 w-4" /> Estación completa
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end text-xs text-muted-foreground">
        <div className="text-right">
          <div>{slots.length} posiciones totales</div>
          <div>{contents.length} lotes almacenados</div>
        </div>
      </div>

      {/* MAIN FLOORPLAN */}
      <Card className="overflow-hidden border-2 border-neutral-300 bg-neutral-50 p-4 dark:bg-neutral-900">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-4">
            <G1Block />
            <div className="mt-1 rounded border border-dashed border-neutral-400 px-2 py-1 text-center text-[10px] uppercase text-muted-foreground">
              Estaciones de trabajo
            </div>
          </div>
          <div className="col-span-8 flex items-center justify-center">
            <div className="flex items-center gap-1 text-sky-500">
              <ArrowRight className="h-5 w-5" />
              <span className="text-[10px] font-bold uppercase">Flujo entrada</span>
            </div>
          </div>

          <div className="col-span-2 flex flex-col gap-1">
            <div className="grid grid-cols-2 gap-1">
              <Zone zone="caduco" />
              <Zone zone="dev-proveedores" />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Zone zone="cuarentena" code="CUARENTENA-1" />
              <Zone zone="cuarentena" code="CUARENTENA-2" />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Zone zone="merma" />
              <div />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Zone zone="confinamiento" icon={<ShieldAlert className="h-3 w-3" />} tall />
              <div className="flex flex-col gap-1">
                <Zone zone="pt-limitado" />
                <Zone zone="dev-clientes" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Zone zone="pedidos-reprog" />
              <Zone zone="congelador" icon={<Snowflake className="h-3 w-3" />} />
            </div>
          </div>

          <div className="col-span-4 grid grid-cols-3 gap-2">
            <Rack letter="F" positions={4} />
            <Rack letter="E" positions={4} />
            <Rack letter="D" positions={4} />
          </div>

          <div className="col-span-6 grid grid-cols-3 gap-2">
            <Rack letter="C" positions={5} />
            <Rack letter="B" positions={5} />
            <Rack letter="A" positions={5} />
          </div>

          <div className="col-span-3">
            <Zone zone="camara-fria" icon={<Snowflake className="h-4 w-4" />} tall className="h-40" />
          </div>
          <div className="col-span-5 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Zone zone="pedidos-surtidos" />
              <Zone zone="surtido" />
            </div>
            <div className="flex items-center justify-center gap-2 text-red-500">
              <ArrowDown className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase">Flujo salida</span>
              <ArrowUp className="h-4 w-4 text-sky-500" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Zone zone="insecticidas" />
              <Zone zone="material-embalaje" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Zone zone="alm-temporal" code="ALM-TEMPORAL-1" />
              <Zone zone="alm-temporal" code="ALM-TEMPORAL-2" />
            </div>
          </div>
          <div className="col-span-4 flex flex-col justify-end gap-2">
            <div className="rounded border border-dashed border-neutral-400 px-2 py-2 text-center text-[10px] uppercase text-muted-foreground">
              Acceso personal almacén
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Zone zone="embarque" code="ENTREGA-PEDIDOS" icon={<ArrowDown className="h-3 w-3" />} />
              <Zone zone="recibo" code="RECEPCION-PROVEEDORES" icon={<ArrowUp className="h-3 w-3" />} />
            </div>
          </div>
        </div>
      </Card>

      {(() => {
        const mig = slots.find((s) => s.zone === "migracion");
        const migContents = mig ? contentsBySlot.get(mig.id) ?? [] : [];
        return mig ? (
          <Card
            className="cursor-pointer border-amber-400 bg-amber-50 p-3 hover:bg-amber-100 dark:bg-amber-950/30"
            onClick={() => setOpenSlotId(mig.id)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-amber-900 dark:text-amber-100">
                  🚧 Slot MIGRACION (temporal)
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  Bandeja para reubicar inventario tras el rediseño del layout.
                </div>
              </div>
              <Badge className="bg-amber-500 text-white">
                {migContents.length} lotes pendientes
              </Badge>
            </div>
          </Card>
        ) : null;
      })()}

      <Card className="p-3">
        <div className="mb-2 text-xs font-bold uppercase text-muted-foreground">Simbología</div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px] md:grid-cols-4 lg:grid-cols-6">
          {Object.entries(ZONE_STYLES).map(([z, st]) => (
            <div key={z} className="flex items-center gap-1.5">
              <span className={cn("h-4 w-4 shrink-0 rounded", st.bg)} />
              <span>{st.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Slot detail sheet */}
      <Sheet open={!!openSlotId} onOpenChange={(v) => !v && setOpenSlotId(null)}>
        <SheetContent side="right" className="w-full max-w-md">
          <SheetHeader>
            <SheetTitle>
              {openSlot?.code}
              {openSlot && (
                <Badge className={cn("ml-2", slotStyle(openSlot.zone).bg, slotStyle(openSlot.zone).text)}>
                  {slotStyle(openSlot.zone).label}
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription>
              {openSlot ? (
                <>
                  Bloque {openSlot.block ?? "—"} · Nivel {openSlot.row_letter ?? "—"} ·
                  Posición {openSlot.position ?? "—"}
                </>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {openContents.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Posición vacía
              </div>
            ) : (
              openContents.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="font-semibold">
                    {c.products?.clave ?? c.description ?? "Sin SKU"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.products?.name ?? c.description ?? ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">Qty: {c.quantity}</Badge>
                    {c.lote && <Badge variant="outline">Lote: {c.lote}</Badge>}
                    {c.expiration_date && (
                      <Badge variant="outline">Cad: {c.expiration_date}</Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {openSlot && (
            <div className="mt-4 border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => {
                  setFocusSlotId(openSlot.id);
                  setOpenSlotId(null);
                }}
              >
                <Maximize2 className="h-4 w-4" /> Abrir en estación completa
              </Button>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Amplía esta sección del layout para ver sus posiciones y lotes.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Zoomed section view */}
      <Dialog open={!!focusSlot} onOpenChange={(v) => !v && setFocusSlotId(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {focusSlot?.code}
              {focusSlot && (
                <Badge className={cn(slotStyle(focusSlot.zone).bg, slotStyle(focusSlot.zone).text)}>
                  {slotStyle(focusSlot.zone).label}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {focusRackLetter
                ? `Rack ${focusRackLetter} ampliado — la posición seleccionada está resaltada.`
                : "Sección ampliada del layout."}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] overflow-auto rounded-md bg-neutral-50 p-4 dark:bg-neutral-900">
            {focusRackLetter === "G1" ? (
              <div className="mx-auto w-full max-w-md scale-[1.6] origin-top py-8">
                <G1Block />
              </div>
            ) : focusRackLetter ? (
              <div className="mx-auto w-full max-w-md scale-[1.6] origin-top py-8">
                <Rack letter={focusRackLetter} positions={RACK_POSITIONS[focusRackLetter] ?? 4} />
              </div>
            ) : focusSlot ? (
              <div className="mx-auto max-w-sm">
                <div
                  className={cn(
                    "flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg p-6 text-center text-sm font-bold uppercase shadow",
                    slotStyle(focusSlot.zone).bg,
                    slotStyle(focusSlot.zone).text,
                  )}
                >
                  <span>{slotStyle(focusSlot.zone).label}</span>
                  <span className="text-xs font-mono opacity-80">{focusSlot.code}</span>
                </div>
              </div>
            ) : null}
          </div>

          {focusSlot && (
            <div className="max-h-48 space-y-2 overflow-auto">
              {(contentsBySlot.get(focusSlot.id) ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Posición vacía</p>
              ) : (
                (contentsBySlot.get(focusSlot.id) ?? []).map((c) => (
                  <div key={c.id} className="rounded-md border border-border p-2 text-sm">
                    <div className="font-semibold">{c.products?.clave ?? c.description ?? "Sin SKU"}</div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Qty: {c.quantity}</span>
                      {c.lote && <span>Lote: {c.lote}</span>}
                      {c.expiration_date && <span>Cad: {c.expiration_date}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Action-bar dialogs */}
      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleScan}
        mode={scannerMode}
        onModeChange={setScannerMode}
      />
      {pickPrompt && (
        <ScannerPickDialog
          open={!!pickPrompt}
          onOpenChange={(o) => !o && setPickPrompt(null)}
          scannedValue={pickPrompt.barcode}
          candidates={pickPrompt.candidates}
          onPickComplete={() => setPickPrompt(null)}
        />
      )}
      <RecentMovementsSheet open={historyOpen} onOpenChange={setHistoryOpen} />
      <HistoricalInventoryDialog
        open={historicalOpen}
        onOpenChange={setHistoricalOpen}
        currentValue={asOf}
        onSelect={(d) => {
          if (d) {
            // Snapshot infra (inventory_snapshots table + list_inventory_snapshots RPC)
            // isn't deployed yet — the map still reads live slot_contents. Refuse the
            // switch so the button never lies about showing past inventory.
            toast.info("Vista histórica no disponible todavía", {
              description: "Aún no se guardan snapshots del inventario. El mapa sigue mostrando el stock actual.",
            });
            setAsOf(null);
            return;
          }
          setAsOf(null);
        }}
      />
      <ImportInventoryDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        slots={slots as any}
        contents={contents as any}
        products={products as any}
      />
    </div>
  );
}
