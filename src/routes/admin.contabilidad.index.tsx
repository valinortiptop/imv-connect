import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import {
  Landmark, ScrollText, BookText, Scale, PieChart, Receipt, ShieldCheck,
  ArrowRight, TrendingUp, TrendingDown, AlertTriangle,
} from "lucide-react";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";

export const Route = createFileRoute("/admin/contabilidad/")({
  head: () => ({
    meta: [
      { title: "Contabilidad — Dashboard fiscal" },
      { name: "description", content: "Panel de contabilidad electrónica conforme al SAT: pólizas, balanza, IVA/IEPS." },
    ],
  }),
  component: ContabilidadDashboard,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function ContabilidadDashboard() {
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;

  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth() + 1;
  const firstOfMonth = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const endOfMonth = useMemo(() => {
    const d = new Date(anio, mes, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [anio, mes]);

  const { data: polizasMes = [] } = useQuery({
    queryKey: ["conta-polizas-mes", empresaId, firstOfMonth, endOfMonth],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("polizas" as any)
        .select("id, tipo, estado, total_cargos, fecha")
        .eq("empresa_id", empresaId!)
        .gte("fecha", firstOfMonth)
        .lte("fecha", endOfMonth);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: ivaSaldos = [] } = useQuery({
    queryKey: ["conta-iva-saldos", empresaId, endOfMonth],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("iva_ieps_saldos" as any, {
        _empresa: empresaId!, _hasta: endOfMonth,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const totalAsentadas = polizasMes.filter((p) => p.estado === "asentada").length;
  const totalBorrador = polizasMes.filter((p) => p.estado === "borrador").length;
  const montoAsentado = polizasMes
    .filter((p) => p.estado === "asentada")
    .reduce((s, p) => s + Number(p.total_cargos || 0), 0);

  const ivaTrasladado = ivaSaldos
    .filter((i) => i.tipo === "iva_trasladado_cobrado")
    .reduce((s, i) => s + Number(i.monto || 0), 0);
  const ivaAcreditable = ivaSaldos
    .filter((i) => i.tipo === "iva_acreditable_pagado")
    .reduce((s, i) => s + Number(i.monto || 0), 0);
  const ivaPorPagar = ivaTrasladado - ivaAcreditable;

  const cards = [
    { label: "Catálogo de cuentas", to: "/admin/contabilidad/cuentas",   icon: BookText },
    { label: "Pólizas",             to: "/admin/contabilidad/polizas",   icon: ScrollText },
    { label: "Libro diario",        to: "/admin/contabilidad/diario",    icon: BookText },
    { label: "Libro mayor",         to: "/admin/contabilidad/mayor",     icon: BookText },
    { label: "Balanza",             to: "/admin/contabilidad/balanza",   icon: Scale },
    { label: "Estados financieros", to: "/admin/contabilidad/estados",   icon: PieChart },
    { label: "IVA / IEPS",          to: "/admin/contabilidad/impuestos", icon: Receipt },
    { label: "Facturas contables",  to: "/admin/contabilidad/facturas",  icon: Receipt },
    { label: "Cumplimiento SAT",    to: "/admin/contabilidad/sat",       icon: ShieldCheck },
  ] as const;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary" /> Contabilidad
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Contabilidad electrónica conforme al Anexo 24 del SAT. Selecciona la empresa emisora para ver su información.
          </p>
        </div>
        <EmpresaSelector />
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Elige una empresa para ver el dashboard.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={<ScrollText className="h-4 w-4 text-primary" />}
              label="Pólizas asentadas (mes)"
              value={String(totalAsentadas)}
              sub={`${totalBorrador} en borrador`}
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
              label="Movimientos del mes"
              value={mxn.format(montoAsentado)}
              sub="Cargos asentados"
            />
            <StatCard
              icon={<Receipt className="h-4 w-4 text-blue-500" />}
              label="IVA trasladado cobrado"
              value={mxn.format(ivaTrasladado)}
              sub="Acumulado histórico"
            />
            <StatCard
              icon={ivaPorPagar >= 0
                ? <AlertTriangle className="h-4 w-4 text-amber-500" />
                : <TrendingDown className="h-4 w-4 text-emerald-500" />}
              label="IVA neto"
              value={mxn.format(ivaPorPagar)}
              sub={ivaPorPagar >= 0 ? "A pagar al SAT" : "A favor"}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cards.map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <c.icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{c.label}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
