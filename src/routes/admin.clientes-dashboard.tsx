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
    { id: "prospectos", label: "Prospectos", sublabel: "Seguimiento", icon: UserSearch, col: 1, row: 1, to: "/admin/prospectos", count: data?.prospectos, accent: "primary" },
    { id: "clientes",   label: "Clientes",   sublabel: "Alta / edición", icon: Users, col: 2, row: 1, to: "/admin/clientes", count: data?.clientes, accent: "primary" },
    { id: "cotiza",     label: "Cotizaciones", icon: ClipboardList, col: 3, row: 1, to: "/admin/pedidos", accent: "muted" },
    { id: "pedidos",    label: "Pedidos",    sublabel: "Abiertos", icon: FileText, col: 4, row: 1, to: "/admin/pedidos", count: data?.pedidosAbiertos, accent: "primary" },
    { id: "remision",   label: "Remisión",   sublabel: "Afecta inventario", icon: Truck, col: 1, row: 2, to: "/admin/logistica", accent: "warning" },
    { id: "factura",    label: "Facturación", sublabel: "Costo de venta", icon: ReceiptText, col: 2, row: 2, to: "/admin/facturas", count: data?.facturasMes, accent: "success" },
    { id: "cobranza",   label: "Cobranza",   sublabel: "Aplicación de pagos", icon: Banknote, col: 3, row: 2, to: "/admin/credito-cobranza/cartera", count: data?.cxcVencida, accent: "danger" },
    { id: "devol",      label: "Devoluciones", icon: Undo2, col: 4, row: 2, to: "/admin/devoluciones/lista", count: data?.devoluciones, accent: "muted" },
  ];

  const edges: FlowEdge[] = [
    { from: "prospectos", to: "clientes" },
    { from: "clientes",   to: "cotiza" },
    { from: "cotiza",     to: "pedidos" },
    { from: "pedidos",    to: "remision" },
    { from: "remision",   to: "factura" },
    { from: "factura",    to: "cobranza" },
    { from: "factura",    to: "devol" },
  ];

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> Clientes · Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Flujo comercial de principio a fin. Haz clic en cualquier etapa para ir a esa sección.
        </p>
      </header>

      <FlowDiagram nodes={nodes} edges={edges} cols={4} rows={2} />

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
