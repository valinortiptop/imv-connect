import { useState } from "react";
import {
  LayoutDashboard, Calculator, ShoppingCart, Users, Package, Warehouse,
  ClipboardList, Settings, Truck, Tag, TrendingUp, Route as RouteIcon, BookOpen,
  Bot, FileText, Link2, BarChart3, ChevronDown, LogOut, CheckSquare,
  AlertOctagon, Undo2, UserPlus, History, Handshake, UserSquare2, Rocket, Activity, Gauge, Building2,
  Calculator as CalcIcon, BookText, Scale, Receipt, Landmark, ShieldCheck, PieChart, ScrollText,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { logoFullWhite } from "@/assets/logos";
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

type NavItem = { key: string; label: string; url: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "General",
    items: [
      { key: "navDashboard",    label: "Dashboard",            url: "/admin",                icon: LayoutDashboard, exact: true },
      { key: "navAIChat",       label: "Gandalf",              url: "/admin/gandalf",        icon: Bot },
      { key: "navTareas",       label: "Tareas",               url: "/admin/tareas",         icon: CheckSquare },
      { key: "navCalculator",   label: "Calculadora",          url: "/admin/calculadora",    icon: Calculator },
      { key: "navOnboarding",   label: "Onboarding",           url: "/admin/onboarding",     icon: Rocket },
    ],
  },
  {
    label: "Ventas",
    items: [
      { key: "navProspects",    label: "Prospectos",           url: "/admin/prospectos",     icon: UserPlus },
      { key: "navOrders",       label: "Pedidos",              url: "/admin/pedidos",        icon: ShoppingCart },
      { key: "navClients",      label: "Clientes",             url: "/admin/clientes",       icon: Users },
      { key: "navPortalAdmin",  label: "Portal Clientes",      url: "/admin/portal",          icon: Link2 },
      { key: "navReps",         label: "Vendedores",           url: "/admin/representantes", icon: UserSquare2 },
      { key: "navDirectory",    label: "Facturación",          url: "/admin/facturas",       icon: FileText },
      { key: "navPromos",       label: "Promociones",          url: "/admin/promos",         icon: Tag },
      { key: "navPartners",     label: "Partners",             url: "/admin/partners",       icon: Handshake },
      { key: "navPriceLists",   label: "Listas de Precios",    url: "/admin/listas-precios", icon: TrendingUp },
      { key: "navSales",        label: "Sales",                url: "/admin/sales",          icon: TrendingUp },
      { key: "navPnL",          label: "P&L",                  url: "/admin/pnl",            icon: BarChart3 },
      { key: "navVentasReport", label: "Ventas",               url: "/admin/ventas",         icon: FileText },
    ],
  },
  {
    label: "Almacén y Compras",
    items: [
      { key: "navProducts",      label: "Productos",            url: "/admin/productos",          icon: Package },
      { key: "navInventory",     label: "Inventario",           url: "/admin/inventario",         icon: Warehouse },
      { key: "navInventario",    label: "Almacén",              url: "/admin/almacen",            icon: Warehouse },
      { key: "navKardex",        label: "Kardex",               url: "/admin/kardex",             icon: History },
      { key: "navStock",         label: "Entradas",             url: "/admin/entradas",           icon: Truck },
      { key: "navPurchaseNeeds", label: "Compras", url: "/admin/necesidades",       icon: ClipboardList },
      { key: "navDevoluciones",  label: "Devoluciones",         url: "/admin/devoluciones/lista", icon: Undo2 },
      { key: "navDamaged",       label: "Dañados",              url: "/admin/danados",            icon: AlertOctagon },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { key: "navLogistics",   label: "Logística",  url: "/admin/logistica",  icon: RouteIcon },
      { key: "navManiobra",    label: "Maniobra",   url: "/admin/maniobra",   icon: Package },
      { key: "navCatalogo",    label: "Catálogo",   url: "/admin/catalogo",   icon: BookOpen },
      { key: "navDocuments",   label: "Documentos", url: "/admin/documentos", icon: FileText },
    ],
  },
  {
    label: "Contabilidad",
    items: [
      { key: "navContaDash",    label: "Dashboard fiscal",    url: "/admin/contabilidad",              icon: Landmark, exact: true },
      { key: "navContaCuentas", label: "Catálogo de cuentas", url: "/admin/contabilidad/cuentas",      icon: BookText },
      { key: "navContaAgrup",   label: "Códigos agrupadores", url: "/admin/contabilidad/agrupadores",  icon: BookText },
      { key: "navContaElec",    label: "Contabilidad electrónica", url: "/admin/contabilidad/electronica", icon: FileText },
      { key: "navContaPolizas", label: "Pólizas",             url: "/admin/contabilidad/polizas",      icon: ScrollText },
      { key: "navContaDiario",  label: "Libro diario",        url: "/admin/contabilidad/diario",       icon: BookOpen },
      { key: "navContaMayor",   label: "Libro mayor",         url: "/admin/contabilidad/mayor",        icon: BookText },
      { key: "navContaBalanza", label: "Balanza",             url: "/admin/contabilidad/balanza",      icon: Scale },
      { key: "navContaEstados", label: "Estados financieros", url: "/admin/contabilidad/estados",      icon: PieChart },
      { key: "navContaIVA",     label: "IVA / IEPS",          url: "/admin/contabilidad/impuestos",    icon: Receipt },
      { key: "navContaFact",    label: "Facturas contables",  url: "/admin/contabilidad/facturas",     icon: FileText },
      { key: "navContaSAT",     label: "Cumplimiento SAT",    url: "/admin/contabilidad/sat",          icon: ShieldCheck },
    ],
  },
  {
    label: "Configuración",
    items: [
      { key: "navEmpresas",    label: "Empresas",            url: "/admin/empresas",        icon: Building2 },
      { key: "navApiStatus",   label: "Estado de APIs",      url: "/admin/estado-apis",     icon: Activity },
      { key: "navApiUsage",    label: "Uso de APIs",         url: "/admin/uso-apis",        icon: Gauge },
      { key: "navAdmin",       label: "Admin",               url: "/admin/administracion",  icon: Settings },
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
  const { canAccessKey, loading } = usePermissions();

  const isItemActive = (url: string, exact?: boolean) =>
    exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of navGroups) init[g.label] = true;
    return init;
  });

  const toggle = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const visibleGroups = loading
    ? navGroups
    : navGroups
        .map((g) => ({ ...g, items: g.items.filter((i) => canAccessKey(i.key)) }))
        .filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="offcanvas">
      {/* Brand header — full IMV lockup on its native navy background */}
      <Link
        to="/admin"
        className="block border-b border-sidebar-border bg-[#0b1f5c] px-4 py-2"
        aria-label="IMV — ir al inicio"
      >
        <div className="overflow-hidden h-8 flex items-center justify-center">
          <img
            src={logoFullWhite}
            alt="IMV Integradora de Medicamentos Veterinarios"
            className="block h-12 w-auto -my-2"
          />
        </div>
      </Link>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleGroups.map((group) => {
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
