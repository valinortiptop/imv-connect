import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Warehouse,
  Package,
  ArrowLeftRight,
  ClipboardCheck,
  Truck,
  Search,
  Info,
  Calculator,
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
    // Row 1: costos (top)
    { id: "costos", label: "Integración de costos", icon: Calculator, col: 2, row: 1, to: "/admin/kardex", count: data?.entradasHoy, accent: "success" },
    // Row 2: main horizontal spine
    { id: "almacenes", label: "Almacenes", icon: Warehouse, col: 1, row: 2, to: "/admin/almacenes", count: data?.almacenes, accent: "primary" },
    { id: "movs",      label: "Movimientos", icon: ArrowLeftRight, col: 2, row: 2, to: "/admin/kardex", count: data?.movimientosHoy, accent: "primary" },
    { id: "fisico",    label: "Inventario físico", icon: ClipboardCheck, col: 3, row: 2, to: "/admin/inventario", accent: "warning" },
    { id: "consulta",  label: "Consulta de inventario", icon: Search, col: 4, row: 2, to: "/admin/kardex", accent: "muted" },
    // Row 3
    { id: "productos", label: "Productos / servicios", icon: Package, col: 1, row: 3, to: "/admin/productos", count: data?.productos, accent: "muted" },
    { id: "guias",     label: "Guías de embarque", icon: Truck, col: 2, row: 3, to: "/admin/logistica", accent: "muted" },
  ];

  const edges: FlowEdge[] = [
    { from: "almacenes", to: "movs" },
    { from: "movs", to: "costos", bidirectional: true },
    { from: "movs", to: "fisico" },
    { from: "fisico", to: "consulta" },
    { from: "movs", to: "guias" },
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

      <FlowDiagram nodes={nodes} edges={edges} cols={4} rows={3} />

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
