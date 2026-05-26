/**
 * Lightweight literal-string translation helper.
 *
 *   tx("Importar lista")          // "Importar lista" in es, "Import list" in en
 *   useTx() returns the same function but causes the component to re-render
 *   when the language changes (use this in React components).
 *
 * To translate a new string: just wrap it here. If it's not in EN_MAP yet,
 * the original Spanish is returned. Add the entry to EN_MAP and English
 * starts working — no other code changes needed.
 */

import { useEffect, useState } from "react";

const LS_KEY = "app-lang";

function readLang(): "es" | "en" {
  if (typeof window === "undefined") return "es";
  const v = window.localStorage.getItem(LS_KEY);
  return v === "en" ? "en" : "es";
}

/** Spanish → English. Add entries here to expand coverage. */
const EN_MAP: Record<string, string> = {
  // ── Common UI ────────────────────────────────────────────────
  "Cancelar": "Cancel",
  "Guardar": "Save",
  "Guardando…": "Saving…",
  "Guardando...": "Saving...",
  "Cerrar": "Close",
  "Eliminar": "Delete",
  "Editar": "Edit",
  "Aceptar": "Accept",
  "Confirmar": "Confirm",
  "Hecho": "Done",
  "Hacer otro": "Do another",
  "Sin asignar": "Unassigned",
  "Asignar": "Assign",
  "Asignar a": "Assign to",
  "Asignados a mí": "Assigned to me",
  "Buscar": "Search",
  "Filtros": "Filters",
  "Estado": "Status",
  "Municipio": "Municipality",
  "Municipio / Colonia": "Municipality / Neighborhood",
  "Colonia": "Neighborhood",
  "Dirección": "Address",
  "Notas": "Notes",
  "Acciones": "Actions",
  "Lista": "List",
  "Mes": "Month",
  "Año": "Year",
  "Anterior": "Previous",
  "Siguiente": "Next",
  "Total": "Total",
  "Todos": "All",
  "Sí": "Yes",
  "No": "No",
  "Detener": "Stop",
  "Empezar de nuevo": "Start over",
  "Copiar": "Copy",
  "Próximamente": "Coming soon",
  "Página": "Page",
  "de": "of",
  "Mostrando": "Showing",

  // ── Prospects ────────────────────────────────────────────────
  "Prospectos": "Prospects",
  "Pipeline de clientes potenciales · llamadas, seguimientos y conversión.":
    "Pipeline of potential clients · calls, follow-ups and conversion.",
  "Importar lista": "Import list",
  "Importar prospectos": "Import prospects",
  "Importar": "Import",
  "Exportar CSV": "Export CSV",
  "Enriquecer con Google": "Enrich with Google",
  "Enriquecer prospectos con Google Places": "Enrich prospects with Google Places",
  "Enriquecer prospectos": "Enrich prospects",
  "Enriquecimiento": "Enrichment",
  "Enriquecidos": "Enriched",
  "Sin enriquecer": "Not enriched",
  "Sin enriquecer (": "Not enriched (",
  "Probar con los primeros 10": "Test with first 10",
  "Para validar el flujo y revisar resultados antes de gastar más.":
    "Validate the flow and review results before spending more.",
  "Salta los que ya se procesaron antes.": "Skip already-processed ones.",
  "Re-procesa también los que ya se enriquecieron.": "Also re-process already enriched.",
  "Alcance": "Scope",
  "Procesando": "Processing",
  "Encontrados": "Found",
  "Sin coincidencia": "No match",
  "Errores": "Errors",
  "Últimos resultados": "Latest results",
  "Resultados guardados automáticamente. Cierra y abre cualquier prospecto para ver los datos llenados.":
    "Results saved automatically. Close and open any prospect to see filled data.",
  "Cerrar (sigue corriendo en backend)": "Close (keeps running in background)",
  "Total de prospectos": "Total prospects",
  "Nuevos": "New",
  "Contactados": "Contacted",
  "Interesados": "Interested",
  "Convertidos": "Converted",
  "Tienes": "You have",
  "seguimientos pendientes hoy": "follow-ups pending today",
  "Ver": "View",
  "Teléfono, nombre, colonia…": "Phone, name, neighborhood…",
  "Cargando…": "Loading…",
  "Sin prospectos. Haz clic en": "No prospects. Click",
  "para empezar.": "to get started.",
  "Mostrando 500 de": "Showing 500 of",
  "Usa los filtros para acotar.": "Use filters to narrow down.",
  "Última llamada": "Last call",
  "Próximo seguimiento": "Next follow-up",
  "Asignado": "Assigned",
  "Llamar": "Call",
  "WhatsApp": "WhatsApp",
  "Maps": "Maps",
  "Ver en Google Maps": "View in Google Maps",
  "Google Maps (manual)": "Google Maps (manual)",
  "Pega la URL de Google Maps (https://maps.app.goo.gl/…)":
    "Paste the Google Maps URL (https://maps.app.goo.gl/…)",
  "Se usa cuando el botón": "Used when the button",
  "arriba se abre en lugar del enlace automático.":
    "above opens, instead of the automatic link.",
  "Nombre del negocio": "Business name",
  "Calle, número, referencias…": "Street, number, landmarks…",
  "Horarios preferidos, objeciones, referencias…": "Preferred hours, objections, references…",
  "Registrar llamada": "Log call",
  "Resultado": "Outcome",
  "Próximo seguimiento (opcional)": "Next follow-up (optional)",
  "Qué dijo, objeciones, compromiso…": "What they said, objections, commitments…",
  "Guardar llamada": "Save call",
  "Historial": "History",
  "Sin llamadas registradas.": "No calls logged.",
  "Eliminar llamada": "Delete call",
  "¿Seguro que quieres eliminar la llamada": "Are you sure you want to delete the call",
  "del": "from",
  "Esta acción no se puede deshacer.": "This action cannot be undone.",
  "Teléfono copiado": "Phone copied",
  "Lista:": "List:",
  "Prospecto": "Prospect",
  "Por nombre": "By name",
  "Por ID cliente": "By client ID",
  "Sub un Excel o CSV con la columna": "Upload an Excel or CSV with the column",
  "Sube un Excel o CSV con la columna": "Upload an Excel or CSV with the column",
  "Los demás campos (nombre, municipio, colonia, dirección) se importan si existen.":
    "Other fields (name, municipality, neighborhood, address) are imported if present.",
  "Suelta el archivo aquí": "Drop the file here",
  "Haz clic o arrastra un archivo": "Click or drag a file",
  "Listos para importar": "Ready to import",
  "Ya son prospectos": "Already prospects",
  "Inválidos": "Invalid",
  "teléfonos ya existen como clientes:": "phones already exist as clients:",
  "Se importarán igual como prospectos; puedes completar la info faltante después.":
    "They will still be imported as prospects; you can fill in missing info later.",
  "teléfonos inválidos (se omitirán):": "invalid phones (will be skipped):",
  "Etiqueta de origen": "Source label",
  "esperado 10 dígitos, tiene": "expected 10 digits, got",
  "vacío": "empty",
  "y": "and",
  "más": "more",
  "Asignar {n} prospectos": "Assign {n} prospects",
  "Cerrado permanentemente": "Permanently closed",
  "Cerrado temporalmente": "Temporarily closed",
  "Horario": "Hours",
  "URL:": "URL:",
  "Llamada eliminada": "Call deleted",

  // ── Reporte ADM (Ventas page) ───────────────────────────────
  "Reporte ADM": "ADM Report",
  "Reporte mensual": "Monthly report",
  "Ventas — Reporte mensual": "Sales — Monthly report",
  "Canal misceláneas ADM · Naucalpan y 4 municipios aledaños.":
    "ADM convenience-store channel · Naucalpan and 4 neighboring municipalities.",
  "Parámetros": "Parameters",
  "Bultos del mes": "Bags this month",
  "Usar": "Use",
  "Sin ventas": "No sales",
  "Tiendas activas": "Active stores",
  "Importe total": "Total amount",
  "Bultos": "Bags",
  "Ventas entregadas este mes:": "Sales delivered this month:",
  "Descargar reporte mensual": "Download monthly report",
  "PDF de 7 páginas: portada, resumen, cobertura, mezcla de producto, detalle de ventas, indicadores y metodología.":
    "7-page PDF: cover, summary, coverage, product mix, sales detail, indicators and methodology.",
  "Presentación": "Presentation",
  "Descargar PDF": "Download PDF",
  "Generando…": "Generating…",
  "Cobertura por municipio": "Coverage by municipality",
  "Tiendas": "Stores",
  "Importe": "Amount",
  "Logística de rutas": "Routes logistics",
  "Rutas activas": "Active routes",
  "170–210 clientes por ruta": "170–210 clients per route",
  "Paradas / ruta / semana": "Stops / route / week",
  "por día hábil": "per business day",
  "Próxima ruta": "Next route",
  "Ya lista para activarse": "Ready to activate",
  "En": "In",
  "mes": "month",
  "meses": "months",
  "Comparar contra": "Compare against",
  "Mes (actual)": "Month (current)",
  "Mes (comparación)": "Month (comparison)",
  "Año (comparación)": "Year (comparison)",
  "Nuevas tiendas": "New stores",
  "Tiendas perdidas": "Lost stores",
  "Δ Bultos totales": "Δ Total bags",
  "Δ Importe total": "Δ Total amount",
  "Top crecimiento": "Top growth",
  "Top caídas": "Top declines",
  "Sin movimientos.": "No movements.",
  "Detalle por tienda —": "Detail by store —",
  "vs": "vs",
  "Tipo": "Type",
  "Solo nuevas": "Only new",
  "Solo perdidas": "Only lost",
  "Que crecieron": "Grew",
  "Que bajaron": "Declined",
  "Orden": "Sort",
  "Más bultos (mes actual)": "Most bags (current month)",
  "Más importe (mes actual)": "Most amount (current month)",
  "Δ Bultos (magnitud)": "Δ Bags (magnitude)",
  "Δ Importe (magnitud)": "Δ Amount (magnitude)",
  "Nombre cliente": "Client name",
  "Cliente": "Client",
  "Δ Bultos": "Δ Bags",
  "Δ Importe": "Δ Amount",
  "tiendas": "stores",
  "NUEVA": "NEW",
  "PERDIDA": "LOST",
  "Filtra para ver más específico.": "Filter to see more specific results.",
  "Ver por": "View by",
  "Bultos del mes anterior": "Bags last month",

  // ── Catalog page ─────────────────────────────────────────────
  "Catálogo": "Catalog",
  "Catálogo de Productos": "Product Catalog",
  "Productos": "Products",
  "Precios": "Prices",
  "Lista de precios": "Price list",
  "Marca": "Brand",
  "Peso": "Weight",
  "Precio": "Price",
  "Stock": "Stock",
  "Disponible": "Available",
  "En camino": "Incoming",
  "Comprometido": "Committed",
  "Activo": "Active",
  "Inactivo": "Inactive",
  "Activos": "Active",
  "Inactivos": "Inactive",
  "Buscar por clave, nombre o marca...": "Search by SKU, name or brand...",
  "Todos los proveedores": "All suppliers",
  "Todas las marcas": "All brands",
  "Cargando productos...": "Loading products...",
  "No hay productos que coincidan.": "No products match.",
  "Editar Producto": "Edit Product",
  "Nuevo producto": "New product",
  "Nuevo Producto": "New Product",

  // ── Pedidos page ─────────────────────────────────────────────
  "Pedidos": "Orders",
  "Nuevo Pedido": "New Order",
  "Buscar por cliente o código...": "Search by client or code...",
  "Todos los estados": "All statuses",
  "No hay pedidos": "No orders",
  "Crear primer pedido": "Create first order",
  "Pendiente portal": "Portal pending",
  "Nuevo": "New",
  "Confirmado": "Confirmed",
  "En preparación": "In preparation",
  "En preparacion": "In preparation",
  "En ruta": "On route",
  "Entregado": "Delivered",
  "Cancelado": "Cancelled",
  "Fecha pedido": "Order date",
  "Fecha entrega": "Delivery date",
  "Líneas": "Lines",

  // ── Sidebar group labels ─────────────────────────────────────
  "General": "General",
  "Ventas": "Sales",
  "Inventario": "Inventory",
  "Operaciones": "Operations",
  "Configuración": "Settings",
};

let cachedLang: "es" | "en" = readLang();
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("app-lang-change", (e: any) => {
    cachedLang = (e.detail === "en" ? "en" : "es");
    listeners.forEach((fn) => fn());
  });
  // Multi-tab sync via storage event
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) {
      cachedLang = (e.newValue === "en" ? "en" : "es");
      listeners.forEach((fn) => fn());
    }
  });
}

/** Plain function, doesn't trigger re-render. Useful in non-component code. */
export function tx(es: string): string {
  if (cachedLang === "es") return es;
  return EN_MAP[es] ?? es;
}

/** React hook variant — re-renders the calling component when lang changes. */
export function useTx(): (es: string) => string {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((v) => v + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return tx;
}
