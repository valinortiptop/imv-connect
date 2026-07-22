import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Users, Info } from "lucide-react";
import FlowDiagram, {
  type FlowNode,
  type FlowEdge,
} from "@/components/dashboards/FlowDiagram";
import { getClientesDashboardCountsFn } from "@/lib/dashboard-counts.functions";

import prospectosIcon from "@/assets/flow-icons/prospectos.png.asset.json";
import clientesIcon from "@/assets/flow-icons/clientes.png.asset.json";
import consignaIcon from "@/assets/flow-icons/consignaciones.png.asset.json";
import devConsignaIcon from "@/assets/flow-icons/devolucion-consignaciones.png.asset.json";
import mapasIcon from "@/assets/flow-icons/mapas-entrega.png.asset.json";
import notasVentaIcon from "@/assets/flow-icons/notas-venta.png.asset.json";
import segNotasIcon from "@/assets/flow-icons/seguimiento-notas.png.asset.json";
import cotizaIcon from "@/assets/flow-icons/cotizaciones.png.asset.json";
import pedidosIcon from "@/assets/flow-icons/pedidos.png.asset.json";
import facturasIcon from "@/assets/flow-icons/facturas.png.asset.json";
import segCxcIcon from "@/assets/flow-icons/seguimiento-cxc.png.asset.json";
import depositosIcon from "@/assets/flow-icons/depositos.png.asset.json";
import cobranzaIcon from "@/assets/flow-icons/aplicacion-cobranza.png.asset.json";
import productosIcon from "@/assets/flow-icons/productos.png.asset.json";
import remisionesIcon from "@/assets/flow-icons/remisiones.png.asset.json";
import guiasIcon from "@/assets/flow-icons/guias-embarque.png.asset.json";
import devolucionesIcon from "@/assets/flow-icons/devoluciones.png.asset.json";
import notasCargoIcon from "@/assets/flow-icons/notas-cargo.png.asset.json";

export const Route = createFileRoute("/admin/clientes-dashboard")({
  head: () => ({ meta: [{ title: "Clientes · Dashboard" }] }),
  component: ClientesDashboard,
});

function ClientesDashboard() {
  const fetchCounts = useServerFn(getClientesDashboardCountsFn);
  const { data } = useQuery({
    queryKey: ["clientes-dashboard-counts"],
    queryFn: () => fetchCounts(),
    staleTime: 60_000,
  });

  const nodes: FlowNode[] = [
    // Row 1
    { id: "prospectos",   label: "Prospectos", icon: { src: prospectosIcon.url }, col: 1, row: 1, to: "/admin/prospectos", count: data?.prospectos, accent: "primary" },
    { id: "clientes",     label: "Clientes",   icon: { src: clientesIcon.url }, col: 2, row: 1, to: "/admin/clientes", count: data?.clientes, accent: "primary" },
    { id: "consigna",     label: "Consignaciones", icon: { src: consignaIcon.url }, col: 4, row: 1, accent: "muted", disabled: true },
    { id: "devConsigna",  label: "Devolución de consignaciones", icon: { src: devConsignaIcon.url }, col: 5, row: 1, accent: "muted", disabled: true },
    { id: "mapas",        label: "Mapas de entrega", icon: { src: mapasIcon.url }, col: 6, row: 1, to: "/admin/logistica", accent: "muted" },
    { id: "notasVenta",   label: "Notas de venta", icon: { src: notasVentaIcon.url }, col: 7, row: 1, to: "/admin/facturas", accent: "muted" },
    // Row 2
    { id: "segNotas",     label: "Seguimientos de notas", sublabel: "clientes y prospectos", icon: { src: segNotasIcon.url }, col: 1, row: 2, accent: "muted", disabled: true },
    { id: "cotiza",       label: "Cotizaciones", icon: { src: cotizaIcon.url }, col: 2, row: 2, to: "/admin/pedidos", accent: "muted" },
    { id: "pedidos",      label: "Pedidos", icon: { src: pedidosIcon.url }, col: 3, row: 2, to: "/admin/pedidos", count: data?.pedidosAbiertos, accent: "primary" },
    { id: "factura",      label: "Facturas", sublabel: "Costo de venta", icon: { src: facturasIcon.url }, col: 4, row: 2, to: "/admin/facturas", count: data?.facturasMes, accent: "success" },
    { id: "segCxc",       label: "Seguimiento de cuentas por cobrar", icon: { src: segCxcIcon.url }, col: 5, row: 2, to: "/admin/credito-cobranza/cartera", count: data?.cxcVencida, accent: "danger" },
    { id: "depositos",    label: "Relación masiva de depósitos en banca", icon: { src: depositosIcon.url }, col: 6, row: 2, to: "/admin/bancos/movimientos", accent: "muted" },
    { id: "aplicaCob",    label: "Aplicación de cobranza", icon: { src: cobranzaIcon.url }, col: 7, row: 2, to: "/admin/credito-cobranza/complementos", accent: "primary" },
    // Row 3
    { id: "productos",    label: "Productos / servicios", icon: { src: productosIcon.url }, col: 1, row: 3, to: "/admin/productos", accent: "muted" },
    { id: "segCotiza",    label: "Seguimiento de cotizaciones", icon: { src: segNotasIcon.url }, col: 2, row: 3, accent: "muted", disabled: true },
    { id: "remision",     label: "Remisiones", sublabel: "Afecta inventario", icon: { src: remisionesIcon.url }, col: 3, row: 3, to: "/admin/logistica", accent: "warning" },
    { id: "guias",        label: "Guías de embarque", icon: { src: guiasIcon.url }, col: 4, row: 3, to: "/admin/logistica", accent: "muted" },
    { id: "devol",        label: "Devoluciones, descuentos y anticipos", icon: { src: devolucionesIcon.url }, col: 5, row: 3, to: "/admin/devoluciones/lista", count: data?.devoluciones, accent: "muted" },
    { id: "notasCargo",   label: "Notas de cargo y cheques devueltos", icon: { src: notasCargoIcon.url }, col: 7, row: 3, accent: "muted", disabled: true },
  ];

  const edges: FlowEdge[] = [
    { from: "prospectos", to: "clientes" },
    // Clientes fans out: separate the two vh-bends so they don't stack on col 2
    { from: "clientes", to: "segNotas", bend: "vh", laneOffset: -28 },
    { from: "clientes", to: "cotiza" },
    { from: "clientes", to: "productos", bend: "vh", laneOffset: 28 },
    { from: "cotiza", to: "segCotiza", bidirectional: true },
    { from: "cotiza", to: "pedidos" },
    { from: "pedidos", to: "factura" },
    // Pedidos ↔ Consigna ↔ Factura share col 4; offset the bends
    { from: "pedidos", to: "consigna", bend: "vh", laneOffset: -24 },
    { from: "consigna", to: "factura" },
    { from: "consigna", to: "devConsigna", bidirectional: true },
    { from: "pedidos", to: "remision", bidirectional: true },
    { from: "remision", to: "guias", bidirectional: true },
    { from: "guias", to: "factura", bend: "vh", laneOffset: 24 },
    // Devol → Factura: route via col 4 to avoid crossing segCxc at col 5
    { from: "devol", to: "factura", bend: "hv", laneOffset: 28 },
    { from: "factura", to: "segCxc" },
    { from: "segCxc", to: "depositos" },
    { from: "depositos", to: "aplicaCob" },
    { from: "notasCargo", to: "aplicaCob" },
  ];

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> Clientes · Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Flujo comercial completo. Haz clic en cualquier etapa para ir a esa sección.
        </p>
      </header>

      <FlowDiagram nodes={nodes} edges={edges} cols={7} rows={3} />

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          <strong>Reglas contables (Eduardo Islas):</strong> la <em>remisión</em> afecta el inventario;
          la <em>factura</em> genera la póliza automática de costo de venta e IVA trasladado;
          la <em>aplicación de cobranza</em> genera la póliza de ingreso.
        </p>
      </div>
    </section>
  );
}
