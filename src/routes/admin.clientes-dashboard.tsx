import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  UserSearch,
  Users,
  FileText,
  ClipboardList,
  Truck,
  ReceiptText,
  Banknote,
  Undo2,
  Info,
  Package,
  NotebookPen,
  Boxes,
  MapPinned,
  Receipt,
  ListChecks,
  Landmark,
  FileMinus,
} from "lucide-react";
import FlowDiagram, {
  type FlowNode,
  type FlowEdge,
} from "@/components/dashboards/FlowDiagram";
import { getClientesDashboardCountsFn } from "@/lib/dashboard-counts.functions";

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
    { id: "prospectos",   label: "Prospectos", icon: UserSearch, col: 1, row: 1, to: "/admin/prospectos", count: data?.prospectos, accent: "primary" },
    { id: "clientes",     label: "Clientes",   icon: Users, col: 2, row: 1, to: "/admin/clientes", count: data?.clientes, accent: "primary" },
    { id: "consigna",     label: "Consignaciones", icon: Boxes, col: 4, row: 1, accent: "muted", disabled: true },
    { id: "devConsigna",  label: "Devolución de consignaciones", icon: Undo2, col: 5, row: 1, accent: "muted", disabled: true },
    { id: "mapas",        label: "Mapas de entrega", icon: MapPinned, col: 6, row: 1, to: "/admin/logistica", accent: "muted" },
    { id: "notasVenta",   label: "Notas de venta", icon: Receipt, col: 7, row: 1, to: "/admin/facturas", accent: "muted" },
    // Row 2 (main flow)
    { id: "segNotas",     label: "Seguimientos de notas", sublabel: "clientes y prospectos", icon: NotebookPen, col: 1, row: 2, accent: "muted", disabled: true },
    { id: "cotiza",       label: "Cotizaciones", icon: ClipboardList, col: 2, row: 2, to: "/admin/pedidos", accent: "muted" },
    { id: "pedidos",      label: "Pedidos", icon: FileText, col: 3, row: 2, to: "/admin/pedidos", count: data?.pedidosAbiertos, accent: "primary" },
    { id: "factura",      label: "Facturas", sublabel: "Costo de venta", icon: ReceiptText, col: 4, row: 2, to: "/admin/facturas", count: data?.facturasMes, accent: "success" },
    { id: "segCxc",       label: "Seguimiento de cuentas por cobrar", icon: ListChecks, col: 5, row: 2, to: "/admin/credito-cobranza/cartera", count: data?.cxcVencida, accent: "danger" },
    { id: "depositos",    label: "Relación masiva de depósitos en banca", icon: Landmark, col: 6, row: 2, to: "/admin/bancos/movimientos", accent: "muted" },
    { id: "aplicaCob",    label: "Aplicación de cobranza", icon: Banknote, col: 7, row: 2, to: "/admin/credito-cobranza/complementos", accent: "primary" },
    // Row 3
    { id: "productos",    label: "Productos / servicios", icon: Package, col: 1, row: 3, to: "/admin/productos", accent: "muted" },
    { id: "segCotiza",    label: "Seguimiento de cotizaciones", icon: NotebookPen, col: 2, row: 3, accent: "muted", disabled: true },
    { id: "remision",     label: "Remisiones", sublabel: "Afecta inventario", icon: Truck, col: 3, row: 3, to: "/admin/logistica", accent: "warning" },
    { id: "guias",        label: "Guías de embarque", icon: Truck, col: 4, row: 3, to: "/admin/logistica", accent: "muted" },
    { id: "devol",        label: "Devoluciones, descuentos y anticipos", icon: Undo2, col: 5, row: 3, to: "/admin/devoluciones/lista", count: data?.devoluciones, accent: "muted" },
    { id: "notasCargo",   label: "Notas de cargo y cheques devueltos", icon: FileMinus, col: 7, row: 3, accent: "muted", disabled: true },
  ];

  const edges: FlowEdge[] = [
    // Row 1 top branch
    { from: "prospectos", to: "clientes" },
    // Clientes fans down
    { from: "clientes", to: "segNotas", bend: "vh" },
    { from: "clientes", to: "cotiza" },
    { from: "clientes", to: "productos", bend: "vh" },
    // Cotizaciones column
    { from: "cotiza", to: "segCotiza", bidirectional: true },
    { from: "cotiza", to: "pedidos" },
    // Pedidos → Facturas main line
    { from: "pedidos", to: "factura" },
    // Consignaciones loop
    { from: "pedidos", to: "consigna", bend: "vh" },
    { from: "consigna", to: "factura", bend: "vh" },
    { from: "consigna", to: "devConsigna", bidirectional: true },
    // Remisiones / guías / devoluciones feeding factura
    { from: "pedidos", to: "remision", bidirectional: true },
    { from: "remision", to: "guias", bidirectional: true },
    { from: "guias", to: "factura", bend: "vh" },
    { from: "devol", to: "factura", bend: "vh" },
    // Cobranza chain
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
