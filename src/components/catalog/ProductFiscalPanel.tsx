import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCanEditFiscal, useCodigosFiscales, fiscalUpdatePayload } from "@/hooks/use-fiscal";
import { applyCodigo, matchCodigo, normalizeConfig, taxBreakdown, type TaxConfig, type RetModo } from "@/lib/product-tax";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

type Producto = Record<string, any> & { id: string };

export function ProductFiscalPanel({ producto }: { producto: Producto }) {
  const qc = useQueryClient();
  const { data: codigos = [] } = useCodigosFiscales();
  const { data: canEdit = false } = useCanEditFiscal();
  const initial = useMemo(() => normalizeConfig(producto as any), [producto]);
  const [cfg, setCfg] = useState<TaxConfig>(initial);
  const [satProd, setSatProd] = useState<string>(producto.sat_product_key ?? producto.sat_clave ?? "");
  const [satUnit, setSatUnit] = useState<string>(producto.sat_unit_key ?? "");
  useEffect(() => setCfg(initial), [initial]);

  const match = matchCodigo(cfg, codigos);
  const set = (p: Partial<TaxConfig>) => setCfg((c) => ({ ...c, ...p }));
  const b = taxBreakdown(Number(producto.precio_lista ?? 0), cfg);

  const save = useMutation({
    mutationFn: async () => {
      const clean = applyCodigo(cfg);
      const { error } = await supabase
        .from("productos")
        .update({ ...fiscalUpdatePayload(clean, match?.id ?? null), sat_product_key: satProd.trim() || null, sat_unit_key: satUnit.trim() || null } as any)
        .eq("id", producto.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuración fiscal guardada");
      qc.invalidateQueries({ queryKey: ["product-360", producto.id] });
      qc.invalidateQueries({ queryKey: ["productos-fiscal"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });

  const dis = !canEdit;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Código fiscal</Label>
        <Select
          disabled={dis}
          value={match?.id ?? "custom"}
          onValueChange={(v) => {
            const c = codigos.find((x) => x.id === v);
            if (c) setCfg(applyCodigo(c));
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {codigos.filter((c) => c.activo).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.clave} — {c.nombre}</SelectItem>
            ))}
            <SelectItem value="custom" disabled>Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {!match && <p className="text-xs text-muted-foreground">Esta combinación no coincide con ningún código: se guarda como personalizada.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TaxCard title="IVA" accent="border-l-chart-4">
          <RadioGroup disabled={dis} value={cfg.iva_modo} onValueChange={(v) => set({ iva_modo: v as TaxConfig["iva_modo"] })}>
            <Opt v="tipo" label="Por tipo de cliente/proveedor" />
            <Opt v="producto" label="Por producto">
              <Pct disabled={dis || cfg.iva_modo !== "producto"} value={cfg.iva_pct} onChange={(iva_pct) => set({ iva_pct })} />
            </Opt>
            <Opt v="exento" label="Exento" />
          </RadioGroup>
          <label className="flex items-center gap-2 text-sm pt-1">
            <Checkbox disabled={dis} checked={!cfg.objeto_impuesto} onCheckedChange={(v) => set({ objeto_impuesto: v !== true })} />
            No objeto de impuesto
          </label>
        </TaxCard>

        <TaxCard title="IEPS" accent="border-l-chart-2">
          <RadioGroup disabled={dis} value={cfg.ieps_pct > 0 ? "si" : "no"} onValueChange={(v) => set({ ieps_pct: v === "si" ? cfg.ieps_pct || 6 : 0 })}>
            <Opt v="si" label="Sí">
              <Pct disabled={dis || cfg.ieps_pct === 0} value={cfg.ieps_pct} onChange={(ieps_pct) => set({ ieps_pct })} />
            </Opt>
            <Opt v="no" label="No" />
          </RadioGroup>
        </TaxCard>

        <RetCard title="Retención de IVA" accent="border-l-chart-1" dis={dis} modo={cfg.ret_iva_modo} pct={cfg.ret_iva_pct}
          onModo={(ret_iva_modo) => set({ ret_iva_modo })} onPct={(ret_iva_pct) => set({ ret_iva_pct })} sinLabel="Sin ret. IVA" />
        <RetCard title="Retención de ISR" accent="border-l-chart-5" dis={dis} modo={cfg.ret_isr_modo} pct={cfg.ret_isr_pct}
          onModo={(ret_isr_modo) => set({ ret_isr_modo })} onPct={(ret_isr_pct) => set({ ret_isr_pct })} sinLabel="Sin ret. ISR" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="satprod">Clave SAT producto/servicio</Label>
          <Input id="satprod" disabled={dis} value={satProd} onChange={(e) => setSatProd(e.target.value)} placeholder="Sin clave" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="satunit">Clave SAT unidad</Label>
          <Input id="satunit" disabled={dis} value={satUnit} onChange={(e) => setSatUnit(e.target.value)} placeholder="Sin clave" />
        </div>
      </div>

      <div className="rounded-md border divide-y text-sm">
        <Line l="Subtotal" v={fmt(b.subtotal)} />
        {b.iepsAmt > 0 && <Line l={`IEPS (${cfg.ieps_pct}%)`} v={fmt(b.iepsAmt)} />}
        <Line l="IVA" v={fmt(b.ivaAmt)} />
        <Line l="Total c/impuestos" v={fmt(b.total)} strong />
        {b.retIva > 0 && <Line l="− Retención IVA" v={fmt(b.retIva)} />}
        {b.retIsr > 0 && <Line l="− Retención ISR" v={fmt(b.retIsr)} />}
        {(b.retIva > 0 || b.retIsr > 0) && <Line l="Neto a cobrar" v={fmt(b.neto)} strong />}
        {(cfg.ret_iva_modo === "tipo" || cfg.ret_isr_modo === "tipo" || cfg.iva_modo === "tipo") && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Los impuestos "por tipo" dependen del cliente o proveedor y no se incluyen en este cálculo.</p>
        )}
      </div>

      {canEdit ? (
        <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Guardando…" : "Guardar configuración fiscal"}
        </Button>
      ) : (
        <Badge variant="secondary" className="font-normal">Solo administración o contabilidad pueden modificar esta sección.</Badge>
      )}
    </div>
  );
}

function TaxCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-l-4 p-3 space-y-2 bg-card", accent)}>
      <div className="text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}

function RetCard(p: { title: string; accent: string; dis: boolean; modo: RetModo; pct: number; sinLabel: string; onModo: (m: RetModo) => void; onPct: (n: number) => void }) {
  return (
    <TaxCard title={p.title} accent={p.accent}>
      <RadioGroup disabled={p.dis} value={p.modo} onValueChange={(v) => p.onModo(v as RetModo)}>
        <Opt v="tipo" label="Por tipo de cliente/proveedor" />
        <Opt v="producto" label="Por producto">
          <Pct disabled={p.dis || p.modo !== "producto"} value={p.pct} onChange={p.onPct} />
        </Opt>
        <Opt v="sin" label={p.sinLabel} />
      </RadioGroup>
    </TaxCard>
  );
}

function Opt({ v, label, children }: { v: string; label: string; children?: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm min-h-8">
      <RadioGroupItem value={v} />
      <span className="flex-1">{label}</span>
      {children}
    </label>
  );
}

function Pct({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <Input type="number" step="0.000001" min={0} max={100} disabled={disabled} aria-label="Porcentaje"
        className="h-8 w-24 text-right tabular-nums" value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

function Line({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return (
    <div className={cn("px-3 py-2 flex justify-between", strong && "font-semibold bg-muted/30")}>
      <span className={strong ? "" : "text-muted-foreground"}>{l}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
