import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/contabilidad/facturas")({
  head: () => ({ meta: [{ title: "Facturas contables — Contabilidad" }] }),
  component: FacturasContPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function FacturasContPage() {
  const qc = useQueryClient();
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [filtro, setFiltro] = useState<string>("pendientes");

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ["facturas-contables", empresaId, filtro],
    enabled: !!empresaId,
    queryFn: async () => {
      let q = supabase
        .from("facturas" as any)
        .select("id, folio, fecha_emision, total, estado, poliza_id, cliente_id, clientes(razon_social, nombre_comercial)")
        .eq("empresa_id", empresaId!)
        .order("fecha_emision", { ascending: false })
        .limit(200);
      if (filtro === "pendientes") q = q.is("poliza_id", null);
      if (filtro === "contabilizadas") q = q.not("poliza_id", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const contabilizar = useMutation({
    mutationFn: async (factura: any) => {
      if (!empresaId) throw new Error("Selecciona empresa");
      // Look up cuentas: 105 clientes, 401 ventas, 208-01 IVA trasladado cobrado
      const { data: cuentas } = await supabase
        .from("cuentas_contables" as any)
        .select("id, codigo")
        .eq("empresa_id", empresaId)
        .in("codigo", ["105", "401", "208-01", "209-01"]);
      const map: Record<string, string> = {};
      for (const c of (cuentas ?? []) as any[]) map[c.codigo] = c.id;

      const total = Number(factura.total);
      const iva = +(total - total / 1.16).toFixed(2);
      const sub = +(total - iva).toFixed(2);

      // Create draft póliza de ingreso
      const { data: pol, error: e1 } = await supabase
        .from("polizas" as any)
        .insert({
          empresa_id: empresaId,
          tipo: "ingreso",
          fecha: factura.fecha_emision,
          concepto: `Factura ${factura.folio}`,
          estado: "borrador",
          origen: "factura",
          origen_id: factura.id,
        })
        .select("id")
        .single();
      if (e1) throw e1;
      const polizaId = (pol as any).id as string;

      const movs = [
        { cuenta_id: map["105"], cargo: total, abono: 0, concepto: "Cliente" },
        { cuenta_id: map["401"], cargo: 0, abono: sub, concepto: "Ventas" },
        { cuenta_id: map["209-01"] ?? map["208-01"], cargo: 0, abono: iva, concepto: "IVA por trasladar 16%" },
      ].filter((m) => m.cuenta_id).map((m, i) => ({ ...m, poliza_id: polizaId, orden: i, uuid_cfdi: factura.uuid_cfdi }));

      const { error: e2 } = await supabase.from("poliza_movimientos" as any).insert(movs);
      if (e2) throw e2;

      // Link factura → poliza
      const { error: e3 } = await supabase.from("facturas" as any).update({ poliza_id: polizaId }).eq("id", factura.id);
      if (e3) throw e3;

      return polizaId;
    },
    onSuccess: (polizaId) => {
      toast.success("Póliza generada — revisa y asienta");
      qc.invalidateQueries({ queryKey: ["facturas-contables"] });
      window.location.href = `/admin/contabilidad/polizas/${polizaId}`;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Facturas contables
          </h1>
          <p className="text-sm text-muted-foreground">Facturas emitidas y su vínculo con las pólizas contables.</p>
        </div>
        <EmpresaSelector />
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Elige una empresa.</div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendientes">Pendientes de contabilizar</SelectItem>
                <SelectItem value="contabilizadas">Contabilizadas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2 w-24">Folio</th>
                  <th className="text-left px-2 py-2 w-28">Fecha</th>
                  <th className="text-left px-2 py-2">Cliente</th>
                  <th className="text-right px-2 py-2 w-32">Total</th>
                  <th className="text-center px-2 py-2 w-28">Contabilidad</th>
                  <th className="w-32"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
                ) : facturas.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Sin facturas.</td></tr>
                ) : facturas.map((f: any) => (
                  <tr key={f.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-2 py-1.5 font-mono text-xs">{f.folio}</td>
                    <td className="px-2 py-1.5 text-xs">{f.fecha_emision}</td>
                    <td className="px-2 py-1.5">{f.clientes?.nombre_comercial || f.clientes?.razon_social || "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{mxn.format(Number(f.total))}</td>
                    <td className="px-2 py-1.5 text-center">
                      {f.poliza_id
                        ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" /> Contabilizada</Badge>
                        : <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendiente</Badge>}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {f.poliza_id ? (
                        <Link to="/admin/contabilidad/polizas/$id" params={{ id: f.poliza_id }} className="text-primary text-xs hover:underline">
                          Ver póliza
                        </Link>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => contabilizar.mutate(f)} disabled={contabilizar.isPending}>
                          Contabilizar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
