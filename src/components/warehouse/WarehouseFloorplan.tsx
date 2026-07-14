// @ts-nocheck
/**
 * WarehouseFloorplan
 *
 * Visual 2D map of IMV's warehouse matching document IMV-D-AL-01/08.
 * Reads `warehouse_slots` + `slot_contents` and shows every rack,
 * zone, and flow area in its real physical position. Clicking any
 * rack slot or zone opens a detail sheet with contents.
 *
 * Legend (mirrors the printed layout):
 *   verde  = DISPONIBLE (racks A–F)
 *   negro  = MERMA
 *   amarillo = CUARENTENA
 *   rojo   = CADUCO
 *   rosa claro = DEVOLUCIÓN CLIENTES
 *   rosa fuerte = PEDIDOS REPROGRAMADOS
 *   azul claro = PT LIMITADO
 *   rosa pastel = ALMACÉN TEMPORAL
 *   naranja = DEVOLUCIÓN PROVEEDORES
 *   durazno = INSECTICIDAS
 *   cyan   = CÁMARA FRÍA
 *   morado = CONFINAMIENTO
 *   blanco = CONGELADOR / SURTIDO / PEDIDOS SURTIDOS
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, ArrowRight, ArrowLeft, Snowflake, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

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
  quantity: number;
  lote: string | null;
  expiration_date: string | null;
  description: string | null;
  products: { clave: string; name: string } | null;
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

function slotStyle(zone: string) {
  return ZONE_STYLES[zone] ?? { bg: "bg-neutral-200", text: "text-neutral-900", label: zone };
}

export default function WarehouseFloorplan() {
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);

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
        .select("id, slot_id, quantity, lote, expiration_date, description, products(clave, name)");
      if (error) throw error;
      return (data ?? []) as SlotContent[];
    },
    staleTime: 60 * 1000,
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
  const openContents = openSlotId ? contentsBySlot.get(openSlotId) ?? [] : [];

  const findByCode = (code: string) => slotsByCode.get(code);

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
    const levels = [6, 5, 4, 3, 2, 1]; // top = highest level (like a real shelf)
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

  /** Bulk zone tile — represents a special area (single slot). */
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

  /** G1 grid: 5 niveles × 4 posiciones, small. */
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Almacén IMV</h1>
          <p className="text-xs text-muted-foreground">
            Layout físico según IMV-D-AL-01/08 — Necaxa 125 Bis, Portales
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{slots.length} posiciones totales</div>
          <div>{contents.length} lotes almacenados</div>
        </div>
      </div>

      {/* MAIN FLOORPLAN */}
      <Card className="overflow-hidden border-2 border-neutral-300 bg-neutral-50 p-4 dark:bg-neutral-900">
        <div className="grid grid-cols-12 gap-3">
          {/* TOP ROW: G1 area + estaciones de trabajo (left), flow arrow */}
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

          {/* MIDDLE ROW: special zones (left) + racks D/E/F + racks A/B/C */}
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

          {/* Racks D, E, F (4 positions each) */}
          <div className="col-span-4 grid grid-cols-3 gap-2">
            <Rack letter="F" positions={4} />
            <Rack letter="E" positions={4} />
            <Rack letter="D" positions={4} />
          </div>

          {/* Racks C, B, A (5 positions each) */}
          <div className="col-span-6 grid grid-cols-3 gap-2">
            <Rack letter="C" positions={5} />
            <Rack letter="B" positions={5} />
            <Rack letter="A" positions={5} />
          </div>

          {/* BOTTOM ROW: cámara fría + surtido + almacen temporal */}
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

      {/* MIGRACION callout */}
      {(() => {
        const mig = slots.find((s) => s.zone === "migracion");
        const migContents = mig ? contentsBySlot.get(mig.id) ?? [] : [];
        return (
          <Card
            className="cursor-pointer border-amber-400 bg-amber-50 p-3 hover:bg-amber-100 dark:bg-amber-950/30"
            onClick={() => mig && setOpenSlotId(mig.id)}
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
        );
      })()}

      {/* LEGEND */}
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
        </SheetContent>
      </Sheet>
    </div>
  );
}
