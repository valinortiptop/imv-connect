import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Warehouse,
  Package,
  ArrowLeftRight,
  ClipboardCheck,
  Truck,
  Boxes,
  AlertTriangle,
  Search,
  Info,
} from "lucide-react";
import FlowDiagram, {
  type FlowNode,
  type FlowEdge,
} from "@/components/dashboards/FlowDiagram";
import { getAlmacenDashboardCountsFn } from "@/lib/dashboard-counts.functions";

export const Route = createFileRoute("/admin/almacen-dashboard")({
  head: () => ({ meta: [{ title: "Almacén · Dashboard" }] }),
  component: AlmacenDashboard,
});

function AlmacenDashboard() {
  const fetchCounts = useServerFn(getAlmacenDashboardCountsFn);
  const { data } = useQuery({
    queryKey: ["almacen-dashboard-counts"],
    queryFn: () => fetchCounts(),
    staleTime: 60_000,
  });

  const nodes: FlowNode[] = [
    { id: "almacenes", label: "Almacenes", sublabel: "Ubicaciones", icon: Warehouse, col: 1, row: 1, to: "/admin/almacenes", count: data?.almacenes, accent: "primary" },
    { id: "productos", label: "Productos", sublabel: "Catálogo", icon: Package, col: 2, row: 1, to: "/admin/productos", count: data?.productos, accent: "muted" },
    { id: "entradas",  label: "Entradas",  sublabel: "Compra / traspaso", icon: Boxes, col: 3, row: 1, to: "/admin/entradas", count: data?.entradasHoy, accent: "success" },
    { id: "movs",      label: "Movimientos", sublabel: "Hoy", icon: ArrowLeftRight, col: 2, row: 2, to: "/admin/kardex", count: data?.movimientosHoy, accent: "primary" },
    { id: "fisico",    label: "Inventario físico", sublabel: "Conteo", icon: ClipboardCheck, col: 1, row: 2, to: "/admin/inventario", accent: "warning" },
    { id: "guias",     label: "Guías de embarque", sublabel: "Salidas", icon: Truck, col: 3, row: 2, to: "/admin/logistica", accent: "muted" },
    { id: "danados",   label: "Dañados / Mermas", icon: AlertTriangle, col: 4, row: 1, to: "/admin/danados", count: data?.danados, accent: "danger" },
    { id: "consulta",  label: "Consulta / Kardex", icon: Search, col: 4, row: 2, to: "/admin/kardex", accent: "muted" },
  ];

  const edges: FlowEdge[] = [
    { from: "almacenes", to: "movs" },
    { from: "productos", to: "movs" },
    { from: "entradas",  to: "movs" },
    { from: "movs",      to: "fisico" },
    { from: "movs",      to: "guias" },
    { from: "movs",      to: "consulta" },
    { from: "guias",     to: "danados" },
  ];

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Warehouse className="h-6 w-6 text-primary" /> Almacén · Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Flujo de movimientos de inventario. Todo cruza por <strong>Movimientos</strong>.
        </p>
      </header>

      <FlowDiagram nodes={nodes} edges={edges} cols={4} rows={2} />

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          <strong>Integración de costos:</strong> cada movimiento (entrada, salida por remisión,
          traspaso, ajuste, daño) genera un asiento de kardex valuado. Las salidas por
          remisión disparan el costo de venta al facturar.
        </p>
      </div>
    </section>
  );
}
