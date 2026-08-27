// Central navigation tree for the admin app. Shared by the sidebar and the
// Cmd+K command palette. Item `key` values MUST stay stable — they are the
// permission keys used by `permission_routes` / usePermissions().

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

export type NavItem = {
  key: string;
  label: string;
  url: string;
  icon: string;
  exact?: boolean;
  adminOnly?: boolean;
};

export type NavSubGroup = { label?: string; items: NavItem[] };
export type NavGroup = { label: string; subgroups: NavSubGroup[] };

export const navGroups: NavGroup[] = [
  {
    label: "General",
    subgroups: [
      {
        items: [
          { key: "navDashboard", label: "Dashboard", url: "/admin", icon: icDashboard.url, exact: true },
          { key: "navClientesDashboard", label: "Clientes Dashboard", url: "/admin/clientes-dashboard", icon: icClientes.url },
          { key: "navAlmacenDashboard", label: "Almacén Dashboard", url: "/admin/almacen-dashboard", icon: icAlmacenes.url },
          { key: "navAIChat", label: "Gandalf", url: "/admin/gandalf", icon: icGandalf.url },
          { key: "navTareas", label: "Tareas", url: "/admin/tareas", icon: icTareas.url },
          { key: "navCalculator", label: "Calculadora", url: "/admin/calculadora", icon: icCalculadora.url },
          { key: "navOnboarding", label: "Onboarding", url: "/admin/onboarding", icon: icOnboarding.url },
        ],
      },
    ],
  },
  {
    label: "Ventas",
    subgroups: [
      {
        label: "Comercial",
        items: [
          { key: "navProspects", label: "Prospectos", url: "/admin/prospectos", icon: icProspectos.url },
          { key: "navOrders", label: "Pedidos", url: "/admin/pedidos", icon: icPedidos.url },
          { key: "navClients", label: "Clientes", url: "/admin/clientes", icon: icClientes.url },
          { key: "navPortalAdmin", label: "Portal Clientes", url: "/admin/portal", icon: icPortalClientes.url },
          { key: "navReps", label: "Vendedores", url: "/admin/representantes", icon: icVendedores.url },
          { key: "navDirectory", label: "Facturación", url: "/admin/facturas", icon: icFacturas.url },
        ],
      },
      {
        label: "Precios y promos",
        items: [
          { key: "navPromos", label: "Promociones", url: "/admin/promos", icon: icPromociones.url },
          { key: "navPriceLists", label: "Listas de Precios", url: "/admin/listas-precios", icon: icListasPrecios.url },
          { key: "navPartners", label: "Partners", url: "/admin/partners", icon: icPartners.url },
        ],
      },
      {
        label: "Reportes",
        items: [
          { key: "navSales", label: "Sales", url: "/admin/sales", icon: icSales.url },
          { key: "navVentasReport", label: "Ventas", url: "/admin/ventas", icon: icVentas.url },
          { key: "navPnL", label: "P&L", url: "/admin/pnl", icon: icPnl.url },
        ],
      },
    ],
  },
  {
    label: "Representantes",
    subgroups: [
      {
        items: [
          { key: "navRepPanel", label: "Panel Rep", url: "/rep", icon: icPanelRep.url, exact: true },
          { key: "navRepCoach", label: "Coach IA", url: "/rep/coach", icon: icCoachIA.url },
          { key: "navRepSupervisor", label: "Supervisor", url: "/rep/supervisor", icon: icSupervisor.url },
        ],
      },
    ],
  },
  {
    label: "Inventario y Almacén",
    subgroups: [
      {
        label: "Inventario",
        items: [
          { key: "navProducts", label: "Productos", url: "/admin/productos", icon: icProductos.url },
          { key: "navInventory", label: "Inventario", url: "/admin/inventario", icon: icConsultaInv.url },
          { key: "navKardex", label: "Kardex", url: "/admin/kardex", icon: icKardex.url },
          { key: "navStock", label: "Entradas", url: "/admin/entradas", icon: icEntradas.url },
        ],
      },
      {
        label: "Operación de almacén",
        items: [
          { key: "navInventario", label: "Almacén", url: "/admin/almacen", icon: icAlmacenes.url },
          { key: "navAlmacenesCat", label: "Almacenes / ubicaciones", url: "/admin/almacenes", icon: icAlmacenes.url },
          { key: "navRecepciones", label: "Recepciones", url: "/admin/almacen/recepciones", icon: icEntradas.url },
          { key: "navTraspasos", label: "Traspasos", url: "/admin/almacen/traspasos", icon: icAlmacenes.url },
          { key: "navRemisiones", label: "Remisiones", url: "/admin/almacen/remisiones", icon: icKardex.url },
          { key: "navCardexMat", label: "Cardex de material", url: "/admin/almacen/cardex", icon: icKardex.url },
          { key: "navRepAlmacen", label: "Reportes almacén", url: "/admin/almacen/reportes", icon: icRotacion.url },
        ],
      },
      {
        label: "Devoluciones",
        items: [
          { key: "navDevoluciones", label: "Devoluciones", url: "/admin/devoluciones/lista", icon: icDevoluciones.url },
          { key: "navDamaged", label: "Dañados", url: "/admin/danados", icon: icDanados.url },
        ],
      },
    ],
  },
  {
    label: "Compras",
    subgroups: [
      {
        items: [
          { key: "navPurchaseNeeds", label: "Compras", url: "/admin/compras", icon: icCompras.url, exact: true },
          { key: "navComprasPlaneacion", label: "Planeación", url: "/admin/compras/planeacion", icon: icPlaneacion.url },
          { key: "navComprasOrdenes", label: "Órdenes", url: "/admin/compras/ordenes", icon: icOrdenesCompra.url },
          { key: "navComprasProveedores", label: "Proveedores", url: "/admin/compras/proveedores", icon: icProveedores.url },
          { key: "navComprasPresupuesto", label: "Presupuesto", url: "/admin/compras/presupuesto", icon: icPresupuesto.url },
        ],
      },
      {
        label: "Control",
        items: [
          { key: "navComprasCaducidades", label: "Caducidades", url: "/admin/compras/caducidades", icon: icCaducidades.url },
          { key: "navComprasCostos", label: "Costos", url: "/admin/compras/costos", icon: icIntegracionCostos.url },
          { key: "navComprasRotacion", label: "Rotación", url: "/admin/compras/rotacion", icon: icRotacion.url },
          { key: "navComprasFaltantes", label: "Faltantes", url: "/admin/compras/faltantes", icon: icFaltantes.url },
          { key: "navComprasAlertas", label: "Alertas", url: "/admin/compras/alertas", icon: icAlertas.url },
        ],
      },
    ],
  },
  {
    label: "Operaciones",
    subgroups: [
      {
        items: [
          { key: "navLogistics", label: "Logística", url: "/admin/logistica", icon: icMapasEntrega.url },
          { key: "navManiobra", label: "Maniobra", url: "/admin/maniobra", icon: icManiobra.url },
          { key: "navCatalogo", label: "Catálogo", url: "/admin/catalogo", icon: icCatalogo.url },
          { key: "navDocuments", label: "Documentos", url: "/admin/documentos", icon: icDocumentos.url },
        ],
      },
    ],
  },
  {
    label: "Cobranza",
    subgroups: [
      {
        items: [
          { key: "navCreditoCartera", label: "Cartera", url: "/admin/credito-cobranza/cartera", icon: icSeguimientoCxc.url },
          { key: "navCreditoGestiones", label: "Gestiones", url: "/admin/credito-cobranza/gestiones", icon: icGestiones.url },
          { key: "navCreditoPromesas", label: "Promesas de pago", url: "/admin/credito-cobranza/promesas", icon: icPromesasPago.url },
          { key: "navCreditoAutorizaciones", label: "Autorizaciones", url: "/admin/credito-cobranza/autorizaciones", icon: icAutorizaciones.url },
        ],
      },
    ],
  },
  {
    label: "Contabilidad",
    subgroups: [
      {
        label: "Fiscal",
        items: [
          { key: "navContaDash", label: "Dashboard fiscal", url: "/admin/contabilidad", icon: icDashboardFiscal.url, exact: true },
          { key: "navContaCuentas", label: "Catálogo de cuentas", url: "/admin/contabilidad/cuentas", icon: icCatalogoCuentas.url },
          { key: "navContaAgrup", label: "Códigos agrupadores", url: "/admin/contabilidad/agrupadores", icon: icAgrupadores.url },
        ],
      },
      {
        label: "Libros",
        items: [
          { key: "navContaPolizas", label: "Pólizas", url: "/admin/contabilidad/polizas", icon: icPolizas.url },
          { key: "navContaDiario", label: "Libro diario", url: "/admin/contabilidad/diario", icon: icLibroDiario.url },
          { key: "navContaMayor", label: "Libro mayor", url: "/admin/contabilidad/mayor", icon: icLibroMayor.url },
          { key: "navContaBalanza", label: "Balanza", url: "/admin/contabilidad/balanza", icon: icBalanza.url },
          { key: "navContaEstados", label: "Estados financieros", url: "/admin/contabilidad/estados", icon: icEstadosFinancieros.url },
        ],
      },
      {
        label: "Cumplimiento",
        items: [
          { key: "navContaElec", label: "Contabilidad electrónica", url: "/admin/contabilidad/electronica", icon: icContaElectronica.url },
          { key: "navContaIVA", label: "IVA / IEPS", url: "/admin/contabilidad/impuestos", icon: icImpuestos.url },
          { key: "navContaFact", label: "Facturas contables", url: "/admin/contabilidad/facturas", icon: icFacturas.url },
          { key: "navContaSAT", label: "Cumplimiento SAT", url: "/admin/contabilidad/sat", icon: icSAT.url },
        ],
      },
    ],
  },
  {
    label: "Bancos",
    subgroups: [
      {
        items: [
          { key: "navBancosCuentas", label: "Cuentas bancarias", url: "/admin/bancos", icon: icBancos.url, exact: true },
          { key: "navBancosEstados", label: "Estados bancarios", url: "/admin/bancos/estados", icon: icEstadosBancarios.url },
          { key: "navBancosMov", label: "Entradas y salidas", url: "/admin/bancos/movimientos", icon: icMovBancarios.url },
          { key: "navBancosTraspasos", label: "Traspasos", url: "/admin/bancos/traspasos", icon: icTraspasos.url },
          { key: "navBancosNomina", label: "Pago de nómina", url: "/admin/bancos/nomina", icon: icNomina.url },
        ],
      },
    ],
  },
  {
    label: "Configuración",
    subgroups: [
      {
        label: "Mi cuenta",
        items: [
          { key: "navMiCuenta", label: "Mi cuenta", url: "/admin/cuenta", icon: icAdmin.url },
          { key: "navNotificaciones", label: "Notificaciones", url: "/admin/notificaciones", icon: icAlertas.url },
          { key: "navNotificacionesPrefs", label: "Preferencias de avisos", url: "/admin/configuracion/notificaciones", icon: icAdmin.url },
        ],
      },
      {
        label: "Administración",
        items: [
          { key: "navEmpresas", label: "Empresas", url: "/admin/empresas", icon: icEmpresas.url, adminOnly: true },
          { key: "navPlantillas", label: "Plantillas de mensajes", url: "/admin/configuracion/plantillas", icon: icDocumentos.url, adminOnly: true },
          { key: "navApiStatus", label: "Estado de APIs", url: "/admin/estado-apis", icon: icEstadoApis.url, adminOnly: true },
          { key: "navNetsuite", label: "Integración NetSuite", url: "/admin/integraciones/netsuite", icon: icEstadoApis.url, adminOnly: true },
          { key: "navApiUsage", label: "Uso de APIs", url: "/admin/uso-apis", icon: icUsoApis.url, adminOnly: true },
          { key: "navAdmin", label: "Admin", url: "/admin/administracion", icon: icAdmin.url, adminOnly: true },
        ],
      },
    ],
  },
];

/** Personal pages any signed-in user may open regardless of route permissions. */
export const ALWAYS_VISIBLE_KEYS = new Set(["navMiCuenta", "navNotificacionesPrefs"]);

export function flattenNav(groups: NavGroup[]): (NavItem & { group: string })[] {
  return groups.flatMap((g) =>
    g.subgroups.flatMap((sg) => sg.items.map((i) => ({ ...i, group: g.label }))),
  );
}

export function isItemActive(pathname: string, url: string, exact?: boolean) {
  return exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");
}

/** Normalizes text for accent-insensitive search. */
export function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
