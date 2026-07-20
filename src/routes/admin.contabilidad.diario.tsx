import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";

export const Route = createFileRoute("/admin/contabilidad/diario")({
  head: () => ({ meta: [{ title: "Libro diario — Contabilidad" }] }),
  component: DiarioPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() { return new Date().toISOString().slice(0, 10); }

function DiarioPage() {
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [desde, setDesde] = useState(firstOfMonth());
  const [hasta, setHasta] = useState(today());
  const [incluirBorradores, setIncluirBorradores] = useState(true);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["diario", empresaId, desde, hasta, incluirBorradores],
    enabled: !!empresaId,
    queryFn: async () => {
      const estados = incluirBorradores ? ["asentada", "borrador"] : ["asentada"];
      const { data, error } = await supabase
        .from("polizas" as any)
        .select("id, folio, tipo, fecha, concepto, estado, poliza_movimientos!inner(id, cargo, abono, concepto, cuenta_id, orden, cuentas_contables(codigo, nombre))")
        .eq("empresa_id", empresaId!)
        .in("estado", estados)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha")
        .order("folio");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const totals = useMemo(() => {
    let c = 0, a = 0;
    for (const p of rows) for (const m of p.poliza_movimientos) { c += Number(m.cargo); a += Number(m.abono); }
    return { c, a };
  }, [rows]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookText className="h-6 w-6 text-primary" /> Libro diario
          </h1>
          <p className="text-sm text-muted-foreground">Cronología de todas las pólizas asentadas en el periodo.</p>
        </div>
        <EmpresaSelector />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">Desde</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div><Label className="text-xs">Hasta</Label><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
          <input type="checkbox" checked={incluirBorradores} onChange={(e) => setIncluirBorradores(e.target.checked)} className="h-4 w-4" />
          Incluir borradores
        </label>
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
                  <th className="text-left px-2 py-2 w-24">Fecha</th>
                  <th className="text-left px-2 py-2 w-24">Folio</th>
                  <th className="text-left px-2 py-2 w-28">Cuenta</th>
                  <th className="text-left px-2 py-2">Concepto</th>
                  <th className="text-right px-2 py-2 w-28">Cargo</th>
                  <th className="text-right px-2 py-2 w-28">Abono</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Sin pólizas asentadas en el rango.</td></tr>
                ) : rows.flatMap((p: any) =>
                  p.poliza_movimientos.map((m: any, i: number) => (
                    <tr key={m.id} className={`${i === 0 ? "border-t-2 border-primary/20" : "border-t border-border/60"} hover:bg-muted/20`}>
                      <td className="px-2 py-1.5 text-xs">{i === 0 ? p.fecha : ""}</td>
                      <td className="px-2 py-1.5">
                        {i === 0 ? (
                          <Link to="/admin/contabilidad/polizas/$id" params={{ id: p.id }} className="font-mono text-xs text-primary hover:underline">{p.folio}</Link>
                        ) : ""}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs">{m.cuentas_contables?.codigo}</td>
                      <td className="px-2 py-1.5 truncate max-w-[420px]">
                        <span className="text-xs">{m.cuentas_contables?.nombre}</span>
                        {(m.concepto || p.concepto) && <div className="text-[11px] text-muted-foreground truncate">{m.concepto || p.concepto}</div>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs">{Number(m.cargo) > 0 ? mxn.format(Number(m.cargo)) : ""}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs">{Number(m.abono) > 0 ? mxn.format(Number(m.abono)) : ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-muted/40">
                <tr className="border-t border-border">
                  <td colSpan={4} className="px-2 py-2 text-right text-xs uppercase tracking-wider">Totales</td>
                  <td className="px-2 py-2 text-right font-mono">{mxn.format(totals.c)}</td>
                  <td className="px-2 py-2 text-right font-mono">{mxn.format(totals.a)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Card view: mobile — one card per póliza */}
          <div className="sm:hidden space-y-2">
            {isLoading ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">Cargando…</div>
            ) : rows.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">Sin pólizas asentadas en el rango.</div>
            ) : rows.map((p: any) => {
              const pc = p.poliza_movimientos.reduce((s: number, m: any) => s + Number(m.cargo), 0);
              const pa = p.poliza_movimientos.reduce((s: number, m: any) => s + Number(m.abono), 0);
              return (
                <div key={p.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link to="/admin/contabilidad/polizas/$id" params={{ id: p.id }} className="font-mono text-sm font-semibold text-primary hover:underline">
                      {p.folio}
                    </Link>
                    <span className="text-xs text-muted-foreground">{p.fecha}</span>
                  </div>
                  {p.concepto && <div className="mt-1 text-xs text-muted-foreground break-words">{p.concepto}</div>}
                  <ul className="mt-2 space-y-1 border-t border-border pt-2">
                    {p.poliza_movimientos.map((m: any) => (
                      <li key={m.id} className="flex items-baseline justify-between gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono">{m.cuentas_contables?.codigo}</div>
                          <div className="truncate text-muted-foreground">{m.cuentas_contables?.nombre}</div>
                        </div>
                        <div className="shrink-0 text-right font-mono tabular-nums">
                          {Number(m.cargo) > 0 && <div className="text-emerald-600">{mxn.format(Number(m.cargo))}</div>}
                          {Number(m.abono) > 0 && <div className="text-rose-600">{mxn.format(Number(m.abono))}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex justify-between border-t border-border pt-2 text-xs font-semibold tabular-nums">
                    <span>Cargo {mxn.format(pc)}</span>
                    <span>Abono {mxn.format(pa)}</span>
                  </div>
                </div>
              );
            })}
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs font-semibold tabular-nums flex justify-between">
              <span>Total cargos {mxn.format(totals.c)}</span>
              <span>Total abonos {mxn.format(totals.a)}</span>
            </div>
          </div>
        </>
      )}

    </section>
  );
}
