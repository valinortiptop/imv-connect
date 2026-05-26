import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  ShoppingCart,
  FileText,
  Undo2,
  Wallet,
  Boxes,
  Truck,
  Warehouse,
  Percent,
  Package,
  FlaskConical,
  Users,
  UserSquare2,
  ShieldCheck,
  Settings,
  LogOut,
  UserCog,
  Activity,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const operacion = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
  { title: "Onboarding", url: "/admin/onboarding", icon: ClipboardList },
  { title: "Pedidos", url: "/admin/pedidos", icon: ShoppingCart },
  { title: "Facturas", url: "/admin/facturas", icon: FileText },
  { title: "Devoluciones", url: "/admin/devoluciones", icon: Undo2 },
  { title: "Cobranza", url: "/admin/cobranza", icon: Wallet },
];

const inventario = [
  { title: "Inventario", url: "/admin/inventario", icon: Boxes },
  { title: "Compras", url: "/admin/compras", icon: Truck },
  { title: "Almacenes", url: "/admin/almacenes", icon: Warehouse },
  { title: "Comisiones", url: "/admin/comisiones", icon: Percent },
];

const catalogos = [
  { title: "Productos", url: "/admin/productos", icon: Package },
  { title: "Laboratorios", url: "/admin/laboratorios", icon: FlaskConical },
  { title: "Clientes", url: "/admin/clientes", icon: Users },
  { title: "Representantes", url: "/admin/representantes", icon: UserSquare2 },
  { title: "Usuarios", url: "/admin/usuarios", icon: ShieldCheck },
];

const integraciones = [
  { title: "Uso de APIs", url: "/admin/uso-apis", icon: Activity },
];

export function AdminSidebar({
  email,
  onSignOut,
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (url: string, exact?: boolean) =>
    exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  const renderGroup = (label: string, items: typeof operacion) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url, item.exact)}>
                <Link to={item.url} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/admin" className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            IMV
          </div>
          {!collapsed && <span className="text-sm font-semibold">IMV Admin</span>}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Operación", operacion)}
        {renderGroup("Inventario", inventario)}
        {renderGroup("Catálogos", catalogos)}
        {renderGroup("Integraciones", integraciones)}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="flex items-center gap-2">
                  <Settings className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <span className="truncate text-xs">{email ?? "Cuenta"}</span>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56">
                <DropdownMenuLabel className="truncate">
                  {email ?? "Cuenta"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin/cuenta" className="flex items-center gap-2">
                    <UserCog className="h-4 w-4" /> Ajustes de cuenta
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/admin/onboarding" className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" /> Onboarding
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
