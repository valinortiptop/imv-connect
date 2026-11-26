import { fmtFechaMx } from "@/lib/date-utils";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { BarraHerramientas } from "@/components/barra-herramientas";
import { ArrowLeftRight, FileDown, Plus, Printer, Search, Trash2 } from "lucide-react";
import { traspasoPdf } from "@/lib/almacen-pdf";
import { fmtDateShort } from "@/lib/date-utils";
import { notifyEventFn } from "@/lib/notifications.functions";

type Almacen = { id: string; nombre: string };
type Producto = { id: string; sku: string; nombre: string };
type Batch = { lote: string | null; caducidad: string | null; cantidad: number };

type Line = {
  key: string;
  producto_id: string;
  clave: string;
  articulo: string;
  lote: string;
  caducidad: string;
  cantidad: number;
};

type TraspasoRow = {
  traspaso_id: string;
  folio: string;
  fecha: string;
  estado: string;
  almacen_origen: string | null;
  almacen_destino: string | null;
  clave: string;
  articulo: string;
  lote: string | null;
  caducidad: string | null;
  cantidad: number;
  notas: string | null;
};

export default function TraspasosPage() {
  const qc = useQueryClient();
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [fecha, setFecha] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }));
  const [notas, setNotas] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [prodQuery, setProdQuery] = useState("");
  const [q, setQ] = useState("");

  const { data: almacenes = [] } = useQuery({
    queryKey: ["almacenes-activos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("almacenes").select("id, nombre").eq("activo", true).order("nombre");
      if (error) throw error;
      return (data ?? []) as Almacen[];
    },
  });

  const { data: productos = [] } = useQuery({
    queryKey: ["traspaso-prod-search", prodQuery],
    enabled: prodQuery.trim().length >= 2,
    queryFn: async () => {
      const term = `%${prodQuery.trim()}%`;
      const { data, error } = await supabase
        .from("productos")
        .select("id, sku, nombre")
        .or(`nombre.ilike.${term},sku.ilike.${term}`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Producto[];
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["v_traspasos_report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_traspasos_report" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as TraspasoRow[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { head: TraspasoRow; items: TraspasoRow[] }>();
    for (const r of rows) {
      const g = map.get(r.traspaso_id);
      if (g) g.items.push(r);
      else map.set(r.traspaso_id, { head: r, items: [r] });
    }
    const term = q.trim().toLowerCase();
    const list = [...map.values()];
    if (!term) return list;
    return list.filter(
      (g) =>
        g.head.folio?.toLowerCase().includes(term) ||
        g.head.almacen_origen?.toLowerCase().includes(term) ||
        g.head.almacen_destino?.toLowerCase().includes(term) ||
        g.items.some((i) => i.clave?.toLowerCase().includes(term) || i.articulo?.toLowerCase().includes(term)),
    );
  }, [rows, q]);

  const addLote = (l: Line) =>
    setLines((s) => {
      const i = s.findIndex((x) => x.key === l.key);
      const nueva: Line = { ...l, key: `${l.producto_id}-${Math.random().toString(36).slice(2, 7)}`, lote: "", caducidad: "", cantidad: 1 };
      return [...s.slice(0, i + 1), nueva, ...s.slice(i + 1)];
    });

  const addLine = (p: Producto) => {
    setLines((s) => [
      ...s,
      {
        key: `${p.id}-${Math.random().toString(36).slice(2, 7)}`,
        producto_id: p.id,
        clave: p.sku,
        articulo: p.nombre,
        lote: "",
        caducidad: "",
        cantidad: 1,
      },
    ]);
    setProdQuery("");
  };

  const patch = (key: string, p: Partial<Line>) => setLines((s) => s.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const guardar = useMutation({
    mutationFn: async () => {
      if (!origen || !destino) throw new Error("Selecciona almacén origen y destino");
      if (origen === destino) throw new Error("El almacén origen y destino deben ser distintos");
      const items = lines
        .filter((l) => l.cantidad > 0)
        .map((l) => ({
          producto_id: l.producto_id,
          lote: l.lote || null,
          caducidad: l.caducidad || null,
          cantidad: l.cantidad,
        }));
      if (items.length === 0) throw new Error("Agrega al menos un producto");
      if (items.some((it) => !Number.isInteger(it.cantidad))) throw new Error("Las piezas deben ser enteras");
      // Tope por lote: la suma de líneas del mismo lote no puede exceder la existencia en origen.
      const porLote = new Map<string, { n: number; nombre: string; lote: string }>();
      for (const l of lines) {
        if (!l.lote || l.cantidad <= 0) continue;
        const k = `${l.producto_id}|${l.lote}|${l.caducidad}`;
        const cur = porLote.get(k) ?? { n: 0, nombre: l.articulo, lote: l.lote };
        cur.n += l.cantidad;
        porLote.set(k, cur);
      }
      for (const [k, v] of porLote) {
        const [pid, lote, cad] = k.split("|");
        const disp = batches
          .filter((b) => b.producto_id === pid && (b.lote ?? "") === lote && (b.caducidad ?? "") === cad)
          .reduce((a, b) => a + Number(b.cantidad || 0), 0);
        if (batches.some((b) => b.producto_id === pid) && v.n > disp)
          throw new Error(`El lote ${v.lote} de ${v.nombre} solo tiene ${disp} piezas; intentas mover ${v.n}`);
      }
      const { data, error } = await supabase.rpc("ejecutar_traspaso" as never, {
        _origen: origen,
        _destino: destino,
        _items: items,
        _notas: notas || null,
        _fecha: fecha,
      } as never);
      if (error) throw error;
      void notifyEventFn({
        data: {
          event: "almacen_traspaso",
          vars: {
            folio: String(data ?? ""),
            origen: almacenes?.find((a: any) => a.id === origen)?.nombre ?? origen,
            destino: almacenes?.find((a: any) => a.id === destino)?.nombre ?? destino,
            piezas: items.reduce((a: number, it: any) => a + Number(it.cantidad || 0), 0),
            fecha,
          },
        },
      }).catch(() => {});
      return data as unknown as string;
    },
    onSuccess: () => {
      toast.success("Traspaso aplicado · inventario actualizado en ambos almacenes");
      setLines([]);
      setNotas("");
      qc.invalidateQueries({ queryKey: ["v_traspasos_report"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Existencia por lote en el almacén origen, para ayudar en la captura. */
  const { data: batches = [] } = useQuery({
    queryKey: ["batches-origen", origen, lines.map((l) => l.producto_id).join(",")],
    enabled: !!origen && lines.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("producto_id, lote, caducidad, cantidad")
        .eq("almacen_id", origen)
        .in("producto_id", lines.map((l) => l.producto_id))
        .gt("cantidad", 0);
      if (error) throw error;
      return (data ?? []) as unknown as (Batch & { producto_id: string })[];
    },
  });

  return (
    <section className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ArrowLeftRight className="h-6 w-6 text-primary" /> Traspasos entre almacenes
        </h1>
        <p className="text-sm text-muted-foreground">
          Mueve material entre almacenes por clave y lote. Cada traspaso genera su documento PDF y queda en el kardex.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <select className="input h-10 rounded-md border border-input bg-background px-3 text-sm" value={origen} onChange={(e) => setOrigen(e.target.value)}>
              <option value="">Almacén origen…</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
            <select className="input h-10 rounded-md border border-input bg-background px-3 text-sm" value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Almacén destino…</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <Input placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar producto por clave o nombre…"
              value={prodQuery}
              onChange={(e) => setProdQuery(e.target.value)}
            />
            {productos.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow">
                {productos.map((p) => (
                  <button
                    key={p.id}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => addLine(p)}
                  >
                    <span className="truncate">{p.nombre}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.map((l) => {
            const bs = batches.filter((b) => b.producto_id === l.producto_id);
            return (
              <div key={l.key} className="rounded-md border border-border p-3">
                <div className="mb-2 text-sm font-medium">
                  {l.articulo} <span className="text-xs text-muted-foreground">({l.clave})</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
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
                          {b.lote ?? "sin lote"} · cad. {b.caducidad ? fmtDateShort(b.caducidad) : "s/cad"} · {b.cantidad} pzas
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input placeholder="Lote" value={l.lote} onChange={(e) => patch(l.key, { lote: e.target.value })} />
                  )}
                  <Input type="date" value={l.caducidad} onChange={(e) => patch(l.key, { caducidad: e.target.value })} />
                  {(() => {
                    const b = bs.find((x) => (x.lote ?? "") === l.lote && (x.caducidad ?? "") === l.caducidad);
                    const max = b ? Number(b.cantidad) : undefined;
                    const excede = max !== undefined && l.cantidad > max;
                    return (
                      <div>
                        <Input
                          type="number"
                          step={1}
                          min={1}
                          max={max}
                          inputMode="numeric"
                          aria-label="Piezas"
                          aria-invalid={excede}
                          value={l.cantidad}
                          onChange={(e) => patch(l.key, { cantidad: Math.max(0, Math.trunc(Number(e.target.value))) })}
                          placeholder="Piezas"
                        />
                        {max !== undefined && (
                          <p className={`mt-1 text-xs ${excede ? "text-destructive" : "text-muted-foreground"}`}>
                            {excede ? `Excede existencia (${max})` : `Disponible: ${max}`}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-10" onClick={() => addLote(l)}>
                      <Plus className="mr-1 h-4 w-4" /> Otro lote
                    </Button>
                    <Button variant="outline" size="sm" className="h-10" aria-label="Quitar línea" onClick={() => setLines((s) => s.filter((x) => x.key !== l.key))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end">
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || lines.length === 0}>
              <Plus className="mr-1 h-4 w-4" /> {guardar.isPending ? "Aplicando…" : "Aplicar traspaso"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold">Traspasos realizados</h2>
      <BarraHerramientas
        busqueda={{ valor: q, onChange: setQ, placeholder: "Buscar traspaso…" }}
        resumen={<>{grouped.length.toLocaleString("es-MX")} traspasos</>}
      />

      <div className="space-y-3">
        {grouped.map((g) => (
          <Card key={g.head.traspaso_id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{g.head.folio}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtFechaMx(g.head.fecha)} · {g.head.almacen_origen} → {g.head.almacen_destino}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      traspasoPdf({ folio: g.head.folio, fecha: g.head.fecha, almacen_origen: g.head.almacen_origen, almacen_destino: g.head.almacen_destino, notas: g.head.notas, items: g.items }, "download")
                    }
                  >
                    <FileDown className="mr-1 h-4 w-4" /> PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      traspasoPdf({ folio: g.head.folio, fecha: g.head.fecha, almacen_origen: g.head.almacen_origen, almacen_destino: g.head.almacen_destino, notas: g.head.notas, items: g.items }, "print")
                    }
                  >
                    <Printer className="mr-1 h-4 w-4" /> Imprimir
                  </Button>
                </div>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-2 py-1 text-left">Clave</th>
                      <th className="px-2 py-1 text-left">Descripción</th>
                      <th className="px-2 py-1 text-left">Lote</th>
                      <th className="px-2 py-1 text-left">Caducidad</th>
                      <th className="px-2 py-1 text-right">Cantidad</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
