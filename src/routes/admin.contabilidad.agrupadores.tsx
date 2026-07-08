import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BookText, Search, Link2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";

export const Route = createFileRoute("/admin/contabilidad/agrupadores")({
  head: () => ({
    meta: [
      { title: "Códigos agrupadores SAT — Contabilidad" },
      { name: "description", content: "Catálogo oficial Anexo 24 del SAT y enlace con el catálogo de cuentas." },
    ],
  }),
  component: AgrupadoresPage,
});

type SAT = { codigo: string; nombre: string; nivel: number; naturaleza: "deudora" | "acreedora"; padre: string | null };
type Cuenta = {
  id: string;
  codigo: string;
  nombre: string;
  codigo_agrupador: string | null;
  nivel: number;
  permite_movimientos: boolean;
};

function AgrupadoresPage() {
  const qc = useQueryClient();
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [search, setSearch] = useState("");

  const { data: sat = [] } = useQuery({
    queryKey: ["sat-agrupador-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sat_codigo_agrupador" as any)
        .select("codigo, nombre, nivel, naturaleza, padre")
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as unknown as SAT[];
    },
  });

  const { data: cuentas = [] } = useQuery({
    queryKey: ["cuentas-para-agrup", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cuentas_contables" as any)
        .select("id, codigo, nombre, codigo_agrupador, nivel, permite_movimientos")
        .eq("empresa_id", empresaId!)
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as unknown as Cuenta[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sat;
    return sat.filter((s) => s.codigo.toLowerCase().includes(q) || s.nombre.toLowerCase().includes(q));
  }, [sat, search]);

  const cuentasByAgrup = useMemo(() => {
    const m = new Map<string, Cuenta[]>();
    for (const c of cuentas) {
      if (!c.codigo_agrupador) continue;
      const arr = m.get(c.codigo_agrupador) ?? [];
      arr.push(c);
      m.set(c.codigo_agrupador, arr);
    }
    return m;
  }, [cuentas]);

  const sinAgrupador = cuentas.filter((c) => c.permite_movimientos && !c.codigo_agrupador);

  const autoWire = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Selecciona una empresa");
      const validCodes = new Set(sat.map((s) => s.codigo));
      const updates: { id: string; codigo_agrupador: string }[] = [];
      for (const c of sinAgrupador) {
        // Try prefix of codigo (e.g. "118-01" -> "118")
        const base = c.codigo.split(/[-.]/)[0];
        if (validCodes.has(base)) {
          updates.push({ id: c.id, codigo_agrupador: base });
        }
      }
      let ok = 0;
      for (const u of updates) {
        const { error } = await supabase
          .from("cuentas_contables" as any)
          .update({ codigo_agrupador: u.codigo_agrupador })
          .eq("id", u.id);
        if (!error) ok++;
      }
      return { ok, total: sinAgrupador.length };
    },
    onSuccess: ({ ok, total }) => {
      toast.success(`${ok} / ${total} cuentas enlazadas automáticamente`);
      qc.invalidateQueries({ queryKey: ["cuentas-para-agrup"] });
      qc.invalidateQueries({ queryKey: ["cuentas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookText className="h-6 w-6 text-primary" /> Códigos agrupadores SAT
          </h1>
          <p className="text-sm text-muted-foreground">
            Catálogo oficial del Anexo 24. Cada cuenta contable de nivel de movimiento debe estar enlazada a un agrupador.
          </p>
        </div>
        <EmpresaSelector />
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Elige una empresa para ver el enlace con tu catálogo.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-4">
              <div className="text-xs text-muted-foreground">Cuentas de movimiento</div>
              <div className="text-2xl font-bold">{cuentas.filter((c) => c.permite_movimientos).length}</div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="text-xs text-muted-foreground">Con agrupador SAT</div>
              <div className="text-2xl font-bold text-emerald-500">
                {cuentas.filter((c) => c.permite_movimientos && c.codigo_agrupador).length}
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="text-xs text-muted-foreground">Sin enlazar</div>
              <div className="text-2xl font-bold text-amber-500">{sinAgrupador.length}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar agrupador por código o nombre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button onClick={() => autoWire.mutate()} disabled={autoWire.isPending || sinAgrupador.length === 0}>
              <Wand2 className="h-4 w-4 mr-1" />
              {autoWire.isPending ? "Enlazando…" : `Auto-enlazar ${sinAgrupador.length} cuentas`}
            </Button>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 w-24">Código</th>
                  <th className="text-left px-3 py-2">Nombre</th>
                  <th className="text-center px-3 py-2 w-16">Nivel</th>
                  <th className="text-left px-3 py-2 w-24">Naturaleza</th>
                  <th className="text-left px-3 py-2">Cuentas enlazadas</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const linked = cuentasByAgrup.get(s.codigo) ?? [];
                  return (
                    <tr key={s.codigo} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">{s.codigo}</td>
                      <td className="px-3 py-2">{s.nombre}</td>
                      <td className="px-3 py-2 text-center">{s.nivel}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px]">{s.naturaleza}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {linked.length === 0 ? (
                          <span className="text-xs text-muted-foreground">— sin cuentas —</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {linked.map((c) => (
                              <Badge key={c.id} variant="secondary" className="text-[10px] font-mono">
                                <Link2 className="h-2.5 w-2.5 mr-1" />
                                {c.codigo} · {c.nombre}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
