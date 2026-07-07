import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, ArrowRightLeft, TrendingUp, TrendingDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";

export const Route = createFileRoute("/admin/contabilidad/impuestos")({
  head: () => ({ meta: [{ title: "IVA / IEPS — Contabilidad" }] }),
  component: ImpuestosPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;

function today() { return new Date().toISOString().slice(0, 10); }

type SaldoImp = { tipo: string; tasa: number; base: number; monto: number };

function ImpuestosPage() {
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [hasta, setHasta] = useState(today());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["iva-ieps", empresaId, hasta],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("iva_ieps_saldos" as any, { _empresa: empresaId!, _hasta: hasta });
      if (error) throw error;
      return (data ?? []) as SaldoImp[];
    },
  });

  const byTipo = useMemo(() => {
    const m: Record<string, SaldoImp[]> = {};
    for (const r of rows) { m[r.tipo] ||= []; m[r.tipo].push(r); }
    return m;
  }, [rows]);

  const totalTipo = (tipo: string) => (byTipo[tipo] ?? []).reduce((s, r) => s + Number(r.monto), 0);

  const ivaTrasCobr = totalTipo("iva_trasladado_cobrado");
  const ivaTrasPend = totalTipo("iva_trasladado_pendiente");
  const ivaAcrPag = totalTipo("iva_acreditable_pagado");
  const ivaAcrPend = totalTipo("iva_acreditable_pendiente");

  const iepsTrasCobr = totalTipo("ieps_trasladado_cobrado");
  const iepsAcrPag = totalTipo("ieps_acreditable_pagado");

  const ivaNeto = ivaTrasCobr - ivaAcrPag;
  const iepsNeto = iepsTrasCobr - iepsAcrPag;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> IVA / IEPS en tiempo real
          </h1>
          <p className="text-sm text-muted-foreground">Traspasos automáticos pendiente ↔ cobrado/pagado por tasa, incluyendo IEPS 6% bebidas saborizadas.</p>
        </div>
        <EmpresaSelector />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">Corte al</Label><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Elige una empresa.</div>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SaldoCard title="IVA neto" value={ivaNeto} sub={ivaNeto >= 0 ? "A pagar al SAT" : "A favor"} tone={ivaNeto >= 0 ? "warn" : "ok"} />
            <SaldoCard title="IEPS neto" value={iepsNeto} sub={iepsNeto >= 0 ? "A pagar al SAT" : "A favor"} tone={iepsNeto >= 0 ? "warn" : "ok"} />
            <SaldoCard title="Retenciones acumuladas" value={totalTipo("ret_isr") + totalTipo("ret_iva")} sub="ISR + IVA retenidos" tone="info" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel titulo="IVA trasladado (a clientes)" tono="acreedora">
              <FilaTasas rows={byTipo["iva_trasladado_cobrado"] ?? []} label="Cobrado" positive />
              <FilaTasas rows={byTipo["iva_trasladado_pendiente"] ?? []} label="Pendiente de cobrar" />
            </Panel>
            <Panel titulo="IVA acreditable (a proveedores)" tono="deudora">
              <FilaTasas rows={byTipo["iva_acreditable_pagado"] ?? []} label="Pagado" positive />
              <FilaTasas rows={byTipo["iva_acreditable_pendiente"] ?? []} label="Pendiente de pagar" />
            </Panel>
            <Panel titulo="IEPS trasladado" tono="acreedora">
              <FilaTasas rows={byTipo["ieps_trasladado_cobrado"] ?? []} label="Cobrado" positive />
              <FilaTasas rows={byTipo["ieps_trasladado_pendiente"] ?? []} label="Pendiente" />
            </Panel>
            <Panel titulo="IEPS acreditable" tono="deudora">
              <FilaTasas rows={byTipo["ieps_acreditable_pagado"] ?? []} label="Pagado" positive />
              <FilaTasas rows={byTipo["ieps_acreditable_pendiente"] ?? []} label="Pendiente" />
            </Panel>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground flex gap-2">
            <ArrowRightLeft className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <p>
              Los saldos se traspasan automáticamente de <strong>pendiente</strong> a <strong>cobrado/pagado</strong>
              cuando asientas la póliza del pago correspondiente. Registra el desglose por tasa (16 / 8 / 0 / IEPS 6%)
              en cada póliza para que este panel refleje la realidad.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function Panel({ titulo, tono, children }: { titulo: string; tono: "deudora" | "acreedora"; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border">
      <div className={`px-3 py-2 border-b border-border font-semibold text-sm ${tono === "deudora" ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
        {titulo}
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function FilaTasas({ rows, label, positive }: { rows: SaldoImp[]; label: string; positive?: boolean }) {
  const total = rows.reduce((s, r) => s + Number(r.monto), 0);
  return (
    <div className="px-3 py-2">
      <div className="flex justify-between text-xs uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className={`font-mono ${positive ? "text-emerald-600 font-semibold" : ""}`}>{mxn.format(total)}</span>
      </div>
      {rows.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {rows.map((r, i) => (
            <span key={i} className="text-[11px] font-mono rounded bg-muted px-1.5 py-0.5">
              {pct(Number(r.tasa))} · {mxn.format(Number(r.monto))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SaldoCard({ title, value, sub, tone }: { title: string; value: number; sub: string; tone: "ok" | "warn" | "info" }) {
  const cls = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-blue-600";
  const Icon = tone === "warn" ? TrendingUp : TrendingDown;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{title}</div>
      <div className={`text-2xl font-bold font-mono mt-1 ${cls}`}>{mxn.format(value)}</div>
      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Icon className="h-3 w-3" /> {sub}</div>
    </div>
  );
}
