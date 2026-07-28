import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileDown, Printer, Search, Ban, Pencil, PackageCheck } from "lucide-react";
import { recepcionPdf } from "@/lib/almacen-pdf";
import EditarRecepcionDialog from "./EditarRecepcionDialog";

type RecRow = {
  recepcion_id: string;
  folio: string;
  fecha: string;
  estado: string;
  proveedor: string | null;
  factura_proveedor: string | null;
  oc_folio: string | null;
  oc_id: string | null;
  almacen: string | null;
  clave: string;
  articulo: string;
  lote: string | null;
  caducidad: string | null;
  cantidad: number;
  costo_unitario: number;
};

export default function RecepcionesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["v_entradas_report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_entradas_report" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as unknown as RecRow[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { head: RecRow; items: RecRow[] }>();
    for (const r of rows) {
      const g = map.get(r.recepcion_id);
      if (g) g.items.push(r);
      else map.set(r.recepcion_id, { head: r, items: [r] });
    }
    const term = q.trim().toLowerCase();
    const list = [...map.values()];
    if (!term) return list;
    return list.filter(
      (g) =>
        g.head.folio?.toLowerCase().includes(term) ||
        g.head.oc_folio?.toLowerCase().includes(term) ||
        g.head.proveedor?.toLowerCase().includes(term) ||
        g.head.factura_proveedor?.toLowerCase().includes(term) ||
        g.items.some(
          (i) =>
            i.clave?.toLowerCase().includes(term) ||
            i.articulo?.toLowerCase().includes(term) ||
            i.lote?.toLowerCase().includes(term),
        ),
    );
  }, [rows, q]);

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancelar_recepcion" as never, {
        _rec: id,
        _motivo: "Cancelada desde almacén",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recepción cancelada · inventario revertido");
      qc.invalidateQueries({ queryKey: ["v_entradas_report"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pdfData = (g: { head: RecRow; items: RecRow[] }) => ({
    folio: g.head.folio,
    fecha: g.head.fecha,
    oc_folio: g.head.oc_folio,
    proveedor: g.head.proveedor,
    almacen: g.head.almacen,
    factura_proveedor: g.head.factura_proveedor,
    estado: g.head.estado,
    items: g.items,
  });

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <PackageCheck className="h-6 w-6 text-primary" /> Recepciones de compra
          </h1>
          <p className="text-sm text-muted-foreground">
            Ingresos sobre órdenes de compra con lote y caducidad. Cada ingreso genera su PDF y puede corregirse o cancelarse.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Folio, OC, proveedor, clave, lote…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
      {!isLoading && grouped.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aún no hay recepciones registradas. Se crean al recibir una orden de compra.
        </div>
      )}

      <div className="space-y-3">
        {grouped.map((g) => (
          <Card key={g.head.recepcion_id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{g.head.folio}</span>
                    <Badge variant={g.head.estado === "cancelada" ? "destructive" : "secondary"}>{g.head.estado}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {g.head.fecha} · OC {g.head.oc_folio ?? "—"} · {g.head.proveedor ?? "Sin proveedor"} ·{" "}
                    {g.head.almacen ?? "—"} · Factura {g.head.factura_proveedor ?? "—"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => recepcionPdf(pdfData(g), "download")}>
                    <FileDown className="mr-1 h-4 w-4" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => recepcionPdf(pdfData(g), "print")}>
                    <Printer className="mr-1 h-4 w-4" /> Imprimir
                  </Button>
                  {g.head.estado !== "cancelada" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(g.head.recepcion_id)}>
                        <Pencil className="mr-1 h-4 w-4" /> Corregir
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={cancelar.isPending}
                        onClick={() => {
                          if (confirm(`¿Cancelar la recepción ${g.head.folio}? Se revertirá el inventario.`)) {
                            cancelar.mutate(g.head.recepcion_id);
                          }
                        }}
                      >
                        <Ban className="mr-1 h-4 w-4" /> Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-2 py-1 text-left">Clave</th>
                      <th className="px-2 py-1 text-left">Descripción</th>
                      <th className="px-2 py-1 text-left">Lote</th>
                      <th className="px-2 py-1 text-left">Caducidad</th>
                      <th className="px-2 py-1 text-right">Cantidad</th>
                      <th className="px-2 py-1 text-right">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((i, idx) => (
                      <tr key={idx} className="border-b border-border/40">
                        <td className="px-2 py-1">{i.clave}</td>
                        <td className="px-2 py-1">{i.articulo}</td>
                        <td className="px-2 py-1">{i.lote ?? "—"}</td>
                        <td className="px-2 py-1">{i.caducidad ?? "—"}</td>
                        <td className="px-2 py-1 text-right">{Number(i.cantidad).toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">${Number(i.costo_unitario).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <EditarRecepcionDialog
          recepcionId={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["v_entradas_report"] });
          }}
        />
      )}
    </section>
  );
}
