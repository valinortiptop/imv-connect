import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Trash2 } from "lucide-react";
import { notifyEventFn } from "@/lib/notifications.functions";

type Almacen = { id: string; nombre: string };
type Pedido = { id: string; folio: string; cliente_id: string | null; clientes?: { razon_social?: string | null } | null };
type Batch = { producto_id: string; lote: string | null; caducidad: string | null; cantidad: number };
type FieldErrors = {
  almacen: boolean;
  pedido: boolean;
  general?: string;
  lines: Record<string, { cantidad?: boolean; lote?: boolean }>;
};

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
  pedidoPreset,
  onClose,
  onSaved,
}: {
  remisionId?: string | null;
  /** Preselected pedido (used when starting a remisión from the
   *  "pedidos sin remisionar" table). */
  pedidoPreset?: Pedido | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pedidoQuery, setPedidoQuery] = useState("");
  const [pedido, setPedido] = useState<Pedido | null>(pedidoPreset ?? null);
  const [almacen, setAlmacen] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  // Renglones donde el usuario eligió capturar el lote a mano.
  const [manualLote, setManualLote] = useState<Record<string, boolean>>({});
  // Campos faltantes que se resaltan en rojo al intentar guardar.
  const [errors, setErrors] = useState<FieldErrors>({ almacen: false, pedido: false, lines: {} });

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

  /** Agrupa los renglones por producto para visualizar juntos los lotes surtidos. */
  const groups = useMemo(() => {
    const map = new Map<string, { producto_id: string; clave: string; articulo: string; lines: Line[] }>();
    for (const l of lines) {
      const g = map.get(l.producto_id);
      if (g) g.lines.push(l);
      else map.set(l.producto_id, { producto_id: l.producto_id, clave: l.clave, articulo: l.articulo, lines: [l] });
    }
    return [...map.values()];
  }, [lines]);

  const patch = (key: string, p: Partial<Line>) => setLines((s) => s.map((l) => (l.key === key ? { ...l, ...p } : l)));


  /** Existencia del lote elegido en el renglón (para mostrar al usuario). */
  const selectedStock = (l: Line): number | null => {
    if (!l.lote) return null;
    const b = batches.find((x) => x.producto_id === l.producto_id && (x.lote ?? "") === l.lote);
    return b ? Number(b.cantidad ?? 0) : null;
  };

  /** Duplica el renglón para surtir el mismo producto desde otro lote. */
  const splitLine = (l: Line) =>
    setLines((s) => {
      const idx = s.findIndex((x) => x.key === l.key);
      const copy: Line = {
        ...l,
        key: `${l.key}-split-${Date.now()}`,
        cantidad: 0,
        lote: "",
        caducidad: "",
      };
      return [...s.slice(0, idx + 1), copy, ...s.slice(idx + 1)];
    });

  /** Valida y devuelve los campos faltantes (para pintarlos en rojo). */
  const validate = () => {
    const errs: FieldErrors = { almacen: false, pedido: false, lines: {} };
    if (!almacen) errs.almacen = true;
    if (!remisionId && !pedido) errs.pedido = true;
    if (lines.length === 0) errs.general = "Agrega al menos un producto";
    lines.forEach((l) => {
      const le: { cantidad?: boolean; lote?: boolean } = {};
      if (!l.cantidad || l.cantidad <= 0) le.cantidad = true;
      const hasBatches = batches.some((b) => b.producto_id === l.producto_id);
      if (hasBatches && !l.lote) le.lote = true;
      if (le.cantidad || le.lote) errs.lines[l.key] = le;
    });
    return errs;
  };

  const hasErrors = (e: FieldErrors) =>
    e.almacen || e.pedido || !!e.general || Object.keys(e.lines).length > 0;

  const guardar = useMutation({
    mutationFn: async () => {
      const errs = validate();
      setErrors(errs);
      if (hasErrors(errs)) throw new Error("Completa los campos marcados en rojo");
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
        _almacen: almacen,
        _items: items,
        _notas: notas || null,
      } as never);
      if (error) throw error;
      if (!remisionId) {
        const piezas = items.reduce((a: number, it: any) => a + Number(it.cantidad || 0), 0);
        void notifyEventFn({
          data: {
            event: "pedido_en_ruta",
            vars: {
              folio: pedido?.folio ?? "—",
              cliente: pedido?.clientes?.razon_social ?? "Cliente",
              piezas,
              eta: fecha,
            },
          },
        }).catch(() => {});
      }
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
              className={`pl-8 ${errors.pedido ? "border-destructive ring-1 ring-destructive" : ""}`}
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
            className={`h-10 rounded-md border bg-background px-3 text-sm ${errors.almacen ? "border-destructive ring-1 ring-destructive" : "border-input"}`}
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

        <div className="space-y-3">
          {groups.map((g) => {
            const bs = batches.filter((b) => b.producto_id === g.producto_id);
            const totalDisp = bs.reduce((a, b) => a + Number(b.cantidad || 0), 0);
            const totalSurtido = g.lines.reduce((a, l) => a + Number(l.cantidad || 0), 0);
            return (
              <div key={g.producto_id} className="rounded-md border border-border p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {g.articulo} <span className="text-xs text-muted-foreground">({g.clave})</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Surtido: <span className="font-medium text-foreground">{totalSurtido}</span>
                    {" · "}
                    {bs.length > 0
                      ? `${bs.length} lote(s) · ${totalDisp} en existencia`
                      : almacen
                        ? "Sin lotes registrados en este almacén"
                        : "Selecciona un almacén para ver los lotes"}
                  </div>
                </div>

                {bs.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {bs.map((b, i) => (
                      <span
                        key={i}
                        className="rounded border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {b.lote ?? "sin lote"} · cad {b.caducidad ?? "s/f"} · {b.cantidad} disp.
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {g.lines.map((l) => (
                    <div key={l.key}>
                      <div className="grid gap-2 sm:grid-cols-5">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          className={errors.lines[l.key]?.cantidad ? "border-destructive ring-1 ring-destructive" : undefined}
                          value={l.cantidad}
                          onChange={(e) => {
                            const n = Math.max(0, Math.round(Number(e.target.value) || 0));
                            patch(l.key, { cantidad: n });
                          }}
                          placeholder="Cantidad"
                        />
                        {bs.length > 0 ? (
                          <select
                            className={`h-10 rounded-md border bg-background px-3 text-sm ${errors.lines[l.key]?.lote ? "border-destructive ring-1 ring-destructive" : "border-input"}`}
                            value={manualLote[l.key] ? "__manual__" : l.lote}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "__manual__") {
                                setManualLote((m) => ({ ...m, [l.key]: true }));
                                patch(l.key, { lote: "" });
                                return;
                              }
                              setManualLote((m) => ({ ...m, [l.key]: false }));
                              const b = bs.find((x) => (x.lote ?? "") === v);
                              patch(l.key, { lote: v, caducidad: b?.caducidad ?? "" });
                            }}
                          >
                            <option value="">Lote…</option>
                            {bs.map((b, i) => (
                              <option key={i} value={b.lote ?? ""}>
                                {b.lote ?? "sin lote"} · cad {b.caducidad ?? "s/f"} · {b.cantidad} disp.
                              </option>
                            ))}
                            <option value="__manual__">Otro lote (manual)…</option>
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

                      {bs.length > 0 && manualLote[l.key] && (
                        <Input
                          className="mt-2"
                          placeholder="Captura el lote manualmente"
                          value={l.lote}
                          onChange={(e) => patch(l.key, { lote: e.target.value })}
                        />
                      )}

                      {selectedStock(l) != null && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Lote {l.lote}: {selectedStock(l)} en existencia
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => splitLine(g.lines[g.lines.length - 1])}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Surtir desde otro lote
                  </Button>
                </div>
              </div>
            );
          })}
        </div>


        {errors.general && <p className="mt-3 text-sm text-destructive">{errors.general}</p>}

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
