import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scale, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";

export const Route = createFileRoute("/admin/contabilidad/balanza")({
  head: () => ({ meta: [{ title: "Balanza de comprobación — Contabilidad" }] }),
  component: BalanzaPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function firstOfMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }
function today() { return new Date().toISOString().slice(0, 10); }

function BalanzaPage() {
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [desde, setDesde] = useState(firstOfMonth());
  const [hasta, setHasta] = useState(today());
  const [nivelMax, setNivelMax] = useState(6);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["balanza", empresaId, desde, hasta],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("balanza_de_comprobacion" as any, {
        _empresa: empresaId!, _desde: desde, _hasta: hasta,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filtered = useMemo(() => rows.filter((r) => r.nivel <= nivelMax), [rows, nivelMax]);

  const totales = useMemo(() => {
    let si = 0, c = 0, a = 0, sf = 0;
    for (const r of filtered.filter((x) => x.nivel === 1)) {
      si += Number(r.saldo_inicial); c += Number(r.cargos); a += Number(r.abonos); sf += Number(r.saldo_final);
    }
    return { si, c, a, sf };
  }, [filtered]);

  const exportCSV = () => {
    const header = "Código,Nombre,Agrupador,Naturaleza,Nivel,Saldo inicial,Cargos,Abonos,Saldo final\n";
    const body = filtered.map((r) =>
      [r.codigo, JSON.stringify(r.nombre), r.codigo_agrupador ?? "", r.naturaleza, r.nivel, r.saldo_inicial, r.cargos, r.abonos, r.saldo_final].join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `balanza-${desde}-${hasta}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" /> Balanza de comprobación
          </h1>
          <p className="text-sm text-muted-foreground">Saldos iniciales, movimientos y finales por cuenta.</p>
        </div>
        <EmpresaSelector />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">Desde</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div><Label className="text-xs">Hasta</Label><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        <div><Label className="text-xs">Nivel máx.</Label><Input type="number" min={1} max={6} value={nivelMax} onChange={(e) => setNivelMax(Number(e.target.value))} className="w-24" /></div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Elige una empresa.</div>
      ) : (
        <>
          {/* Table view: sm+ */}
          <div className="hidden sm:block rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2 w-24">Código</th>
                  <th className="text-left px-2 py-2">Nombre</th>
                  <th className="text-left px-2 py-2 w-20">Agrup.</th>
                  <th className="text-right px-2 py-2 w-32">Saldo inicial</th>
                  <th className="text-right px-2 py-2 w-28">Cargos</th>
                  <th className="text-right px-2 py-2 w-28">Abonos</th>
                  <th className="text-right px-2 py-2 w-32">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin cuentas.</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.cuenta_id} className={`border-t border-border ${r.nivel === 1 ? "bg-muted/30 font-semibold" : ""}`}>
                    <td className="px-2 py-1.5 font-mono text-xs" style={{ paddingLeft: `${8 + (r.nivel - 1) * 16}px` }}>{r.codigo}</td>
                    <td className="px-2 py-1.5">{r.nombre}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{r.codigo_agrupador ?? ""}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">{mxn.format(Number(r.saldo_inicial))}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">{mxn.format(Number(r.cargos))}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">{mxn.format(Number(r.abonos))}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">{mxn.format(Number(r.saldo_final))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/40">
                <tr className="border-t border-border">
                  <td colSpan={3} className="px-2 py-2 text-right text-xs uppercase tracking-wider">Totales nivel 1</td>
                  <td className="px-2 py-2 text-right font-mono">{mxn.format(totales.si)}</td>
                  <td className="px-2 py-2 text-right font-mono">{mxn.format(totales.c)}</td>
                  <td className="px-2 py-2 text-right font-mono">{mxn.format(totales.a)}</td>
                  <td className="px-2 py-2 text-right font-mono">{mxn.format(totales.sf)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Card view: mobile */}
          <div className="sm:hidden space-y-2">
            {isLoading ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">Cargando…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">Sin cuentas.</div>
            ) : filtered.map((r) => (
              <div key={r.cuenta_id} className={`rounded-lg border border-border bg-card p-3 ${r.nivel === 1 ? "font-semibold" : ""}`}>
                <div className="flex items-baseline justify-between gap-2" style={{ paddingLeft: `${(r.nivel - 1) * 12}px` }}>
                  <div className="min-w-0">
                    <div className="font-mono text-xs">{r.codigo}</div>
                    <div className="text-sm break-words">{r.nombre}</div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-xs tabular-nums">{mxn.format(Number(r.saldo_final))}</div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs">
                  <dt className="text-muted-foreground">Inicial</dt>
                  <dd className="text-right font-mono tabular-nums">{mxn.format(Number(r.saldo_inicial))}</dd>
                  <dt className="text-muted-foreground">Cargos</dt>
                  <dd className="text-right font-mono tabular-nums">{mxn.format(Number(r.cargos))}</dd>
                  <dt className="text-muted-foreground">Abonos</dt>
                  <dd className="text-right font-mono tabular-nums">{mxn.format(Number(r.abonos))}</dd>
                </dl>
              </div>
            ))}
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs font-semibold">
              <div className="mb-1 uppercase tracking-wider text-muted-foreground">Totales nivel 1</div>
              <dl className="grid grid-cols-2 gap-x-3 tabular-nums font-mono">
                <dt>Inicial</dt><dd className="text-right">{mxn.format(totales.si)}</dd>
                <dt>Cargos</dt><dd className="text-right">{mxn.format(totales.c)}</dd>
                <dt>Abonos</dt><dd className="text-right">{mxn.format(totales.a)}</dd>
                <dt>Final</dt><dd className="text-right">{mxn.format(totales.sf)}</dd>
              </dl>
            </div>
          </div>
        </>
      )}

    </section>
  );
}
