import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Trash2 } from "lucide-react";

type Almacen = { id: string; nombre: string };
type Pedido = { id: string; folio: string; cliente_id: string | null; clientes?: { razon_social?: string | null } | null };
type Batch = { producto_id: string; lote: string | null; caducidad: string | null; cantidad: number };

type Line = {
  key: string;
  pedido_item_id: string | null;
  producto_id: string;
  clave: string;
  articulo: string;
  cantidad: number;
  lote: string;
  caducidad: string;
  ubicacion: string;
};

export default function NuevaRemisionDialog({
  remisionId,
  onClose,
  onSaved,
}: {
  remisionId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pedidoQuery, setPedidoQuery] = useState("");
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [almacen, setAlmacen] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const { data: almacenes = [] } = useQuery({
    queryKey: ["almacenes-activos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("almacenes").select("id, nombre").eq("activo", true).order("nombre");
      if (error) throw error;
      return (data ?? []) as Almacen[];
    },
  });

  useEffect(() => {
    if (!almacen && almacenes.length > 0) setAlmacen(almacenes[0].id);
  }, [almacenes, almacen]);

  const { data: pedidos = [] } = useQuery({
    queryKey: ["remision-pedido-search", pedidoQuery],
    enabled: pedidoQuery.trim().length >= 2 && !pedido,
    queryFn: async () => {
      const term = `%${pedidoQuery.trim()}%`;
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, folio, cliente_id, clientes(razon_social)")
        .ilike("folio", term)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as unknown as Pedido[];
    },
  });

  // Carga los renglones del pedido seleccionado
  const { isFetching: loadingItems } = useQuery({
    queryKey: ["remision-pedido-items", pedido?.id],
    enabled: !!pedido?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedido_items")
        .select("id, producto_id, cantidad, productos(sku, nombre)")
        .eq("pedido_id", pedido!.id);
      if (error) throw error;
      const items = (data ?? []) as unknown as Record<string, unknown>[];
      setLines(
        items.map((i) => ({
          key: String(i.id),
          pedido_item_id: String(i.id),
          producto_id: String(i.producto_id),
          clave: ((i.productos as { sku?: string } | null)?.sku ?? "") as string,
          articulo: ((i.productos as { nombre?: string } | null)?.nombre ?? "") as string,
          cantidad: Number(i.cantidad ?? 0),
          lote: "",
          caducidad: "",
          ubicacion: "",
        })),
      );
      return items;
    },
  });

  // Cargar remisión existente (modo edición)
  useQuery({
    queryKey: ["remision-edit", remisionId],
    enabled: !!remisionId,
    queryFn: async () => {
      const { data: head, error: e1 } = await supabase
        .from("remisiones" as never)
        .select("*, pedidos(id, folio, cliente_id, clientes(razon_social))")
        .eq("id", remisionId as string)
        .maybeSingle();
      if (e1) throw e1;
      const h = head as unknown as Record<string, unknown>;
      setAlmacen((h?.almacen_id as string) ?? "");
      setFecha(((h?.fecha as string) ?? new Date().toISOString()).slice(0, 10));
      setNotas((h?.notas as string) ?? "");
      setPedido((h?.pedidos as Pedido) ?? null);

      const { data: items, error: e2 } = await supabase
        .from("remision_items" as never)
        .select("*, productos(sku, nombre)")
        .eq("remision_id", remisionId as string);
      if (e2) throw e2;
      setLines(
        ((items ?? []) as unknown as Record<string, unknown>[]).map((i) => ({
          key: String(i.id),
          pedido_item_id: (i.pedido_item_id as string) ?? null,
          producto_id: String(i.producto_id),
          clave: ((i.productos as { sku?: string } | null)?.sku ?? "") as string,
          articulo: ((i.productos as { nombre?: string } | null)?.nombre ?? "") as string,
          cantidad: Number(i.cantidad ?? 0),
          lote: (i.lote as string) ?? "",
          caducidad: (i.caducidad as string) ?? "",
          ubicacion: (i.ubicacion as string) ?? "",
        })),
      );
      return head;
    },
  });

  const productoIds = useMemo(() => lines.map((l) => l.producto_id), [lines]);

  const { data: batches = [] } = useQuery({
    queryKey: ["remision-batches", almacen, productoIds.join(",")],
    enabled: !!almacen && productoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("producto_id, lote, caducidad, cantidad")
        .eq("almacen_id", almacen)
        .in("producto_id", productoIds)
        .gt("cantidad", 0)
        .order("caducidad", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Batch[];
    },
  });

  const patch = (key: string, p: Partial<Line>) => setLines((s) => s.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const guardar = useMutation({
    mutationFn: async () => {
      if (!almacen) throw new Error("Selecciona el almacén de salida");
      const items = lines
        .filter((l) => l.cantidad > 0)
        .map((l) => ({
          pedido_item_id: l.pedido_item_id,
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          lote: l.lote || null,
          caducidad: l.caducidad || null,
          ubicacion: l.ubicacion || null,
        }));
      if (items.length === 0) throw new Error("Captura al menos un renglón");

      if (remisionId) {
        const { error } = await supabase.rpc("editar_remision" as never, {
          _rem: remisionId,
          _items: items,
          _notas: notas || null,
        } as never);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.rpc("crear_remision" as never, {
        _pedido: pedido?.id ?? null,
        _cliente: pedido?.cliente_id ?? null,
        _almacen: almacen,
        _items: items,
        _notas: notas || null,
        _fecha: fecha,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(remisionId ? "Remisión actualizada" : "Remisión creada · inventario descontado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-4xl rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">{remisionId ? "Editar remisión" : "Nueva remisión"}</h2>

        {!remisionId && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar pedido por folio…"
              value={pedido ? `${pedido.folio} · ${pedido.clientes?.razon_social ?? ""}` : pedidoQuery}
              onChange={(e) => {
                setPedido(null);
                setLines([]);
                setPedidoQuery(e.target.value);
              }}
            />
            {!pedido && pedidos.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover shadow">
                {pedidos.map((p) => (
                  <button
                    key={p.id}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      setPedido(p);
                      setPedidoQuery("");
                    }}
                  >
                    <span className="truncate">{p.clientes?.razon_social ?? "Sin cliente"}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{p.folio}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={almacen}
            onChange={(e) => setAlmacen(e.target.value)}
          >
            <option value="">Almacén de salida…</option>
            {almacenes.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!!remisionId} />
          <Input placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        {loadingItems && <div className="text-sm text-muted-foreground">Cargando renglones del pedido…</div>}

        <div className="space-y-2">
          {lines.map((l) => {
            const bs = batches.filter((b) => b.producto_id === l.producto_id);
            return (
              <div key={l.key} className="rounded-md border border-border p-3">
                <div className="mb-2 text-sm font-medium">
                  {l.articulo} <span className="text-xs text-muted-foreground">({l.clave})</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-5">
                  <Input
                    type="number"
                    step="0.01"
                    value={l.cantidad}
                    onChange={(e) => patch(l.key, { cantidad: Number(e.target.value) })}
                    placeholder="Cantidad"
                  />
                  {bs.length > 0 ? (
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={l.lote}
                      onChange={(e) => {
                        const b = bs.find((x) => (x.lote ?? "") === e.target.value);
                        patch(l.key, { lote: e.target.value, caducidad: b?.caducidad ?? "" });
                      }}
                    >
                      <option value="">Lote…</option>
                      {bs.map((b, i) => (
                        <option key={i} value={b.lote ?? ""}>
                          {b.lote ?? "sin lote"} · {b.caducidad ?? "s/cad"} · {b.cantidad}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input placeholder="Lote" value={l.lote} onChange={(e) => patch(l.key, { lote: e.target.value })} />
                  )}
                  <Input type="date" value={l.caducidad} onChange={(e) => patch(l.key, { caducidad: e.target.value })} />
                  <Input
                    placeholder="Ubicación"
                    value={l.ubicacion}
                    onChange={(e) => patch(l.key, { ubicacion: e.target.value })}
                  />
                  <Button variant="outline" onClick={() => setLines((s) => s.filter((x) => x.key !== l.key))}>
                    <Trash2 className="mr-1 h-4 w-4" /> Quitar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending ? "Guardando…" : remisionId ? "Guardar cambios" : "Crear remisión"}
          </Button>
        </div>
      </div>
    </div>
  );
}
