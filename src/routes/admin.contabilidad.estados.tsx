import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Scale, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";

export const Route = createFileRoute("/admin/contabilidad/estados")({
  head: () => ({ meta: [{ title: "Estados financieros — Contabilidad" }] }),
  component: EstadosPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
function firstOfYear() { return `${new Date().getFullYear()}-01-01`; }
function today() { return new Date().toISOString().slice(0, 10); }

function EstadosPage() {
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [desde, setDesde] = useState(firstOfYear());
  const [hasta, setHasta] = useState(today());
  const [nivelMax, setNivelMax] = useState(6);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["balanza-para-estados", empresaId, desde, hasta],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("balanza_de_comprobacion" as any, {
        _empresa: empresaId!, _desde: desde, _hasta: hasta,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filteredBalanza = useMemo(() => rows.filter((r) => r.nivel <= nivelMax), [rows, nivelMax]);
  const totalesBalanza = useMemo(() => {
    let si = 0, c = 0, a = 0, sf = 0;
    for (const r of filteredBalanza.filter((x) => x.nivel === 1)) {
      si += Number(r.saldo_inicial); c += Number(r.cargos); a += Number(r.abonos); sf += Number(r.saldo_final);
    }
    return { si, c, a, sf };
  }, [filteredBalanza]);

  const exportBalanzaCSV = () => {
    const header = "Código,Nombre,Agrupador,Naturaleza,Nivel,Saldo inicial,Cargos,Abonos,Saldo final\n";
    const body = filteredBalanza.map((r) =>
      [r.codigo, JSON.stringify(r.nombre), r.codigo_agrupador ?? "", r.naturaleza, r.nivel, r.saldo_inicial, r.cargos, r.abonos, r.saldo_final].join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `balanza-${desde}-${hasta}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Group by first digit of código agrupador
  const bloques = useMemo(() => {
    const g: Record<string, { label: string; rows: any[]; total: number }> = {
      "1": { label: "Activo", rows: [], total: 0 },
      "2": { label: "Pasivo", rows: [], total: 0 },
      "3": { label: "Capital", rows: [], total: 0 },
      "4": { label: "Ingresos", rows: [], total: 0 },
      "5": { label: "Costos", rows: [], total: 0 },
      "6": { label: "Gastos", rows: [], total: 0 },
      "7": { label: "Resultado integral de financiamiento", rows: [], total: 0 },
    };
    for (const r of rows) {
      const k = String(r.codigo_agrupador ?? r.codigo).charAt(0);
      if (g[k]) {
        g[k].rows.push(r);
        if (r.nivel <= 2) g[k].total += Number(r.saldo_final);
      }
    }
    return g;
  }, [rows]);

  const utilidad = (bloques["4"]?.total ?? 0) - (bloques["5"]?.total ?? 0) - (bloques["6"]?.total ?? 0) + (bloques["7"]?.total ?? 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PieChart className="h-6 w-6 text-primary" /> Estados financieros
          </h1>
          <p className="text-sm text-muted-foreground">Balance general, estado de resultados y reportes personalizados.</p>
        </div>
        <EmpresaSelector />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">Desde</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div><Label className="text-xs">Hasta</Label><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Elige una empresa.</div>
      ) : (
        <Tabs defaultValue="balance">
          <TabsList>
            <TabsTrigger value="balance">Balance general</TabsTrigger>
            <TabsTrigger value="resultados">Estado de resultados</TabsTrigger>
            <TabsTrigger value="custom">Reportes personalizados</TabsTrigger>
          </TabsList>

          <TabsContent value="balance" className="space-y-3 pt-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Bloque titulo="Activo" data={bloques["1"]} />
              <div className="space-y-3">
                <Bloque titulo="Pasivo" data={bloques["2"]} />
                <Bloque titulo="Capital contable" data={bloques["3"]} />
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">Utilidad del ejercicio</span>
                    <span className="font-mono font-bold">{mxn.format(utilidad)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4 flex justify-between text-lg">
              <span className="font-bold">Activo total</span>
              <span className="font-mono font-bold">{mxn.format(bloques["1"]?.total ?? 0)}</span>
            </div>
            <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4 flex justify-between text-lg">
              <span className="font-bold">Pasivo + Capital + Utilidad</span>
              <span className="font-mono font-bold">
                {mxn.format((bloques["2"]?.total ?? 0) + (bloques["3"]?.total ?? 0) + utilidad)}
              </span>
            </div>
          </TabsContent>

          <TabsContent value="resultados" className="space-y-3 pt-3">
            <Bloque titulo="Ingresos" data={bloques["4"]} />
            <Bloque titulo="Costos" data={bloques["5"]} />
            <Bloque titulo="Gastos" data={bloques["6"]} />
            <Bloque titulo="Resultado integral de financiamiento" data={bloques["7"]} />
            <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4 flex justify-between text-xl">
              <span className="font-bold">Utilidad neta del periodo</span>
              <span className={`font-mono font-bold ${utilidad >= 0 ? "text-emerald-600" : "text-destructive"}`}>{mxn.format(utilidad)}</span>
            </div>
          </TabsContent>

          <TabsContent value="custom" className="pt-3">
            <ReportesPersonalizados empresaId={empresaId} />
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}

function Bloque({ titulo, data }: { titulo: string; data: { label: string; rows: any[]; total: number } | undefined }) {
  if (!data) return null;
  const rows2 = data.rows.filter((r) => r.nivel === 2 && Math.abs(Number(r.saldo_final)) > 0.005);
  return (
    <div className="rounded-lg border border-border">
      <div className="bg-muted/40 px-3 py-2 font-semibold text-sm border-b border-border flex justify-between">
        <span>{titulo}</span>
        <span className="font-mono">{mxn.format(data.total)}</span>
      </div>
      <div className="divide-y divide-border/60">
        {rows2.length === 0 && <div className="px-3 py-3 text-xs text-muted-foreground">Sin movimientos.</div>}
        {rows2.map((r) => (
          <div key={r.cuenta_id} className="flex justify-between px-3 py-1.5 text-sm hover:bg-muted/20">
            <span className="truncate">
              <span className="font-mono text-xs text-muted-foreground mr-2">{r.codigo}</span>
              {r.nombre}
            </span>
            <span className="font-mono text-xs">{mxn.format(Number(r.saldo_final))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportesPersonalizados({ empresaId }: { empresaId: string }) {
  const { data: reportes = [] } = useQuery({
    queryKey: ["reportes-personalizados", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reportes_personalizados" as any)
        .select("*")
        .eq("empresa_id", empresaId)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
      <p className="mb-2 font-medium text-foreground">Reportes personalizados / parciales</p>
      <p>
        Guarda plantillas de estados financieros seleccionando cuentas específicas
        (ej. "Balance parcial de bancos", "Gastos por departamento", "Ingresos por línea").
      </p>
      <p className="mt-3">
        {reportes.length === 0
          ? "Aún no tienes reportes guardados. El constructor de plantillas se agrega en la siguiente iteración."
          : `${reportes.length} reportes guardados.`}
      </p>
    </div>
  );
}
