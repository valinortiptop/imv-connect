import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getReorderPrefillFn,
  searchProductsForRepFn,
  createRepOrderFn,
} from "@/lib/rep.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Search, Sparkles, ShoppingCart } from "lucide-react";

type Line = {
  producto_id: string;
  nombre_snapshot: string;
  sku_snapshot: string | null;
  unidad_snapshot: string;
  cantidad: number;
  precio_unitario: number;
  iva_pct: number;
  source?: string;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

type Props = {
  clienteId: string;
  visitId?: string;
  onCreated?: (pedidoId: string, folio: string) => void;
};

export default function OrderQuickCreate({ clienteId, visitId, onCreated }: Props) {
  const qc = useQueryClient();
  const prefillFn = useServerFn(getReorderPrefillFn);
  const searchFn = useServerFn(searchProductsForRepFn);
  const createFn = useServerFn(createRepOrderFn);

  const [lines, setLines] = useState<Line[]>([]);
  const [notas, setNotas] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [q, setQ] = useState("");

  const prefillQ = useQuery({
    queryKey: ["rep-prefill", clienteId],
    queryFn: () => prefillFn({ data: { clienteId } }),
  });

  const searchQ = useQuery({
    queryKey: ["rep-prod-search", clienteId, q],
    queryFn: () => searchFn({ data: { clienteId, q } }),
    enabled: q.trim().length >= 2,
  });

  const totals = useMemo(() => {
    let sub = 0;
    let iva = 0;
    for (const l of lines) {
      const imp = l.cantidad * l.precio_unitario;
      sub += imp;
      iva += imp * l.iva_pct;
    }
    return { sub, iva, total: sub + iva };
  }, [lines]);

  const add = (p: any) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.producto_id === p.producto_id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + (p.suggested_qty ?? 1) };
        return copy;
      }
      return [
        ...prev,
        {
          producto_id: p.producto_id,
          nombre_snapshot: p.nombre,
          sku_snapshot: p.sku ?? null,
          unidad_snapshot: p.unidad ?? "PZA",
          cantidad: p.suggested_qty ?? 1,
          precio_unitario: p.precio_sugerido ?? p.precio_lista ?? 0,
          iva_pct: 0.16,
          source: p.source,
        },
      ];
    });
  };

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          clienteId,
          visitId,
          items: lines,
          notas_cliente: notas || undefined,
          urgency: urgent,
          delivery_date: deliveryDate || undefined,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(`Pedido ${r.pedido.folio} creado`);
      qc.invalidateQueries({ queryKey: ["client-dash", clienteId] });
      qc.invalidateQueries({ queryKey: ["rep-visits"] });
      qc.invalidateQueries({ queryKey: ["client-visits", clienteId] });
      setLines([]);
      setNotas("");
      onCreated?.(r.pedido.id, r.pedido.folio);
    },
    onError: (e: any) => toast.error(e.message ?? "Error creando pedido"),
  });

  return (
    <div className="space-y-4">
      {/* Búsqueda */}
      <div>
        <Label>Buscar producto</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="SKU o nombre…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {q.trim().length >= 2 && (
          <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border">
            {(searchQ.data?.results ?? []).length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">Sin resultados</div>
            )}
            {(searchQ.data?.results ?? []).map((p: any) => (
              <button
                key={p.producto_id}
                onClick={() => add(p)}
                className="flex w-full items-center justify-between border-b border-border p-2 text-left last:border-b-0 hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.nombre}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {p.sku} · stock {p.stock_disponible}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm">{fmt(p.precio_sugerido)}</div>
                  {p.source !== "lista" && (
                    <Badge variant="secondary" className="text-[9px]">
                      {p.source}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sugerencias IA / histórico */}
      {q.trim().length < 2 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium">Sugerencias</span>
            <span className="text-xs text-muted-foreground">
              (histórico + precios especiales)
            </span>
          </div>
          <div className="grid max-h-48 grid-cols-1 gap-1 overflow-auto md:grid-cols-2">
            {(prefillQ.data?.suggestions ?? []).map((p: any) => (
              <button
                key={p.producto_id}
                onClick={() => add(p)}
                className="flex items-center justify-between rounded-md border border-border p-2 text-left text-sm hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.nombre}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {p.sku} · sugerida qty {p.suggested_qty}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs">{fmt(p.precio_sugerido)}</div>
                  {p.source !== "historico" && (
                    <Badge variant="secondary" className="text-[9px]">
                      {p.source}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
            {(prefillQ.data?.suggestions ?? []).length === 0 && !prefillQ.isLoading && (
              <p className="text-xs text-muted-foreground">Sin histórico previo.</p>
            )}
          </div>
        </div>
      )}

      {/* Líneas */}
      <div className="rounded-md border border-border">
        <div className="border-b border-border p-2 text-xs font-medium">
          Carrito ({lines.length})
        </div>
        {lines.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            <ShoppingCart className="mx-auto mb-1 h-6 w-6" /> Agrega productos
          </div>
        )}
        <div className="divide-y divide-border">
          {lines.map((l, idx) => (
            <div key={l.producto_id} className="grid grid-cols-12 items-center gap-2 p-2 text-sm">
              <div className="col-span-6 min-w-0">
                <div className="truncate font-medium">{l.nombre_snapshot}</div>
                <div className="text-[10px] text-muted-foreground">{l.sku_snapshot}</div>
              </div>
              <Input
                type="number"
                min="1"
                step="1"
                className="col-span-2 h-8"
                value={l.cantidad}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setLines((prev) => {
                    const c = [...prev];
                    c[idx] = { ...c[idx], cantidad: v > 0 ? v : 1 };
                    return c;
                  });
                }}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                className="col-span-3 h-8"
                value={l.precio_unitario}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setLines((prev) => {
                    const c = [...prev];
                    c[idx] = { ...c[idx], precio_unitario: v >= 0 ? v : 0 };
                    return c;
                  });
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="col-span-1 h-8 w-8"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <div className="border-t border-border p-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{fmt(totals.sub)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>IVA</span>
              <span>{fmt(totals.iva)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>{fmt(totals.total)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Entrega</Label>
          <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </div>
        <label className="flex items-end gap-2 text-sm">
          <input
            type="checkbox"
            checked={urgent}
            onChange={(e) => setUrgent(e.target.checked)}
            className="h-4 w-4"
          />
          <span>Urgente</span>
        </label>
      </div>

      <div>
        <Label>Notas para el cliente</Label>
        <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      <Button
        className="w-full"
        disabled={lines.length === 0 || create.isPending}
        onClick={() => create.mutate()}
      >
        <Plus className="mr-1 h-4 w-4" /> Crear pedido
      </Button>
    </div>
  );
}
