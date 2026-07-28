import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, FileDown, Printer, ScrollText } from "lucide-react";
import { reportePdf } from "@/lib/almacen-pdf";

type Producto = { id: string; sku: string; nombre: string };

type Mov = {
  id: string;
  fecha: string;
  producto_id: string;
  clave: string | null;
  articulo: string | null;
  lote: string | null;
  caducidad: string | null;
  almacen: string | null;
  tipo: string;
  naturaleza: string;
  cantidad: number;
  origen: string | null;
  referencia: string | null;
  notas: string | null;
};

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleString("es-MX") : "—");

/** Highlights the searched term inside a label. */
function Highlight({ text, term }: { text: string; term: string }) {
  const t = term.trim();
  if (!t) return <>{text}</>;
  const i = text.toLowerCase().indexOf(t.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-primary/20 text-foreground">{text.slice(i, i + t.length)}</mark>
      {text.slice(i + t.length)}
    </>
  );
}

export default function CardexPage() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [producto, setProducto] = useState<Producto | null>(null);
  const [lote, setLote] = useState("todos");

  const productos = useQuery({
    queryKey: ["cardex-productos", term],
    queryFn: async () => {
      let query = supabase.from("productos").select("id, sku, nombre").eq("activo", true).order("sku").limit(50);
      if (term.trim()) query = query.or(`sku.ilike.%${term.trim()}%,nombre.ilike.%${term.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Producto[];
    },
    staleTime: 30_000,
  });

  const movimientos = useQuery({
    queryKey: ["cardex-movs", producto?.id],
    enabled: !!producto?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_cardex_material" as never)
        .select("*")
        .eq("producto_id", producto!.id)
        .order("fecha", { ascending: true })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as unknown as Mov[];
    },
  });

  const lotes = useMemo(() => {
    const set = new Set((movimientos.data ?? []).map((m) => m.lote).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [movimientos.data]);

  const rows = useMemo(() => {
    const list = (movimientos.data ?? []).filter((m) => lote === "todos" || (m.lote ?? "") === lote);
    let saldo = 0;
    return list.map((m) => {
      saldo += Number(m.cantidad ?? 0);
      return { ...m, saldo };
    });
  }, [movimientos.data, lote]);

  const saldoFinal = rows.length ? rows[rows.length - 1].saldo : 0;

  const exportPdf = (mode: "download" | "print") => {
    if (!producto) return;
    reportePdf(
      `Cardex de material · ${producto.sku} ${producto.nombre}`,
      ["Fecha", "Tipo", "Origen", "Almacén", "Lote", "Caducidad", "Cantidad", "Saldo", "Referencia"],
      rows.map((r) => [
        fmtDate(r.fecha),
        r.naturaleza,
        r.origen ?? "—",
        r.almacen ?? "—",
        r.lote ?? "—",
        r.caducidad ?? "—",
        Number(r.cantidad ?? 0).toFixed(2),
        Number(r.saldo ?? 0).toFixed(2),
        r.referencia ?? "—",
      ]),
      [lote === "todos" ? "Todos los lotes" : `Lote ${lote}`, `Saldo final: ${saldoFinal.toFixed(2)}`],
      mode,
    );
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ScrollText className="h-6 w-6 text-primary" /> Cardex de material
          </h1>
          <p className="text-sm text-muted-foreground">
            Trazabilidad completa por artículo y lote: entradas, salidas, ventas, devoluciones, notas de crédito,
            traspasos y ajustes con saldo corrido.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => exportPdf("download")}>
            <FileDown className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => exportPdf("print")}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between sm:w-[420px]">
                {producto ? `${producto.sku} · ${producto.nombre}` : "Selecciona un producto…"}
                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Buscar por clave o nombre…" value={term} onValueChange={setTerm} />
                <CommandList>
                  <CommandEmpty>{productos.isLoading ? "Buscando…" : "Sin resultados."}</CommandEmpty>
                  <CommandGroup>
                    {(productos.data ?? []).map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.id}
                        onSelect={() => {
                          setProducto(p);
                          setLote("todos");
                          setOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${producto?.id === p.id ? "opacity-100" : "opacity-0"}`} />
                        <span className="truncate">
                          <Highlight text={`${p.sku} · ${p.nombre}`} term={term} />
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Select value={lote} onValueChange={setLote} disabled={!lotes.length}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Lote" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los lotes</SelectItem>
              {lotes.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {producto && (
            <div className="text-sm text-muted-foreground">
              {rows.length} movimientos · saldo final <strong className="text-foreground">{saldoFinal.toFixed(2)}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Movimiento</th>
                <th className="px-3 py-2 text-left">Origen</th>
                <th className="px-3 py-2 text-left">Almacén</th>
                <th className="px-3 py-2 text-left">Lote</th>
                <th className="px-3 py-2 text-left">Caducidad</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-left">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.fecha)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={r.naturaleza === "Entrada" ? "outline" : r.naturaleza === "Salida" ? "secondary" : "default"}>
                      {r.tipo}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{r.origen ?? "—"}</td>
                  <td className="px-3 py-2">{r.almacen ?? "—"}</td>
                  <td className="px-3 py-2">{r.lote ?? "—"}</td>
                  <td className="px-3 py-2">{r.caducidad ?? "—"}</td>
                  <td className={`px-3 py-2 text-right ${Number(r.cantidad) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                    {Number(r.cantidad ?? 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{Number(r.saldo ?? 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{r.referencia ?? r.notas ?? "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-3 py-10 text-center text-muted-foreground" colSpan={9}>
                    {producto ? "Sin movimientos registrados para este producto." : "Selecciona un producto para ver su cardex."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}
