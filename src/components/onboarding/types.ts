export type Item = {
  id: string;
  categoria: string;
  clave: string;
  titulo: string;
  descripcion: string | null;
  requerido: boolean;
  requiere_archivo: boolean;
  estado: "pendiente" | "en_proceso" | "entregado" | "no_aplica";
  notas: string | null;
  valor_texto: string | null;
  orden: number;
  area: string | null;
  responsable_rol: string | null;
  responsable_nombre: string | null;
  fecha_compromiso: string | null;
  plantilla_clave: string | null;
  validado_at: string | null;
  validado_por: string | null;
};

export type Archivo = {
  id: string;
  item_id: string;
  storage_path: string;
  nombre_original: string;
  size_bytes: number | null;
  uploaded_at: string;
};

export const AREAS: { key: string; label: string }[] = [
  { key: "comercial", label: "Comercial" },
  { key: "finanzas", label: "Cobranza y finanzas" },
  { key: "almacen", label: "Almacén y compras" },
  { key: "contabilidad", label: "Contabilidad" },
  { key: "fiscal", label: "Fiscal / Facturación" },
  { key: "configuracion", label: "Configuración inicial" },
];

export const RESPONSABLES: { key: string; label: string; desc: string }[] = [
  { key: "direccion", label: "Dirección IMV", desc: "Fecha de corte, aprobación final, CSD y accesos" },
  { key: "maresi", label: "Maresi (comercial)", desc: "Clientes, precios, comisiones y flujo de ventas" },
  { key: "contador", label: "Contador", desc: "Catálogo de cuentas, balanza, impuestos y aprobación contable" },
  { key: "cobranza", label: "Cobranza / Tesorería", desc: "Cartera y bancos" },
  { key: "almacen", label: "Almacén / Compras", desc: "Inventario físico y proveedores" },
  { key: "netsuite", label: "Administrador NetSuite", desc: "Exportes finales y baja de licencia" },
  { key: "valinor", label: "Valinor Studio", desc: "Desarrollo, cargas iniciales, Facturapi y soporte" },
];

export const FASES: { key: string; label: string }[] = [
  { key: "preparacion", label: "Preparación" },
  { key: "sesiones", label: "Sesiones" },
  { key: "cargas", label: "Cargas iniciales" },
  { key: "paralelo", label: "Paralelo" },
  { key: "apagado", label: "NetSuite apagado" },
];

/** Estado efectivo: validado > entregado (o con archivo) > estado guardado. */
export type EstadoDoc = Item["estado"] | "validado";
export function estadoDoc(it: Item, archivos: Archivo[]): EstadoDoc {
  if (it.estado === "no_aplica") return "no_aplica";
  if (it.validado_at) return "validado";
  if (it.estado === "entregado") return "entregado";
  if (it.requiere_archivo && archivos.some((a) => a.item_id === it.id)) return "entregado";
  return it.estado;
}
export const isDone = (e: EstadoDoc) => e === "entregado" || e === "validado";

/** Días entre hoy (Ciudad de México) y una fecha YYYY-MM-DD. */
export function diasHasta(fecha: string): number {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  return Math.round((Date.parse(fecha) - Date.parse(hoy)) / 86400000);
}

/** Convierte timestamptz a valor para <input type="datetime-local"> en hora CDMX. */
export function toLocalInput(ts: string | null): string {
  if (!ts) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(ts));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}
/** Valor de datetime-local (hora CDMX, UTC-6) → ISO. */
export function fromLocalInput(v: string): string | null {
  return v ? new Date(`${v}:00-06:00`).toISOString() : null;
}
