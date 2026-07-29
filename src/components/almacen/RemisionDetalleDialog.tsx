import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileDown, Printer } from "lucide-react";

export type RemDetalleItem = {
  producto_id?: string | null;
  clave: string;
  articulo: string;
  lote: string | null;
  caducidad: string | null;
  ubicacion: string | null;
  cantidad: number;
};

export type RemDetalleHead = {
  remision_id: string;
  folio: string;
  fecha: string;
  estado: string;
  cliente: string | null;
  pedido_folio: string | null;
  almacen: string | null;
};

export default function RemisionDetalleDialog({
  head,
  items,
  onClose,
  onPdf,
  onPrint,
}: {
  head: RemDetalleHead;
  items: RemDetalleItem[];
  onClose: () => void;
  onPdf: () => void;
  onPrint: () => void;
}) {
  const productIds = [...new Set(items.map((i) => i.producto_id).filter(Boolean))] as string[];

  // Existencia actual por lote, para mostrar "Disponible" junto a cada renglón.
  const { data: batches = [] } = useQuery({
    queryKey: ["rem-detalle-batches", head.remision_id, productIds.join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("producto_id, lote, caducidad, cantidad")
        .in("producto_id", productIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        producto_id: string;
        lote: string | null;
        caducidad: string | null;
        cantidad: number;
      }>;
    },
  });

  const disponible = (i: RemDetalleItem) => {
    if (!i.producto_id) return null;
    const rows = batches.filter(
      (b) => b.producto_id === i.producto_id && (b.lote ?? "") === (i.lote ?? ""),
    );
    if (rows.length === 0) return null;
    return rows.reduce((s, b) => s + Number(b.cantidad ?? 0), 0);
  };

  const totalPiezas = items.reduce((s, i) => s + Number(i.cantidad ?? 0), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Remisión {head.folio}
            <Badge variant={head.estado === "cancelada" ? "destructive" : "secondary"}>
              {head.estado}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Fecha</div>
            <div>{head.fecha ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Pedido</div>
            <div>{head.pedido_folio ?? "—"}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-[11px] uppercase text-muted-foreground">Cliente</div>
            <div className="truncate">{head.cliente ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Almacén</div>
            <div>{head.almacen ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Renglones</div>
            <div className="tabular-nums">{items.length}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Piezas</div>
            <div className="tabular-nums">{totalPiezas}</div>
          </div>
        </div>

        <div className="mt-2 max-h-[45vh] overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Clave</th>
                <th className="px-2 py-1.5 text-left">Artículo</th>
                <th className="px-2 py-1.5 text-left">Número de serie/lote</th>
                <th className="px-2 py-1.5 text-left">Fecha de caducidad</th>
                <th className="px-2 py-1.5 text-right">Cantidad</th>
                <th className="px-2 py-1.5 text-right">Disponible</th>
                <th className="px-2 py-1.5 text-left">Ubicación</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, idx) => (
                <tr key={idx} className="border-t border-border/50">
                  <td className="px-2 py-1.5">{i.clave}</td>
                  <td className="px-2 py-1.5">{i.articulo}</td>
                  <td className="px-2 py-1.5 font-mono">{i.lote ?? "—"}</td>
                  <td className="px-2 py-1.5">{i.caducidad ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{Number(i.cantidad)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {disponible(i) ?? "—"}
                  </td>
                  <td className="px-2 py-1.5">{i.ubicacion ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onPdf}>
            <FileDown className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={onPrint}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir
          </Button>
          <Button size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
