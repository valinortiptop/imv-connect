import { useEffect, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";

// Icon asset imports (3D clay style, hosted on CDN)
import icClientes from "@/assets/flow-icons/clientes.png.asset.json";
import icAlmacenes from "@/assets/flow-icons/almacenes.png.asset.json";
import icDashboard from "@/assets/flow-icons/dashboard.png.asset.json";
import icGandalf from "@/assets/flow-icons/gandalf.png.asset.json";
import icTareas from "@/assets/flow-icons/tareas.png.asset.json";
import icCalculadora from "@/assets/flow-icons/calculadora.png.asset.json";
import icOnboarding from "@/assets/flow-icons/onboarding.png.asset.json";
import icProspectos from "@/assets/flow-icons/prospectos.png.asset.json";
import icPedidos from "@/assets/flow-icons/pedidos.png.asset.json";
import icPortalClientes from "@/assets/flow-icons/portal-clientes.png.asset.json";
import icVendedores from "@/assets/flow-icons/vendedores.png.asset.json";
import icFacturas from "@/assets/flow-icons/facturas.png.asset.json";
import icPromociones from "@/assets/flow-icons/promociones.png.asset.json";
import icPartners from "@/assets/flow-icons/partners.png.asset.json";
import icListasPrecios from "@/assets/flow-icons/listas-precios.png.asset.json";
import icSales from "@/assets/flow-icons/sales.png.asset.json";
import icPnl from "@/assets/flow-icons/pnl.png.asset.json";
import icVentas from "@/assets/flow-icons/ventas.png.asset.json";
import icPanelRep from "@/assets/flow-icons/panel-rep.png.asset.json";
import icCoachIA from "@/assets/flow-icons/coach-ia.png.asset.json";
import icSupervisor from "@/assets/flow-icons/supervisor.png.asset.json";
import icProductos from "@/assets/flow-icons/productos.png.asset.json";
import icConsultaInv from "@/assets/flow-icons/consulta-inventario.png.asset.json";
import icKardex from "@/assets/flow-icons/kardex.png.asset.json";
import icEntradas from "@/assets/flow-icons/entradas.png.asset.json";
import icCompras from "@/assets/flow-icons/compras.png.asset.json";
import icPlaneacion from "@/assets/flow-icons/planeacion.png.asset.json";
import icOrdenesCompra from "@/assets/flow-icons/ordenes-compra.png.asset.json";
import icProveedores from "@/assets/flow-icons/proveedores.png.asset.json";
import icCaducidades from "@/assets/flow-icons/caducidades.png.asset.json";
import icIntegracionCostos from "@/assets/flow-icons/integracion-costos.png.asset.json";
import icRotacion from "@/assets/flow-icons/rotacion.png.asset.json";
import icFaltantes from "@/assets/flow-icons/faltantes.png.asset.json";
import icAlertas from "@/assets/flow-icons/alertas.png.asset.json";
import icPresupuesto from "@/assets/flow-icons/presupuesto.png.asset.json";
import icDevoluciones from "@/assets/flow-icons/devoluciones.png.asset.json";
import icDanados from "@/assets/flow-icons/danados.png.asset.json";
import icMapasEntrega from "@/assets/flow-icons/mapas-entrega.png.asset.json";
import icManiobra from "@/assets/flow-icons/maniobra.png.asset.json";
import icCatalogo from "@/assets/flow-icons/catalogo.png.asset.json";
import icDocumentos from "@/assets/flow-icons/documentos.png.asset.json";
import icSeguimientoCxc from "@/assets/flow-icons/seguimiento-cxc.png.asset.json";
import icGestiones from "@/assets/flow-icons/gestiones.png.asset.json";
import icPromesasPago from "@/assets/flow-icons/promesas-pago.png.asset.json";
import icAutorizaciones from "@/assets/flow-icons/autorizaciones.png.asset.json";
import icDashboardFiscal from "@/assets/flow-icons/dashboard-fiscal.png.asset.json";
import icCatalogoCuentas from "@/assets/flow-icons/catalogo-cuentas.png.asset.json";
import icAgrupadores from "@/assets/flow-icons/agrupadores.png.asset.json";
import icContaElectronica from "@/assets/flow-icons/contabilidad-electronica.png.asset.json";
import icPolizas from "@/assets/flow-icons/polizas.png.asset.json";
import icLibroDiario from "@/assets/flow-icons/libro-diario.png.asset.json";
import icLibroMayor from "@/assets/flow-icons/libro-mayor.png.asset.json";
import icBalanza from "@/assets/flow-icons/balanza.png.asset.json";
import icEstadosFinancieros from "@/assets/flow-icons/estados-financieros.png.asset.json";
import icImpuestos from "@/assets/flow-icons/impuestos.png.asset.json";
import icSAT from "@/assets/flow-icons/sat.png.asset.json";
import icBancos from "@/assets/flow-icons/bancos.png.asset.json";
import icEstadosBancarios from "@/assets/flow-icons/estados-bancarios.png.asset.json";
import icMovBancarios from "@/assets/flow-icons/mov-bancarios.png.asset.json";
import icTraspasos from "@/assets/flow-icons/traspasos.png.asset.json";
import icNomina from "@/assets/flow-icons/nomina.png.asset.json";
import icEmpresas from "@/assets/flow-icons/empresas.png.asset.json";
import icEstadoApis from "@/assets/flow-icons/estado-apis.png.asset.json";
import icUsoApis from "@/assets/flow-icons/uso-apis.png.asset.json";
import icAdmin from "@/assets/flow-icons/admin.png.asset.json";

type NavItem = { key: string; label: string; url: string; icon: string; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const ADMIN_BUILD_MARKER = `Build ${__BUILD_ID__}`;

const navGroups: NavGroup[] = [
  {
    label: "General",
    items: [
      { key: "navClientesDashboard", label: "Clientes Dashboard",  url: "/admin/clientes-dashboard", icon: icClientes.url },
      { key: "navAlmacenDashboard",  label: "Almacén Dashboard",   url: "/admin/almacen-dashboard",  icon: icAlmacenes.url },
      { key: "navDashboard",    label: "Dashboard",            url: "/admin",                icon: icDashboard.url, exact: true },
      { key: "navAIChat",       label: "Gandalf",              url: "/admin/gandalf",        icon: icGandalf.url },
      { key: "navTareas",       label: "Tareas",               url: "/admin/tareas",         icon: icTareas.url },
      { key: "navCalculator",   label: "Calculadora",          url: "/admin/calculadora",    icon: icCalculadora.url },
      { key: "navOnboarding",   label: "Onboarding",           url: "/admin/onboarding",     icon: icOnboarding.url },
    ],
  },
  {
    label: "Ventas",
    items: [
      { key: "navProspects",    label: "Prospectos",           url: "/admin/prospectos",     icon: icProspectos.url },
      { key: "navOrders",       label: "Pedidos",              url: "/admin/pedidos",        icon: icPedidos.url },
      { key: "navClients",      label: "Clientes",             url: "/admin/clientes",       icon: icClientes.url },
      { key: "navPortalAdmin",  label: "Portal Clientes",      url: "/admin/portal",         icon: icPortalClientes.url },
      { key: "navReps",         label: "Vendedores",           url: "/admin/representantes", icon: icVendedores.url },
      { key: "navDirectory",    label: "Facturación",          url: "/admin/facturas",       icon: icFacturas.url },
      { key: "navPromos",       label: "Promociones",          url: "/admin/promos",         icon: icPromociones.url },
      { key: "navPartners",     label: "Partners",             url: "/admin/partners",       icon: icPartners.url },
      { key: "navPriceLists",   label: "Listas de Precios",    url: "/admin/listas-precios", icon: icListasPrecios.url },
      { key: "navSales",        label: "Sales",                url: "/admin/sales",          icon: icSales.url },
      { key: "navPnL",          label: "P&L",                  url: "/admin/pnl",            icon: icPnl.url },
      { key: "navVentasReport", label: "Ventas",               url: "/admin/ventas",         icon: icVentas.url },
    ],
  },
  {
    label: "Representantes",
    items: [
      { key: "navRepPanel",      label: "Panel Rep",    url: "/rep",            icon: icPanelRep.url, exact: true },
      { key: "navRepCoach",      label: "Coach IA",     url: "/rep/coach",      icon: icCoachIA.url },
      { key: "navRepSupervisor", label: "Supervisor",   url: "/rep/supervisor", icon: icSupervisor.url },
    ],
  },
  {
    label: "Almacén y Compras",
    items: [
      { key: "navProducts",      label: "Productos",            url: "/admin/productos",          icon: icProductos.url },
      { key: "navInventory",     label: "Inventario",           url: "/admin/inventario",         icon: icConsultaInv.url },
      { key: "navInventario",    label: "Almacén",              url: "/admin/almacen",            icon: icAlmacenes.url },
      { key: "navAlmacenesCat",  label: "Almacenes / ubicaciones", url: "/admin/almacenes",       icon: icAlmacenes.url },

      { key: "navKardex",        label: "Kardex",               url: "/admin/kardex",             icon: icKardex.url },
      { key: "navStock",         label: "Entradas",             url: "/admin/entradas",           icon: icEntradas.url },
      { key: "navRecepciones",   label: "Recepciones",          url: "/admin/almacen/recepciones", icon: icEntradas.url },
      { key: "navTraspasos",     label: "Traspasos",            url: "/admin/almacen/traspasos",  icon: icAlmacenes.url },
      { key: "navRemisiones",    label: "Remisiones",           url: "/admin/almacen/remisiones", icon: icKardex.url },
      { key: "navCardexMat",     label: "Cardex de material",   url: "/admin/almacen/cardex",     icon: icKardex.url },
      { key: "navRepAlmacen",    label: "Reportes almacén",     url: "/admin/almacen/reportes",   icon: icRotacion.url },

      { key: "navPurchaseNeeds",       label: "Compras",              url: "/admin/compras",              icon: icCompras.url, exact: true },
      { key: "navComprasPlaneacion",   label: "Planeación",           url: "/admin/compras/planeacion",   icon: icPlaneacion.url },
      { key: "navComprasOrdenes",      label: "Órdenes",              url: "/admin/compras/ordenes",      icon: icOrdenesCompra.url },
      { key: "navComprasProveedores",  label: "Proveedores",          url: "/admin/compras/proveedores",  icon: icProveedores.url },
      { key: "navComprasCaducidades",  label: "Caducidades",          url: "/admin/compras/caducidades",  icon: icCaducidades.url },
      { key: "navComprasCostos",       label: "Costos",               url: "/admin/compras/costos",       icon: icIntegracionCostos.url },
      { key: "navComprasRotacion",     label: "Rotación",             url: "/admin/compras/rotacion",     icon: icRotacion.url },
      { key: "navComprasFaltantes",    label: "Faltantes",            url: "/admin/compras/faltantes",    icon: icFaltantes.url },
      { key: "navComprasAlertas",      label: "Alertas",              url: "/admin/compras/alertas",      icon: icAlertas.url },
      { key: "navComprasPresupuesto",  label: "Presupuesto",          url: "/admin/compras/presupuesto",  icon: icPresupuesto.url },
      { key: "navDevoluciones",  label: "Devoluciones",         url: "/admin/devoluciones/lista", icon: icDevoluciones.url },
      { key: "navDamaged",       label: "Dañados",              url: "/admin/danados",            icon: icDanados.url },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { key: "navLogistics",   label: "Logística",  url: "/admin/logistica",  icon: icMapasEntrega.url },
      { key: "navManiobra",    label: "Maniobra",   url: "/admin/maniobra",   icon: icManiobra.url },
      { key: "navCatalogo",    label: "Catálogo",   url: "/admin/catalogo",   icon: icCatalogo.url },
      { key: "navDocuments",   label: "Documentos", url: "/admin/documentos", icon: icDocumentos.url },
    ],
  },
  {
    label: "Cobranza",
    items: [
      { key: "navCreditoCartera",        label: "Cartera",          url: "/admin/credito-cobranza/cartera",        icon: icSeguimientoCxc.url },
      { key: "navCreditoGestiones",      label: "Gestiones",        url: "/admin/credito-cobranza/gestiones",      icon: icGestiones.url },
      { key: "navCreditoPromesas",       label: "Promesas de pago", url: "/admin/credito-cobranza/promesas",       icon: icPromesasPago.url },
      { key: "navCreditoAutorizaciones", label: "Autorizaciones",   url: "/admin/credito-cobranza/autorizaciones", icon: icAutorizaciones.url },
    ],
  },
  {
    label: "Contabilidad",
    items: [
      { key: "navContaDash",    label: "Dashboard fiscal",    url: "/admin/contabilidad",              icon: icDashboardFiscal.url, exact: true },
      { key: "navContaCuentas", label: "Catálogo de cuentas", url: "/admin/contabilidad/cuentas",      icon: icCatalogoCuentas.url },
      { key: "navContaAgrup",   label: "Códigos agrupadores", url: "/admin/contabilidad/agrupadores",  icon: icAgrupadores.url },
      { key: "navContaElec",    label: "Contabilidad electrónica", url: "/admin/contabilidad/electronica", icon: icContaElectronica.url },
      { key: "navContaPolizas", label: "Pólizas",             url: "/admin/contabilidad/polizas",      icon: icPolizas.url },
      { key: "navContaDiario",  label: "Libro diario",        url: "/admin/contabilidad/diario",       icon: icLibroDiario.url },
      { key: "navContaMayor",   label: "Libro mayor",         url: "/admin/contabilidad/mayor",        icon: icLibroMayor.url },
      { key: "navContaBalanza", label: "Balanza",             url: "/admin/contabilidad/balanza",      icon: icBalanza.url },
      { key: "navContaEstados", label: "Estados financieros", url: "/admin/contabilidad/estados",      icon: icEstadosFinancieros.url },
      { key: "navContaIVA",     label: "IVA / IEPS",          url: "/admin/contabilidad/impuestos",    icon: icImpuestos.url },
      { key: "navContaFact",    label: "Facturas contables",  url: "/admin/contabilidad/facturas",     icon: icFacturas.url },
      { key: "navContaSAT",     label: "Cumplimiento SAT",    url: "/admin/contabilidad/sat",          icon: icSAT.url },
    ],
  },
  {
    label: "Bancos",
    items: [
      { key: "navBancosCuentas",   label: "Cuentas bancarias",  url: "/admin/bancos",                icon: icBancos.url, exact: true },
      { key: "navBancosEstados",   label: "Estados bancarios",  url: "/admin/bancos/estados",        icon: icEstadosBancarios.url },
      { key: "navBancosMov",       label: "Entradas y salidas", url: "/admin/bancos/movimientos",    icon: icMovBancarios.url },
      { key: "navBancosTraspasos", label: "Traspasos",          url: "/admin/bancos/traspasos",      icon: icTraspasos.url },
      { key: "navBancosNomina",    label: "Pago de nómina",     url: "/admin/bancos/nomina",         icon: icNomina.url },
    ],
  },
  {
    label: "Configuración",
    items: [
      { key: "navEmpresas",    label: "Empresas",            url: "/admin/empresas",        icon: icEmpresas.url },
      { key: "navApiStatus",   label: "Estado de APIs",      url: "/admin/estado-apis",     icon: icEstadoApis.url },
      { key: "navApiUsage",    label: "Uso de APIs",         url: "/admin/uso-apis",        icon: icUsoApis.url },
      { key: "navAdmin",       label: "Admin",               url: "/admin/administracion",  icon: icAdmin.url },
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
  const { isMobile, setOpenMobile } = useSidebar();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
                                  "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50",
                                  active && "bg-muted text-primary font-medium"
                                )}
                              >
                                <img
                                  src={item.icon}
                                  alt=""
                                  aria-hidden="true"
                                  loading="lazy"
                                  width={24}
                                  height={24}
                                  className="h-6 w-6 shrink-0 object-contain mix-blend-multiply"
                                />
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
          <div className="text-[10px] text-muted-foreground/70" title="Marca visible para confirmar que el navegador cargó la última publicación">
            {ADMIN_BUILD_MARKER}
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
