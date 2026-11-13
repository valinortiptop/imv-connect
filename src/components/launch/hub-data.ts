import { supabase } from "@/integrations/supabase/client";

export const db = supabase as any;
export const BUCKET = "onboarding";

export type Req = {
  id: string; clave: string; titulo: string; descripcion: string | null; area: string | null;
  requerido: boolean; estado: string; validado_at: string | null; responsable_rol: string | null;
  fecha_compromiso: string | null; orden: number;
};
export type Doc = {
  id: string; item_id: string | null; storage_path: string; nombre_original: string; mime_type: string | null;
  size_bytes: number | null; uploaded_at: string; ai_estado: string; ai_veredicto: string | null;
  ai_resumen: string | null; ai_observaciones: string[]; destacado: boolean; atencion: boolean;
};
export type Sesion = {
  id: string; orden: number; titulo: string; participantes: string | null; duracion: string | null;
  objetivo: string | null; fecha_hora: string | null; estado: string; acuerdos: string | null; responsables: string[];
};
export type Asistente = { id: string; sesion_id: string; nombre: string; rol: string | null; email: string | null; asistio: boolean | null };
export type Disp = { id: string; persona: string; rol: string; slots: string[] };
export type Task = {
  id: string; orden: number; titulo: string; descripcion: string | null; estado: string; fecha_compromiso: string | null;
  tipo: string; prioridad: string; modulo: string | null; responsable: string | null; adjunto_path: string | null; sesion_id: string | null;
};
export type Programa = { fecha_corte: string | null; fase: string; decision_netsuite: string };

export const AREAS = [
  { key: "comercial", label: "Comercial", emoji: "C" },
  { key: "finanzas", label: "Cobranza y finanzas", emoji: "F" },
  { key: "almacen", label: "Almacén y compras", emoji: "A" },
  { key: "contabilidad", label: "Contabilidad", emoji: "K" },
  { key: "fiscal", label: "Fiscal / Facturación", emoji: "S" },
  { key: "configuracion", label: "Configuración inicial", emoji: "I" },
];

export const ROLES = [
  { key: "direccion", label: "Dirección IMV" },
  { key: "maresi", label: "Maresi (comercial)" },
  { key: "contador", label: "Contador" },
  { key: "cobranza", label: "Cobranza / Tesorería" },
  { key: "almacen", label: "Almacén / Compras" },
  { key: "netsuite", label: "Admin NetSuite" },
  { key: "valinor", label: "Valinor Studio" },
];
export const roleLabel = (k: string) => ROLES.find((r) => r.key === k)?.label ?? k;

export const TASK_COLS = [
  { key: "pendiente", label: "Pendiente" },
  { key: "en_curso", label: "En curso" },
  { key: "revision", label: "En revisión" },
  { key: "hecho", label: "Hecho" },
];
/** Old dev-task states map onto the kanban columns. */
export const taskCol = (estado: string) =>
  estado === "en_proceso" ? "en_curso" : estado === "listo" ? "hecho" : TASK_COLS.some((c) => c.key === estado) ? estado : "pendiente";

/** "1 h", "90 min", "1.5 h", "2 horas" → minutes (default 60). */
export function durationMinutes(d: string | null): number {
  if (!d) return 60;
  const n = parseFloat(d.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 60;
  const mins = /min/i.test(d) ? n : n * 60;
  return Math.max(30, Math.round(mins / 30) * 30);
}

export type DocState = "falta" | "subido" | "revisar" | "ok" | "validado";
export function reqState(r: Req, docs: Doc[]): DocState {
  if (r.validado_at) return "validado";
  if (docs.length === 0) return "falta";
  const latest = docs[0];
  if (latest.ai_veredicto === "bien") return "ok";
  if (latest.ai_veredicto === "revisar" || latest.ai_veredicto === "incorrecto") return "revisar";
  return "subido";
}

export async function loadHub() {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;
  const [items, docs, prog, ses, asis, disp, tasks, admin, conta] = await Promise.all([
    db.from("onboarding_items").select("id,clave,titulo,descripcion,area,requerido,estado,validado_at,responsable_rol,fecha_compromiso,orden").order("orden"),
    db.from("onboarding_archivos").select("*").order("uploaded_at", { ascending: false }).range(0, 1999),
    db.from("onboarding_programa").select("fecha_corte,fase,decision_netsuite").eq("id", 1).maybeSingle(),
    db.from("onboarding_sesiones").select("*").order("orden"),
    db.from("onboarding_asistentes").select("*").order("created_at"),
    db.from("onboarding_disponibilidad").select("id,persona,rol,slots"),
    db.from("onboarding_tareas_dev").select("*").order("orden"),
    uid ? supabase.rpc("has_role", { _user_id: uid, _role: "admin" }) : Promise.resolve({ data: false }),
    uid ? supabase.rpc("has_role", { _user_id: uid, _role: "contabilidad" }) : Promise.resolve({ data: false }),
  ]);
  const err = [items, docs, prog, ses, asis, disp, tasks].find((r: any) => r.error);
  if (err) throw new Error(err.error.message);
  return {
    uid,
    reqs: items.data as Req[],
    docs: (docs.data as Doc[]).map((d) => ({ ...d, ai_observaciones: Array.isArray(d.ai_observaciones) ? d.ai_observaciones : [] })),
    programa: prog.data as Programa | null,
    sesiones: ses.data as Sesion[],
    asistentes: asis.data as Asistente[],
    disponibilidad: disp.data as Disp[],
    tasks: tasks.data as Task[],
    isAdmin: !!admin.data,
    canValidate: !!admin.data || !!conta.data,
  };
}
export type HubData = Awaited<ReturnType<typeof loadHub>>;

export const fmtBytes = (n: number | null) =>
  n == null ? "tamaño desconocido" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
