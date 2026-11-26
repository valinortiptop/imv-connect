/** Reglas de sugerencia para nuevas órdenes de compra (puras, testeables). */

export type HistItem = { producto_id: string; cantidad: number; fecha: string; costo: number; laboratorio_id: string };

export type Sugerencia = {
  producto_id: string;
  promedioMensual: number;
  existencia: number | null;
  puntoReorden: number | null;
  ultimaCompra: string | null;
  ultimoCosto: number | null;
  cantidad: number;
  motivo: string;
};

/** Redondea hacia arriba al múltiplo de compra (mínimo 1). */
export function redondearMultiplo(cantidad: number, multiplo: number | null | undefined): number {
  const m = Math.max(1, Math.trunc(Number(multiplo) || 1));
  const q = Math.max(0, Math.ceil(cantidad));
  if (q === 0) return 0;
  return Math.ceil(q / m) * m;
}

/** Fecha estimada = emisión + días de entrega; fecha límite = estimada + 7 días de margen. */
export function fechasEntrega(emisionISO: string, diasEntrega: number | null | undefined) {
  if (diasEntrega == null) return { estimada: null as string | null, limite: null as string | null };
  const [y, m, d] = emisionISO.split("-").map(Number);
  const base = Date.UTC(y!, m! - 1, d!);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const est = base + diasEntrega * 86400000;
  return { estimada: iso(est), limite: iso(est + 7 * 86400000) };
}

/**
 * Cantidad sugerida = promedio mensual comprado en `meses` × 1 mes de cobertura,
 * menos existencia; si hay punto de reorden y la existencia es mayor, no se sugiere.
 */
export function calcularSugerencias(args: {
  historial: HistItem[];
  meses: number;
  hoyISO: string;
  existencia: Record<string, number>;
  puntoReorden: Record<string, number | null>;
  multiplo: Record<string, number>;
}): Sugerencia[] {
  const { historial, meses, hoyISO } = args;
  const desde = new Date(hoyISO + "T00:00:00Z");
  desde.setUTCMonth(desde.getUTCMonth() - meses);
  const desdeISO = desde.toISOString().slice(0, 10);
  const porProd = new Map<string, HistItem[]>();
  for (const h of historial) {
    const arr = porProd.get(h.producto_id) ?? [];
    arr.push(h);
    porProd.set(h.producto_id, arr);
  }
  const out: Sugerencia[] = [];
  for (const [pid, items] of porProd) {
    const enRango = items.filter((i) => i.fecha >= desdeISO);
    const total = enRango.reduce((s, i) => s + Number(i.cantidad), 0);
    const prom = total / meses;
    const ord = [...items].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const ult = ord[0] ?? null;
    const ex = pid in args.existencia ? args.existencia[pid]! : null;
    const pr = args.puntoReorden[pid] ?? null;
    if (prom <= 0) continue;
    if (pr != null && ex != null && ex > pr) continue;
    const necesidad = prom - (ex ?? 0);
    const cantidad = redondearMultiplo(necesidad, args.multiplo[pid]);
    if (cantidad <= 0) continue;
    const partes = [`Compras ~${Math.round(prom).toLocaleString("es-MX")}/mes (últimos ${meses} meses)`];
    partes.push(ex == null ? "existencia no reportada" : `tienes ${ex.toLocaleString("es-MX")}`);
    if (pr != null) partes.push(`punto de reorden ${pr.toLocaleString("es-MX")}`);
    if (ult) partes.push(`última compra ${ult.fecha.split("-").reverse().join("/")}`);
    out.push({
      producto_id: pid,
      promedioMensual: prom,
      existencia: ex,
      puntoReorden: pr,
      ultimaCompra: ult?.fecha ?? null,
      ultimoCosto: ult?.costo ?? null,
      cantidad,
      motivo: partes.join(" · "),
    });
  }
  return out.sort((a, b) => b.promedioMensual - a.promedioMensual);
}

export const fmtFecha = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
export const fmtNum = (n: number) => n.toLocaleString("es-MX");
export const fmtMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
