import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, FileDown, Lock, LockOpen, Printer, Search } from "lucide-react";
import { reportePdf } from "@/lib/almacen-pdf";
import GenericReportTab, {
  fmtMXN as fmtMXNc,
  fmtNum,
  fmtDate,
  type ReportRow,
} from "@/components/almacen/GenericReportTab";


type Rotacion = {
  producto_id: string;
  sku: string;
  nombre: string;
  laboratorio: string | null;
  stock_fisico: number;
  costo: number;
  valor_inmovilizado: number;
  ultima_venta: string | null;
  dias_sin_venta: number | null;
  clasificacion: string;
};

type CortaCad = {
  batch_id: string;
  producto_id: string;
  clave: string;
  articulo: string;
  laboratorio: string | null;
  almacen: string | null;
  lote: string | null;
  caducidad: string | null;
  cantidad: number;
  dias_para_caducar: number | null;
  dias_sin_venta: number | null;
  clasificacion: string;
};

type TrazCompra = {
  oc_id: string;
  oc_folio: string | null;
  fecha_emision: string | null;
  oc_estado: string | null;
  proveedor: string | null;
  recepcion_folio: string | null;
  fecha_recepcion: string | null;
  recepcion_estado: string | null;
  factura_proveedor: string | null;
  total: number | null;
};

type TrazVenta = {
  pedido_id: string;
  pedido_folio: string | null;
  pedido_fecha: string | null;
  cliente: string | null;
  remision_folio: string | null;
  remision_fecha: string | null;
  remision_estado: string | null;
  factura_folio: string | null;
  factura_fecha: string | null;
  factura_total: number | null;
  factura_estado: string | null;
};

const fmtMXN = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n ?? 0));

const claseColor = (c: string) =>
  c === "muerto" || c === "critico"
    ? "destructive"
    : c === "lento" || c === "riesgo"
      ? "secondary"
      : "outline";

export default function ReportesAlmacenPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const rotacion = useQuery({
    queryKey: ["v_baja_rotacion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_baja_rotacion" as never)
        .select("*")
        .order("valor_inmovilizado", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Rotacion[];
    },
  });

  const cortaCad = useQuery({
    queryKey: ["v_corta_caducidad_lento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_corta_caducidad_lento" as never)
        .select("*")
        .order("dias_para_caducar", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as CortaCad[];
    },
  });

  const trazCompra = useQuery({
    queryKey: ["v_trazabilidad_compra"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_trazabilidad_compra" as never)
        .select("*")
        .order("fecha_emision", { ascending: false })
        .limit(1500);
      if (error) throw error;
      return (data ?? []) as unknown as TrazCompra[];
    },
  });

  const trazVenta = useQuery({
    queryKey: ["v_trazabilidad_venta"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_trazabilidad_venta" as never)
        .select("*")
        .order("pedido_fecha", { ascending: false })
        .limit(1500);
      if (error) throw error;
      return (data ?? []) as unknown as TrazVenta[];
    },
  });

  const bloqueos = useQuery({
    queryKey: ["stock-params-bloqueo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock_params")
        .select("producto_id, bloqueo_compra, bloqueo_motivo");
      if (error) throw error;
      return (data ?? []) as unknown as { producto_id: string; bloqueo_compra: boolean; bloqueo_motivo: string | null }[];
    },
  });

  const bloqueoMap = useMemo(() => {
    const m = new Map<string, { bloqueo_compra: boolean; bloqueo_motivo: string | null }>();
    for (const b of bloqueos.data ?? []) m.set(b.producto_id, b);
    return m;
  }, [bloqueos.data]);

  const toggleBloqueo = useMutation({
    mutationFn: async ({ producto_id, bloquear, motivo }: { producto_id: string; bloquear: boolean; motivo: string }) => {
      const { error } = await supabase
        .from("product_stock_params")
        .upsert(
          { producto_id, bloqueo_compra: bloquear, bloqueo_motivo: bloquear ? motivo : null },
          { onConflict: "producto_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.bloquear ? "Producto bloqueado para compra" : "Bloqueo de compra retirado");
      qc.invalidateQueries({ queryKey: ["stock-params-bloqueo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = q.trim().toLowerCase();
  const match = (...vals: (string | null | undefined)[]) =>
    !term || vals.some((v) => (v ?? "").toLowerCase().includes(term));

  const rotFiltered = (rotacion.data ?? []).filter((r) => match(r.sku, r.nombre, r.laboratorio, r.clasificacion));
  const cadFiltered = (cortaCad.data ?? []).filter((r) => match(r.clave, r.articulo, r.lote, r.almacen, r.laboratorio));
  const compraFiltered = (trazCompra.data ?? []).filter((r) =>
    match(r.oc_folio, r.proveedor, r.recepcion_folio, r.factura_proveedor),
  );
  const ventaFiltered = (trazVenta.data ?? []).filter((r) =>
    match(r.pedido_folio, r.cliente, r.remision_folio, r.factura_folio),
  );

  const exportRotacion = (mode: "download" | "print") =>
    reportePdf(
      "Rotación de inventario · productos de lento movimiento",
      ["Clave", "Artículo", "Laboratorio", "Existencia", "Días sin venta", "Valor", "Clasificación"],
      rotFiltered.map((r) => [
        r.sku,
        r.nombre,
        r.laboratorio ?? "—",
        Number(r.stock_fisico ?? 0).toFixed(2),
        r.dias_sin_venta != null ? String(r.dias_sin_venta) : "Nunca",
        fmtMXN(r.valor_inmovilizado),
        r.clasificacion,
      ]),
      [
        `${rotFiltered.length} productos`,
        `Valor inmovilizado: ${fmtMXN(rotFiltered.reduce((s, r) => s + Number(r.valor_inmovilizado ?? 0), 0))}`,
      ],
      mode,
    );

  const exportCaducidad = (mode: "download" | "print") =>
    reportePdf(
      "Corta caducidad y lento movimiento",
      ["Clave", "Artículo", "Almacén", "Lote", "Caducidad", "Días", "Cantidad", "Clasificación"],
      cadFiltered.map((r) => [
        r.clave,
        r.articulo,
        r.almacen ?? "—",
        r.lote ?? "—",
        r.caducidad ?? "—",
        r.dias_para_caducar != null ? String(r.dias_para_caducar) : "—",
        Number(r.cantidad ?? 0).toFixed(2),
        r.clasificacion,
      ]),
      [`${cadFiltered.length} lotes en riesgo`],
      mode,
    );

  const exportCompra = (mode: "download" | "print") =>
    reportePdf(
      "Trazabilidad de compra · OC → recepción → factura",
      ["OC", "Fecha", "Proveedor", "Recepción", "Fecha rec.", "Factura prov.", "Total"],
      compraFiltered.map((r) => [
        r.oc_folio ?? "—",
        r.fecha_emision ?? "—",
        r.proveedor ?? "—",
        r.recepcion_folio ?? "Pendiente",
        r.fecha_recepcion ?? "—",
        r.factura_proveedor ?? "—",
        fmtMXN(r.total),
      ]),
      [`${compraFiltered.length} órdenes de compra`],
      mode,
    );

  const exportVenta = (mode: "download" | "print") =>
    reportePdf(
      "Trazabilidad de venta · pedido → remisión → factura",
      ["Pedido", "Fecha", "Cliente", "Remisión", "Fecha rem.", "Factura", "Total"],
      ventaFiltered.map((r) => [
        r.pedido_folio ?? "—",
        r.pedido_fecha ? r.pedido_fecha.slice(0, 10) : "—",
        r.cliente ?? "—",
        r.remision_folio ?? "Pendiente",
        r.remision_fecha ?? "—",
        r.factura_folio ?? "Sin facturar",
        fmtMXN(r.factura_total),
      ]),
      [`${ventaFiltered.length} pedidos`],
      mode,
    );

  const ExportBar = ({ onExport }: { onExport: (m: "download" | "print") => void }) => (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => onExport("download")}>
        <FileDown className="mr-1 h-4 w-4" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => onExport("print")}>
        <Printer className="mr-1 h-4 w-4" /> Imprimir
      </Button>
    </div>
  );

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="h-6 w-6 text-primary" /> Reportes de almacén
          </h1>
          <p className="text-sm text-muted-foreground">
            Rotación, corta caducidad y trazabilidad completa de compra y venta. Bloquea la recompra de productos
            estancados directamente desde el reporte.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={recalcular.isPending}
            onClick={() => recalcular.mutate()}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${recalcular.isPending ? "animate-spin" : ""}`} />
            Recalcular bloqueos
          </Button>
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar en el reporte…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

      </header>

      <Tabs defaultValue="rotacion">
        <TabsList className="flex-wrap">
          <TabsTrigger value="rotacion">Rotación</TabsTrigger>
          <TabsTrigger value="caducidad">Corta caducidad</TabsTrigger>
          <TabsTrigger value="entradas">Entradas</TabsTrigger>
          <TabsTrigger value="traslados">Traslados</TabsTrigger>
          <TabsTrigger value="salidas">Salidas por remisión</TabsTrigger>
          <TabsTrigger value="sinventa">Sin movimiento</TabsTrigger>
          <TabsTrigger value="ncprov">NC proveedor</TabsTrigger>
          <TabsTrigger value="ncventa">NC venta</TabsTrigger>
          <TabsTrigger value="compra">Trazabilidad compra</TabsTrigger>
          <TabsTrigger value="venta">Trazabilidad venta</TabsTrigger>
        </TabsList>

        <TabsContent value="entradas">
          <GenericReportTab
            view="v_entradas_report"
            title="Reporte de entradas · ingresos a almacén"
            orderBy="fecha"
            term={q}
            unitLabel="partidas de entrada"
            searchKeys={["folio", "clave", "articulo", "lote", "proveedor", "oc_folio", "almacen", "factura_proveedor"]}
            columns={[
              { key: "folio", label: "Entrada" },
              { key: "fecha", label: "Fecha", fmt: fmtDate },
              { key: "oc_folio", label: "OC" },
              { key: "proveedor", label: "Proveedor" },
              { key: "almacen", label: "Almacén" },
              { key: "clave", label: "Clave" },
              { key: "articulo", label: "Artículo" },
              { key: "lote", label: "Lote" },
              { key: "caducidad", label: "Caducidad", fmt: fmtDate },
              { key: "cantidad", label: "Cantidad", align: "right", fmt: fmtNum },
              { key: "importe", label: "Importe", align: "right", fmt: fmtMXNc },
            ]}
            summary={(rows) => [
              `Piezas: ${rows.reduce((s, r) => s + Number(r.cantidad ?? 0), 0).toFixed(2)}`,
              `Importe: ${fmtMXNc(rows.reduce((s, r) => s + Number(r.importe ?? 0), 0))}`,
            ]}
          />
        </TabsContent>

        <TabsContent value="traslados">
          <GenericReportTab
            view="v_traspasos_report"
            title="Reporte de traslados entre almacenes"
            orderBy="fecha"
            term={q}
            unitLabel="partidas trasladadas"
            searchKeys={["folio", "clave", "articulo", "lote", "almacen_origen", "almacen_destino"]}
            columns={[
              { key: "folio", label: "Folio" },
              { key: "fecha", label: "Fecha", fmt: fmtDate },
              { key: "almacen_origen", label: "Origen" },
              { key: "almacen_destino", label: "Destino" },
              { key: "clave", label: "Clave" },
              { key: "articulo", label: "Artículo" },
              { key: "lote", label: "Lote" },
              { key: "caducidad", label: "Caducidad", fmt: fmtDate },
              { key: "cantidad", label: "Cantidad", align: "right", fmt: fmtNum },
              { key: "estado", label: "Estado" },
            ]}
          />
        </TabsContent>

        <TabsContent value="salidas">
          <GenericReportTab
            view="v_remisiones_report"
            title="Reporte de salidas por remisión"
            orderBy="fecha"
            term={q}
            unitLabel="partidas remisionadas"
            searchKeys={["folio", "cliente", "clave", "articulo", "lote", "ubicacion", "pedido_folio", "almacen"]}
            columns={[
              { key: "folio", label: "Remisión" },
              { key: "fecha", label: "Fecha", fmt: fmtDate },
              { key: "cliente", label: "Cliente" },
              { key: "pedido_folio", label: "Pedido" },
              { key: "clave", label: "Clave" },
              { key: "articulo", label: "Artículo" },
              { key: "lote", label: "Lote" },
              { key: "caducidad", label: "Caducidad", fmt: fmtDate },
              { key: "ubicacion", label: "Ubicación" },
              { key: "cantidad", label: "Cantidad", align: "right", fmt: fmtNum },
              { key: "estado", label: "Estado" },
            ]}
            summary={(rows) => [`Piezas: ${rows.reduce((s, r) => s + Number(r.cantidad ?? 0), 0).toFixed(2)}`]}
          />
        </TabsContent>

        <TabsContent value="sinventa">
          <GenericReportTab
            view="v_sin_movimiento_venta"
            title="Productos sin movimiento de venta"
            orderBy="dias_sin_venta"
            term={q}
            unitLabel="productos sin venta"
            searchKeys={["clave", "articulo", "laboratorio", "marca", "categoria"]}
            columns={[
              { key: "clave", label: "Clave" },
              { key: "articulo", label: "Artículo" },
              { key: "laboratorio", label: "Laboratorio" },
              { key: "categoria", label: "Categoría" },
              { key: "existencia", label: "Existencia", align: "right", fmt: fmtNum },
              { key: "ultima_venta", label: "Última venta", fmt: (v) => (v ? String(v).slice(0, 10) : "Nunca") },
              { key: "dias_sin_venta", label: "Días sin venta", align: "right", fmt: (v) => (v == null ? "—" : String(v)) },
            ]}
          />
        </TabsContent>

        <TabsContent value="ncprov">
          <GenericReportTab
            view="v_notas_credito_proveedor_report"
            title="Notas de crédito aplicadas a facturas de proveedor"
            orderBy="fecha"
            term={q}
            unitLabel="partidas de nota de crédito"
            searchKeys={["folio", "factura_proveedor", "oc_folio", "laboratorio", "clave", "articulo", "lote", "motivo"]}
            columns={[
              { key: "folio", label: "NC" },
              { key: "fecha", label: "Fecha", fmt: fmtDate },
              { key: "laboratorio", label: "Proveedor / lab." },
              { key: "factura_proveedor", label: "Factura prov." },
              { key: "oc_folio", label: "OC" },
              { key: "clave", label: "Clave" },
              { key: "articulo", label: "Artículo" },
              { key: "lote", label: "Lote" },
              { key: "cantidad", label: "Cantidad", align: "right", fmt: fmtNum },
              { key: "importe", label: "Importe", align: "right", fmt: fmtMXNc },
              { key: "motivo", label: "Motivo" },
            ]}
            summary={(rows) => [`Importe: ${fmtMXNc(rows.reduce((s, r) => s + Number(r.importe ?? 0), 0))}`]}
          />
        </TabsContent>

        <TabsContent value="ncventa">
          <GenericReportTab
            view="v_notas_credito_venta_report"
            title="Notas de crédito aplicadas a facturas de venta"
            orderBy="fecha"
            term={q}
            unitLabel="notas de crédito"
            searchKeys={["folio", "factura_folio", "cliente", "devolucion_folio"]}
            columns={[
              { key: "folio", label: "NC" },
              { key: "fecha", label: "Fecha", fmt: fmtDate },
              { key: "cliente", label: "Cliente" },
              { key: "factura_folio", label: "Factura" },
              { key: "factura_total", label: "Total factura", align: "right", fmt: fmtMXNc },
              { key: "devolucion_folio", label: "Devolución" },
              { key: "nc_total", label: "Total NC", align: "right", fmt: fmtMXNc },
              { key: "factura_estado", label: "Estado factura" },
            ]}
            summary={(rows) => [`Total NC: ${fmtMXNc(rows.reduce((s, r) => s + Number(r.nc_total ?? 0), 0))}`]}
          />
        </TabsContent>


        <TabsContent value="rotacion" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {rotFiltered.length} productos · valor inmovilizado{" "}
              <strong>{fmtMXN(rotFiltered.reduce((s, r) => s + Number(r.valor_inmovilizado ?? 0), 0))}</strong>
            </div>
            <ExportBar onExport={exportRotacion} />
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Clave</th>
                    <th className="px-3 py-2 text-left">Artículo</th>
                    <th className="px-3 py-2 text-left">Laboratorio</th>
                    <th className="px-3 py-2 text-right">Existencia</th>
                    <th className="px-3 py-2 text-right">Días sin venta</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 text-left">Clasificación</th>
                    <th className="px-3 py-2 text-left">Compra</th>
                  </tr>
                </thead>
                <tbody>
                  {rotFiltered.slice(0, 500).map((r) => {
                    const b = bloqueoMap.get(r.producto_id);
                    const bloqueado = !!b?.bloqueo_compra;
                    return (
                      <tr key={r.producto_id} className="border-b border-border/40">
                        <td className="px-3 py-2">{r.sku}</td>
                        <td className="px-3 py-2">{r.nombre}</td>
                        <td className="px-3 py-2">{r.laboratorio ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{Number(r.stock_fisico ?? 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{r.dias_sin_venta ?? "Nunca"}</td>
                        <td className="px-3 py-2 text-right">{fmtMXN(r.valor_inmovilizado)}</td>
                        <td className="px-3 py-2">
                          <Badge variant={claseColor(r.clasificacion)}>{r.clasificacion}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            size="sm"
                            variant={bloqueado ? "destructive" : "outline"}
                            disabled={toggleBloqueo.isPending}
                            onClick={() =>
                              toggleBloqueo.mutate({
                                producto_id: r.producto_id,
                                bloquear: !bloqueado,
                                motivo: `Lento movimiento · ${r.dias_sin_venta ?? "sin"} días sin venta`,
                              })
                            }
                          >
                            {bloqueado ? (
                              <>
                                <Lock className="mr-1 h-3 w-3" /> Bloqueado
                              </>
                            ) : (
                              <>
                                <LockOpen className="mr-1 h-3 w-3" /> Bloquear
                              </>
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="caducidad" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{cadFiltered.length} lotes en riesgo</div>
            <ExportBar onExport={exportCaducidad} />
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Clave</th>
                    <th className="px-3 py-2 text-left">Artículo</th>
                    <th className="px-3 py-2 text-left">Almacén</th>
                    <th className="px-3 py-2 text-left">Lote</th>
                    <th className="px-3 py-2 text-left">Caducidad</th>
                    <th className="px-3 py-2 text-right">Días</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2 text-left">Clasificación</th>
                  </tr>
                </thead>
                <tbody>
                  {cadFiltered.slice(0, 500).map((r) => (
                    <tr key={r.batch_id} className="border-b border-border/40">
                      <td className="px-3 py-2">{r.clave}</td>
                      <td className="px-3 py-2">{r.articulo}</td>
                      <td className="px-3 py-2">{r.almacen ?? "—"}</td>
                      <td className="px-3 py-2">{r.lote ?? "—"}</td>
                      <td className="px-3 py-2">{r.caducidad ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{r.dias_para_caducar ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{Number(r.cantidad ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={claseColor(r.clasificacion)}>{r.clasificacion}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compra" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{compraFiltered.length} órdenes de compra</div>
            <ExportBar onExport={exportCompra} />
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">OC</th>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Proveedor</th>
                    <th className="px-3 py-2 text-left">Recepción</th>
                    <th className="px-3 py-2 text-left">Fecha rec.</th>
                    <th className="px-3 py-2 text-left">Factura prov.</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {compraFiltered.slice(0, 500).map((r, i) => (
                    <tr key={`${r.oc_id}-${i}`} className="border-b border-border/40">
                      <td className="px-3 py-2">{r.oc_folio ?? "—"}</td>
                      <td className="px-3 py-2">{r.fecha_emision ?? "—"}</td>
                      <td className="px-3 py-2">{r.proveedor ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.recepcion_folio ?? <span className="text-muted-foreground">Pendiente</span>}
                      </td>
                      <td className="px-3 py-2">{r.fecha_recepcion ?? "—"}</td>
                      <td className="px-3 py-2">{r.factura_proveedor ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{fmtMXN(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="venta" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{ventaFiltered.length} pedidos</div>
            <ExportBar onExport={exportVenta} />
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Pedido</th>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Remisión</th>
                    <th className="px-3 py-2 text-left">Fecha rem.</th>
                    <th className="px-3 py-2 text-left">Factura</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ventaFiltered.slice(0, 500).map((r, i) => (
                    <tr key={`${r.pedido_id}-${i}`} className="border-b border-border/40">
                      <td className="px-3 py-2">{r.pedido_folio ?? "—"}</td>
                      <td className="px-3 py-2">{r.pedido_fecha ? r.pedido_fecha.slice(0, 10) : "—"}</td>
                      <td className="px-3 py-2">{r.cliente ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.remision_folio ?? <span className="text-muted-foreground">Pendiente</span>}
                      </td>
                      <td className="px-3 py-2">{r.remision_fecha ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.factura_folio ?? <span className="text-muted-foreground">Sin facturar</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{fmtMXN(r.factura_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
