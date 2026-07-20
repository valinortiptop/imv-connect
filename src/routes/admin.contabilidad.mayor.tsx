import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/contabilidad/mayor")({
  head: () => ({ meta: [{ title: "Libro mayor — Contabilidad" }] }),
  component: MayorPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() { return new Date().toISOString().slice(0, 10); }

function MayorPage() {
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [desde, setDesde] = useState(firstOfMonth());
  const [hasta, setHasta] = useState(today());
  const [cuentaId, setCuentaId] = useState<string>("");
  const [incluirBorradores, setIncluirBorradores] = useState(true);

  const { data: cuentas = [] } = useQuery({
    queryKey: ["cuentas-mayor", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cuentas_contables" as any)
        .select("id, codigo, nombre, permite_movimientos")
        .eq("empresa_id", empresaId!)
        .eq("activa", true)
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: mayor = [], isLoading } = useQuery({
    queryKey: ["mayor", cuentaId, desde, hasta, incluirBorradores],
    enabled: !!cuentaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("libro_mayor_cuenta" as any, {
        _cuenta: cuentaId, _desde: desde, _hasta: hasta, _incluir_borradores: incluirBorradores,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookText className="h-6 w-6 text-primary" /> Libro mayor
          </h1>
          <p className="text-sm text-muted-foreground">Movimientos y saldo corrido por cuenta.</p>
        </div>
        <EmpresaSelector />
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Elige una empresa.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[300px]">
              <Label className="text-xs">Cuenta</Label>
              <Select value={cuentaId} onValueChange={setCuentaId}>
                <SelectTrigger><SelectValue placeholder="Elige una cuenta" /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {cuentas.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-mono text-xs">{c.codigo}</span> · {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Desde</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
            <div><Label className="text-xs">Hasta</Label><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
              <input type="checkbox" checked={incluirBorradores} onChange={(e) => setIncluirBorradores(e.target.checked)} className="h-4 w-4" />
              Incluir borradores
            </label>
          </div>

          {!cuentaId ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Elige una cuenta para ver su mayor.</div>
          ) : (
            <>
              <div className="hidden sm:block rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-2 w-24">Fecha</th>
                      <th className="text-left px-2 py-2 w-24">Folio</th>
                      <th className="text-left px-2 py-2">Concepto</th>
                      <th className="text-right px-2 py-2 w-28">Cargo</th>
                      <th className="text-right px-2 py-2 w-28">Abono</th>
                      <th className="text-right px-2 py-2 w-32">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
                    ) : mayor.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Sin movimientos.</td></tr>
                    ) : mayor.map((r: any, i: number) => (
                      <tr key={i} className="border-t border-border hover:bg-muted/20">
                        <td className="px-2 py-1.5 text-xs">{r.fecha}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">{r.folio}</td>
                        <td className="px-2 py-1.5 truncate max-w-[380px]">{r.concepto}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">{Number(r.cargo) > 0 ? mxn.format(Number(r.cargo)) : ""}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">{Number(r.abono) > 0 ? mxn.format(Number(r.abono)) : ""}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">{mxn.format(Number(r.saldo))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="sm:hidden space-y-2">
                {isLoading ? (
                  <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">Cargando…</div>
                ) : mayor.length === 0 ? (
                  <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">Sin movimientos.</div>
                ) : mayor.map((r: any, i: number) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs">{r.folio}</span>
                      <span className="text-xs text-muted-foreground">{r.fecha}</span>
                    </div>
                    {r.concepto && <div className="mt-1 text-xs break-words">{r.concepto}</div>}
                    <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-2 text-xs font-mono tabular-nums">
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Cargo</div>
                        <div className="text-emerald-600">{Number(r.cargo) > 0 ? mxn.format(Number(r.cargo)) : "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Abono</div>
                        <div className="text-rose-600">{Number(r.abono) > 0 ? mxn.format(Number(r.abono)) : "—"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-muted-foreground">Saldo</div>
                        <div className="font-semibold">{mxn.format(Number(r.saldo))}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

        </>
      )}
    </section>
  );
}
