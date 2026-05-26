import { useState } from "react";
import {
  LayoutDashboard, Calculator, ShoppingCart, Users, Package, Warehouse,
  ClipboardList, Settings, Truck, Tag, TrendingUp, Route as RouteIcon, BookOpen,
  Bot, FileText, Link2, BarChart3, ChevronDown, LogOut, CheckSquare,
  AlertOctagon, Undo2, UserPlus, History, Handshake, UserSquare2,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = { label: string; url: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "General",
    items: [
      { label: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
      { label: "Gandalf", url: "/admin/gandalf", icon: Bot },
      { label: "Tareas", url: "/admin/tareas", icon: CheckSquare },
      { label: "Calculadora", url: "/admin/calculadora", icon: Calculator },
    ],
  },
  {
    label: "Ventas",
    items: [
      { label: "Prospectos", url: "/admin/prospectos", icon: UserPlus },
      { label: "Pedidos", url: "/admin/pedidos", icon: ShoppingCart },
      { label: "Clientes", url: "/admin/clientes", icon: Users },
      { label: "Vendedores", url: "/admin/representantes", icon: UserSquare2 },
      { label: "Facturación", url: "/admin/facturas", icon: FileText },
      { label: "Promociones", url: "/admin/promos", icon: Tag },
      { label: "Partners", url: "/admin/partners", icon: Handshake },
      { label: "Listas de Precios", url: "/admin/listas-precios", icon: TrendingUp },
      { label: "Sales", url: "/admin/sales", icon: TrendingUp },
      { label: "P&L", url: "/admin/pnl", icon: BarChart3 },
      { label: "Ventas", url: "/admin/ventas", icon: FileText },
    ],
  },
  {
    label: "Inventario",
    items: [
      { label: "Productos", url: "/admin/productos", icon: Package },
      { label: "Inventario", url: "/admin/inventario", icon: Warehouse },
      { label: "Almacén", url: "/admin/almacen", icon: Warehouse },
      { label: "Kardex", url: "/admin/kardex", icon: History },
      { label: "Entradas", url: "/admin/entradas", icon: Truck },
      { label: "Necesidades de Compra", url: "/admin/necesidades", icon: ClipboardList },
      { label: "Devoluciones", url: "/admin/devoluciones/lista", icon: Undo2 },
      { label: "Dañados", url: "/admin/danados", icon: AlertOctagon },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { label: "Logística", url: "/admin/logistica", icon: RouteIcon },
      { label: "Maniobra", url: "/admin/maniobra", icon: Package },
      { label: "Catálogo", url: "/admin/catalogo", icon: BookOpen },
      { label: "Documentos", url: "/admin/documentos", icon: FileText },
    ],
  },
  {
    label: "Configuración",
    items: [
      { label: "Portal Clientes", url: "/admin/portal", icon: Link2 },
      { label: "Admin", url: "/admin/administracion", icon: Settings },
    ],
  },
];

export function AdminSidebar({
  email,
  onSignOut,
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const isItemActive = (url: string, exact?: boolean) =>
    exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of navGroups) init[g.label] = true;
    return init;
  });

  const toggle = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navGroups.map((group) => {
                const isOpen = open[group.label] ?? true;
                return (
                  <div key={group.label}>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => toggle(group.label)}
                        className="font-medium"
                      >
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">
                          {group.label}
                        </span>
                        <ChevronDown
                          className={cn(
                            "ml-auto h-4 w-4 transition-transform duration-200",
                            !isOpen && "-rotate-90"
                          )}
                        />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {isOpen && (
                      <ul className="ml-3 border-l border-sidebar-border pl-2 pt-1 pb-2 space-y-0.5">
                        {group.items.map((item) => {
                          const active = isItemActive(item.url, item.exact);
                          return (
                            <li key={item.url}>
                              <Link
                                to={item.url}
                                className={cn(
                                  "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
                                  active && "bg-muted text-primary font-medium"
                                )}
                              >
                                <item.icon className="h-4 w-4" />
                                <span>{item.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="border-t p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
            <span className="truncate">{email ?? "Cuenta"}</span>
          </div>
          <button
            onClick={onSignOut}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
