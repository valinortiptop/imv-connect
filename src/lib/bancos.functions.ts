/**
 * Server functions for the Bancos module.
 *
 *  - parseStatementFn        : upload a bank statement (CSV/XLSX/PDF),
 *                              extract transactions, AI-categorize each
 *                              against the company's chart of accounts,
 *                              and create bank_movements rows.
 *  - categorizeMovementFn    : re-run AI categorization for one movement.
 *  - createTransferFn        : create a transfer (2 linked movements).
 *  - createPayrollPaymentFn  : record a payroll payment (+ movement).
 *  - deleteStatementFn       : delete a statement and its imported movements.
 *  - signStatementUrlFn      : signed URL to download the original file.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { geminiGenerateInline } from "./valinor-proxy.server";

const BUCKET = "bank-statements";

/* ────────────────────────── helpers ─────────────────────────── */

function extractJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        /* noop */
      }
    }
    return null;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/* ---------------- CSV / XLSX parsing (server-side xlsx) --------------- */

type RawTxn = {
  fecha: string; // ISO YYYY-MM-DD
  descripcion: string;
  monto: number; // signed: + entrada, - salida
  referencia?: string;
  contraparte?: string;
};

function normalizeAmount(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[$,\s]/g, "");
  if (!s) return null;
  // Parentheses = negative
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/^\(|\)$/g, "");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function normalizeDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  // xlsx dates: numbers (serial) or strings
  if (typeof v === "number") {
    // Excel serial date → JS date
    const utcDays = v - 25569;
    const ms = utcDays * 86400 * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // DD/MM/YYYY or DD-MM-YYYY (Mexican banks)
  const m1 = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m1) {
    const dd = m1[1].padStart(2, "0");
    const mm = m1[2].padStart(2, "0");
    let yy = m1[3];
    if (yy.length === 2) yy = (Number(yy) >= 70 ? "19" : "20") + yy;
    return `${yy}-${mm}-${dd}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

async function parseSpreadsheet(bytes: Uint8Array): Promise<RawTxn[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const rows: RawTxn[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
      raw: true,
    });
    if (!json.length) continue;

    // Detect columns
    const keys = Object.keys(json[0] ?? {});
    const lower = keys.map((k) => k.toLowerCase());
    const find = (patterns: RegExp[]) => {
      for (let i = 0; i < lower.length; i++) {
        if (patterns.some((p) => p.test(lower[i]))) return keys[i];
      }
      return null;
    };
    const dateKey = find([/fecha/, /^date/, /operaci[óo]n/]);
    const descKey = find([/descrip/, /concepto/, /detalle/, /movimiento/]);
    const amountKey = find([/^monto$/, /importe/, /amount/]);
    const debitKey = find([/cargo|d[ée]bito|debit|retiro/]);
    const creditKey = find([/abono|cr[ée]dito|credit|dep[oó]sito/]);
    const refKey = find([/referencia|folio|reference/]);

    if (!dateKey || (!amountKey && !debitKey && !creditKey)) continue;

    for (const r of json) {
      const fecha = normalizeDate(r[dateKey]);
      if (!fecha) continue;
      let monto: number | null = null;
      if (amountKey) monto = normalizeAmount(r[amountKey]);
      if (monto == null && (debitKey || creditKey)) {
        const cr = creditKey ? normalizeAmount(r[creditKey]) ?? 0 : 0;
        const db = debitKey ? normalizeAmount(r[debitKey]) ?? 0 : 0;
        monto = cr - db;
      }
      if (monto == null || monto === 0) continue;
      const desc = descKey ? String(r[descKey] ?? "").trim() : "";
      rows.push({
        fecha,
        descripcion: desc || "(sin descripción)",
        monto,
        referencia: refKey ? String(r[refKey] ?? "").trim() || undefined : undefined,
      });
    }
    if (rows.length) break; // usually first sheet has the data
  }
  return rows;
}

/* ---------------- PDF parsing via Gemini extraction --------------- */

const PDF_EXTRACT_PROMPT = `Eres un asistente que lee estados de cuenta bancarios mexicanos.
Extrae TODAS las transacciones (movimientos) del documento y devuelve EXCLUSIVAMENTE JSON con esta forma:
{
  "banco": "nombre del banco si aparece",
  "cuenta": "número/CLABE si aparece",
  "periodo": "YYYY-MM o rango",
  "saldo_inicial": 0,
  "saldo_final": 0,
  "transacciones": [
    { "fecha": "YYYY-MM-DD", "descripcion": "texto", "monto": 1234.56, "referencia": "opcional", "contraparte": "opcional" }
  ]
}
Reglas:
- "monto" es POSITIVO para depósitos/entradas y NEGATIVO para retiros/cargos/salidas.
- Ignora encabezados, totales y filas que no sean movimientos.
- No inventes datos. Si un campo no aparece, omítelo.
- Devuelve TODAS las transacciones, no un resumen.`;

async function parsePdfWithAI(bytes: Uint8Array): Promise<{
  banco?: string;
  cuenta?: string;
  periodo?: string;
  saldo_inicial?: number;
  saldo_final?: number;
  transacciones: RawTxn[];
}> {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  const res = await geminiGenerateInline({
    model: "gemini-flash-latest",
    parts: [
      { text: PDF_EXTRACT_PROMPT },
      { inline_data: { mime_type: "application/pdf", data: b64 } },
    ],
    jsonMode: true,
  });
  const raw =
    res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const parsed =
    extractJson<{
      banco?: string;
      cuenta?: string;
      periodo?: string;
      saldo_inicial?: number;
      saldo_final?: number;
      transacciones?: RawTxn[];
    }>(raw) ?? { transacciones: [] };
  return {
    banco: parsed.banco,
    cuenta: parsed.cuenta,
    periodo: parsed.periodo,
    saldo_inicial: parsed.saldo_inicial,
    saldo_final: parsed.saldo_final,
    transacciones: (parsed.transacciones ?? []).filter(
      (t) => t && t.fecha && Number.isFinite(Number(t.monto)),
    ),
  };
}

/* ---------------- AI categorization ---------------- */

type CuentaLite = { id: string; codigo: string; nombre: string };

const CATEGORIAS_DEFAULT = [
  "Ventas",
  "Cobranza cliente",
  "Compras / Proveedores",
  "Nómina",
  "Impuestos",
  "Comisiones bancarias",
  "Intereses",
  "Servicios",
  "Renta",
  "Transporte / Combustible",
  "Traspaso entre cuentas",
  "Devolución",
  "Otro",
] as const;

async function categorizeBatch(
  txns: RawTxn[],
  cuentas: CuentaLite[],
): Promise<Array<{ cuenta_id: string | null; categoria: string; confianza: number; contraparte?: string }>> {
  if (txns.length === 0) return [];
  const cuentaList = cuentas
    .slice(0, 200)
    .map((c) => `${c.codigo} — ${c.nombre} (id:${c.id})`)
    .join("\n");
  const prompt = `Eres un contador mexicano. Clasifica cada transacción bancaria devolviendo la MEJOR cuenta contable (del catálogo dado) y una categoría breve.
Categorías permitidas: ${CATEGORIAS_DEFAULT.join(", ")}.

Catálogo de cuentas contables disponibles:
${cuentaList || "(sin catálogo)"}

Transacciones a clasificar (índice, fecha, descripción, monto):
${txns.map((t, i) => `${i}. ${t.fecha} | ${t.descripcion} | ${t.monto.toFixed(2)}`).join("\n")}

Devuelve EXCLUSIVAMENTE un JSON con esta forma:
{
  "resultados": [
    { "i": 0, "cuenta_id": "uuid del catálogo o null", "categoria": "una de las categorías", "confianza": 0.85, "contraparte": "opcional" }
  ]
}
Reglas:
- Si el monto es positivo, prefiere cuentas de INGRESO (Ventas, Cobranza).
- Si es negativo, prefiere cuentas de GASTO o pasivo (Compras, Nómina, Comisiones, Impuestos).
- Comisiones bancarias, IVA por comisiones, ISR → cuentas fiscales/gastos.
- Si la descripción menciona traspaso, transferencia interna → "Traspaso entre cuentas".
- Si no hay cuenta razonable en el catálogo, cuenta_id = null.
- La confianza va de 0 a 1.`;

  try {
    const res = await geminiGenerateInline({
      model: "gemini-flash-latest",
      parts: [{ text: prompt }],
      jsonMode: true,
    });
    const raw =
      res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = extractJson<{
      resultados?: Array<{
        i: number;
        cuenta_id: string | null;
        categoria: string;
        confianza: number;
        contraparte?: string;
      }>;
    }>(raw);
    const out = txns.map(() => ({
      cuenta_id: null as string | null,
      categoria: "Otro",
      confianza: 0,
      contraparte: undefined as string | undefined,
    }));
    if (parsed?.resultados) {
      const validIds = new Set(cuentas.map((c) => c.id));
      for (const r of parsed.resultados) {
        if (typeof r.i !== "number" || r.i < 0 || r.i >= out.length) continue;
        const cid = r.cuenta_id && validIds.has(r.cuenta_id) ? r.cuenta_id : null;
        out[r.i] = {
          cuenta_id: cid,
          categoria: r.categoria || "Otro",
          confianza:
            typeof r.confianza === "number"
              ? Math.max(0, Math.min(1, r.confianza))
              : 0,
          contraparte: r.contraparte,
        };
      }
    }
    return out;
  } catch (e) {
    console.warn("[bancos] AI categorize failed:", (e as Error).message);
    return txns.map(() => ({
      cuenta_id: null,
      categoria: "Otro",
      confianza: 0,
      contraparte: undefined,
    }));
  }
}

/* ─────────────────── parseStatementFn ─────────────────── */

export const parseStatementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        empresa_id: z.string().uuid(),
        cuenta_id: z.string().uuid(),
        filename: z.string().min(1).max(255),
        mime: z.string().min(1).max(200),
        base64: z.string().min(10).max(30_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // 1. Upload file to storage
    const cleanName = data.filename.replace(/[^\w.\-]+/g, "_");
    const path = `${data.empresa_id}/${data.cuenta_id}/${Date.now()}_${cleanName}`;
    const bytes = base64ToBytes(data.base64);
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: data.mime, upsert: false });
    if (upErr) throw new Error(`upload: ${upErr.message}`);

    // 2. Create statement row
    const { data: stmt, error: stErr } = await supabaseAdmin
      .from("bank_statements" as any)
      .insert({
        empresa_id: data.empresa_id,
        cuenta_id: data.cuenta_id,
        file_url: path,
        file_name: data.filename,
        file_size: bytes.length,
        status: "processing",
        uploaded_by: context.userId,
      } as any)
      .select("*")
      .single();
    if (stErr) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error(`db: ${stErr.message}`);
    }

    try {
      // 3. Parse depending on mime
      let txns: RawTxn[] = [];
      let saldoIni: number | undefined;
      let saldoFin: number | undefined;
      let periodo: string | undefined;
      let bankName: string | undefined;

      const isXlsx =
        /\.(xlsx|xls|csv)$/i.test(data.filename) ||
        /spreadsheet|excel|csv/i.test(data.mime);
      const isPdf = data.mime === "application/pdf" || /\.pdf$/i.test(data.filename);

      if (isXlsx) {
        txns = await parseSpreadsheet(bytes);
      } else if (isPdf) {
        const parsed = await parsePdfWithAI(bytes);
        txns = parsed.transacciones;
        saldoIni = parsed.saldo_inicial;
        saldoFin = parsed.saldo_final;
        periodo = parsed.periodo;
        bankName = parsed.banco;
      } else {
        throw new Error("Formato no soportado. Sube CSV/XLSX o PDF.");
      }

      if (txns.length === 0) {
        await supabaseAdmin
          .from("bank_statements" as any)
          .update({
            status: "error",
            error_message: "No se detectaron transacciones en el archivo.",
          } as any)
          .eq("id", stmt.id);
        return { statement: stmt, imported: 0, message: "Sin transacciones" };
      }

      // 4. Fetch chart of accounts (level >=2, permite_movimientos) for AI
      const { data: cuentas = [] } = await supabaseAdmin
        .from("cuentas_contables" as any)
        .select("id, codigo, nombre")
        .eq("empresa_id", data.empresa_id)
        .eq("activa", true);
      const cuentasLite = (cuentas as unknown as CuentaLite[]) ?? [];

      // 5. Categorize (batch of 40 to keep prompt small)
      const results: Array<{
        cuenta_id: string | null;
        categoria: string;
        confianza: number;
        contraparte?: string;
      }> = [];
      const BATCH = 40;
      for (let i = 0; i < txns.length; i += BATCH) {
        const slice = txns.slice(i, i + BATCH);
        const cats = await categorizeBatch(slice, cuentasLite);
        results.push(...cats);
      }

      // 6. Insert bank_movements
      const rows = txns.map((t, i) => {
        const cat = results[i] ?? { cuenta_id: null, categoria: "Otro", confianza: 0 };
        const isTraspaso = /traspaso entre/i.test(cat.categoria);
        const isNomina = /n[óo]mina/i.test(cat.categoria);
        const isComision = /comisi[oó]n/i.test(cat.categoria);
        const isInteres = /inter[eé]s/i.test(cat.categoria);
        const monto = Math.abs(t.monto);
        const tipo = isTraspaso
          ? t.monto >= 0
            ? "traspaso_in"
            : "traspaso_out"
          : isNomina
            ? "nomina"
            : isComision
              ? "comision"
              : isInteres
                ? "interes"
                : t.monto >= 0
                  ? "entrada"
                  : "salida";
        return {
          empresa_id: data.empresa_id,
          cuenta_id: data.cuenta_id,
          fecha: t.fecha,
          tipo,
          monto,
          descripcion: t.descripcion,
          referencia: t.referencia ?? null,
          contraparte: cat.contraparte ?? t.contraparte ?? null,
          categoria: cat.categoria,
          ai_categoria: cat.cuenta_id,
          ai_confianza: cat.confianza,
          statement_id: stmt.id,
          conciliado: false,
          created_by: context.userId,
        };
      });

      const { error: insErr } = await supabaseAdmin
        .from("bank_movements" as any)
        .insert(rows as any);
      if (insErr) throw new Error(`insert movements: ${insErr.message}`);

      // 7. Update statement with totals + status
      const totalCr = rows
        .filter((r) => ["entrada", "traspaso_in", "interes"].includes(r.tipo))
        .reduce((a, b) => a + Number(b.monto), 0);
      const totalDb = rows
        .filter((r) => ["salida", "traspaso_out", "comision", "nomina"].includes(r.tipo))
        .reduce((a, b) => a + Number(b.monto), 0);

      const { data: upd } = await supabaseAdmin
        .from("bank_statements" as any)
        .update({
          status: "processed",
          bank_name: bankName ?? null,
          periodo: periodo ?? null,
          saldo_inicial: saldoIni ?? null,
          saldo_final: saldoFin ?? null,
          total_credits: totalCr,
          total_debits: totalDb,
        } as any)
        .eq("id", stmt.id)
        .select("*")
        .single();

      return {
        statement: upd ?? stmt,
        imported: rows.length,
        message: `${rows.length} movimientos importados`,
      };
    } catch (e) {
      const msg = (e as Error).message;
      await supabaseAdmin
        .from("bank_statements" as any)
        .update({ status: "error", error_message: msg } as any)
        .eq("id", stmt.id);
      throw new Error(msg);
    }
  });

/* ─────────────────── categorizeMovementFn ─────────────────── */

export const categorizeMovementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ movement_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: m, error } = await supabaseAdmin
      .from("bank_movements" as any)
      .select("*")
      .eq("id", data.movement_id)
      .single();
    if (error || !m) throw new Error(error?.message ?? "movimiento no existe");
    const mov = m as any;
    const { data: cuentas = [] } = await supabaseAdmin
      .from("cuentas_contables" as any)
      .select("id, codigo, nombre")
      .eq("empresa_id", mov.empresa_id)
      .eq("activa", true);
    const signedMonto =
      ["entrada", "traspaso_in", "interes"].includes(mov.tipo)
        ? Number(mov.monto)
        : -Number(mov.monto);
    const [cat] = await categorizeBatch(
      [
        {
          fecha: mov.fecha,
          descripcion: mov.descripcion ?? "",
          monto: signedMonto,
        },
      ],
      (cuentas as unknown as CuentaLite[]) ?? [],
    );
    const { data: upd, error: uErr } = await supabaseAdmin
      .from("bank_movements" as any)
      .update({
        categoria: cat.categoria,
        ai_categoria: cat.cuenta_id,
        ai_confianza: cat.confianza,
        contraparte: cat.contraparte ?? mov.contraparte,
      } as any)
      .eq("id", mov.id)
      .select("*")
      .single();
    if (uErr) throw new Error(uErr.message);
    return { movement: upd };
  });

/* ─────────────────── createTransferFn ─────────────────── */

export const createTransferFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        empresa_id: z.string().uuid(),
        cuenta_origen_id: z.string().uuid(),
        cuenta_destino_id: z.string().uuid(),
        fecha: z.string().min(10),
        monto: z.number().positive(),
        referencia: z.string().optional(),
        notas: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.cuenta_origen_id === data.cuenta_destino_id) {
      throw new Error("Las cuentas origen y destino deben ser distintas");
    }
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: t, error: tErr } = await supabaseAdmin
      .from("bank_transfers" as any)
      .insert({
        empresa_id: data.empresa_id,
        cuenta_origen_id: data.cuenta_origen_id,
        cuenta_destino_id: data.cuenta_destino_id,
        fecha: data.fecha,
        monto: data.monto,
        referencia: data.referencia ?? null,
        notas: data.notas ?? null,
        created_by: context.userId,
      } as any)
      .select("*")
      .single();
    if (tErr) throw new Error(tErr.message);

    const desc = `Traspaso ${data.referencia ?? ""}`.trim();
    const { error: mErr } = await supabaseAdmin.from("bank_movements" as any).insert([
      {
        empresa_id: data.empresa_id,
        cuenta_id: data.cuenta_origen_id,
        fecha: data.fecha,
        tipo: "traspaso_out",
        monto: data.monto,
        descripcion: desc,
        categoria: "Traspaso entre cuentas",
        transfer_id: t.id,
        conciliado: true,
        created_by: context.userId,
      },
      {
        empresa_id: data.empresa_id,
        cuenta_id: data.cuenta_destino_id,
        fecha: data.fecha,
        tipo: "traspaso_in",
        monto: data.monto,
        descripcion: desc,
        categoria: "Traspaso entre cuentas",
        transfer_id: t.id,
        conciliado: true,
        created_by: context.userId,
      },
    ] as any);
    if (mErr) throw new Error(mErr.message);
    return { transfer: t };
  });

/* ─────────────────── createPayrollPaymentFn ─────────────────── */

export const createPayrollPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        empresa_id: z.string().uuid(),
        cuenta_id: z.string().uuid(),
        employee_id: z.string().uuid(),
        payment_date: z.string().min(10),
        amount: z.number().positive(),
        payment_type: z.string().default("sueldo"),
        payment_method: z.string().default("transferencia"),
        days_worked: z.number().optional(),
        notes: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: emp } = await supabaseAdmin
      .from("employees" as any)
      .select("name")
      .eq("id", data.employee_id)
      .single();
    const empName = (emp as any)?.name ?? "empleado";

    const { data: pay, error: pErr } = await supabaseAdmin
      .from("payroll_payments" as any)
      .insert({
        employee_id: data.employee_id,
        payment_date: data.payment_date,
        amount: data.amount,
        payment_type: data.payment_type,
        payment_method: data.payment_method,
        days_worked: data.days_worked ?? null,
        notes: data.notes ?? null,
      } as any)
      .select("*")
      .single();
    if (pErr) throw new Error(pErr.message);

    const { error: mErr } = await supabaseAdmin
      .from("bank_movements" as any)
      .insert({
        empresa_id: data.empresa_id,
        cuenta_id: data.cuenta_id,
        fecha: data.payment_date,
        tipo: "nomina",
        monto: data.amount,
        descripcion: `Pago nómina — ${empName}`,
        contraparte: empName,
        categoria: "Nómina",
        payroll_payment_id: pay.id,
        conciliado: true,
        created_by: context.userId,
      } as any);
    if (mErr) throw new Error(mErr.message);
    return { payment: pay };
  });

/* ─────────────────── deleteStatementFn ─────────────────── */

export const deleteStatementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row } = await supabaseAdmin
      .from("bank_statements" as any)
      .select("file_url")
      .eq("id", data.id)
      .single();
    // Delete related movements (imported ones)
    await supabaseAdmin
      .from("bank_movements" as any)
      .delete()
      .eq("statement_id", data.id);
    if ((row as any)?.file_url) {
      await supabaseAdmin.storage.from(BUCKET).remove([(row as any).file_url]);
    }
    const { error } = await supabaseAdmin
      .from("bank_statements" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ─────────────────── signStatementUrlFn ─────────────────── */

export const signStatementUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row, error } = await supabaseAdmin
      .from("bank_statements" as any)
      .select("file_url, file_name")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("estado no encontrado");
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl((row as any).file_url, 60 * 30);
    return { url: signed?.signedUrl ?? null, name: (row as any).file_name };
  });
