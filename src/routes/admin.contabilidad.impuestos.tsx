import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, ArrowRightLeft, TrendingUp, TrendingDown, Users, Factory, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

// ============ Facturas / Clientes ============

type FacturaRow = {
  id: string;
  cliente_id: string | null;
  total: number;
  iva: number;
  subtotal: number;
  pagado: number;
  saldo: number;
  estado: string;
};
type ItemRow = { factura_id: string; cantidad: number; precio_unitario: number; iva_pct: number };
type Cliente = { id: string; razon_social: string; nombre_comercial: string | null; rfc: string | null };

// ============ OCs / Laboratorios ============

type OCRow = {
  id: string;
  folio: string;
  laboratorio_id: string;
  subtotal: number;
  iva: number;
  total: number;
  estado: string;
  fecha_recepcion: string | null;
};
type Lab = { id: string; nombre: string };

// ============ Aggregations ============

type ByTasa = Record<string, number>; // tasa (as string) -> monto

type ClienteAgg = {
  cliente: Cliente | null;
  cliente_id: string | null;
  facturas: number;
  ivaCobrado: number;
  ivaPendiente: number;
  cobradoByTasa: ByTasa;
  pendienteByTasa: ByTasa;
};

type LabAgg = {
  laboratorio: Lab | null;
  laboratorio_id: string;
  ocs: number;
  ivaPendiente: number;
  totalPendiente: number;
};

function ImpuestosPage() {
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [hasta, setHasta] = useState(today());

  // Póliza-based rates (IEPS + retenciones)
  const { data: polizaRows = [] } = useQuery({
    queryKey: ["iva-ieps", empresaId, hasta],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("iva_ieps_saldos" as any, { _empresa: empresaId!, _hasta: hasta });
      if (error) throw error;
      return (data ?? []) as SaldoImp[];
    },
  });

  // Facturas emitidas → IVA trasladado (a clientes)
  const { data: facturas = [] } = useQuery({
    queryKey: ["facturas-iva", empresaId, hasta],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facturas" as any)
        .select("id, cliente_id, total, iva, subtotal, pagado, saldo, estado")
        .eq("empresa_id", empresaId!)
        .lte("fecha_emision", hasta)
        .neq("estado", "cancelada");
      if (error) throw error;
      return (data ?? []) as unknown as FacturaRow[];
    },
  });

  const facturaIds = facturas.map((f) => f.id);
  const { data: items = [] } = useQuery({
    queryKey: ["factura-items-iva", facturaIds.join(",")],
    enabled: facturaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factura_items" as any)
        .select("factura_id, cantidad, precio_unitario, iva_pct")
        .in("factura_id", facturaIds);
      if (error) throw error;
      return (data ?? []) as unknown as ItemRow[];
    },
  });

  const clienteIds = Array.from(new Set(facturas.map((f) => f.cliente_id).filter(Boolean))) as string[];
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-iva", clienteIds.join(",")],
    enabled: clienteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes" as any)
        .select("id, razon_social, nombre_comercial, rfc")
        .in("id", clienteIds);
      if (error) throw error;
      return (data ?? []) as unknown as Cliente[];
    },
  });

  // OCs recibidas → IVA acreditable (a proveedores / laboratorios)
  const { data: ocs = [] } = useQuery({
    queryKey: ["oc-iva", hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_compra" as any)
        .select("id, folio, laboratorio_id, subtotal, iva, total, estado, fecha_recepcion")
        .in("estado", ["recibida", "parcial"])
        .lte("fecha_recepcion", hasta);
      if (error) throw error;
      return (data ?? []) as unknown as OCRow[];
    },
  });

  const labIds = Array.from(new Set(ocs.map((o) => o.laboratorio_id).filter(Boolean)));
  const { data: labs = [] } = useQuery({
    queryKey: ["labs-iva", labIds.join(",")],
    enabled: labIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laboratorios" as any)
        .select("id, nombre")
        .in("id", labIds);
      if (error) throw error;
      return (data ?? []) as unknown as Lab[];
    },
  });

  // ---------- IVA trasladado breakdown ----------
  const trasladadoAgg = useMemo(() => {
    const clienteById = new Map(clientes.map((c) => [c.id, c]));
    const itemsByFactura = new Map<string, ItemRow[]>();
    for (const it of items) {
      const arr = itemsByFactura.get(it.factura_id) ?? [];
      arr.push(it);
      itemsByFactura.set(it.factura_id, arr);
    }

    const cobradoTasa: ByTasa = {};
    const pendienteTasa: ByTasa = {};
    const porCliente = new Map<string, ClienteAgg>();

    for (const f of facturas) {
      const facturaItems = itemsByFactura.get(f.id) ?? [];
      const totalIva = Number(f.iva) || 0;
      const total = Number(f.total) || 0;
      const pagado = Number(f.pagado) || 0;
      const cobradoFrac = total > 0 ? Math.min(1, pagado / total) : 0;
      const pendienteFrac = Math.max(0, 1 - cobradoFrac);

      // Distribute IVA per tasa via items
      const ivaByTasaOnFactura: ByTasa = {};
      const totalItemsIva = facturaItems.reduce(
        (s, it) => s + Number(it.cantidad) * Number(it.precio_unitario) * (Number(it.iva_pct) / 100),
        0,
      );
      if (totalItemsIva > 0) {
        for (const it of facturaItems) {
          const itemIva = Number(it.cantidad) * Number(it.precio_unitario) * (Number(it.iva_pct) / 100);
          const share = (itemIva / totalItemsIva) * totalIva;
          const key = Number(it.iva_pct).toFixed(2);
          ivaByTasaOnFactura[key] = (ivaByTasaOnFactura[key] ?? 0) + share;
        }
      } else {
        // fallback: assume all @16%
        ivaByTasaOnFactura["16.00"] = totalIva;
      }

      const key = f.cliente_id ?? "__sin_cliente__";
      const agg = porCliente.get(key) ?? {
        cliente: f.cliente_id ? clienteById.get(f.cliente_id) ?? null : null,
        cliente_id: f.cliente_id,
        facturas: 0,
        ivaCobrado: 0,
        ivaPendiente: 0,
        cobradoByTasa: {},
        pendienteByTasa: {},
      };
      agg.facturas += 1;

      for (const [tasaKey, montoIva] of Object.entries(ivaByTasaOnFactura)) {
        const cobrado = montoIva * cobradoFrac;
        const pendiente = montoIva * pendienteFrac;
        cobradoTasa[tasaKey] = (cobradoTasa[tasaKey] ?? 0) + cobrado;
        pendienteTasa[tasaKey] = (pendienteTasa[tasaKey] ?? 0) + pendiente;
        agg.cobradoByTasa[tasaKey] = (agg.cobradoByTasa[tasaKey] ?? 0) + cobrado;
        agg.pendienteByTasa[tasaKey] = (agg.pendienteByTasa[tasaKey] ?? 0) + pendiente;
        agg.ivaCobrado += cobrado;
        agg.ivaPendiente += pendiente;
      }
      porCliente.set(key, agg);
    }

    const filas = [...porCliente.values()].sort(
      (a, b) => (b.ivaCobrado + b.ivaPendiente) - (a.ivaCobrado + a.ivaPendiente),
    );

    return { cobradoTasa, pendienteTasa, porCliente: filas };
  }, [facturas, items, clientes]);

  // ---------- IVA acreditable breakdown ----------
  const acreditableAgg = useMemo(() => {
    const labById = new Map(labs.map((l) => [l.id, l]));
    const pendienteTasa: ByTasa = {};
    const porLab = new Map<string, LabAgg>();

    for (const o of ocs) {
      // OCs assume 16% flat
      const iva = Number(o.iva) || 0;
      pendienteTasa["16.00"] = (pendienteTasa["16.00"] ?? 0) + iva;

      const agg = porLab.get(o.laboratorio_id) ?? {
        laboratorio: labById.get(o.laboratorio_id) ?? null,
        laboratorio_id: o.laboratorio_id,
        ocs: 0,
        ivaPendiente: 0,
        totalPendiente: 0,
      };
      agg.ocs += 1;
      agg.ivaPendiente += iva;
      agg.totalPendiente += Number(o.total) || 0;
      porLab.set(o.laboratorio_id, agg);
    }

    const filas = [...porLab.values()].sort((a, b) => b.ivaPendiente - a.ivaPendiente);
    return { pendienteTasa, porLab: filas };
  }, [ocs, labs]);

  // ---------- Totals ----------
  const byTipoPoliza = useMemo(() => {
    const m: Record<string, SaldoImp[]> = {};
    for (const r of polizaRows) { m[r.tipo] ||= []; m[r.tipo].push(r); }
    return m;
  }, [polizaRows]);

  const sumTasa = (b: ByTasa) => Object.values(b).reduce((s, v) => s + v, 0);
  const totalTipoPol = (tipo: string) =>
    (byTipoPoliza[tipo] ?? []).reduce((s, r) => s + Number(r.monto), 0);

  const ivaTrasCobr = sumTasa(trasladadoAgg.cobradoTasa);
  const ivaTrasPend = sumTasa(trasladadoAgg.pendienteTasa);
  const ivaAcrPend = sumTasa(acreditableAgg.pendienteTasa);
  const ivaAcrPag = totalTipoPol("iva_acreditable_pagado"); // requires pólizas

  const iepsTrasCobr = totalTipoPol("ieps_trasladado_cobrado");
  const iepsTrasPend = totalTipoPol("ieps_trasladado_pendiente");
  const iepsAcrPag = totalTipoPol("ieps_acreditable_pagado");
  const iepsAcrPend = totalTipoPol("ieps_acreditable_pendiente");

  const ivaNeto = ivaTrasCobr - ivaAcrPag;
  const iepsNeto = iepsTrasCobr - iepsAcrPag;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> IVA / IEPS en tiempo real
          </h1>
          <p className="text-sm text-muted-foreground">
            IVA trasladado calculado desde facturas · IVA acreditable desde órdenes de compra recibidas.
          </p>
        </div>
        <EmpresaSelector />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Corte al</Label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Elige una empresa.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SaldoCard title="IVA neto" value={ivaNeto} sub={ivaNeto >= 0 ? "A pagar al SAT" : "A favor"} tone={ivaNeto >= 0 ? "warn" : "ok"} />
            <SaldoCard title="IEPS neto" value={iepsNeto} sub={iepsNeto >= 0 ? "A pagar al SAT" : "A favor"} tone={iepsNeto >= 0 ? "warn" : "ok"} />
            <SaldoCard title="Retenciones acumuladas" value={totalTipoPol("ret_isr") + totalTipoPol("ret_iva")} sub="ISR + IVA retenidos" tone="info" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel titulo="IVA trasladado (a clientes)" tono="acreedora">
              <FilaTasasByRecord byTasa={trasladadoAgg.cobradoTasa} label="Cobrado" positive />
              <FilaTasasByRecord byTasa={trasladadoAgg.pendienteTasa} label="Pendiente de cobrar" />
              <FilaFooter total={ivaTrasCobr + ivaTrasPend} />
            </Panel>
            <Panel titulo="IVA acreditable (a proveedores)" tono="deudora">
              <FilaTasasByRecord
                byTasa={{ "16.00": ivaAcrPag }}
                label="Pagado"
                positive
                empty={ivaAcrPag === 0}
              />
              <FilaTasasByRecord byTasa={acreditableAgg.pendienteTasa} label="Pendiente de pagar" />
              <FilaFooter total={ivaAcrPag + ivaAcrPend} />
            </Panel>
            <Panel titulo="IEPS trasladado" tono="acreedora">
              <FilaTasas rows={byTipoPoliza["ieps_trasladado_cobrado"] ?? []} label="Cobrado" positive />
              <FilaTasas rows={byTipoPoliza["ieps_trasladado_pendiente"] ?? []} label="Pendiente" />
              <FilaFooter total={iepsTrasCobr + iepsTrasPend} />
            </Panel>
            <Panel titulo="IEPS acreditable" tono="deudora">
              <FilaTasas rows={byTipoPoliza["ieps_acreditable_pagado"] ?? []} label="Pagado" positive />
              <FilaTasas rows={byTipoPoliza["ieps_acreditable_pendiente"] ?? []} label="Pendiente" />
              <FilaFooter total={iepsAcrPag + iepsAcrPend} />
            </Panel>
          </div>

          {/* Drill-down: Clientes */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-3 bg-emerald-500/10 border-b border-border flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              <div className="font-semibold text-sm">IVA trasladado — desglose por cliente</div>
              <Badge variant="outline" className="ml-auto text-[10px]">{trasladadoAgg.porCliente.length} clientes</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Cliente</th>
                    <th className="text-left px-3 py-2 w-28">RFC</th>
                    <th className="text-right px-3 py-2 w-20">Facturas</th>
                    <th className="text-right px-3 py-2 w-36">IVA cobrado</th>
                    <th className="text-right px-3 py-2 w-40">IVA pendiente</th>
                    <th className="text-right px-3 py-2 w-36">Total IVA</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {trasladadoAgg.porCliente.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Sin facturas emitidas en el periodo.</td></tr>
                  ) : trasladadoAgg.porCliente.map((r) => (
                    <tr key={r.cliente_id ?? "__none__"} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2">
                        {r.cliente ? (r.cliente.nombre_comercial || r.cliente.razon_social) : <span className="italic text-muted-foreground">Sin cliente</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.cliente?.rfc ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{r.facturas}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-600">{mxn.format(r.ivaCobrado)}</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-600">{mxn.format(r.ivaPendiente)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{mxn.format(r.ivaCobrado + r.ivaPendiente)}</td>
                      <td className="px-3 py-2 text-right">
                        {r.cliente_id && (
                          <Link to="/admin/clientes/$id" params={{ id: r.cliente_id }} className="text-primary hover:underline">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Drill-down: Laboratorios / proveedores */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-3 bg-blue-500/10 border-b border-border flex items-center gap-2">
              <Factory className="h-4 w-4 text-blue-600" />
              <div className="font-semibold text-sm">IVA acreditable — desglose por proveedor</div>
              <Badge variant="outline" className="ml-auto text-[10px]">{acreditableAgg.porLab.length} laboratorios</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Laboratorio / proveedor</th>
                    <th className="text-right px-3 py-2 w-20">OCs</th>
                    <th className="text-right px-3 py-2 w-40">Total pendiente</th>
                    <th className="text-right px-3 py-2 w-40">IVA acreditable</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {acreditableAgg.porLab.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Sin órdenes de compra recibidas en el periodo.</td></tr>
                  ) : acreditableAgg.porLab.map((r) => (
                    <tr key={r.laboratorio_id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2">{r.laboratorio?.nombre ?? <span className="italic text-muted-foreground">Sin nombre</span>}</td>
                      <td className="px-3 py-2 text-right">{r.ocs}</td>
                      <td className="px-3 py-2 text-right font-mono">{mxn.format(r.totalPendiente)}</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-600">{mxn.format(r.ivaPendiente)}</td>
                      <td className="px-3 py-2 text-right">
                        <Link to="/admin/laboratorios" className="text-primary hover:underline">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground flex gap-2">
            <ArrowRightLeft className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <p>
              <strong>Trasladado</strong> se calcula desde las facturas emitidas: cobrado = proporcional al monto pagado,
              pendiente = proporcional al saldo. <strong>Acreditable pendiente</strong> se calcula desde las órdenes de compra
              en estado <em>recibida</em> o <em>parcial</em>. IEPS y retenciones vienen de las pólizas asentadas.
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

function FilaTasasByRecord({
  byTasa, label, positive, empty,
}: { byTasa: ByTasa; label: string; positive?: boolean; empty?: boolean }) {
  const entries = Object.entries(byTasa).filter(([, v]) => v > 0.005);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="px-3 py-2">
      <div className="flex justify-between text-xs uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className={`font-mono ${positive ? "text-emerald-600 font-semibold" : ""}`}>
          {mxn.format(empty ? 0 : total)}
        </span>
      </div>
      {entries.length > 0 && !empty && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {entries.map(([tasaKey, monto]) => (
            <span key={tasaKey} className="text-[11px] font-mono rounded bg-muted px-1.5 py-0.5">
              {Number(tasaKey).toFixed(0)}% · {mxn.format(monto)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FilaFooter({ total }: { total: number }) {
  return (
    <div className="px-3 py-1.5 bg-muted/20 flex justify-between items-center text-xs">
      <span className="text-muted-foreground">Total del panel</span>
      <span className="font-mono font-semibold">{mxn.format(total)}</span>
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
