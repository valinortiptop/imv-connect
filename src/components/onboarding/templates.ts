import * as XLSX from "xlsx";

/** Plantillas de carga inicial. Columnas alineadas a los importadores de onboarding. */
const TEMPLATES: Record<string, { nombre: string; columnas: string[] }> = {
  clientes: { nombre: "clientes", columnas: ["razon_social", "rfc", "regimen_fiscal", "uso_cfdi", "codigo_postal_fiscal", "direccion", "codigo_postal", "telefono", "email", "representante", "lista_precios", "limite_credito_mxn", "dias_credito"] },
  precios: { nombre: "precios", columnas: ["sku", "price_with_iva", "lista_precios", "cliente_rfc_precio_especial"] },
  productos: { nombre: "productos", columnas: ["sku", "nombre", "clave_sat", "unidad_sat", "iva", "costo_mxn", "precio_mxn", "laboratorio", "categoria"] },
  cartera: { nombre: "cartera_por_factura", columnas: ["cliente_rfc", "cliente", "folio", "uuid", "fecha_emision", "fecha_vencimiento", "total", "saldo", "moneda"] },
  inventario: { nombre: "inventario_inicial", columnas: ["almacen", "sku", "lote", "caducidad", "cantidad", "costo_unitario_mxn"] },
  proveedores: { nombre: "proveedores", columnas: ["razon_social", "rfc", "dias_credito", "contacto", "email", "telefono"] },
  cxp: { nombre: "cuentas_por_pagar", columnas: ["proveedor_rfc", "proveedor", "folio", "uuid", "fecha", "vencimiento", "total", "saldo", "moneda"] },
  catalogo_cuentas: { nombre: "catalogo_cuentas", columnas: ["codigo", "nombre", "naturaleza", "nivel", "codigo_agrupador_sat"] },
  balanza: { nombre: "balanza_corte", columnas: ["codigo", "nombre", "saldo_inicial", "cargos", "abonos", "saldo_final"] },
};

export function hasTemplate(k: string | null): boolean {
  return !!k && k in TEMPLATES;
}

export function downloadTemplate(k: string) {
  const t = TEMPLATES[k];
  if (!t) return;
  const ws = XLSX.utils.aoa_to_sheet([t.columnas]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, `plantilla_${t.nombre}.xlsx`);
}
