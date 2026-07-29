import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ban, FileDown, FileText, Pencil, Printer, Search } from "lucide-react";
import { remisionPdf } from "@/lib/almacen-pdf";
import NuevaRemisionDialog from "./NuevaRemisionDialog";

type PendienteRow = {
  id: string;
  folio: string;
  created_at: string;
  estado: string | null;
  total: number | null;
  cliente_id: string | null;
  clientes?: { razon_social?: string | null } | null;
  remisiones?: { id: string; estado: string | null }[] | null;
};

type RemRow = {
  remision_id: string;
  folio: string;
  fecha: string;
  estado: string;
  cliente: string | null;
  cliente_id: string | null;
  pedido_folio: string | null;
  pedido_id: string | null;
  almacen: string | null;
  clave: string;
  articulo: string;
  lote: string | null;
  caducidad: string | null;
  ubicacion: string | null;
  cantidad: number;
};

export default function RemisionesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [nueva, setNueva] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [pedidoPreset, setPedidoPreset] = useState<{
    id: string;
    folio: string;
    cliente_id: string | null;
    clientes?: { razon_social?: string | null } | null;
  } | null>(null);

  // Pedidos activos que todavía no tienen una remisión vigente.
  const { data: pendientes = [], isLoading: loadingPend } = useQuery({
    queryKey: ["pedidos-sin-remision"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, folio, created_at, estado, total, cliente_id, clientes(razon_social), remisiones(id, estado)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return ((data ?? []) as unknown as PendienteRow[]).filter((p) => {
        const est = (p.estado ?? "").toLowerCase();
        if (est.includes("cancel")) return false;
        const vigentes = (p.remisiones ?? []).filter((r) => (r.estado ?? "") !== "cancelada");
        return vigentes.length === 0;
      });
    },
  });

  const pendientesFiltrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return pendientes;
    return pendientes.filter(
      (p) =>
        p.folio?.toLowerCase().includes(term) ||
        (p.clientes?.razon_social ?? "").toLowerCase().includes(term),
    );
  }, [pendientes, q]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["v_remisiones_report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_remisiones_report" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as unknown as RemRow[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { head: RemRow; items: RemRow[] }>();
    for (const r of rows) {
      const g = map.get(r.remision_id);
      if (g) g.items.push(r);
      else map.set(r.remision_id, { head: r, items: [r] });
    }
    const term = q.trim().toLowerCase();
    const list = [...map.values()];
    if (!term) return list;
    return list.filter(
      (g) =>
        g.head.folio?.toLowerCase().includes(term) ||
        g.head.cliente?.toLowerCase().includes(term) ||
        g.head.pedido_folio?.toLowerCase().includes(term) ||
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
      const { error } = await supabase.rpc("cancelar_remision" as never, {
        _rem: id,
        _motivo: "Cancelada desde almacén",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Remisión dada de baja · inventario devuelto");
      qc.invalidateQueries({ queryKey: ["v_remisiones_report"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pdfData = (g: { head: RemRow; items: RemRow[] }) => ({
    folio: g.head.folio,
    fecha: g.head.fecha,
    cliente: g.head.cliente,
    pedido_folio: g.head.pedido_folio,
    almacen: g.head.almacen,
    estado: g.head.estado,
    items: g.items,
  });

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileText className="h-6 w-6 text-primary" /> Remisiones
          </h1>
          <p className="text-sm text-muted-foreground">
            Salidas por remisión con selección de lote y ubicación. El inventario se descuenta automáticamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Folio, cliente, pedido, lote…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button onClick={() => setNueva(true)}>Nueva remisión</Button>
        </div>
      </header>

      {/* Pedidos pendientes de remisionar */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Pedidos sin remisionar</h2>
              <p className="text-xs text-muted-foreground">
                Pedidos activos que aún no tienen una remisión vigente.
              </p>
            </div>
            <Badge variant="secondary">{pendientesFiltrados.length}</Badge>
          </div>
          {loadingPend ? (
            <div className="text-sm text-muted-foreground">Cargando pedidos…</div>
          ) : pendientesFiltrados.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Todos los pedidos tienen remisión.
            </div>
          ) : (
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Pedido</th>
                    <th className="px-2 py-1.5 text-left">Fecha</th>
                    <th className="px-2 py-1.5 text-left">Cliente</th>
                    <th className="px-2 py-1.5 text-left">Estado</th>
                    <th className="px-2 py-1.5 text-right">Total</th>
                    <th className="px-2 py-1.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientesFiltrados.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-2 py-1.5 font-medium">{p.folio}</td>
                      <td className="px-2 py-1.5">{(p.created_at ?? "").slice(0, 10)}</td>
                      <td className="px-2 py-1.5">{p.clientes?.razon_social ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant="outline">{p.estado ?? "—"}</Badge>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
                          Number(p.total ?? 0),
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPedidoPreset({
                              id: p.id,
                              folio: p.folio,
                              cliente_id: p.cliente_id,
                              clientes: p.clientes ?? null,
                            });
                            setNueva(true);
                          }}
                        >
                          Remisionar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
      {!isLoading && grouped.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aún no hay remisiones. Crea una desde un pedido con “Nueva remisión”.
        </div>
      )}

      <div className="space-y-3">
        {grouped.map((g) => (
          <Card key={g.head.remision_id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{g.head.folio}</span>
                    <Badge variant={g.head.estado === "cancelada" ? "destructive" : "secondary"}>{g.head.estado}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {g.head.fecha} · Pedido {g.head.pedido_folio ?? "—"} · {g.head.cliente ?? "Sin cliente"} · {g.head.almacen ?? "—"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => remisionPdf(pdfData(g), "download")}>
                    <FileDown className="mr-1 h-4 w-4" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => remisionPdf(pdfData(g), "print")}>
                    <Printer className="mr-1 h-4 w-4" /> Imprimir
                  </Button>
                  {g.head.estado !== "cancelada" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditando(g.head.remision_id)}>
                        <Pencil className="mr-1 h-4 w-4" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={cancelar.isPending}
                        onClick={() => {
                          if (confirm(`¿Dar de baja la remisión ${g.head.folio}? Se devolverá el inventario.`)) {
                            cancelar.mutate(g.head.remision_id);
                          }
                        }}
                      >
                        <Ban className="mr-1 h-4 w-4" /> Dar de baja
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
                      <th className="px-2 py-1 text-left">Artículo</th>
                      <th className="px-2 py-1 text-right">Cantidad</th>
                      <th className="px-2 py-1 text-left">Lote</th>
                      <th className="px-2 py-1 text-left">Caducidad</th>
                      <th className="px-2 py-1 text-left">Ubicación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((i, idx) => (
                      <tr key={idx} className="border-b border-border/40">
                        <td className="px-2 py-1">{i.clave}</td>
                        <td className="px-2 py-1">{i.articulo}</td>
                        <td className="px-2 py-1 text-right">{Number(i.cantidad).toFixed(2)}</td>
                        <td className="px-2 py-1">{i.lote ?? "—"}</td>
                        <td className="px-2 py-1">{i.caducidad ?? "—"}</td>
                        <td className="px-2 py-1">{i.ubicacion ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(nueva || editando) && (
        <NuevaRemisionDialog
          remisionId={editando}
          pedidoPreset={editando ? null : pedidoPreset}
          onClose={() => {
            setNueva(false);
            setEditando(null);
            setPedidoPreset(null);
          }}
          onSaved={() => {
            setNueva(false);
            setEditando(null);
            setPedidoPreset(null);
            qc.invalidateQueries({ queryKey: ["v_remisiones_report"] });
            qc.invalidateQueries({ queryKey: ["pedidos-sin-remision"] });
          }}
        />
      )}
    </section>
  );
}
